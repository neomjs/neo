import {spawn, spawnSync} from 'node:child_process';
import http               from 'node:http';
import path               from 'node:path';
import {fileURLToPath}    from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const repoRoot   = path.resolve(__dirname, '../../../..');

// The parity lane boots the phase-3 stack (docker-compose.dev.yml) plus the CI overlay
// (docker-compose.parity-ci.yml): the dev file carries the plane, the overlay wires the
// deterministic mock embedding contract and marks the network internal. Order matters —
// later files merge over earlier ones.
const composeFiles = [
    path.join(repoRoot, 'ai/deploy/docker-compose.dev.yml'),
    path.join(repoRoot, 'ai/deploy/docker-compose.parity-ci.yml')
];

// The compose project IS the overlay plane id (the dev file's &plane-id anchor resolves
// from COMPOSE_PROJECT_NAME's same-scope sibling). A CI run boots an isolated plane:
// distinct identity, own project-scoped volumes, never the durable root.
const projectName = process.env.NEO_PARITY_COMPOSE_PROJECT || 'neo-parity-ci';
const readyPort   = Number(process.env.NEO_PARITY_READY_PORT || 13095);

const PLANE_DATA_ROOT = '/app/.neo-ai-data-parity';

// In-container probe targets. The overlay's internal network publishes NO host ports,
// so there is no host-side endpoint to probe — the identity check rides the network
// namespace itself (service loopback), where the wrong-process-on-a-host-port class is
// inexpressible by construction.
const PROBES = [
    {service: 'kb-server', url: 'http://127.0.0.1:3000'},
    {service: 'mc-server', url: 'http://127.0.0.1:3001'}
];

const state = {
    dockerAvailable: null,
    servicesReady  : false,
    composeStarted : false,
    bootStartedAt  : null,
    readyAt        : null,
    bootMs         : null,
    project        : projectName,
    services       : [],
    reason         : 'Docker compose startup has not completed yet.'
};

let composeProcess;
let shuttingDown = false;

function dockerCompose(args, options = {}) {
    const composeArgs = ['compose', '-p', projectName];

    for (const file of composeFiles) {
        composeArgs.push('-f', file);
    }

    return spawnSync('docker', [...composeArgs, ...args], {
        cwd     : repoRoot,
        encoding: 'utf8',
        env     : process.env,
        ...options
    });
}

/**
 * @summary Writes captured Docker CLI output to stderr when it is non-empty.
 * @param {String} label  Human-readable command label.
 * @param {Object} result The spawnSync result from a Docker command.
 * @returns {void}
 */
function writeProcessOutput(label, result) {
    const output = [
        result.stdout?.trim(),
        result.stderr?.trim()
    ].filter(Boolean).join('\n');

    if (output) {
        console.error(`[parityComposeWebServer] ${label}\n${output}`);
    }
}

/**
 * @summary Emits Docker Compose process and log diagnostics for failed startup.
 * @param {String} reason The failure reason that triggered diagnostics.
 * @returns {void}
 */
function writeComposeDiagnostics(reason) {
    console.error(`[parityComposeWebServer] ${reason}`);

    writeProcessOutput('docker compose ps -a', dockerCompose(['ps', '-a']));
    writeProcessOutput('docker compose logs --tail 200', dockerCompose(['logs', '--no-color', '--tail', '200']));
}

function isDockerAvailable() {
    const version = spawnSync('docker', ['compose', 'version'], {encoding: 'utf8'});

    if (version.status !== 0) {
        state.reason = version.error?.message || version.stderr || 'Docker compose is not available.';
        return false;
    }

    const info = spawnSync('docker', ['info'], {encoding: 'utf8'});

    if (info.status !== 0) {
        state.reason = info.error?.message || info.stderr || 'Docker daemon is not reachable.';
        return false;
    }

    return true;
}

/**
 * @summary Reads the compose service table as structured objects.
 *
 * `docker compose ps --format json` emits NDJSON (one object per service) on current
 * Compose; older 2.x shapes emitted a single array. Accept both — the parse is the
 * compatibility shim, never the assertion.
 * @returns {Object[]} Service rows ({Service, State, Health, ...}).
 */
function readComposeServices() {
    const result = dockerCompose(['ps', '--format', 'json']);

    if (result.status !== 0 || !result.stdout?.trim()) {
        return [];
    }

    const raw = result.stdout.trim();

    try {
        const parsed = JSON.parse(raw);

        return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
        return raw.split('\n').map(line => {
            try {
                return JSON.parse(line);
            } catch {
                return null;
            }
        }).filter(Boolean);
    }
}

/**
 * @summary Served-identity gate: asks BOTH MCP servers to name their plane, executed
 * INSIDE the network by a fresh probe process per service.
 *
 * The CI overlay's internal network has no host-published ports, so the probe cannot
 * ride the host — and need not: the container-local arm is the honest one here. A
 * host-port probe exists to catch a foreign process squatting a published port (the
 * profile's 8100 ssh-collision lesson), and with no published ports that class is
 * inexpressible. What remains worth asserting independently — rather than trusting
 * each container's own healthcheck process — is the same contract from a second
 * process: `mcpHealthcheck.mjs` with the expected plane id + root, exec'd fresh.
 * @returns {Promise<void>} Resolves only when both servers prove the expected plane.
 */
