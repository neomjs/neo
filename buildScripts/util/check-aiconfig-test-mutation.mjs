import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}        from 'node:fs';
import path                  from 'node:path';
import process               from 'node:process';
import {fileURLToPath}       from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const scriptRoot = path.resolve(__dirname, '../..');

// Inline relief valve for a genuinely unavoidable test-config mutation (judgment-call escape, not a
// blanket bypass). A line carrying this marker is skipped.
export const ESCAPE_MARKER = 'aiconfig-mutation-ok';

/*
 * Class-A safety-critical DB-path leaves. A test that writes one of these to the shared `AiConfig`
 * singleton is the orphan-bleed mechanism: the reactive set-trap routes the assignment to the shared
 * provider, so failed cleanup / a shared process / test-ordering means the next consumer reads the
 * test DB — or a live read lands on test state (the B4 safety-critical class). A test must isolate by
 * construction (`UNIT_TEST_MODE` resolves the test DB), never mutate the singleton.
 *
 * The pattern requires an `aiConfig` / `Memory_Config` root before a dangerous leaf, so a non-config
 * `x.database = y` does not trip it; the trailing `=(?![=>])` excludes comparisons (`==` / `===`) and
 * arrows (`=>`), and a capture-read (`const x = aiConfig.storagePaths.graph`) has no `=` after the
 * leaf, so only true assignments match. A dangerous leaf is caught whether dot-accessed
 * (`.storagePaths`) or string-literal-bracket-accessed (`['storagePaths']`); a computed key
 * (`aiConfig[varName]`) is out of a static lint's reach — the escape marker + the by-construction
 * migration cover that residue. Config-VARYING leaves (retry / transport) are deliberately out of
 * scope here — that class has no by-construction story yet.
 */
const DB_PATH_LEAVES = '(?:storagePaths|database|collections|logPath)';
export const DB_PATH_MUTATION = new RegExp(
    `\\b(?:aiConfig|Memory_Config)\\b[\\w.$[\\]'"\`-]*` +                       // a config root, then any path chars
    `(?:\\.${DB_PATH_LEAVES}\\b|\\[\\s*['"\`]${DB_PATH_LEAVES}['"\`]\\s*\\])` + // a dangerous leaf: dot OR string-literal bracket
    `[\\w.$[\\]'"\`]*\\s*=(?![=>])`                                             // optional trailing path, then assignment (not == / =>)
);

/*
 * Files that already mutate Class-A DB paths, grandfathered while the cleanup migrates them to
 * by-construction isolation. The ratchet bites only NEW offenders; this set shrinks as the cleanup
 * lands. Paths are repo-relative POSIX.
 */
export const ALLOWLIST = new Set([
    'test/playwright/unit/ai/mcp/server/knowledge-base/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/memory-core/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/neural-link/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/shared/services/DestructiveOperationGuard.spec.mjs',
    'test/playwright/unit/ai/services/graph/GoldenPathSynthesizer.spec.mjs',
    'test/playwright/unit/ai/services/graph/LazyEdgeDrainer.spec.mjs',
    'test/playwright/unit/ai/services/graph/SemanticGraphExtractor.spec.mjs',
    'test/playwright/unit/ai/services/ingestion/ConceptIngestor.spec.mjs',
    'test/playwright/unit/ai/services/ingestion/MemorySessionIngestor.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/CoalescingEngineService.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/DatabaseService.backupPath.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/DatabaseService.importMergeChroma.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/FileSystemIngestor.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/PermissionService.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/SessionService.ResumeValidation.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/WakeSubscriptionService.spec.mjs'
]);

/*
 * Keywords after which a `/` starts a regex literal, not division (`return /x/` vs `count / x`).
 * The other half of the decision is the last significant code char: after an identifier char, `)`
 * or `]` a `/` is division; after operators, delimiters or nothing it opens a regex.
 */
const REGEX_PRECEDING_KEYWORDS = /^(?:return|typeof|instanceof|case|in|of|new|delete|void|yield|await|do|else)$/;

/*
 * Control-statement headers whose closing `)` puts the grammar back at expression START, so a
 * following `/` opens a regex (`if (ok) /re/.test(s)`), unlike a call/grouping `)` where `/` is
 * division (`foo(a) / b`). Tracked via a paren-word stack carried in state.
 */
const CONTROL_HEADER_KEYWORDS = /^(?:if|while|for|switch|catch|with)$/;

