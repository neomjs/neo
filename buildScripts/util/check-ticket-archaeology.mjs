import {program}             from 'commander';
import {execSync, spawnSync}  from 'node:child_process';
import {readFileSync}         from 'node:fs';
import path                   from 'node:path';
import process                from 'node:process';
import {fileURLToPath}        from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

const DEFAULT_DIRS    = ['ai', 'src', 'test/playwright'];
const DEFAULT_IGNORES = ['.claude', '.codex', 'dist', 'node_modules'];

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
 * @summary Extracts the set of new-side line numbers added by a `git diff --unified=0` patch.
 *
 * Walks each hunk header `@@ -old +new[,count] @@` and the following `+` lines so every added line maps to
 * its line number in the post-image (new) file; `-` (removed) lines do not advance the new-side counter, and
 * `--unified=0` emits no context lines. Lets the per-commit scan target only what a commit actually adds.
 * @param {String} diffOutput Raw `git diff --cached --unified=0` text for a single file.
 * @returns {Set<Number>} 1-based new-file line numbers that were added (empty when the diff adds nothing).
 */
export function parseAddedLines(diffOutput) {
    const added = new Set();

    let newLine = 0,
        inHunk  = false;

    for (const line of diffOutput.split('\n')) {
        const header = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);

        if (header) {
            newLine = parseInt(header[1], 10);
            inHunk  = true;
            continue
        }

        if (!inHunk) {
            continue
        }

        // `+` adds a new-side line (advance the counter); `+++` is the file header, not content.
        if (line.startsWith('+') && !line.startsWith('+++')) {
            added.add(newLine);
            newLine++
        }
        // `-` removes an old-side line — absent from the new file, so the new-side counter holds.
    }

    return added
}

/**
 * @summary Scopes archaeology hits to the lines a commit actually adds (per-commit / lint-staged mode).
 *
 * Full-file `findTicketRefs` preserves block-comment context; this then keeps only hits on staged-added
 * lines so a clean diff is never blocked by pre-existing legacy refs in untouched regions. A null
 * `addedLines` (git unavailable) returns every hit — the safe full-file fallback, never a blind pass.
 * @param {Object[]} hits `[{line, text}]` from findTicketRefs.
 * @param {Set<Number>|null} addedLines Staged added line numbers, or null to fall back to all hits.
 * @returns {Object[]} The retained hits.
 */
export function filterToAddedLines(hits, addedLines) {
    if (addedLines === null) {
        return hits
    }

    return hits.filter(hit => addedLines.has(hit.line))
}

/**
 * @summary Default git-diff runner: argv-based `spawnSync` (never a shell string — staged filenames are
 * untrusted hook input), comparing staged content against HEAD with zero context lines.
 * @param {String} file
 * @param {String} gitRoot
 * @returns {Object} The `spawnSync` result (`{status, stdout, error}`).
 */
function defaultGitDiff(file, gitRoot) {
    return spawnSync('git', ['diff', '--cached', '--unified=0', '--no-color', '--', file], {cwd: gitRoot, encoding: 'utf-8'})
}

/**
 * @summary Returns the staged added-line set for a file, or null when git cannot be consulted.
 *
 * Parses the injected git-diff result: an empty diff yields an empty set (nothing added → nothing to
 * flag), while a git failure (spawn error, non-zero status, or missing stdout — git absent / not a repo)
 * returns null so the caller falls back to a full-file scan rather than passing blindly. The runner is
 * argv-based (no shell string built from the staged filename) and injectable so the fallback branch is
 * unit-testable without a live repo.
 * @param {String} file
 * @param {String} gitRoot
 * @param {Function} [runGitDiff=defaultGitDiff] (file, gitRoot) → spawnSync-shaped result.
 * @returns {Set<Number>|null}
 */
export function stagedAddedLines(file, gitRoot, runGitDiff = defaultGitDiff) {
    const result = runGitDiff(file, gitRoot);

    if (!result || result.error || result.status !== 0 || typeof result.stdout !== 'string') {
        return null
    }

    return parseAddedLines(result.stdout)
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
        .argument('[files...]', 'Specific .mjs files to scan (lint-staged passes staged paths here). When omitted, falls back to scanning --dirs.')
        .option('-d, --dirs <list>', 'Comma-separated directories to scan in default mode.', DEFAULT_DIRS.join(','))
        .option('-i, --ignore <list>', 'Comma-separated path fragments to exclude from default-mode scan.', DEFAULT_IGNORES.join(','))
        .option('-q, --quiet', 'Suppress the per-violation listing; print summary only.', false)
        .showHelpAfterError();

    program.parse(process.argv);

    const argvFiles = program.args,
          options   = program.opts(),
          scanDirs  = options.dirs.split(',').map(s => s.trim()).filter(Boolean),
          ignores   = options.ignore.split(',').map(s => s.trim()).filter(Boolean);

    function collectDefaultFiles() {
        const findArgs = ['-type', 'f', '-name', '*.mjs'];
        ignores.forEach(ignore => findArgs.push('-not', '-path', `*/${ignore}/*`));

        const result = spawnSync('find', [...scanDirs, ...findArgs], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    // Per-commit mode: lint-staged passes explicit staged paths. Sweep mode: no args → scan --dirs whole.
    const perCommit = argvFiles.length > 0,
          files     = perCommit
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

        // Full scan preserves block-comment context; in per-commit mode, scope hits to the lines this
        // commit adds so a clean diff is never blocked by pre-existing legacy refs it never touched. The
        // no-args sweep keeps full-file scanning for deliberate cleanup runs.
        const hits   = findTicketRefs(content),
              scoped = perCommit ? filterToAddedLines(hits, stagedAddedLines(file, gitRoot)) : hits;

        scoped.forEach(({line, text}) => violations.push(`${file}:${line}: ${text}`));
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-ticket-archaeology: ${violations.length} ticket ref(s) in durable comments:\x1b[0m`);
        if (!options.quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nDurable comments/JSDoc must describe behavior, not cite tracking tickets (they rot when');
            console.error('tickets close/rename). Move the ref to the PR body / commit subject, or — only if genuinely');
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
