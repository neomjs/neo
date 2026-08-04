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

import {terminateDaemon} from '../../helpers/terminateDaemon.mjs';

const __filename   = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const repoRoot     = path.resolve(__dirname, '../../../../..');
const DAEMON_ENTRY = path.join(repoRoot, 'ai/daemons/orchestrator/daemon.mjs');

const BOOT_TIMEOUT_MS  = 30000;
const PULSE_TIMEOUT_MS = 30000;

/**
 * @summary Returns true when the path exists.
 * @param {String} targetPath
 * @returns {Promise<Boolean>}
 */
async function pathExists(targetPath) {
    try {
        await fs.access(targetPath);
        return true
    } catch {
        return false
    }
}

/**
 * @summary Formats the first-level entries in a directory for failure diagnostics.
 * @param {String} directoryPath
 * @returns {Promise<String>}
 */
async function listDirectoryEntries(directoryPath) {
    try {
        const entries = await fs.readdir(directoryPath, {withFileTypes: true});

        return entries
            .map(entry => `${entry.isDirectory() ? 'd' : entry.isFile() ? 'f' : '?'} ${entry.name}`)
            .sort()
            .join('\n') || '(empty)'
    } catch (err) {
        return `(unavailable: ${err.code || err.message})`
    }
}

/**
 * @summary Builds the daemon-boot diagnostic payload for a failed log wait.
 * @param {Object} options
 * @param {String} options.reason
 * @param {Number} options.timeoutMs
 * @param {String} options.logPath
 * @param {String} [options.dataDir]
 * @param {String} options.lastContent
 * @param {import('node:child_process').ChildProcess} [options.daemonProcess]
 * @param {{code:Number|null, signal:String|null}} [options.processExit]
 * @param {Error} [options.processError]
 * @param {Function} [options.getStdout]
 * @param {Function} [options.getStderr]
 * @returns {Promise<String>}
 */
async function formatLogWaitDiagnostics({
    dataDir,
    daemonProcess,
    getStderr = () => '',
    getStdout = () => '',
    lastContent,
    logPath,
    processError,
    processExit,
    reason,
    timeoutMs
}) {
    const dataDirListing = dataDir ? await listDirectoryEntries(dataDir) : '(not provided)',
          logExists      = await pathExists(logPath),
          stderr         = getStderr(),
          stdout         = getStdout();

    return [
        `Timed out after ${timeoutMs}ms waiting for log predicate.`,
        `Reason: ${reason}`,
        `Process: pid=${daemonProcess?.pid ?? 'n/a'} exitCode=${processExit?.code ?? daemonProcess?.exitCode ?? null} signal=${processExit?.signal ?? daemonProcess?.signalCode ?? null} killed=${daemonProcess?.killed ?? false}`,
        processError ? `Process error: ${processError.stack || processError.message}` : null,
        `Log: path=${logPath} exists=${logExists}`,
        `Data dir: ${dataDir || '(not provided)'}\n${dataDirListing}`,
        `Last log content (${lastContent.length} bytes):\n${lastContent || '(empty)'}`,
        `stdout (${stdout.length} bytes):\n${stdout || '(empty)'}`,
        `stderr (${stderr.length} bytes):\n${stderr || '(empty)'}`
    ].filter(Boolean).join('\n\n')
}

/**
 * @summary Polls a log file until a predicate matches its content or the timeout elapses.
 * @param {String} logPath
 * @param {(content:String)=>Boolean} predicate
 * @param {Number} timeoutMs
 * @param {Object} [options]
 * @param {import('node:child_process').ChildProcess} [options.daemonProcess]
 * @param {String} [options.dataDir]
 * @param {Function} [options.getStdout]
 * @param {Function} [options.getStderr]
 * @returns {Promise<String>} The matching content snapshot.
 */