/**
 * @summary Decides whether a `/` at the current lexer position opens a regex literal.
 *
 * Standard lexer heuristic, not a parser, on three signals: `state.lastCode` (last significant
 * code char), `state.wordBuf` (trailing identifier run — the keyword half: `return /x/`), and
 * `state.controlParen` (whether the most recent `)` closed a control-statement header — the
 * grammar half: `if (ok) /x/` is a regex, `foo(a) / b` is division). Expression-ending literals
 * (closing quote/backtick, a finished regex) record the `]` proxy in `lastCode`, so a following
 * `/` is division. Known bound, documented at the mask: a division whose left operand ends on the
 * PREVIOUS line (ASI edge) misreads as regex.
 * @param {Object} state The carried lexer state.
 * @returns {Boolean}
 */
function regexAllowed(state) {
    const last = state.lastCode;

    if (!last) {
        return true
    }
    if (/[A-Za-z0-9_$]/.test(last)) {
        return REGEX_PRECEDING_KEYWORDS.test(state.wordBuf)
    }
    if (last === ')') {
        return state.controlParen === true
    }
    return last !== ']'
}

/**
 * @summary Consumes a regex literal starting at `line[i] === '/'`, returning the index after it.
 *
 * Honors `\` escapes and `[...]` character classes (where `/` is literal). Flags are consumed. A
 * regex literal cannot span lines in JS, so an unterminated body simply ends the line's scan.
 * @param {String} line
 * @param {Number} i Index of the opening `/`.
 * @returns {Number} Index of the first character after the literal (or `line.length`).
 */
function consumeRegex(line, i) {
    const n = line.length;

    let j       = i + 1,
        inClass = false;

    while (j < n) {
        const c = line[j];

        if (c === '\\') {
            j += 2;
            continue
        }
        if (inClass) {
            if (c === ']') {
                inClass = false
            }
            j++;
            continue
        }
        if (c === '[') {
            inClass = true;
            j++;
            continue
        }
        if (c === '/') {
            j++;
            while (j < n && /[a-z]/i.test(line[j])) {
                j++
            }
            return j
        }
        j++
    }

    return n
}

/**
 * @summary Builds a per-character "is this code?" mask for a line — false inside string literals,
 * comments, regex-literal bodies and template TEXT; true in executable code, including code inside
 * template interpolations at any nesting depth.
 *
 * Implemented as a stacked lexical state machine — the same frame model as
 * `check-block-alignment.mjs`'s `computeTemplateLiteralLineMask` (the repo precedent), adapted from
 * per-line booleans to per-char masks, with cross-line carried state and a regex-literal state that
 * checker does not need. Frames: the base `code` frame, a `template` frame per open backtick, an
 * `expression` frame per open `${` (brace-depth-tracked). Comments, quoted strings and regex
 * literals are handled ABOVE the frame dispatch, so a `}` inside any of them can never close an
 * expression frame early, and comment/string/regex text inside an interpolation is never code.
 *
 * Cross-line semantics: block comments, template frames and expression frames legally span lines
 * and carry in `state`; a multi-line template's text lines therefore mask as string, and a
 * line-comment inside a multi-line interpolation ends at EOL while the frame survives. Quoted
 * strings auto-close at EOL (unterminated ones are syntax errors in the valid JS this guard scans)
 * unless a line-final `\` continues them: the backslash escapes the LINE TERMINATOR — a
 * continuation consumes NO character on the next line, so an immediate closing delimiter at
 * column zero is processed normally (`state.stringContinues`). Expression-ending literals (a
 * closing quote, backtick, or regex) record the `]` proxy in `lastCode`, so a following `/` is
 * division, and a paren-word stack distinguishes a control-header `)` (regex follows: `if (ok)
 * /re/`) from a call/grouping `)` (division follows: `foo(a) / b`). Remaining documented bound:
 * a division whose left operand ends on the PREVIOUS line (ASI edge) misreads as regex. Unlike a
 * strip-to-text pass the mask preserves positions, so a regex match found on the RAW line can be
 * classified by whether its root token sits in code — a string-literal *bracket key*
 * (`['storagePaths']`, real code merely containing a string) stays detectable while a pattern
 * living entirely inside a string (a log message, a `describe(...)` title, a regex body) is
 * excluded. The structural complement of `check-ticket-archaeology.mjs`'s `extractComment`.
 * @param {Object} state Mutated in place; carries all cross-line lexer state. Constructing it as
 *     `{inBlock: false}` remains sufficient — richer fields self-initialize on first use.
 * @param {Boolean} state.inBlock Inside a block comment.
 * @param {Object[]} [state.stack] Lexical frames: `{type: 'code'|'template'|'expression'}`.
 * @param {String|null} [state.stringQuote] Open quote character of a quoted string.
 * @param {Boolean} [state.stringContinues] A line-final `\` inside a quoted string escaped the
 *     line terminator — the string legally continues on the next line.
 * @param {String} [state.lastCode] Last significant code char (regex-vs-division heuristic).
 * @param {String} [state.wordBuf] Trailing identifier run (regex-after-keyword heuristic).
 * @param {String[]} [state.parenWords] Word immediately preceding each open `(` (control-header
 *     detection for the regex heuristic).
 * @param {Boolean} [state.controlParen] The most recent `)` closed a control-statement header.
 * @param {String} line
 * @returns {Boolean[]} `mask[i]` is true when raw character `i` is executable code.
 */
