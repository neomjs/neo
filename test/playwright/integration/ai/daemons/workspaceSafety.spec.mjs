/**
 * @module test/playwright/integration/ai/daemons/workspaceSafety
 * @summary Workspace-safety integration test for the Agent OS orchestrator daemon.
 *
 * Validates that a fresh `npx-neo-app`-style workspace can spawn the orchestrator
 * daemon under `NEO_AI_DEPLOYMENT_MODE=cloud` without crashing on missing Neo-team
 * substrate (identityRoots entries, operator-only config, pre-existing data dir).
 * Companion to the AC1-AC4 invariant tests in `Orchestrator.externalConfig.spec.mjs`;
 * this is the runtime proof for the workspace-safety AC5 invariant that an earlier
 * unit-scoped PR deferred as too heavy for unit-test scope.
 *
 * Two probes:
 *  1. Cloud-deployment-mode boot: confirms the daemon reaches the `[Orchestrator]
 *     Started.` log line within a reasonable timeout, with no `UnhandledPromiseRejection`
 *     / uncaught error surfaces. Cloud profile defaults disable kbSync, primaryDevSync,
 *     bridgeDaemon, and swarmHeartbeat lanes — verifies those gates fire silently
 *     rather than throwing on missing substrate.
 *  2. Local-deployment-mode swarm-heartbeat degrade-with-log: confirms the
 *     `[resolveSwarmHeartbeatTargets] 'self' resolved to self but selfIdentity is
 *     null — disabled` log line is emitted within a single pulse interval when the
 *     daemon runs without `NEO_AGENT_IDENTITY` (the npx-neo-app default).
 *
 * @see https://github.com/neomjs/neo/issues/11948
 * @see https://github.com/neomjs/neo/issues/11837
 * @see ai/daemons/orchestrator/daemon.mjs
 * @see ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs
 */
import {spawn}         from 'node:child_process';
import fs              from 'node:fs/promises';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';
import Database        from 'better-sqlite3';
import {test, expect}  from '@playwright/test';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const repoRoot     = path.resolve(__dirname, '../../../../..');
const DAEMON_ENTRY = path.join(repoRoot, 'ai/daemons/orchestrator/daemon.mjs');

const BOOT_TIMEOUT_MS  = 30000;
const PULSE_TIMEOUT_MS = 30000;
const SIGTERM_GRACE_MS = 5000;

/**
 * @summary Polls a log file until a predicate matches its content or the timeout elapses.
 * @param {String} logPath
 * @param {(content:String)=>Boolean} predicate
 * @param {Number} timeoutMs
 * @returns {Promise<String>} The matching content snapshot.
 */
