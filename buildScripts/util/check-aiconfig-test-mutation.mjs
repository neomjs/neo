import {execSync, spawnSync} from 'node:child_process';
import {readFileSync}  from 'node:fs';
import path            from 'node:path';
import process         from 'node:process';
import {fileURLToPath} from 'node:url';

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
    'test/playwright/unit/ai/daemons/orchestrator/services/DreamService.spec.mjs',
    'test/playwright/unit/ai/daemons/orchestrator/services/DreamServiceGoldenPath.spec.mjs',
    'test/playwright/unit/ai/mcp/server/knowledge-base/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/memory-core/Server.spec.mjs',
    'test/playwright/unit/ai/mcp/server/memory-core/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/neural-link/logger.spec.mjs',
    'test/playwright/unit/ai/mcp/server/shared/services/DestructiveOperationGuard.spec.mjs',
    'test/playwright/unit/ai/scripts/runners/runSandman.spec.mjs',
    'test/playwright/unit/ai/services/graph/GoldenPathSynthesizer.spec.mjs',
    'test/playwright/unit/ai/services/graph/LazyEdgeDrainer.spec.mjs',
    'test/playwright/unit/ai/services/graph/SemanticGraphExtractor.spec.mjs',
    'test/playwright/unit/ai/services/ingestion/ConceptIngestor.spec.mjs',
    'test/playwright/unit/ai/services/ingestion/MemorySessionIngestor.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/CoalescingEngineService.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/DatabaseService.backupPath.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/DatabaseService.graphBackup.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/DatabaseService.importMergeChroma.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/FileSystemIngestor.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/PermissionService.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/SessionService.ResumeValidation.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/SessionSummarization.spec.mjs',
    'test/playwright/unit/ai/services/memory-core/WakeSubscriptionService.spec.mjs'
]);

/**
 * @summary Builds a per-character "is this code?" mask for a line — false inside string literals and
 * comments, true in executable code.
 *
 * Block-comment state is carried across lines via `state.inBlock`. Unlike a strip-to-text pass the mask
 * preserves positions, so a regex match found on the RAW line can be classified by whether its root
 * token sits in code. That is what lets a string-literal *bracket key* (`['storagePaths']` — real code
 * that merely contains a string) be detected, while a mutation pattern living entirely inside a string
 * (a log message, a `describe(...)` title) is excluded. The structural complement of
 * `check-ticket-archaeology.mjs`'s `extractComment`.
 * @param {String} line
 * @param {{inBlock: Boolean}} state Mutated in place as block comments open and close across lines.
 * @returns {Boolean[]} `mask[i]` is true when raw character `i` is executable code.
 */
export function codeMask(line, state) {
    const n    = line.length,
          mask = new Array(n).fill(false);

    let i = 0;

    if (state.inBlock) {
        const end = line.indexOf('*/');

        if (end === -1) {
            return mask
        }

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
            break
        }

        if (ch === '/' && next === '*') {
            const end = line.indexOf('*/', i + 2);

            if (end === -1) {
                state.inBlock = true;
                break
            }

            i = end + 2;
            continue
        }

        mask[i] = true;
        i++
    }

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
        if (line.includes(ESCAPE_MARKER)) {
            return
        }

        const mask = codeMask(line, state);

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
