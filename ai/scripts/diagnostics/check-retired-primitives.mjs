import {execFileSync} from 'node:child_process';
import path           from 'node:path';
import process        from 'node:process';

/**
 * Pre-Flight (structural fast-path): `ai/scripts/diagnostics/check-retired-primitives.mjs`
 * matches the sibling pattern of `ai/scripts/diagnostics/check-substrate-size.mjs` and
 * `ai/scripts/lint/lint-skill-manifest.mjs` in `ai/scripts/`; all are mechanical-enforcement /
 * CI scripts for agent substrate validation; sibling-file-lift applies; no novel directory choice.
 *
 * @summary CI grep-fail check that retired Agent-OS primitives are not re-introduced under `ai/`.
 *
 * Three enforcement categories:
 *   1. **Retired module imports** — a retired primitive imported from a non-spec source file
 *      (the Clean-Cut Pattern).
 *   2. **Retired per-MCP-server config flags** — a removed boot-time auto-* flag re-declared as a
 *      `leaf(...)` in a server `config.template.mjs`.
 *   3. **Retired MCP tools** — a removed tool's `operationId` re-added to a server `openapi.yaml`
 *      (the tool-shape SSOT).
 *
 * Why categories 2 + 3 exist: the orchestrator daemon is the single source of truth for background
 * memory/KB maintenance. The Agent OS evolves fast, so a backlog ticket older than a week may carry
 * a premise a later migration has obsoleted. A fresh session acting on such a ticket can naively
 * "re-implement the missing config" and resurrect a per-MCP-instance self-trigger — the exact pattern
 * that caused duplicate background work across harness-spawned instances. A comment cannot stop that;
 * a red merge-gate can. This guard converts that regression class into an unmergeable failure with a
 * premise-correcting message that names the owning subsystem.
 *
 * @see learn/agentos/decisions/0004-github-content-architecture.md §2.6 Clean-Cut Pattern
 */

const SEARCH_ROOT = 'ai/';

/**
 * Orchestrator-SSOT migration references, surfaced in the category 2 + 3 failure messages so a
 * developer who hits the guard can find why the primitive was retired and who owns the behavior now.
 * Load-bearing (it is the actionable pointer), not decorative archaeology.
 */
const ORCHESTRATOR_REF = '#12139 / #12065';

/**
 * Retired module-import fragments that MUST NOT be imported from non-spec source files.
 * Each entry is the import-path fragment as it appears inside a `from '...'` clause.
 * Add entries as the retired-primitives table grows. The Clean-Cut Pattern mandates
 * deletion, not preservation as dead code.
 */
const RETIRED_PRIMITIVES = [
    'shared/chunkPath.mjs',
    'shared/archivePath.mjs'
];

/**
 * Retired per-MCP-server boot-time config flags. The orchestrator daemon
 * drives every one of these behaviors on its own schedule (dream / summary / golden-path / chroma /
 * kbSync tasks). Re-declaring any as a `leaf(...)` in a server `config.template.mjs` would resurrect
 * the per-instance self-trigger that caused duplicate background work across harness-spawned MCP
 * instances (Claude Desktop / Codex / Antigravity each spawn N instances per server).
 *
 * `autoStartInference` is the canonical trap: its config was string-matched but the auto-start LOGIC
 * was never implemented. A stale ticket reading "implement inference auto-start" would lead a fresh
 * session to re-add the flag, not knowing the orchestrator owns inference lifecycle (mlx/lms
 * continuous tasks). De-duplicated across servers (`autoStartDatabase` was declared in both
 * memory-core and knowledge-base).
 */
const RETIRED_CONFIG_FLAGS = [
    'autoSummarize',
    'autoStartDatabase',
    'autoStartInference',
    'autoDream',
    'autoGoldenPath',
    'realTimeMemoryParsing',
    'autoIngestFileSystem',
    'autoSync'
];

/**
 * Retired MCP tools. The orchestrator daemon owns the Chroma database lifecycle
 * (`manage_database`) and session summarization (`summarize_sessions`) — the MCP servers are pure
 * clients. Re-adding an `operationId` for either to a server `openapi.yaml` re-advertises a tool the
 * orchestrator owns (and breaks the derived tool-consistency specs, which assert that every
 * `operationId` has a `serviceMapping` handler).
 */
const RETIRED_MCP_TOOLS = [
    'manage_database',
    'summarize_sessions'
];

/**
 * Escapes ALL regex metacharacters in a string fragment so it can be safely embedded in an
 * extended-regex pattern, keeping retired-item entries from becoming regex metacharacter input.
 * Matches MDN's canonical `escapeRegExp` shape.
 *
 * @param {string} s Raw fragment string to escape.
 * @returns {string} Regex-safe escaped form.
 */
function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Builds the three enforcement categories. Each declares: the retired `items`, the grep extended-regex
 * `pattern` that detects a re-introduction, the file `include` globs to scan (empty = all files), the
 * `exclude` globs, and a premise-correcting `help` footer printed on a hit. A category with zero items
 * is skipped by {@link main}.
 *
 * - **import** — `from '...<fragment>'` across all of `ai/` (excluding specs), tolerating single,
 *   double, or template-literal quoting.
 * - **config flag** — `<flag>:` as an object key (anchored to line-start indentation, so JSDoc/comment
 *   mentions like ` * autoSync:` or `// autoSync` do not match), scanned only in `config.template.mjs`.
 * - **MCP tool** — `operationId: <tool>` at line end (so `manage_database_v2` does not false-match),
 *   scanned only in `openapi.yaml`.
 *
 * @returns {Array<{label:string, items:string[], pattern:string, include:string[], exclude:string[], help:string[]}>}
 */