async function waitForLogContent(logPath, predicate, timeoutMs) {
    const deadline    = Date.now() + timeoutMs;
    let   lastContent = '';

    while (Date.now() < deadline) {
        try {
            lastContent = await fs.readFile(logPath, 'utf8');
            if (predicate(lastContent)) return lastContent;
        } catch (err) {
            if (err.code !== 'ENOENT') throw err;
        }
        await new Promise(resolve => setTimeout(resolve, 200));
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for log predicate. Last content (${lastContent.length} bytes):\n${lastContent}`);
}

/**
 * @summary Sends SIGTERM and waits for the child process to exit, force-killing on timeout.
 * @param {import('node:child_process').ChildProcess} daemonProcess
 * @returns {Promise<{code:Number|null, signal:String|null}>}
 */
async function terminateDaemon(daemonProcess) {
    if (!daemonProcess || daemonProcess.exitCode !== null) {
        return {code: daemonProcess?.exitCode ?? null, signal: null};
    }

    return new Promise(resolve => {
        const timeout = setTimeout(() => {
            try {
                daemonProcess.kill('SIGKILL');
            } catch {}
            resolve({code: daemonProcess.exitCode, signal: 'SIGKILL'});
        }, SIGTERM_GRACE_MS);

        daemonProcess.once('exit', (code, signal) => {
            clearTimeout(timeout);
            resolve({code, signal});
        });

        try {
            daemonProcess.kill('SIGTERM');
        } catch {
            clearTimeout(timeout);
            resolve({code: daemonProcess.exitCode, signal: null});
        }
    });
}

test.describe('Orchestrator workspace-safety integration (#11948 / Sub-5 AC5 of #11837)', () => {
    // Long-running daemon boot + isolation tests run sequentially.
    test.describe.configure({mode: 'serial'});

    let workspaceDir;
    let dataDir;
    let logPath;
    let dbPath;
    let daemonProcess;
    let stdoutBuf;
    let stderrBuf;

    test.beforeEach(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-workspace-safety-'));
        dataDir      = path.join(workspaceDir, 'orchestrator-daemon');
        logPath      = path.join(dataDir, 'orchestrator.log');
        dbPath       = path.join(workspaceDir, 'memory-core-graph.sqlite');
        // The orchestrator now self-bootstraps its sqlite + schema on
        // fresh-workspace boot (via `initializeDatabaseSelfBootstrap` →
        // `SQLite.mjs::initSchema`). The previous `initSqliteSchema()` fixture
        // helper that pre-created the schema here is deleted; the integration
        // test now asserts the orchestrator's own bootstrap creates the file +
        // schema after boot (see "AC2 — fresh-workspace self-bootstrap" test below).
        daemonProcess = null;
        stdoutBuf = '';
        stderrBuf = '';
    });

    test.afterEach(async () => {
        if (daemonProcess) {
            await terminateDaemon(daemonProcess);
        }
        if (workspaceDir) {
            await fs.rm(workspaceDir, {recursive: true, force: true});
        }
    });

    test('AC1+AC2+AC3+AC4 — fresh-workspace cloud-mode boot self-bootstraps sqlite + reaches [Orchestrator] Started without fatal log surface', async () => {
        // cwd=workspaceDir isolates every cwd-relative side effect the daemon and its
        // supervised children create (chroma's `.neo-ai-data/chroma/unified`,
        // task PID files, etc.) so the test cannot collide with a concurrently running
        // operator-owned daemon on the same host.
        daemonProcess = spawn('node', [DAEMON_ENTRY], {
            cwd: workspaceDir,
            env: {
                ...process.env,
                NEO_AI_DEPLOYMENT_MODE  : 'cloud',
                NEO_AI_ORCHESTRATOR_DIR : dataDir,
                NEO_AI_DB_PATH          : dbPath,
                NEO_HEARTBEAT_ALIVE_PATH: path.join(workspaceDir, 'heartbeat.alive'),
                NEO_BACKUP_PATH         : path.join(workspaceDir, 'backups')
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        daemonProcess.stdout.on('data', chunk => { stdoutBuf += chunk.toString(); });
        daemonProcess.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

        const logContent = await waitForLogContent(
            logPath,
            content => content.includes('[Orchestrator] Started.'),
            BOOT_TIMEOUT_MS
        );

        // AC3: Process is still alive after boot completion.
        expect(daemonProcess.exitCode, `daemon exited prematurely. stdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`).toBeNull();

        // AC3: Boot path emits no fatal error surface.
        const fatalPatterns = [
            /UnhandledPromiseRejection/i,
            /uncaughtException/i,
            /\[Orchestrator\] Failed to start/i
        ];
        for (const pattern of fatalPatterns) {
            expect(stderrBuf, `stderr contained fatal pattern ${pattern}`).not.toMatch(pattern);
            expect(logContent, `log contained fatal pattern ${pattern}`).not.toMatch(pattern);
        }

        // AC4: Cloud profile sentinel — confirms the daemon reached the Started log line.
        // The lanes that need Neo-team substrate (swarmHeartbeat, primaryDevSync, kbSync,
        // bridgeDaemon) are gated by resolveDeploymentEnabled() returning false in cloud
        // mode, so they neither initialize nor throw. Absence of init-failure log lines IS
        // the graceful-degradation signal in this profile.
        expect(logContent).not.toMatch(/\[Orchestrator\] Swarm heartbeat init failed/i);

        // AC1+AC2 — orchestrator self-bootstrapped the sqlite file + schema
        // even though the beforeEach hook no longer pre-creates them. Replaces the
        // deleted `initSqliteSchema(dbPath)` workaround fixture.
        const stats = await fs.stat(dbPath);
        expect(stats.isFile(), `orchestrator did NOT self-bootstrap sqlite at ${dbPath}`).toBe(true);

        // Probe the schema on disk: open read-only, assert GraphLog table exists
        // (created by SQLite.mjs::initSchema, the shared substrate orchestrator now
        // delegates to via initializeDatabaseSelfBootstrap). Same byte-equivalent
        // schema MC MCP would create on first boot — guarantees schema parity
        // regardless of which daemon boots first in a fresh workspace.
        const probeDb = new Database(dbPath, {readonly: true, fileMustExist: true});
        try {
            const tables = probeDb.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
            expect(tables, `orchestrator-bootstrapped schema missing GraphLog: ${tables.join(',')}`).toContain('GraphLog');
            expect(tables).toContain('Nodes');
            expect(tables).toContain('Edges');
        } finally {
            probeDb.close();
        }
    });

    test('AC4 — swarm-heartbeat target resolver degrades-with-log when selfIdentity is missing', async () => {
        // The swarm-heartbeat lane now defaults OFF, so this test explicitly enables it
        // (NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED) to make the resolver fire, rather than
        // relying on the old local-default. A short pulse interval forces a pulse cycle
        // within the test window. Empty NEO_AGENT_IDENTITY + targetSource='self' triggers
        // the documented disables-with-log path in `swarmHeartbeat.resolveTargets`.
        daemonProcess = spawn('node', [DAEMON_ENTRY], {
            cwd: workspaceDir,
            env: {
                ...process.env,
                NEO_AI_DEPLOYMENT_MODE                        : 'local',
                NEO_AI_ORCHESTRATOR_DIR                       : dataDir,
                NEO_AI_DB_PATH                                : dbPath,
                NEO_HEARTBEAT_ALIVE_PATH                      : path.join(workspaceDir, 'heartbeat.alive'),
                NEO_BACKUP_PATH                               : path.join(workspaceDir, 'backups'),
                NEO_AGENT_IDENTITY                            : '',
                NEO_ORCHESTRATOR_SWARM_HEARTBEAT_ENABLED      : 'true',
                NEO_ORCHESTRATOR_SWARM_HEARTBEAT_TARGET_SOURCE: 'self',
                NEO_ORCHESTRATOR_SWARM_HEARTBEAT_INTERVAL_MS  : '1000',
                NEO_ORCHESTRATOR_POLL_INTERVAL_MS             : '500',
                // NEO_DEBUG=true unlocks the memory-core logger's stderr forward
                // (stderrMode: 'debug' gates stderr behind aiConfig.debug). Without it
                // the resolver log goes to the file-sink only — which by default lives
                // under the canonical Neo root, not the test's isolated workspace.
                NEO_DEBUG                                       : 'true',
                // Disable side-lanes that would spawn external binaries or touch other
                // shared substrate during the test window.
                NEO_ORCHESTRATOR_BRIDGE_DAEMON_ENABLED   : 'false',
                NEO_ORCHESTRATOR_KB_SYNC_ENABLED         : 'false',
                NEO_ORCHESTRATOR_PRIMARY_DEV_SYNC_ENABLED: 'false'
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });

        daemonProcess.stdout.on('data', chunk => { stdoutBuf += chunk.toString(); });
        daemonProcess.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

        // Wait for the resolver disable-with-log surface. The exact phrase comes from
        // ai/daemons/orchestrator/scheduling/swarmHeartbeat.mjs line ~115.
        const combinedSignal = () => `${stdoutBuf}\n${stderrBuf}`;
        const deadline       = Date.now() + PULSE_TIMEOUT_MS;
        let   matched        = false;
        while (Date.now() < deadline) {
            if (/\[resolveSwarmHeartbeatTargets\][^\n]*selfIdentity is null[^\n]*disabled/i.test(combinedSignal())) {
                matched = true;
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        expect(matched,
            `Resolver disable-with-log surface did not appear within ${PULSE_TIMEOUT_MS}ms. ` +
            `daemon exitCode=${daemonProcess.exitCode}\nstdout:\n${stdoutBuf}\nstderr:\n${stderrBuf}`
        ).toBe(true);

        // Process must still be alive — the resolver degrade-with-log path is non-fatal.
        expect(daemonProcess.exitCode).toBeNull();
    });
});
