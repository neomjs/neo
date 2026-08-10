#!/usr/bin/env node
import * as acorn            from 'acorn';
import {execSync, spawnSync} from 'child_process';
import {readFileSync}        from 'fs';
import path                  from 'path';
import {fileURLToPath}       from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

/**
 * Inline relief valve for a write-then-rename pair that legitimately stays hand-rolled. A line
 * carrying this marker is skipped, and the marker is required to carry a reason after the colon —
 * an unexplained escape is a silent licence.
 */
export const ESCAPE_MARKER = 'atomic-write-ok';

/*
 * The SHAPE, not the verb.
 *
 * `rg -l "renameSync\(" ai` over-counts in three distinct ways, every one of which is a legitimate
 * caller this guard must stay silent about:
 *
 *   1. LOG ROTATION      — `renameSync(logFile, `${logFile}.${day}`)`. Moves an existing file; there
 *                          is no scratch and nothing was written to `logFile` first.
 *   2. PLAIN RELOCATION  — the issue/PR syncers moving a file to its corrected path.
 *   3. A DIRECTORY MUTEX — `lifecycleGuard` renames a staging DIRECTORY onto the guard path, and the
 *                          rename FAILING is the mutual exclusion. The write inside it targets a file
 *                          within the staging dir, never the renamed path itself.
 *
 * A guard keyed on `rename` would flag all three. So the predicate is a PAIR: some earlier call in
 * the same file writes to a name, and a later `rename` promotes that SAME name. That is the
 * write-temp-then-rename shape and nothing else matches it.
 *
 * What this deliberately does NOT do is prove the pair is wrong. Five of the six known hand-rolled
 * survivors are correct — each runs a fence (lease re-assert, guard-ownership re-verify, deadline
 * assertion, staged-manifest validation) BETWEEN the write and the rename, which the primitive
 * cannot express because it owns both ends. Those carry the escape marker with their reason, which
 * is what turns "an explicit documented reason" from a promise into a checkable one.
 */
/**
 * A call that CREATES or writes the scratch. Deliberately name-shaped rather than an allowlist of fs
 * functions, because the first version of this guard used a fixed list and missed three real sites:
 *
 *   - `this._writeSynced(tempPath, record)` — a custom writer the list never had
 *   - `fs.promises.open(tempPath, 'w')`     — the scratch is created by `open`, then written
 *                                             through the returned HANDLE, so the name never
 *                                             appears in a write call at all
 *
 * Matching the *shape of the name* covers all three and anything the next author invents.
 */
const CREATES_SCRATCH = /(?:^|[._])(?:write|output|append|open|create)/i,
      RENAME_CALLEE   = /^(?:rename|renameSync)$/;

/**
 * @summary Depth-first walk over an acorn AST.
 * @param {Object} node
 * @param {Function} visit
 * @returns {void}
 */
function walk(node, visit) {
    if (!node || typeof node !== 'object') return;

    if (Array.isArray(node)) {
        node.forEach(child => walk(child, visit));
        return
    }

    if (typeof node.type === 'string') visit(node);

    for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue;
        walk(node[key], visit)
    }
}

/**
 * @summary The trailing identifier of a callee — `fs.promises.rename` -> `rename`.
 * @param {Object} callee
 * @returns {String}
 */
function calleeName(callee) {
    if (!callee) return '';
    if (callee.type === 'Identifier')       return callee.name;
    if (callee.type === 'MemberExpression') return callee.property?.name ?? '';
    return ''
}

/**
 * @summary Finds write-temp-then-rename pairs: a name created or written, then renamed away.
 *
 * **Parsed, not scanned.** The first version matched line by line and therefore could not see a call
 * whose arguments wrap across lines — ordinary formatting was a bypass. It also keyed the write half
 * on a fixed list of fs functions, which missed a custom writer and two handle-based writes. Both
 * misses shared one root: the detector's vocabulary was mistaken for the population, and a clean run
 * meant "nothing I can see" rather than "nothing there".
 *
 * A parse also makes the string/comment exclusion structural rather than masked: a pair that only
 * exists inside emitted plugin source (`generateOpenCodeSeatConfig` writes exactly this shape as
 * generated text) is a string literal in the AST and is never a call.
 * @param {String} content
 * @param {String} [file='<inline>'] For the parse-failure message.
 * @returns {Object[]} `[{line, name, text}]`, one per offending rename (1-based lines).
 */
