import {execSync as defaultExecSync} from 'node:child_process';
import {existsSync as defaultExistsSync} from 'node:fs';

const harnessLabels = {
    'claude-code'   : 'Claude Code',
    'claude-desktop': 'Claude Desktop',
    antigravity    : 'Antigravity',
    codex          : 'Codex',
    cursor         : 'Cursor',
    orchestrator   : 'Neo Orchestrator',
    unknown        : 'unknown',
    vscode         : 'VS Code'
};

/**
 * @summary Classifies the harness that owns a local MCP process by walking its parent process chain.
 *
 * The diagnostic is intentionally heuristic and read-only. It mirrors the process-chain
 * classifier used by `ai/scripts/diagnostics/diagnoseMcpConcurrency.mjs`, but lives at the Memory
 * Core SDK boundary so both operator scripts and boot-time server logging can share one contract.
 *
 * @param {Number}   pid                    Starting PID to inspect.
 * @param {Object}   [options]
 * @param {Function} [options.execSync]     Injectable command runner for tests.
 * @param {Number}   [options.maxDepth=8]   Parent-chain traversal cap.
 * @returns {{harness: String, chain: Array<{pid: Number, command: String}>}}
 */
export function classifyHarness(pid, {execSync = defaultExecSync, maxDepth = 8} = {}) {
    const chain = [];
    let cursor  = pid;

    for (let depth = 0; depth < maxDepth; depth++) {
        let raw;
        try {
            raw = execSync(`ps -o ppid=,comm= -p ${cursor}`, {
                encoding: 'utf8',
                stdio   : ['ignore', 'pipe', 'pipe']
            }).trim();
        } catch {
            break;
        }
        if (!raw) break;

        const match = raw.match(/^\s*(\d+)\s+(.*)$/);
        if (!match) break;

        const ppid    = parseInt(match[1], 10);
        const command = match[2];
        chain.push({pid: cursor, command});

        if (!ppid || ppid === 1 || ppid === cursor) break;
        cursor = ppid;
    }

    for (const entry of chain) {
        const cmd = entry.command.toLowerCase();
        if (cmd.includes('claude') && cmd.includes('code')) return {harness: 'claude-code', chain};
        if (cmd === 'claude' || cmd.endsWith('/claude'))    return {harness: 'claude-code', chain};
        if (cmd.includes('claude'))                         return {harness: 'claude-desktop', chain};
        if (cmd.includes('antigravity'))                    return {harness: 'antigravity', chain};
        if (cmd.includes('codex.app') || cmd.endsWith('/codex')) return {harness: 'codex', chain};
        if (cmd.includes('ai:orchestrator'))                return {harness: 'orchestrator', chain};
        if (cmd.includes('cursor'))                         return {harness: 'cursor', chain};
        if (cmd.includes('code helper') || cmd.includes('vscode')) return {harness: 'vscode', chain};
    }

    return {harness: 'unknown', chain};
}

/**
 * @summary Groups process records by owning harness while preserving PID and chain detail.
 *
 * @param {Array<{pid: Number, command: String}>} processes Process records to classify (`command` optional per record).
 * @param {Object} [options]
 * @param {Function} [options.classifier=classifyHarness] Injectable classifier for tests.
 * @returns {Array<{harness: String, label: String, processes: Array<Object>}>}
 */
export function groupProcessesByHarness(processes, {classifier = classifyHarness} = {}) {
    const groups = new Map();

    for (const processRecord of processes) {
        const {harness, chain} = classifier(processRecord.pid);
        if (!groups.has(harness)) {
            groups.set(harness, {
                harness,
                label    : harnessLabels[harness] || harness,
                processes: []
            });
        }

        groups.get(harness).processes.push({
            ...processRecord,
            harness,
            chain
        });
    }

    return Array.from(groups.values());
}

/**
 * @summary Renders grouped harness counts with PID visibility for startup diagnostics.
 *
 * @param {Array<{label: String, processes: Array<{pid: Number}>}>} groups Harness groups.
 * @returns {String}
 */
export function formatHarnessGroups(groups) {
    return groups.map(group => {
        const pids     = group.processes.map(processRecord => processRecord.pid).join(', ');
        const pidLabel = group.processes.length === 1 ? 'PID' : 'PIDs';

        return `${group.processes.length} ${group.label} (${pidLabel}: ${pids})`;
    }).join(' + ');
}

function quoteShellArg(value) {
    return `'${String(value).replaceAll("'", "'\\''")}'`;
}

/**
 * @summary Returns the SQLite file set opened by a WAL-mode Memory Core graph connection.
 *
 * @param {String} dbPath Absolute path to the Memory Core SQLite graph database.
 * @returns {Array<String>}
 */
