/**
 * @summary Empirical diagnostic for cross-harness memory-core SQLite concurrency.
 *
 * Cross-harness MCP servers (Claude Desktop + each Claude Code session/worktree +
 * Antigravity with its twin-language-server 2x multiplier) each spawn independent
 * memory-core processes that target the SAME SQLite file at
 * `.neo-ai-data/sqlite/memory-core-graph.sqlite`.
 *
 * SQLite WAL mode handles storage-layer concurrency (multi-reader / single-writer),
 * but each process maintains its own `GraphService` singleton cache with no
 * cross-process invalidation. This script is the empirical probe that
 * quantifies the concurrency situation for cache-coherence design and
 * operations:
 *
 *   - How many processes currently hold the DB file open?
 *   - What are their PIDs and launching command names?
 *   - Which parent harness (Claude Desktop / Claude Code / Antigravity / other) do
 *     they belong to, resolved by walking the `ppid` chain?
 *
 * The output anchors cache-coherence decisions in empirical reality rather than
 * assumed architecture, and doubles as an on-call diagnostic when a binding-null or
 * stale-cache symptom surfaces again.
 *
 * Usage:
 *   node ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs            # human-readable report
 *   node ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs --json     # machine-readable JSON
 *
 * Platforms: macOS + Linux (uses `lsof`). On Linux, `fuser -v <file>` is an
 * alternative primitive with similar output; lsof was chosen because it ships by
 * default on both targets and emits a deterministic machine-parseable format via
 * `-F pcn`. Read-only: the script never signals, kills, or otherwise mutates the
 * processes it surfaces.
 *
 * @see ai/services/memory-core/GraphService.mjs  singleton cache origin
 * @see ai/graph/Database.mjs                                 vicinityLoadedNodes mark-without-load
 * @see ai/graph/storage/SQLite.mjs                           WAL pragma (storage layer is concurrency-safe)
 * @see learn/agentos/decisions/0001-cross-process-cache-coherence.md
 * @plane host
 */
import {execSync}                     from 'child_process';
import fs                             from 'fs';
import path                           from 'path';
import {fileURLToPath}                from 'url';
import {buildSqliteHolderDiagnostics} from '../../services/memory-core/helpers/harnessClassifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * @summary Resolve the primary-worktree root path (i.e. the main checkout).
 *
 * MCP servers across all harnesses are configured to target the MAIN checkout's
 * SQLite file (per `claude_desktop_config.json`'s absolute paths), so when this
 * script is invoked from a git worktree we must still probe the primary
 * checkout's `.neo-ai-data/sqlite/…` — not the worktree's local copy, which the
 * bootstrap step does not populate with live DB state.
 *
 * `git worktree list --porcelain` emits the primary worktree as its first entry
 * on all git versions that support worktrees. Falls back to the script's own
 * containing repo root if git isn't resolvable (e.g. script shipped outside a
 * checkout) — preserving the Structural Layer intent that this is a read-only
 * diagnostic, not a hard failure path.
 *
 * @returns {String} Absolute path to the primary worktree root.
 */
function resolvePrimaryCheckout() {
    try {
        const raw = execSync('git worktree list --porcelain', {
            encoding: 'utf8',
            cwd     : __dirname,
            stdio   : ['ignore', 'pipe', 'pipe']
        });
        const firstLine = raw.split('\n').find(l => l.startsWith('worktree '));
        if (firstLine) return firstLine.slice('worktree '.length).trim();
    } catch {
        // fall through to script-local fallback
    }
    return path.resolve(__dirname, '../../..');
}

const projectRoot = resolvePrimaryCheckout();
const SQLITE_MAIN = path.resolve(projectRoot, '.neo-ai-data/sqlite/memory-core-graph.sqlite');

const jsonOutput = process.argv.includes('--json');

/**
 * @summary Main entry point — gather empirical data, classify, render.
 *
 * The reporting shape honors two consumer identities in parallel: human operators
 * running the script interactively (human-readable table), and automation that
 * consumes the JSON output for CI diagnostics or future ADR evidence-capture
 * pipelines. Neither format mutates repository state or signals external
 * processes — strictly read-only, matching the cache-coherence ADR's avoided
 * trap of treating diagnostics as control-plane mutation.
 *
 * @returns {void} Exits with 0 on success, 1 if the SQLite file does not exist.
 */
function main() {
    if (!fs.existsSync(SQLITE_MAIN)) {
        const errMsg = `[diagnoseMcpConcurrency] SQLite file not found: ${SQLITE_MAIN}`;
        if (jsonOutput) {
            console.log(JSON.stringify({error: errMsg, processes: []}, null, 2));
        } else {
            console.error(errMsg);
            console.error('Has the memory-core MCP server ever started? Expected path:');
            console.error(`  ${SQLITE_MAIN}`);
        }
        process.exit(1);
    }

    const diagnostics = buildSqliteHolderDiagnostics({dbPath: SQLITE_MAIN});

    if (jsonOutput) {
        console.log(JSON.stringify(diagnostics, null, 2));
        return;
    }

    console.log(`\nMCP Concurrency Diagnostic — ${SQLITE_MAIN}\n`);

    if (diagnostics.status === 'degraded') {
        console.log(`  Diagnostic degraded: ${diagnostics.error}\n`);
        return;
    }

    if (diagnostics.totalProcesses === 0) {
        console.log('  No processes currently hold this SQLite file open.\n');
        console.log('  Expected when: no MCP memory-core server is running.');
        console.log('  Unexpected when: you have Claude Desktop / Claude Code / Antigravity open.\n');
        return;
    }

    console.log(`  Total processes: ${diagnostics.totalProcesses}\n`);
    console.log('  By harness:');
    for (const [harness, count] of Object.entries(diagnostics.byHarness).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${harness.padEnd(18)} ${count}`);
    }
    console.log('\n  Process detail:');
    console.log('    PID       command          harness');
    console.log('    --------  ---------------  ------------------');
    for (const p of diagnostics.processes) {
        const pidStr     = String(p.pid).padStart(8);
        const cmdStr     = (p.command || '').padEnd(15);
        console.log(`    ${pidStr}  ${cmdStr}  ${p.harness}`);
    }
    console.log('');
}

main();
