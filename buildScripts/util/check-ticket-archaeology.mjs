import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}        from 'node:fs';
import path                  from 'node:path';
import process               from 'node:process';
import {fileURLToPath}       from 'node:url';

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
 * @summary Built-in argv parser (no commander dep) so the guard runs in CI without `npm ci` — matching the
 * sibling lint-scripts (e.g. lint-skill-manifest). Supports `--dirs`/`--ignore` (`=value` or space-separated),
 * `--quiet`, `--skip`, `--base <ref>`, and bare positional file paths.
 * @param {string[]} [argv=process.argv.slice(2)]
 * @returns {{options: {dirs: string, ignore: string, quiet: boolean, skip: boolean, base: ?string}, files: string[]}}
 */
function parseArgs(argv = process.argv.slice(2)) {
    const options = {dirs: DEFAULT_DIRS.join(','), ignore: DEFAULT_IGNORES.join(','), quiet: false, skip: false, base: null};
    const files   = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '-d' || arg === '--dirs')        { options.dirs   = argv[++i]; }
        else if (arg.startsWith('--dirs='))          { options.dirs   = arg.slice('--dirs='.length); }
        else if (arg === '-i' || arg === '--ignore') { options.ignore = argv[++i]; }
        else if (arg.startsWith('--ignore='))        { options.ignore = arg.slice('--ignore='.length); }
        else if (arg === '-q' || arg === '--quiet')  { options.quiet  = true; }
        else if (arg === '-s' || arg === '--skip')   { options.skip   = true; }
        else if (arg === '-b' || arg === '--base')   { options.base   = argv[++i]; }
        else if (arg.startsWith('--base='))          { options.base   = arg.slice('--base='.length); }
        else                                         { files.push(arg); }
    }

    return {options, files};
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

    const {options, files: argvFiles} = parseArgs();
    const scanDirs                    = options.dirs.split(',').map(s => s.trim()).filter(Boolean),
          ignores  = options.ignore.split(',').map(s => s.trim()).filter(Boolean);

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

        const result = spawnSync('find', [...scanDirs, ...findArgs], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    // CI mode: the in-scope (.mjs, within scanDirs, not ignored) files CHANGED vs the base ref. Deletions
    // (--diff-filter=d excludes them) cannot carry archaeology; renames/edits exist on HEAD → readable.
    function changedFilesVsBase(base) {
        const result = spawnSync('git', ['diff', '--name-only', '--diff-filter=d', `${base}...HEAD`], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error(`\x1b[31mError: git diff against '${base}' failed.\x1b[0m`);
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean)
            .filter(f => f.endsWith('.mjs'))
            .filter(f => scanDirs.some(dir => f === dir || f.startsWith(`${dir}/`)))
            .filter(f => !ignores.some(ignore => f.split('/').includes(ignore)));
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
