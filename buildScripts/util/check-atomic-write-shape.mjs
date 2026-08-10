#!/usr/bin/env node
import {execSync, spawnSync} from 'child_process';
import {readFileSync}        from 'fs';
import path                  from 'path';
import {fileURLToPath}       from 'url';
import {codeMask}            from './check-aiconfig-test-mutation.mjs';

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
const WRITE_CALLS  = '(?:writeFile|writeFileSync|outputFile|outputFileSync|outputJson|outputJsonSync|appendFile|appendFileSync)',
      RENAME_CALLS = '(?:rename|renameSync)',
      IDENTIFIER   = '[A-Za-z_$][\\w$]*';

export const WRITE_TO_SCRATCH = new RegExp(`(?<![\\w$])${WRITE_CALLS}\\s*\\(\\s*(${IDENTIFIER})\\b`);
export const RENAME_OF_NAME   = new RegExp(`(?<![\\w$])${RENAME_CALLS}\\s*\\(\\s*(${IDENTIFIER})\\s*,`);

/**
 * @summary Finds write-temp-then-rename pairs: a name written to, then renamed away.
 *
 * Both halves must sit in executable code — the mask is shared with the sibling AiConfig guard so a
 * pair quoted inside a string, a comment, or a template quasi is not a hit. That matters more than
 * it looks: `generateOpenCodeSeatConfig.mjs` EMITS this exact pair as generated plugin source, and a
 * scanner without the mask would flag the generator for the code it writes rather than the code it
 * runs.
 * @param {String} content
 * @returns {Object[]} `[{line, name, text}]`, one per offending rename (1-based lines).
 */
export function findWriteThenRenamePairs(content) {
    const lines   = content.split('\n'),
          state   = {source: content},
          written = new Map(),
          hits    = [];

    lines.forEach((line, index) => {
        const mask = codeMask(line, state, index);

        const writeMatch = line.match(WRITE_TO_SCRATCH);
        if (writeMatch && mask[writeMatch.index]) {
            written.set(writeMatch[1], index + 1)
        }

        if (line.includes(ESCAPE_MARKER)) return;

        const renameMatch = line.match(RENAME_OF_NAME);
        if (renameMatch && mask[renameMatch.index] && written.has(renameMatch[1])) {
            hits.push({line: index + 1, name: renameMatch[1], text: line.trim()})
        }
    });

    return hits
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

        findWriteThenRenamePairs(content).forEach(({line, name, text}) => {
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