export function codeMask(line, state) {
    state.stack           ??= [{type: 'code'}];
    state.stringQuote     ??= null;
    state.stringContinues ??= false;
    state.lastCode        ??= '';
    state.wordBuf         ??= '';
    state.parenWords      ??= [];
    state.controlParen    ??= false;

    const n    = line.length,
          mask = new Array(n).fill(false);

    let i = 0;

    while (i < n) {
        const ch   = line[i],
              next = line[i + 1],
              ctx  = state.stack[state.stack.length - 1];

        if (state.inBlock) {
            const end = line.indexOf('*/', i);

            if (end === -1) {
                return mask
            }
            i             = end + 2;
            state.inBlock = false;
            continue
        }

        if (state.stringQuote) {
            if (ch === '\\') {
                // A line-final backslash escapes the line terminator: the string CONTINUES on the
                // next line and the continuation consumes no next-line character.
                if (i === n - 1) {
                    state.stringContinues = true
                }
                i += 2;
                continue
            }
            if (ch === state.stringQuote) {
                state.stringQuote = null;
                // A closing quote ends an expression: a following `/` is division.
                state.lastCode    = ']';
                state.wordBuf     = ''
            }
            i++;
            continue
        }

        if (ctx.type === 'template') {
            if (ch === '\\') {
                // Line-final: escapes the terminator; the template frame carries anyway and the
                // next line processes from column zero.
                i += 2;
                continue
            }
            if (ch === '`') {
                state.stack.pop();
                state.lastCode = ']';
                state.wordBuf  = '';
                i++;
                continue
            }
            if (ch === '$' && next === '{') {
                state.stack.push({type: 'expression', braceDepth: 1});
                i += 2;
                continue
            }
            i++;
            continue
        }

        // From here down the frame is code or expression — one shared dispatch, which is exactly
        // what makes nested templates and comments inside interpolations correct by construction.
        if (ch === '/' && next === '/') {
            break
        }

        if (ch === '/' && next === '*') {
            state.inBlock = true;
            i += 2;
            continue
        }

        if (ch === '"' || ch === "'") {
            state.stringQuote = ch;
            i++;
            continue
        }

        if (ch === '`') {
            state.stack.push({type: 'template'});
            i++;
            continue
        }

        if (ch === '/' && regexAllowed(state)) {
            i = consumeRegex(line, i);
            // A regex literal ends an expression: a following `/` is division. `]` is the
            // expression-ender proxy in the heuristic's char alphabet.
            state.lastCode = ']';
            state.wordBuf  = '';
            continue
        }

        if (ctx.type === 'expression') {
            if (ch === '{') {
                ctx.braceDepth++
            } else if (ch === '}') {
                ctx.braceDepth--;

                if (ctx.braceDepth === 0) {
                    state.stack.pop();
                    i++;
                    continue
                }
            }
        }

        mask[i] = true;

        if (!/\s/.test(ch)) {
            // Paren-word tracking: `(` records the word immediately preceding it; `)` decides
            // whether it closed a control-statement header (regex may follow) or a call/grouping
            // (division follows). Any other significant char invalidates a stale control-`)`.
            if (ch === '(') {
                state.parenWords.push(state.wordBuf)
            } else if (ch === ')') {
                state.controlParen = CONTROL_HEADER_KEYWORDS.test(state.parenWords.pop() ?? '')
            } else {
                state.controlParen = false
            }

            state.lastCode = ch;
            state.wordBuf  = /[A-Za-z0-9_$]/.test(ch) ? state.wordBuf + ch : ''
        }
        i++
    }

    // JS auto-terminates quoted strings at EOL (unterminated = syntax error upstream, CI runs a
    // parse check) — reset instead of poisoning the next line, except across a `\` continuation
    // (the line-terminator escape consumed above).
    if (state.stringQuote && !state.stringContinues) {
        state.stringQuote = null
    }
    state.stringContinues = false;

    return mask
}