async function waitForLogContent(logPath, predicate, timeoutMs, {
    daemonProcess,
    dataDir,
    getStderr,
    getStdout
} = {}) {
    const deadline    = Date.now() + timeoutMs;
    let   lastContent = '',
          processError = null,
          processExit  = null;

    const onError = err => { processError = err; },
          onExit  = (code, signal) => { processExit = {code, signal}; };

    daemonProcess?.once('error', onError);
    daemonProcess?.once('exit', onExit);

    try {
        while (Date.now() < deadline) {
            if (processError || processExit || daemonProcess?.exitCode !== null) {
                throw new Error(await formatLogWaitDiagnostics({
                    dataDir,
                    daemonProcess,
                    getStderr,
                    getStdout,
                    lastContent,
                    logPath,
                    processError,
                    processExit,
                    reason: processError
                        ? 'daemon process emitted error before the log predicate matched'
                        : 'daemon process exited before the log predicate matched',
                    timeoutMs
                }))
            }

            try {
                lastContent = await fs.readFile(logPath, 'utf8');
                if (predicate(lastContent)) return lastContent;
            } catch (err) {
                if (err.code !== 'ENOENT') throw err;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        throw new Error(await formatLogWaitDiagnostics({
            dataDir,
            daemonProcess,
            getStderr,
            getStdout,
            lastContent,
            logPath,
            reason: 'timeout elapsed before the log predicate matched',
            timeoutMs
        }))
    } finally {
        daemonProcess?.off('error', onError);
        daemonProcess?.off('exit', onExit);
    }
}


test.describe('Orchestrator workspace-safety integration (#11948 / Sub-5 AC5 of #11837)', () => {
    // Long-running daemon boot + isolation tests run sequentially.
    test.describe.configure({mode: 'serial'});

    let workspaceDir;
    let dataDir;
    let mcpLogPath;
    let logPath;
    let dbPath;
    let daemonProcess;
    let stdoutBuf;
    let stderrBuf;

    test.beforeEach(async () => {
        workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), 'neo-workspace-safety-'));
        dataDir      = path.join(workspaceDir, 'orchestrator-daemon');
        mcpLogPath   = path.join(workspaceDir, '.neo-ai-data/logs');
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
            const {outcome, reaped, signal} = await terminateDaemon(daemonProcess);

            // Asserted rather than assumed, and read off the RESULT rather than off the child:
            // a signal-terminated process reports `exitCode === null`, so any check of `exitCode`
            // alone would fail this healthy path. `reaped` is true only where terminal state was
            // observed — a bounded timeout and an undeliverable signal both report false, because
            // neither establishes that the child is gone.
            //
            // What is proven is the ordering defect: the old helper returned while the child was
            // still alive, 25/25. That it is what produced the intermittent ENOTEMPTY is the
            // plausible mechanism and NOT established — see the reproduction note below. Either
            // way an unreaped child must stop the removal, deterministically here rather than as a
            // flake on an unrelated PR.
            expect(reaped, `daemon not reaped before workspace removal (outcome=${outcome}, signal=${signal})`)
                .toBe(true);
        }
        if (workspaceDir) {
            // `force` only swallows ENOENT — it does not retry ENOTEMPTY, which is the reported
            // failure. Bounded retries are a SECOND layer: the reap repair fixes a defect that is
            // proven (a resolve-on-kill returns while the child is alive) but whose link to the
            // observed ENOTEMPTY could not be reproduced locally — 25/25 unreaped returns yet 0/25
            // ENOTEMPTY on APFS, against a CI failure seen on Linux under a far heavier writer.
            // Tolerance covers that gap and cannot mask a regression of the repair, because the
            // assertion above fails first.
            await fs.rm(workspaceDir, {recursive: true, force: true, maxRetries: 5, retryDelay: 50});
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
                NEO_KB_LOG_PATH         : mcpLogPath,
                NEO_MEMORY_LOG_PATH     : mcpLogPath,
                NEO_MEMORY_DB_PATH      : dbPath,
                NEO_NL_LOG_PATH         : mcpLogPath,
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
            BOOT_TIMEOUT_MS,
            {
                daemonProcess,
                dataDir,
                getStderr: () => stderrBuf,
                getStdout: () => stdoutBuf
            }
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

    test('#14798 — cloud boot wait diagnostics include child exit, streams, log state, and data-dir listing', async () => {
        await fs.mkdir(dataDir, {recursive: true});
        await fs.writeFile(path.join(dataDir, 'probe.txt'), 'diagnostic marker');

        daemonProcess = spawn(process.execPath, [
            '-e',
            'console.log("probe stdout"); console.error("probe stderr"); setTimeout(() => process.exit(42), 10);'
        ], {
            cwd  : workspaceDir,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        daemonProcess.stdout.on('data', chunk => { stdoutBuf += chunk.toString(); });
        daemonProcess.stderr.on('data', chunk => { stderrBuf += chunk.toString(); });

        let error;

        try {
            await waitForLogContent(
                logPath,
                content => content.includes('[Orchestrator] Started.'),
                BOOT_TIMEOUT_MS,
                {
                    daemonProcess,
                    dataDir,
                    getStderr: () => stderrBuf,
                    getStdout: () => stdoutBuf
                }
            )
        } catch (err) {
            error = err
        }

        expect(error?.message).toContain('daemon process exited before the log predicate matched');
        expect(error.message).toContain('exitCode=42');
        expect(error.message).toContain('Log: path=');
        expect(error.message).toContain('exists=false');
        expect(error.message).toContain('f probe.txt');
        expect(error.message).toContain('probe stdout');
        expect(error.message).toContain('probe stderr')
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
                NEO_KB_LOG_PATH                               : mcpLogPath,
                NEO_MEMORY_LOG_PATH                           : mcpLogPath,
                NEO_MEMORY_DB_PATH                            : dbPath,
                NEO_NL_LOG_PATH                               : mcpLogPath,
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
