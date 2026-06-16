import catharsis            from 'catharsis';
import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}       from 'node:fs';
import path                 from 'node:path';
import process              from 'node:process';
import {fileURLToPath}      from 'node:url';

/*
 * Substrate gate against unparseable JSDoc type expressions in the docs build.
 *
 * The docs build (`npm run generate-docs-json` — the last `build all` step) parses every `{type}` with
 * `jsdoc-x` → `catharsis` (the Closure/JSDoc type grammar, NOT TypeScript). A TS-like expression catharsis
 * cannot parse throws inside a parse batch; the build then fails the whole run (by design) and the
 * docs app loses that content. That failure surfaces late (last build step) and aborts on the first bad
 * batch without enumerating the rest. This lint runs the SAME parser, ahead of the build, over every
 * offender — so authors see it at commit / PR time instead of in a broken `build all`.
 *
 * Dependency note: unlike the dependency-free lint workflows, this one imports `catharsis` (a transitive
 * dep of `jsdoc-api`), so its CI workflow runs `npm ci --ignore-scripts`. Running the real parser — rather
 * than approximating it with a regex — is deliberate: the failure mode is a catharsis tokenizer quirk (a
 * bare union in a record value breaks only with no space after the colon), which no regex can classify
 * without false-positives on the many valid spaced/parenthesized record-unions across the codebase.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// JSDoc tags whose {type} the docs build must be able to parse.
const TYPE_TAG = /@(param|returns?|type|property|prop|typedef|yields?|throws|exception|augments|member|enum)\b/;

// The authored-source surface the team writes JSDoc in — intentionally BROADER than the docs build's
// current parse set (which only covers configured apps): an unparseable type is a defect anywhere, even
// where `generate-docs-json` does not yet reach (an unconfigured app/example becomes a build break the
// moment it is wired in). Excludes underscore-prefixed aggregators, node_modules/dist, and the machine-
// local config overlays.
const DEFAULT_DIRS = ['src', 'ai', 'examples', 'apps', 'docs/app'];
const EXCLUDE      = /(^|\/)_|\/node_modules\/|\/dist\/|(^|\/)ai\/config\.mjs$|(^|\/)ai\/mcp\/server\/[^/]+\/config\.mjs$/;

/**
 * @summary Reads the balanced `{type}` starting at `braceStart` on line `i`, spanning continuation lines.
 *
 * The OUTER braces are the tag wrapper, so the returned string is the inner type expression catharsis
 * parses — e.g. `@returns {{a:String}}` yields `{a:String}`, `@param {String}` yields `String`. Continuation
 * lines have their leading ` * ` stripped. Returns `''` if the braces never balance (malformed / not a type).
 * @param {String[]} lines
 * @param {Number} i Index of the line carrying the tag.
 * @param {Number} braceStart Column of the tag's opening `{` on line `i`.
 * @returns {String}
 */
export function extractType(lines, i, braceStart) {
    let depth = 0, expr = '', li = i, done = false;

    while (li < lines.length && !done) {
        const l = lines[li];
        let start = li === i ? braceStart : 0;

        if (li !== i) {
            const lead = l.match(/^\s*\*\s?/);
            if (lead) start = lead[0].length
        }

        for (let k = start; k < l.length; k++) {
            const ch = l[k];
            if      (ch === '{') { depth++; if (depth > 1) expr += ch }
            else if (ch === '}') { depth--; if (depth === 0) { done = true; break } expr += ch }
            else if (depth >= 1) expr += ch
        }

        if (!done) { expr += ' '; li++ }
    }

    return done ? expr.trim() : ''
}

/**
 * @summary Extracts each `/**`-block JSDoc type expression and returns the ones catharsis cannot parse.
 *
 * Only `/** … *\/` doc blocks are scanned — jsdoc ignores `/* … *\/` block comments and `//` lines, so a
 * type-like token inside those is not a build input and flagging it would be a false positive. Within a doc
 * block, the balanced `{type}` after a type-bearing tag is parsed with the SAME parser the docs build uses
 * (`catharsis`, jsdoc dictionary), so a hit here is exactly what breaks `npm run generate-docs-json`.
 * @param {String} content Raw file source.
 * @returns {Object[]} `[{line, tag, expr}]` — one entry per unparseable type expression (1-based line).
 */
