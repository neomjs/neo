import {program}             from 'commander';
import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}        from 'node:fs';
import path                  from 'node:path';
import process               from 'node:process';
import {fileURLToPath}       from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Scan roots for the default audit + `--base` CI mode: a directory (scanned recursively) or a specific
// file. Keep mirror-aligned with the `paths:` trigger of .github/workflows/ticket-archaeology-lint.yml so
// every path that can trigger the gate is also scanned (else it passes vacuously). The guard lists ITSELF
// here so it self-guards at the merge-gate, not only via the pre-commit lint-staged `*.mjs` glob.
export const DEFAULT_SCAN_PATHS = ['ai', 'src', 'test/playwright', 'buildScripts/util/check-ticket-archaeology.mjs'];
export const DEFAULT_IGNORES    = ['.claude', '.codex', 'dist', 'node_modules'];

// Inline relief valve for a genuinely load-bearing comment ref (judgment-call escape, not a blanket bypass).
export const ESCAPE_MARKER = 'ticket-ref-ok';

// Decay-prone tracking anchors that must not live in durable source comments. `#\d{4,}\b` targets
// issue/PR numbers (Neo tickets are 5 digits) while a trailing word boundary avoids matching hex colors
// like `#1234ff`; the named forms catch the prose variants.
export const TICKET_PATTERNS = [
    /#\d{4,}\b/,
    /\bEpic\s+#?\d+\b/i,
    /\bDiscussion\s+#?\d+\b/i,
    /\bADR[-\s]?\d{3,4}\b/i
];

/**
 * @summary Extracts the comment portion(s) of a single line of source via a small string-aware scan.
 *
 * Only true comment context is returned: line (slash-slash) and block (slash-star) comments. String
 * literals are skipped, so a ticket ref that lives inside a string — a `describe(...)` test anchor or a
 * URL such as the issues endpoint — is never mistaken for a durable comment. Block-comment state is
 * carried across lines via `state.inBlock`; per-line string state is intentionally not carried (a ref
 * buried in a multi-line template literal is the rare case the inline escape marker covers).
 * @param {String} line
 * @param {{inBlock: Boolean}} state Mutated in place as block comments open and close across lines.
 * @returns {String} The comment text on this line (empty when the line carries no comment).
 */
export function extractComment(line, state) {
    let comment = '',
        i       = 0;

    const n = line.length;

    if (state.inBlock) {
        const end = line.indexOf('*/');

        if (end === -1) {
            return line
        }

        comment      += line.slice(0, end) + ' ';
        i             = end + 2;
        state.inBlock = false
    }

    let inString = null;

    while (i < n) {
        const ch   = line[i],
              next = line[i + 1];

        if (inString) {
            if (ch === '\\') {
                i += 2;
                continue
            }
            if (ch === inString) {
                inString = null
            }
            i++;
            continue
        }

        if (ch === '"' || ch === "'" || ch === '`') {
            inString = ch;
            i++;
            continue
        }

        if (ch === '/' && next === '/') {
            comment += ' ' + line.slice(i);
            break
        }

        if (ch === '/' && next === '*') {
            const end = line.indexOf('*/', i + 2);

            if (end === -1) {
                comment      += ' ' + line.slice(i + 2);
                state.inBlock = true;
                break
            }

            comment += ' ' + line.slice(i + 2, end);
            i        = end + 2;
            continue
        }

        i++
    }

    return comment
}

/**
 * @summary Scans file content for decay-prone ticket refs that live in comment context.
 * @param {String} content
 * @returns {Object[]} `[{line, text}]` — one entry per offending line (1-based line numbers).
 */
export function findTicketRefs(content) {
    const lines = content.split('\n'),
          state = {inBlock: false},
          hits  = [];

    lines.forEach((line, index) => {
        const comment = extractComment(line, state);

        if (!comment || line.includes(ESCAPE_MARKER)) {
            return
        }

        if (TICKET_PATTERNS.some(re => re.test(comment))) {
            hits.push({line: index + 1, text: line.trim()})
        }
    });

    return hits
}

/**
 * @summary True when a repo-relative path is in archaeology-scan scope: a `.mjs` file under one of the
 * scan roots (a directory prefix, or an exact-file root such as the guard itself) and not under any
 * ignored path fragment. The single in-scope contract shared by the `--base` CI selection and the
 * default audit — exported so the base-mode scope is unit-testable without a live git diff.
 * @param {String} file Repo-relative path.
 * @param {String[]} scanPaths Scan roots — directories (prefix match) or specific files (exact match).
 * @param {String[]} ignores Path fragments; a file is excluded when any path segment matches one.
 * @returns {Boolean}
 */
