import {spawn, spawnSync} from 'node:child_process';
import http              from 'node:http';
import net               from 'node:net';
import path              from 'node:path';
import {fileURLToPath}   from 'node:url';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const repoRoot    = path.resolve(__dirname, '../../../..');
const composeFile = path.join(repoRoot, 'ai/deploy/docker-compose.test.yml');
const projectName = process.env.NEO_INTEGRATION_COMPOSE_PROJECT || 'neo-integration-test';
const readyPort   = Number(process.env.NEO_INTEGRATION_READY_PORT || 13090);

const state = {
    dockerAvailable: null,
    servicesReady  : false,
    composeStarted : false,
    reason         : 'Docker compose startup has not completed yet.'
};

let composeProcess;
let shuttingDown = false;

function dockerCompose(args, options = {}) {
    return spawnSync('docker', ['compose', '-p', projectName, '-f', composeFile, ...args], {
        cwd     : repoRoot,
        encoding: 'utf8',
        ...options
    });
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

function portOpen(port) {
    return new Promise(resolve => {
        const socket = net.createConnection({host: '127.0.0.1', port});

        socket.setTimeout(1000);
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        socket.once('error', () => resolve(false));
    });
}

async function waitForServices() {
    const deadline = Date.now() + Number(process.env.NEO_INTEGRATION_STACK_TIMEOUT_MS || 210000);

    while (!shuttingDown && Date.now() < deadline) {
        try {
            const [chroma, kbPort, mcPort] = await Promise.all([
                fetch('http://127.0.0.1:18080/api/v2/heartbeat').then(r => r.ok).catch(() => false),
                portOpen(13000),
                portOpen(13001)
            ]);

            if (chroma && kbPort && mcPort) {
                state.servicesReady = true;
                state.reason        = 'Dockerized MCP integration stack is ready.';
                return;
            }

            state.reason = `Waiting for stack readiness: chroma=${chroma}, kb=${kbPort}, mc=${mcPort}`;
        } catch (error) {
            state.reason = error.message;
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    state.reason = `Timed out waiting for Dockerized MCP integration stack. Last state: ${state.reason}`;
}

function cleanup() {
    if (shuttingDown) return;

    shuttingDown = true;

    if (composeProcess && !composeProcess.killed) {
        composeProcess.kill('SIGTERM');
    }

    dockerCompose(['down', '--remove-orphans', '--volumes'], {stdio: 'ignore'});
}

const server = http.createServer((req, res) => {
    if (req.url !== '/ready') {
        res.writeHead(404, {'content-type': 'application/json'});
        res.end(JSON.stringify({error: 'Not found'}));
        return;
    }

    const ready = state.dockerAvailable === false || state.servicesReady;

    res.writeHead(ready ? 200 : 503, {'content-type': 'application/json'});
    res.end(JSON.stringify(state));
});

server.listen(readyPort, '127.0.0.1', async () => {
    state.dockerAvailable = isDockerAvailable();

    if (!state.dockerAvailable) {
        return;
    }

    dockerCompose(['down', '--remove-orphans', '--volumes'], {stdio: 'ignore'});

    composeProcess = spawn('docker', [
        'compose',
        '-p', projectName,
        '-f', composeFile,
        'up',
        '--build',
        '--remove-orphans'
    ], {
        cwd  : repoRoot,
        stdio: 'inherit'
    });

    state.composeStarted = true;

    composeProcess.once('exit', code => {
        if (!shuttingDown) {
            state.servicesReady = false;
            state.reason        = `docker compose exited before shutdown with code ${code}.`;
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
