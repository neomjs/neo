import {execSync as defaultExecSync} from 'node:child_process';

const harnessLabels = {
    'claude-code'   : 'Claude Code',
    'claude-desktop': 'Claude Desktop',
    antigravity    : 'Antigravity',
    cursor         : 'Cursor',
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
