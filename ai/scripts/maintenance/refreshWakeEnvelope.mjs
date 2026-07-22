import {execFile} from 'node:child_process';
import fs         from 'node:fs';
import os         from 'node:os';
import path       from 'node:path';

/**
 * @module ai/scripts/maintenance/refreshWakeEnvelope
 * @summary Agent-side boot self-write for the OpenCode wake envelope — the immediate owner-native
 * repair for the desktop topology (ticket-ref-ok: load-bearing owner for the desktop wake-envelope
 * boot/session boundary contract): at session start the writing session IS the
 * latest-updated session in the seat checkout by construction (its own boot turn just updated the
 * timestamp), so a self-write binds the live session with no listing heuristics and no plugin
 * dependency. The probe (self-injected prompt) verifies the route end-to-end instead of trusting
 * the write.
 *
 * The contract:
 * - Session identity is ONLY ever resolved at boot time, by the running session itself — the
 *   split-brain fence: never "latest of all sessions" from a daemon's point of view (11 sessions
 *   accumulate in a seat checkout, and a twin/restored session can be more recent).
 * - Port + credentials are coordinates and MAY be rediscovered (env first, lsof belt).
 * - The probe is mandatory: a write without a 204 self-injection is a degraded result, not success.
 */

const ENVELOPE_PATH = path.join(os.homedir(), '.local/share/opencode/wake-envelope.json');

/**
 * Discovers the live OpenCode server port: the current envelope's port first, then the NodeService
 * listener via lsof as the belt.
 * @param {Object} options
 * @param {Object} [options.execFileImpl=execFile]
 * @returns {Promise<Number|null>}
 */
export async function discoverServerPort({execFileImpl = execFile} = {}) {
    const envelope = readEnvelope();

    if (envelope?.port) {
        const alive = await probePort(envelope.port);
        if (alive) return envelope.port
    }

    try {
        const {stdout} = await new Promise((resolve, reject) => {
            execFileImpl('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-c', 'OpenCode'], (error, stdout, stderr) =>
                error ? reject(error) : resolve({stdout, stderr}))
        });

        const match = String(stdout).match(/127\.0\.0\.1:(\d+) \(LISTEN\)/);
        return match ? Number(match[1]) : null
    } catch {
        return null
    }
}

function readEnvelope() {
    try {
        return JSON.parse(fs.readFileSync(ENVELOPE_PATH, 'utf8'))
    } catch {
        return null
    }
}

async function probePort(port) {
    try {
        await api({method: 'GET', path: '/session', port, expectStatus: [200, 401]});
        return true
    } catch {
        return false
    }
}

async function api({method, path: apiPath, port, body = null, expectStatus = [200], username = process.env.OPENCODE_SERVER_USERNAME || 'opencode', password = process.env.OPENCODE_SERVER_PASSWORD}) {
    const response = await fetch(`http://127.0.0.1:${port}${apiPath}`, {
        method,
        headers: {
            'Content-Type' : 'application/json',
            'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64')
        },
        ...(body ? {body: JSON.stringify(body)} : {})
    });

    if (!expectStatus.includes(response.status)) {
        throw new Error(`opencode api ${apiPath} -> ${response.status}`)
    }

    return response.status === 204 ? null : response.json()
}

/**
 * The boot self-write: resolve the live session (latest-updated in the seat checkout — owner-native
 * at boot), write the envelope atomically (0600), and self-inject a probe prompt.
 * @param {Object} options
 * @param {String} options.directory Seat checkout path.
 * @param {Number} [options.port] Known server port (skips discovery).
 * @param {Boolean} [options.probe=true] Self-inject a verification probe after writing.
 * @param {Object} [options.apiImpl] Injection seam for tests.
 * @returns {Promise<{status: 'written-probed'|'written-probe-failed'|'no-server'|'no-session', sessionId: String|null, port: Number|null}>
 */
export async function refreshWakeEnvelope({directory, port = null, probe = true, apiImpl = api} = {}) {
    const
        username   = process.env.OPENCODE_SERVER_USERNAME || 'opencode',
        password   = process.env.OPENCODE_SERVER_PASSWORD,
        serverPort = port ?? await discoverServerPort();

    if (!serverPort) return {port: null, sessionId: null, status: 'no-server'};

    const sessions = await apiImpl({method: 'GET', path: `/session?directory=${encodeURIComponent(directory)}`, port: serverPort, username, password});
    const live     = [...(sessions ?? [])].sort((a, b) => (b.time?.updated ?? 0) - (a.time?.updated ?? 0))[0];

    if (!live?.id) return {port: serverPort, sessionId: null, status: 'no-session'};

    const envelope = {
        directory,
        hostname : '127.0.0.1',
        password,
        port     : serverPort,
        sessionId: live.id,
        projectId: live.projectID ?? live.projectId ?? null,
        updatedAt: new Date().toISOString(),
        username
    };

    const tempPath = `${ENVELOPE_PATH}.tmp-${process.pid}-${Date.now()}`;

    fs.mkdirSync(path.dirname(ENVELOPE_PATH), {recursive: true});
    fs.writeFileSync(tempPath, JSON.stringify(envelope, null, 2));
    fs.chmodSync(tempPath, 0o600);
    fs.renameSync(tempPath, ENVELOPE_PATH);

    if (!probe) return {port: serverPort, sessionId: live.id, status: 'written-probe-failed'};

    try {
        await apiImpl({
            body        : {parts: [{text: '[wake boot self-write probe — no action needed, this IS the receipt]', type: 'text'}]},
            expectStatus: [204],
            method      : 'POST',
            path        : `/session/${live.id}/prompt_async`,
            port        : serverPort,
            username,
            password
        });

        return {port: serverPort, sessionId: live.id, status: 'written-probed'}
    } catch {
        return {port: serverPort, sessionId: live.id, status: 'written-probe-failed'}
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const directory = process.argv[2] ?? process.cwd();

    refreshWakeEnvelope({directory})
        .then(outcome => {
            console.log(JSON.stringify(outcome));
            process.exit(outcome.status === 'written-probed' ? 0 : 1)
        })
        .catch(error => {
            console.error(`refreshWakeEnvelope failed: ${error.message}`);
            process.exit(1)
        })
}