async function assertServedIdentity() {
    for (const {service, url} of PROBES) {
        const result = dockerCompose(['exec', '-T', service,
            'node', 'ai/scripts/diagnostics/mcpHealthcheck.mjs',
            '--url', url,
            '--client-name', `neo-parity-ci-readiness-${service}`,
            '--expected-status', 'healthy,degraded',
            '--expected-plane-id', projectName,
            '--expected-plane-data-root', PLANE_DATA_ROOT
        ]);

        if (result.status !== 0) {
            throw new Error(`served-identity probe failed for ${service}: ${(result.stderr || result.stdout || '').trim().slice(-400)}`);
        }
    }
}

async function waitForServices() {
    const deadline = Date.now() + Number(process.env.NEO_PARITY_STACK_TIMEOUT_MS || 480000);

    while (!shuttingDown && Date.now() < deadline) {
        try {
            const services = readComposeServices();

            state.services = services;

            const healthy = name => services.find(s => s.Service === name)?.Health === 'healthy';
            const running = name => services.find(s => s.Service === name)?.State  === 'running';

            // Topology gate: the complete plane — vector store + both MCP servers healthy,
            // and the orchestrator (the plane's writer) running. A failed F-invariant boot
            // walk surfaces here as an exited container, never as a green check.
            if (healthy('chroma') && healthy('kb-server') && healthy('mc-server') && running('orchestrator')) {
                await assertServedIdentity();

                state.servicesReady = true;
                state.readyAt       = new Date().toISOString();
                state.bootMs        = Date.parse(state.readyAt) - Date.parse(state.bootStartedAt);
                state.reason        = 'Parity stack is ready: complete plane healthy, served identity verified by in-container probe.';

                console.log(`[parityComposeWebServer] ready in ${state.bootMs}ms (project=${projectName})`);
                return;
            }

            state.reason = `Waiting for parity stack readiness: ${services.map(s => `${s.Service}=${s.State}/${s.Health || 'no-healthcheck'}`).join(', ') || 'no services yet'}`;
        } catch (error) {
            state.reason = error.message;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    state.reason = `Timed out waiting for the parity stack. Last state: ${state.reason}`;
    writeComposeDiagnostics(state.reason);
}

function cleanup() {
    if (shuttingDown) return;

    shuttingDown = true;

    if (composeProcess && !composeProcess.killed) {
        composeProcess.kill('SIGTERM');
    }

    // --volumes: the CI plane is ephemeral — project-scoped named volumes die with the
    // run, so no run can inherit another run's plane state (or its WAL, or its graph).
    dockerCompose(['down', '--remove-orphans', '--volumes'], {stdio: 'ignore'});
}

const server = http.createServer((req, res) => {
    if (req.url !== '/ready') {
        res.writeHead(404, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: 'Not found'}));
        return;
    }

    // Docker availability is a PROVISIONING requirement for this lane, never a skip
    // condition. The integration-unified fixture reports ready when docker is missing
    // (`dockerAvailable === false || servicesReady`) — that best-effort bypass is
    // deliberately NOT replicated here. With no docker this endpoint stays 503 until
    // the runner times the job out RED: a parity claim without a witness is precisely
    // the failure class this lane exists to kill.
    const ready = state.servicesReady;

    res.writeHead(ready ? 200 : 503, {'content-type': 'application/json'});
    res.end(JSON.stringify(state));
});

server.listen(readyPort, '127.0.0.1', async () => {
    state.dockerAvailable = isDockerAvailable();

    if (!state.dockerAvailable) {
        state.reason = `Docker is a provisioning REQUIREMENT for the parity lane and is unavailable: ${state.reason} ` +
            'Failing closed — the suite must not green-skip on a missing daemon.';
        console.error(`[parityComposeWebServer] ${state.reason}`);
        return;
    }

    state.bootStartedAt = new Date().toISOString();

    dockerCompose(['down', '--remove-orphans', '--volumes'], {stdio: 'ignore'});

    composeProcess = spawn('docker', [
        'compose',
        '-p', projectName,
        ...composeFiles.flatMap(file => ['-f', file]),
        'up',
        '--build',
        '--remove-orphans'
    ], {
        cwd  : repoRoot,
        env  : process.env,
        stdio: 'inherit'
    });

    state.composeStarted = true;

    composeProcess.once('exit', code => {
        if (!shuttingDown) {
            state.servicesReady = false;
            state.reason        = `docker compose exited before shutdown with code ${code}.`;
            writeComposeDiagnostics(state.reason);
        }
    });

    await waitForServices();
});

process.once('SIGINT', () => {
    cleanup();
    process.exit(0);
});

process.once('SIGTERM', () => {
    cleanup();
    process.exit(0);
});

process.once('exit', cleanup);