export function findUnparseableTypes(content) {
    const lines    = content.split('\n'),
          failures = [];

    let inBlock = false, isDoc = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!inBlock) {
            const open = line.indexOf('/*');
            if (open !== -1) {
                inBlock = true;
                isDoc   = line[open + 2] === '*' // `/**` opens a doc block; `/*` (single star) does not
            }
        }

        if (inBlock && isDoc) {
            const tag = line.match(TYPE_TAG);

            if (tag) {
                const braceStart = line.indexOf('{', tag.index);

                if (braceStart !== -1) {
                    const expr = extractType(lines, i, braceStart);

                    if (expr) {
                        try { catharsis.parse(expr, {jsdoc: true}) }
                        catch (e) { failures.push({line: i + 1, tag: tag[1], expr}) }
                    }
                }
            }
        }

        if (inBlock && line.includes('*/')) {
            inBlock = false;
            isDoc   = false
        }
    }

    return failures
}

/**
 * @summary Normalizes an input path (absolute from lint-staged, or relative) to a repo-relative POSIX path.
 * @param {String} file
 * @param {String} gitRoot
 * @returns {String}
 */
export function toRepoRelative(file, gitRoot) {
    return path.relative(gitRoot, path.resolve(gitRoot, file)).split(path.sep).join('/')
}

/**
 * @summary True when `file` (repo-relative POSIX) is inside the docs-build parse scope and not excluded.
 * @param {String} file
 * @returns {Boolean}
 */
export function inScope(file) {
    if (!file.endsWith('.mjs') || EXCLUDE.test(file)) return false;
    return DEFAULT_DIRS.some(dir => file === dir || file.startsWith(dir + '/'))
}

function collectDefaultFiles(gitRoot) {
    const result = spawnSync('find', [...DEFAULT_DIRS, '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
    // A missing optional dir makes `find` exit non-zero while still listing the others — tolerate stdout.
    return (result.stdout || '').trim().split('\n').filter(Boolean)
}

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim()
    } catch (e) {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1)
    }

    // Minimal argv parse — no extra dep. lint-staged passes staged paths as positional args; no args = the
    // full docs-build-scope scan (CI). `--quiet` suppresses the per-violation listing.
    const rawArgv   = process.argv.slice(2),
          quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    const rawFiles = argvFiles.length > 0 ? argvFiles : collectDefaultFiles(gitRoot);
    const files    = rawFiles.map(f => toRepoRelative(f, gitRoot)).filter(inScope);

    if (files.length === 0) {
        console.log('check-jsdoc-types: 0 in-scope .mjs files, nothing to check.');
        process.exit(0)
    }

    const violations = [];
    for (const file of files) {
        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8')
        } catch (e) {
            console.error(`check-jsdoc-types: could not read ${file}: ${e.message}`);
            continue
        }
        findUnparseableTypes(content).forEach(({line, tag, expr}) => violations.push(`${file}:${line}  @${tag} {${expr}}`))
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-jsdoc-types: ${violations.length} unparseable JSDoc type expression(s):\x1b[0m`);
        if (!quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nThe docs build (`npm run generate-docs-json`, the last `build all` step) parses these with');
            console.error('jsdoc-x → catharsis (Closure/JSDoc grammar, NOT TypeScript); an unparseable type fails the build');
            console.error('and breaks the docs app. Most common cause: a TS-like type — typically a bare union inside a');
            console.error('record value with no space after the colon (`{a:Object|null}`). Fix: parenthesize the union');
            console.error('(`{a:(Object|null)}`) or add a space (`{a: Object|null}`); use a `@typedef` for complex shapes.')
            console.error('See .github/CODING_GUIDELINES.md#11-jsdoc-type-expressions for accepted forms.')
        }
        process.exit(1)
    }

    console.log(`check-jsdoc-types: ${files.length} file(s) scanned, 0 unparseable type expressions.`)
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
