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
 */
import {execSync}      from 'child_process';
import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';
import {classifyHarness} from '../../services/memory-core/helpers/harnessClassifier.mjs';

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

// In WAL mode, SQLite opens three sibling files on each connection: the main DB, the
// Write-Ahead Log, and the shared-memory index. Checking all three gives a complete
// picture — a process briefly between checkpoints may only hold -wal / -shm open.
const SQLITE_WAL  = `${SQLITE_MAIN}-wal`;
const SQLITE_SHM  = `${SQLITE_MAIN}-shm`;

const jsonOutput = process.argv.includes('--json');

/**
 * @summary Shell out to `lsof -F pcn` to list processes holding a set of files open.
 *
 * `-F pcn` emits a machine-parseable record format: each attribute on its own line
 * with a single-letter tag prefix — `p` = PID, `c` = command name, `n` = file name.
 * Records for the same process across multiple open file descriptors repeat the
 * `p` line, so deduplication by PID happens downstream in {@link listHoldingProcesses}.
 *
 * `lsof` exits with status 1 when no matching processes are found. This is treated
 * as a successful "empty result," not an error — matching the Projection Layer
 * expectation that zero holders is a valid observation.
 *
 * @param {Array<String>} files Absolute paths to probe. Non-existent paths are silently skipped by lsof.
 * @returns {String} Raw lsof output (possibly empty string).
 */
function runLsof(files) {
    const existing = files.filter(f => fs.existsSync(f));
    if (existing.length === 0) return '';

    try {
        return execSync(`lsof -F pcn -- ${existing.map(f => `'${f}'`).join(' ')}`, {
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        });
    } catch (error) {
        // Exit code 1 = no matching processes; not an error
        if (error.status === 1) return '';
        if (error.code === 'ENOENT') {
            console.error('Platform not supported: this diagnostic requires `lsof` (macOS / Linux).');
            return '';
        }
        throw new Error(`lsof failed: ${error.message || error}`);
    }
}

/**
 * @summary Parse `lsof -F pcn` output into structured process-file records.
 *
 * Each record in lsof's field-delimited format spans multiple lines; a new record
 * starts on every `p` (PID) tag. We accumulate the current record until the next
 * `p` flush, then push it. This preserves the architectural invariant that one
 * record represents one PID and its associated files. Deduplication by PID happens
 * at the caller boundary (see `uniqueProcesses` in main).
 *
 * @param {String} raw Raw lsof output.
 * @returns {Array<{pid: number, command: string, files: string[]}>}
 */
function parseLsofOutput(raw) {
    const records = [];
    let current   = null;

    for (const line of raw.split('\n')) {
        if (!line) continue;
        const tag   = line[0];
        const value = line.slice(1);

        if (tag === 'p') {
            if (current && current.pid) records.push(current);
            current = {pid: parseInt(value, 10), files: []};
        } else if (current) {
            if (tag === 'c') current.command = value;
            else if (tag === 'n') current.files.push(value);
        }
    }
    if (current && current.pid) records.push(current);

    return records;
}

/**
 * @summary List processes currently holding any of the memory-core SQLite files open.
 *
 * Delegates to {@link runLsof} + {@link parseLsofOutput} to run the OS-level probe
 * and shape its raw output into the Projection Layer the rest of the script
 * consumes. Returns one entry per process with an array of its files. The caller
 * dedupes across records by PID.
 *
 * @returns {Array<{pid: number, command: string, files: string[]}>}
 */
function listHoldingProcesses() {
    const raw = runLsof([SQLITE_MAIN, SQLITE_WAL, SQLITE_SHM]);
    return parseLsofOutput(raw);
}

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

    const holders = listHoldingProcesses();

    // Enrich with harness classification, then dedupe by PID (lsof emits one record
    // per open file descriptor; a single process with main+wal+shm open yields 3
    // entries that we collapse to one, merging the files array).
    const enriched = holders.map(h => {
        const {harness, chain} = classifyHarness(h.pid);
        return {pid: h.pid, command: h.command, files: Array.from(new Set(h.files)), harness, chain};
    });

    const processMap = new Map();
    for (const p of enriched) {
        if (processMap.has(p.pid)) {
            const existing = processMap.get(p.pid);
            existing.files = Array.from(new Set([...existing.files, ...p.files]));
        } else {
            processMap.set(p.pid, p);
        }
    }
    const uniqueProcesses = Array.from(processMap.values());

    const byHarness = {};
    for (const p of uniqueProcesses) {
        byHarness[p.harness] = (byHarness[p.harness] || 0) + 1;
    }

    if (jsonOutput) {
        console.log(JSON.stringify({
            sqliteFile    : SQLITE_MAIN,
            totalProcesses: uniqueProcesses.length,
            byHarness,
            processes     : uniqueProcesses
        }, null, 2));
        return;
    }

    console.log(`\nMCP Concurrency Diagnostic — ${SQLITE_MAIN}\n`);

    if (uniqueProcesses.length === 0) {
        console.log('  No processes currently hold this SQLite file open.\n');
        console.log('  Expected when: no MCP memory-core server is running.');
        console.log('  Unexpected when: you have Claude Desktop / Claude Code / Antigravity open.\n');
        return;
    }

    console.log(`  Total processes: ${uniqueProcesses.length}\n`);
    console.log('  By harness:');
    for (const [harness, count] of Object.entries(byHarness).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${harness.padEnd(18)} ${count}`);
    }
    console.log('\n  Process detail:');
    console.log('    PID       command          harness');
    console.log('    --------  ---------------  ------------------');
    for (const p of uniqueProcesses) {
        const pidStr     = String(p.pid).padStart(8);
        const cmdStr     = (p.command || '').padEnd(15);
        console.log(`    ${pidStr}  ${cmdStr}  ${p.harness}`);
    }
    console.log('');
}

main();