export function getSqliteHolderFiles(dbPath) {
    return dbPath ? [dbPath, `${dbPath}-wal`, `${dbPath}-shm`] : [];
}

/**
 * @summary Parses `lsof -F pcn` output into process records with opened files.
 *
 * @param {String} raw Raw `lsof -F pcn` output.
 * @returns {Array<{pid: Number, command: String, files: Array<String>}>}
 */
export function parseLsofOutput(raw) {
    const records = [];
    let current   = null;

    for (const line of String(raw || '').split('\n')) {
        if (!line) continue;

        const tag   = line[0];
        const value = line.slice(1);

        if (tag === 'p') {
            if (current?.pid) records.push(current);
            current = {pid: parseInt(value, 10), files: []};
        } else if (current) {
            if (tag === 'c') current.command = value;
            else if (tag === 'n') current.files.push(value);
        }
    }

    if (current?.pid) records.push(current);

    return records;
}

function dedupeProcesses(processes, currentPid) {
    const processMap = new Map();

    for (const processRecord of processes) {
        if (!processRecord.pid || processRecord.pid === currentPid) continue;

        if (processMap.has(processRecord.pid)) {
            const existing = processMap.get(processRecord.pid);
            existing.files = Array.from(new Set([
                ...(existing.files || []),
                ...(processRecord.files || [])
            ]));
        } else {
            processMap.set(processRecord.pid, {
                ...processRecord,
                files: Array.from(new Set(processRecord.files || []))
            });
        }
    }

    return Array.from(processMap.values());
}

/**
 * @summary Builds the read-only current-state diagnostic for Memory Core SQLite holder processes.
 *
 * The probe deliberately returns `status: 'degraded'` for platform/probe failures instead of
 * throwing. Consumers use this as diagnostic data; a missing `lsof` binary or missing DB file
 * must not become a Memory Core health verdict.
 *
 * @param {Object} [options]
 * @param {String} [options.dbPath] Absolute path to the Memory Core SQLite graph database.
 * @param {Function} [options.execSync=defaultExecSync] Injectable command runner for tests.
 * @param {Function} [options.existsSync=defaultExistsSync] Injectable file-existence reader.
 * @param {Function} [options.classifier=classifyHarness] Injectable harness classifier.
 * @param {Number} [options.currentPid=process.pid] PID to exclude from sibling diagnostics.
 * @param {String} [options.measuredAt] Fixed timestamp for tests.
 * @returns {Object}
 */
export function buildSqliteHolderDiagnostics({
    dbPath,
    execSync   = defaultExecSync,
    existsSync = defaultExistsSync,
    classifier = classifyHarness,
    currentPid = process.pid,
    measuredAt = new Date().toISOString()
} = {}) {
    const files         = getSqliteHolderFiles(dbPath);
    const existingFiles = files.filter(file => existsSync(file));
    const base = {
        status        : 'ok',
        measuredAt,
        sqliteFile    : dbPath || null,
        files,
        existingFiles,
        totalProcesses: 0,
        byHarness     : {},
        groups        : [],
        processes     : [],
        warnings      : []
    };

    if (!dbPath) {
        return {
            ...base,
            status: 'degraded',
            error : 'Memory Core SQLite graph path is not configured'
        };
    }

    if (existingFiles.length === 0) {
        return {
            ...base,
            status: 'degraded',
            error : `Memory Core SQLite files not found for ${dbPath}`
        };
    }

    let raw;
    try {
        raw = execSync(`lsof -F pcn -- ${existingFiles.map(quoteShellArg).join(' ')}`, {
            encoding: 'utf8',
            stdio   : ['ignore', 'pipe', 'pipe']
        });
    } catch (error) {
        if (error.status === 1) {
            raw = '';
        } else {
            return {
                ...base,
                status: 'degraded',
                error : error.code === 'ENOENT'
                    ? 'Platform not supported: this diagnostic requires `lsof` (macOS / Linux).'
                    : `lsof failed: ${error.message || error}`
            };
        }
    }

    const processes = dedupeProcesses(parseLsofOutput(raw), currentPid);
    const groups    = groupProcessesByHarness(processes, {classifier});
    const enrichedProcesses = groups.flatMap(group => group.processes);
    const byHarness = {};

    for (const group of groups) {
        byHarness[group.harness] = group.processes.length;
    }

    const warnings = [];
    if (byHarness.unknown > 0) {
        warnings.push({
            code   : 'unknown-harness',
            message: `${byHarness.unknown} SQLite holder process(es) could not be mapped to a known harness`
        });
    }

    return {
        ...base,
        totalProcesses: processes.length,
        byHarness,
        groups,
        processes: enrichedProcesses,
        warnings
    };
}