function buildCategories() {
    return [
        {
            label  : 'retired-primitive import',
            items  : RETIRED_PRIMITIVES,
            pattern: RETIRED_PRIMITIVES.map(f => `from[[:space:]]+['"\`].*${escapeRegex(f)}`).join('|'),
            include: [],
            exclude: ['*.spec.mjs', '*.test.mjs'],
            help   : [
                'Refer to ADR 0004 §2.6 (Clean-Cut Pattern) and §5.6 (Deprecation-theater anti-pattern):',
                '  learn/agentos/decisions/0004-github-content-architecture.md',
                'Retired primitives must be DELETED, not preserved as dead code after call-site migration.'
            ]
        },
        {
            label  : 'retired config flag',
            items  : RETIRED_CONFIG_FLAGS,
            pattern: RETIRED_CONFIG_FLAGS.map(f => `^[[:space:]]*${escapeRegex(f)}[[:space:]]*:`).join('|'),
            include: ['config.template.mjs'],
            exclude: [],
            help   : [
                `These boot-time auto-* flags are retired (${ORCHESTRATOR_REF}). The orchestrator daemon is the`,
                'single source of truth for dream / summary / golden-path / chroma / kbSync — per-MCP-server',
                'self-triggers caused duplicate background work across harness-spawned instances.',
                'Do NOT re-add the flag. If a backlog ticket told you to "implement" one of these, that ticket\'s',
                'premise is obsolete — close/annotate it rather than resurrect the config. (e.g. autoStartInference',
                'never had real logic; the orchestrator owns inference lifecycle via mlx/lms continuous tasks.)'
            ]
        },
        {
            label  : 'retired MCP tool',
            items  : RETIRED_MCP_TOOLS,
            pattern: RETIRED_MCP_TOOLS.map(t => `operationId:[[:space:]]*${escapeRegex(t)}[[:space:]]*$`).join('|'),
            include: ['openapi.yaml'],
            exclude: [],
            help   : [
                `These MCP tools are retired (${ORCHESTRATOR_REF}). The orchestrator owns the Chroma database`,
                'lifecycle (manage_database) and session summarization (summarize_sessions); the MCP servers are',
                'pure clients. Do NOT re-add the operationId — the orchestrator drives these behaviors.'
            ]
        }
    ];
}

/**
 * Runs one grep scan. Returns matching lines on hit, empty string on clean. Distinguishes "no match"
 * (grep exit 1, the CLEAN case) from a real grep error (exit 2+, re-thrown). Uses execFileSync (no
 * shell intermediate) so the pattern can contain all three quote types (`'`, `"`, `` ` ``) safely.
 *
 * @param {string} pattern Extended-regex pattern.
 * @param {Object} [opts]
 * @param {string[]} [opts.include=[]] grep `--include` globs (empty = all files).
 * @param {string[]} [opts.exclude=[]] grep `--exclude` globs.
 * @returns {string}
 */
function runScan(pattern, {include = [], exclude = []} = {}) {
    const args = [
        '-rnE',
        ...exclude.map(g => `--exclude=${g}`),
        ...include.map(g => `--include=${g}`),
        pattern,
        SEARCH_ROOT
    ];

    try {
        return execFileSync('grep', args, {encoding: 'utf8'});
    } catch (err) {
        if (err.status === 1) {
            // grep convention: exit 1 = zero matches (the CLEAN case).
            return '';
        }
        // exit 2+ = real grep error (bad pattern, unreadable file, etc.). Re-throw.
        throw err;
    }
}

function main() {
    const categories = buildCategories().filter(category => category.items.length > 0);

    if (categories.length === 0) {
        console.log('[checkRetiredPrimitives] PASS: no retired items configured — nothing to enforce.');
        process.exit(0);
    }

    console.log(`\n🔍 Checking for retired Agent-OS primitives under ${SEARCH_ROOT} ...`);
    categories.forEach(category => {
        console.log(`    ${category.label} (${category.items.length}): ${category.items.join(', ')}`);
    });
    console.log('-'.repeat(80));

    const failures = [];

    for (const category of categories) {
        const matches = runScan(category.pattern, {include: category.include, exclude: category.exclude});
        if (matches.trim() !== '') {
            failures.push({category, matches});
        }
    }

    if (failures.length === 0) {
        console.log(`✅ PASS: no retired imports, config flags, or MCP tools found under ${SEARCH_ROOT}.`);
        console.log(`    Substrate is in compliance (ADR 0004 §2.6 Clean-Cut Pattern + orchestrator-SSOT ${ORCHESTRATOR_REF}).\n`);
        process.exit(0);
    }

    console.error(`❌ FAIL: retired Agent-OS primitives re-introduced under ${SEARCH_ROOT}:\n`);

    for (const {category, matches} of failures) {
        console.error(`  ▸ ${category.label}:`);
        console.error(matches.replace(/^/gm, '      ').trimEnd());
        console.error('');
        category.help.forEach(line => console.error(`      ${line}`));
        console.error('');
    }

    console.error(`Root: ${path.resolve(process.cwd())}\n`);
    process.exit(1);
}

main();