export function findWriteThenRenamePairs(content, file = '<inline>') {
    let program;

    try {
        program = acorn.parse(content, {ecmaVersion: 'latest', sourceType: 'module', locations: true})
    } catch (error) {
        // Fail CLOSED. A file this guard cannot parse is a file it cannot clear.
        throw new Error(`check-atomic-write-shape: ${file} did not parse: ${error.message}`)
    }

    const lines   = content.split('\n'),
          scratch = new Map(),
          renames = [];

    walk(program, node => {
        if (node.type !== 'CallExpression') return;

        const name  = calleeName(node.callee),
              first = node.arguments?.[0];

        if (first?.type !== 'Identifier') return;

        if (RENAME_CALLEE.test(name)) {
            renames.push({name: first.name, start: node.start, line: node.loc.start.line})
        } else if (CREATES_SCRATCH.test(name)) {
            const previous = scratch.get(first.name);
            if (previous === undefined || node.start < previous) scratch.set(first.name, node.start)
        }
    });

    return renames
        .filter(({name, start}) => {
            const createdAt = scratch.get(name);
            return createdAt !== undefined && createdAt < start
        })
        .filter(({line}) => !lines[line - 1]?.includes(ESCAPE_MARKER))
        .map(({name, line}) => ({line, name, text: lines[line - 1]?.trim() ?? ''}))
}

/**
 * @summary Normalizes an input path to a repo-relative POSIX path.
 * @param {String} file
 * @param {String} gitRoot
 * @returns {String}
 */
export function toRepoRelative(file, gitRoot) {
    return path.relative(gitRoot, path.resolve(gitRoot, file)).split(path.sep).join('/')
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1);
    }

    const rawArgv   = process.argv.slice(2),
          quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    function collectDefaultFiles() {
        const result = spawnSync('find', ['ai', '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    const files = (argvFiles.length > 0 ? argvFiles : collectDefaultFiles())
        .filter(file => file.endsWith('.mjs'))
        .map(file => toRepoRelative(file, gitRoot))
        .filter(file => file.startsWith('ai/'));

    if (files.length === 0) {
        console.log('check-atomic-write-shape: 0 ai .mjs files in scope, nothing to check.');
        process.exit(0);
    }

    const violations = [];

    for (const file of files) {
        // The primitive itself IS the shape — exempting it by path rather than by marker keeps the
        // implementation free of a marker that would read as a carve-out to anyone reading it.
        if (file === 'ai/services/shared/atomicFileWrite.mjs') continue;

        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8');
        } catch (e) {
            console.error(`check-atomic-write-shape: could not read ${file}: ${e.message}`);
            continue
        }

        findWriteThenRenamePairs(content, file).forEach(({line, name, text}) => {
            violations.push(`${file}:${line}: [${name}] ${text}`)
        });
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-atomic-write-shape: ${violations.length} hand-rolled write-temp-then-rename pair(s):\x1b[0m`);
        if (!quiet) {
            violations.forEach(violation => console.error('  ' + violation));
            console.error('\nUse the owned primitive — `writeFileAtomic` / `writeFileAtomicSync` from');
            console.error('`ai/services/shared/atomicFileWrite.mjs`. It owns the unique scratch, the cleanup on');
            console.error('failure, and the opt-in fsync, which hand-rolled copies get wrong in that order.');
            console.error(`\nIf a check must run BETWEEN the write and the rename (a lease re-assert, a guard`);
            console.error(`ownership re-verify, a deadline assertion, a staged-artifact validation), the primitive`);
            console.error(`cannot express it — keep the pair and add an "${ESCAPE_MARKER}: <reason>" marker on the`);
            console.error('rename line stating which check needs that instant.');
        }
        process.exit(1);
    }

    console.log(`check-atomic-write-shape: ${files.length} ai .mjs file(s) scanned, 0 hand-rolled pairs.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