export function isInScopePath(file, scanPaths, ignores) {
    return file.endsWith('.mjs')
        && scanPaths.some(p => file === p || file.startsWith(`${p}/`))
        && !ignores.some(ignore => file.split('/').includes(ignore))
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch (e) {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1);
    }

    if (path.resolve(scriptRoot) !== path.resolve(gitRoot)) {
        console.error('\x1b[31mError: Script repository root mismatch.\x1b[0m');
        console.error(`check-ticket-archaeology.mjs is located under '${scriptRoot}', but the git repository root is '${gitRoot}'.`);
        process.exit(1);
    }

    program
        .name('check-ticket-archaeology')
        .description('Substrate gate against decay-prone ticket/Epic/Discussion/ADR refs in durable .mjs comments/JSDoc.')
        .argument('[files...]', 'Specific .mjs files to scan (lint-staged passes staged paths). Omitted -> --base changes or the --dirs audit.')
        .option('-d, --dirs <list>', 'Comma-separated scan roots (directories or specific files) for default/--base mode.', DEFAULT_SCAN_PATHS.join(','))
        .option('-i, --ignore <list>', 'Comma-separated path fragments to exclude.', DEFAULT_IGNORES.join(','))
        .option('-b, --base <ref>', 'CI mode: scan only the in-scope .mjs changed vs this base ref.')
        .option('-s, --skip', 'Skip the gate (generated-data class; also via NEO_SKIP_TICKET_ARCHAEOLOGY=1).', false)
        .option('-q, --quiet', 'Suppress the per-violation listing; print the summary only.', false)
        .showHelpAfterError();

    program.parse(process.argv);

    const argvFiles = program.args,
          options   = program.opts(),
          scanPaths = options.dirs.split(',').map(s => s.trim()).filter(Boolean),
          ignores   = options.ignore.split(',').map(s => s.trim()).filter(Boolean);

    // Targeted skip for the generated-data class (data-sync pipeline / sync_all): they commit
    // resources/content/ which legitimately carries ticket-refs (the actual issue/PR/discussion bodies),
    // so the archaeology gate does not apply. A clean opt-out, distinct from blunt `--no-verify`.
    if (options.skip || process.env.NEO_SKIP_TICKET_ARCHAEOLOGY === '1') {
        console.log('check-ticket-archaeology: skipped (generated-data class — --skip / NEO_SKIP_TICKET_ARCHAEOLOGY).');
        process.exit(0);
    }

    function collectDefaultFiles() {
        const findArgs = ['-type', 'f', '-name', '*.mjs'];
        ignores.forEach(ignore => findArgs.push('-not', '-path', `*/${ignore}/*`));

        const result = spawnSync('find', [...scanPaths, ...findArgs], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    // CI mode: the in-scope (per isInScopePath — .mjs, within a scan root, not ignored) files CHANGED vs
    // the base ref. Deletions (--diff-filter=d excludes them) cannot carry archaeology; renames/edits exist
    // on HEAD → readable.
    function changedFilesVsBase(base) {
        const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error(`\x1b[31mError: git diff against '${base}' failed.\x1b[0m`);
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean)
            .filter(f => isInScopePath(f, scanPaths, ignores));
    }

    // File selection (all modes scan each selected file in FULL — boy-scout, no line scoping):
    //   --base <ref> : CI — the in-scope files changed vs <ref>
    //   file args    : pre-commit — lint-staged passes the staged paths
    //   neither      : the default whole-repo audit
    const hasFileArgs = argvFiles.length > 0;
    const files       = options.base
        ? changedFilesVsBase(options.base)
        : hasFileArgs
            ? argvFiles.filter(f => f.endsWith('.mjs'))
            : collectDefaultFiles();

    if (files.length === 0) {
        console.log('check-ticket-archaeology: 0 .mjs files in scope, nothing to check.');
        process.exit(0);
    }

    const violations = [];
    for (const file of files) {
        let content;
        try {
            content = readFileSync(file, 'utf-8');
        } catch (e) {
            console.error(`check-ticket-archaeology: could not read ${file}: ${e.message}`);
            continue;
        }

        // Boy-scout rule (operator-directed): scan the WHOLE touched file, exactly like
        // check-block-alignment — touching a file obligates cleaning ALL its ticket-archaeology, not just
        // the author's added lines. This reduces the grandfathered backlog as files are naturally touched;
        // an added-lines-only scope (the prior shape) froze that debt instead.
        findTicketRefs(content)
            .forEach(({line, text}) => violations.push(`${file}:${line}: ${text}`));
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-ticket-archaeology: ${violations.length} decay-prone ref(s) (ticket/Epic/Discussion/ADR) in durable comments:\x1b[0m`);
        if (!options.quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nDurable comments/JSDoc must describe behavior, not cite tracking refs — tickets, Epics, Discussions, or ADRs (they rot when the');
            console.error('referenced item closes/renames). Move the ref to the PR body / commit subject, or — only if genuinely');
            console.error(`load-bearing — add a "${ESCAPE_MARKER}: <reason>" marker on the line.`);
        }
        process.exit(1);
    }

    console.log(`check-ticket-archaeology: ${files.length} files scanned, 0 violations.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