const DB_PATH_MUTATION_GLOBAL = new RegExp(DB_PATH_MUTATION.source, 'g');

/**
 * @summary Scans file content for Class-A DB-path `AiConfig` mutations whose root token sits in code.
 * @param {String} content
 * @returns {Object[]} `[{line, text}]` — one entry per offending line (1-based line numbers).
 */
export function findDbPathMutations(content) {
    const lines = content.split('\n'),
          state = {inBlock: false},
          hits  = [];

    lines.forEach((line, index) => {
        // Mask computes UNCONDITIONALLY — before the escape check. Skipping a marker line would
        // corrupt the carried lexer state (block-comment flag, template/expression frames); the
        // escape valve is line-scoped for HITS, never for lexing. Same ordering rule as the B3/A5/A1
        // sibling checker.
        const mask = codeMask(line, state);

        if (line.includes(ESCAPE_MARKER)) {
            return
        }

        for (const match of line.matchAll(DB_PATH_MUTATION_GLOBAL)) {
            // The match starts at the aiConfig / Memory_Config root; flag it only when that root is real
            // code, not a string that merely quotes a mutation-looking pattern (a bracket key like
            // `['storagePaths']` is fine — its root token is still in code).
            if (mask[match.index]) {
                hits.push({line: index + 1, text: line.trim()});
                break
            }
        }
    });

    return hits
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

function main() {
    let gitRoot;
    try {
        gitRoot = execSync('git rev-parse --show-toplevel', {cwd: scriptRoot, encoding: 'utf-8'}).trim();
    } catch (e) {
        console.error('\x1b[31mError: Could not determine git repository root.\x1b[0m');
        process.exit(1);
    }

    // Minimal argv parse — no external deps, so the standalone CI workflow runs without `npm install`
    // (the dependency-free pattern the other lint workflows follow). lint-staged passes staged paths as
    // positional args; `--quiet` suppresses the per-violation listing.
    const rawArgv   = process.argv.slice(2),
          quiet     = rawArgv.includes('-q') || rawArgv.includes('--quiet'),
          argvFiles = rawArgv.filter(arg => !arg.startsWith('-'));

    function collectDefaultFiles() {
        const result = spawnSync('find', ['test', '-type', 'f', '-name', '*.mjs'], {cwd: gitRoot, encoding: 'utf-8'});
        if (result.status !== 0) {
            console.error('\x1b[31mError: find command failed.\x1b[0m');
            console.error(result.stderr);
            process.exit(1);
        }
        return result.stdout.trim().split('\n').filter(Boolean);
    }

    const rawFiles = argvFiles.length > 0 ? argvFiles : collectDefaultFiles();
    const files    = rawFiles
        .filter(f => f.endsWith('.mjs'))
        .map(f => toRepoRelative(f, gitRoot))
        .filter(f => f.startsWith('test/'));

    if (files.length === 0) {
        console.log('check-aiconfig-test-mutation: 0 test .mjs files in scope, nothing to check.');
        process.exit(0);
    }

    const violations = [];
    for (const file of files) {
        if (ALLOWLIST.has(file)) {
            continue
        }

        let content;
        try {
            content = readFileSync(path.resolve(gitRoot, file), 'utf-8');
        } catch (e) {
            console.error(`check-aiconfig-test-mutation: could not read ${file}: ${e.message}`);
            continue
        }

        findDbPathMutations(content).forEach(({line, text}) => violations.push(`${file}:${line}: ${text}`));
    }

    if (violations.length > 0) {
        console.error(`\x1b[31mcheck-aiconfig-test-mutation: ${violations.length} DB-path AiConfig mutation(s) in tests:\x1b[0m`);
        if (!quiet) {
            violations.forEach(v => console.error('  ' + v));
            console.error('\nA test must NEVER mutate the shared AiConfig DB paths — test data bleeds into live DBs (the');
            console.error('#12335 orphan incident; ADR-0019 §4 B4). Isolate by construction (UNIT_TEST_MODE resolves the');
            console.error(`test DB), or — only if genuinely unavoidable — add an "${ESCAPE_MARKER}: <reason>" marker on the line.`);
        }
        process.exit(1);
    }

    console.log(`check-aiconfig-test-mutation: ${files.length} test file(s) scanned, 0 new violations.`);
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (invokedDirectly) {
    main()
}
