import * as acorn            from 'acorn';
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

/**
 * @summary Builds the whole-file per-character "is this code?" mask — false inside string literals,
 * template quasis, regex literals and comments; true in executable code.
 *
 * Ground truth is `acorn`'s tokenizer, not a hand-rolled scan. Every non-code token's span is blanked
 * and everything else stays code, so whitespace and punctuation count as code — the same convention
 * the predecessor scanner used, which is what makes the migration provable rather than merely
 * plausible (see the zero-delta evidence on {@link #codeMask}).
 *
 * A tokenizer earns its place on template literals specifically: `tt.template` covers ONLY the quasi
 * text, so the executable interior of `${...}` — including nested interpolations — stays code by
 * construction. `tt.regexp` covers the whole literal, so a regex containing a quote can no longer
 * desync the remainder of its line. Both were live misclassification classes.
 * @param {String} source
 * @returns {Boolean[]}
 */
function buildFileMask(source) {
    const mask     = new Array(source.length).fill(true),
          comments = [],
          tt       = acorn.tokTypes;

    const blank = (start, end) => {
        for (let i = start; i < end && i < source.length; i++) {
            mask[i] = false
        }
    };

    // `acorn.parse` with `onToken` — NOT `acorn.tokenizer`. A standalone tokenizer is not
    // parser-informed, so it cannot resolve the slash ambiguity from grammar context: it reads the
    // regex in `for await (const x of y) /re/.test(x)` as TWO division operators, which is precisely
    // the class this upgrade exists to eliminate. The parser knows a statement can begin there and
    // emits one `regexp` token. The token streams are otherwise identical — they differ only on the
    // cases that need context, which is to say all the hard ones.
    acorn.parse(source, {
        ecmaVersion: 'latest',
        sourceType : 'module',
        onComment  : (block, text, start, end) => comments.push([start, end]),
        onToken    : token => {
            if (token.type === tt.string || token.type === tt.template || token.type === tt.regexp || token.type === tt.invalidTemplate) {
                blank(token.start, token.end)
            }
        }
    });

    comments.forEach(([start, end]) => blank(start, end));

    return mask
}

/**
 * @summary Cuts a whole-file mask into per-line slices. Newlines are dropped — a line's mask is
 * line-length, matching the per-line contract {@link #codeMask} exposes.
 * @param {String} source
 * @param {Boolean[]} mask
 * @returns {Boolean[][]}
 */
function sliceByLine(source, mask) {
    const masks = [];

    let offset = 0;

    for (const text of source.split('\n')) {
        masks.push(mask.slice(offset, offset + text.length));
        offset += text.length + 1
    }

    return masks
}

/**
 * @summary Builds a per-character "is this code?" mask for one line — false inside string literals,
 * template quasis, regex literals and comments, true in executable code.
 *
 * The mask preserves positions, so a regex match found on the RAW line is classified by whether its
 * root token sits in code. That is what lets a string-literal *bracket key* (`['storagePaths']` — real
 * code that merely contains a string) be detected, while a mutation pattern living entirely inside a
 * string (a log message, a `describe(...)` title) is excluded.
 *
 * **Parser-grade, and why that is not gold-plating.** The predecessor scanned character by character
 * and carried `state.inBlock` across lines. Six review cycles enumerated eight classes of valid
 * JavaScript it misread, each repair exposing the next — the class list is open-ended because
 * slash/continuation grammar is a parser problem. Measured against an `acorn` oracle over 1911 files,
 * that scanner disagreed on **418,515 characters across 1152 files** — yet on **0 of 156** real
 * pattern-match sites, which is why this swap is behaviour-preserving on today's corpus while
 * eliminating the classes by construction. Two reproduced live defects it could not survive:
 * a multi-line template read as code (false POSITIVE — `inString` was function-local, so it reset at
 * every newline), and `const re = /["']/; aiConfig.database = 1;` read as string (false NEGATIVE — the
 * safety-critical direction, a silently missed Class-A mutation).
 *
 * **Why `state` carries the source.** One tokenize per file, memoized here and sliced per line, keeps
 * the per-line contract both consumers depend on (A1 additionally reads a code-only PROJECTION of it)
 * without re-parsing 1900 times. `inBlock` is gone: comment continuity is now a property of the parse,
 * not a flag the caller must hand-carry — which also deletes a live defect, since a consumer that
 * skips a line (`findDbPathMutations` returns early on {@link #ESCAPE_MARKER}) silently corrupted
 * every line after it.
 * @param {String} line The raw line — used only to size the fallback mask.
 * @param {{source: String, lineMasks: Boolean[][], parseFailed: String}} state Carries the file source
 *     and memoizes the parse across the file's lines. Mutated in place on first call.
 * @param {Number} lineIndex 0-based index of `line` within `state.source`.
 * @returns {Boolean[]} `mask[i]` is true when raw character `i` is executable code.
 */
export function codeMask(line, state, lineIndex) {
    if (!state.lineMasks) {
        try {
            state.lineMasks = sliceByLine(state.source, buildFileMask(state.source))
        } catch (error) {
            // FAIL CLOSED. A lexically broken file (mid-edit, or a syntax this acorn cannot read) must
            // never mask to all-string: that would silently green-light every rule for the whole file,
            // and a safety-critical backstop reporting clean because it could not READ the code is the
            // worst failure available to it. All-code is the conservative direction — it over-reports
            // (a string quoting the pattern flags) rather than under-.
            state.parseFailed = error.message;
            state.lineMasks   = state.source.split('\n').map(text => new Array(text.length).fill(true))
        }
    }

    return state.lineMasks[lineIndex] ?? new Array(line.length).fill(true)
}

const DB_PATH_MUTATION_GLOBAL = new RegExp(DB_PATH_MUTATION.source, 'g');

/**
 * @summary Scans file content for Class-A DB-path `AiConfig` mutations whose root token sits in code.
 * @param {String} content
 * @returns {Object[]} `[{line, text}]` — one entry per offending line (1-based line numbers).
 */
export function findDbPathMutations(content) {
    const lines = content.split('\n'),
          state = {source: content},
          hits  = [];

    lines.forEach((line, index) => {
        if (line.includes(ESCAPE_MARKER)) {
            return
        }

        const mask = codeMask(line, state, index);

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

    // Minimal argv parse, hand-rolled because it is five lines and a CLI dependency would cost more
    // than it saves — NOT because this workflow avoids `npm install`. It no longer does: `codeMask`
    // imports acorn, so the workflow installs, like `jsdoc-type-lint`, `ticket-archaeology-lint`,
    // `tree-json-lint` and `config-template-ssot-lint` already did. (The claim previously stated
    // here — that the other lint workflows are dependency-free — was false when written.)
    // lint-staged passes staged paths as positional args; `--quiet` suppresses the per-violation listing.
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
