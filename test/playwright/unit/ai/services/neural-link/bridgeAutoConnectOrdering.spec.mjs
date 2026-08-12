import {setup} from '../../../../setup.mjs';

const appName = 'NeuralLinkBridgeAutoConnectOrderingTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}                                from '@playwright/test';
import {spawn}                                       from 'node:child_process';
import {EventEmitter}                                from 'node:events';
import path                                          from 'node:path';
import {fileURLToPath}                               from 'node:url';
import Neo                                           from '../../../../../../src/Neo.mjs';
import * as core                                     from '../../../../../../src/core/_export.mjs';
import ConnectionService, {resolveBridgeAutoConnect} from '../../../../../../ai/services/neural-link/ConnectionService.mjs';

const NEURAL_LINK_ENTRYPOINT = fileURLToPath(
    new URL('../../../../../../ai/mcp/server/neural-link/mcp-server.mjs', import.meta.url)
);

/**
 * @summary Calls `healthcheck` on a spawned Neural Link server over its real stdio MCP transport.
 *
 * Drives the actual protocol rather than importing `HealthService` in-process, because the claim
 * under test is what a CLIENT is told by a server that survived a failed Bridge spawn — an
 * in-process call would answer from a different config resolution and prove nothing about the child.
 *
 * @param {Object} child The spawned ChildProcess.
 * @param {Number} [timeoutMs=8000] Overall budget for the handshake plus the call.
 * @returns {Promise<Object|null>} The parsed health payload, or null if it never answered.
 */
async function callHealthcheck(child, timeoutMs = 8000) {
    return new Promise(resolve => {
        let buffer  = '',
            settled = false;

        const finish = value => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                resolve(value)
            }
        };

        const timer = setTimeout(() => finish(null), timeoutMs);

        child.stdout.on('data', chunk => {
            buffer += chunk.toString();

            for (const line of buffer.split('\n')) {
                if (!line.trim().startsWith('{')) continue;

                let message;

                try { message = JSON.parse(line) } catch { continue }

                if (message.id === 1) {
                    child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})}\n`);
                    child.stdin.write(`${JSON.stringify({
                        jsonrpc: '2.0', id: 2, method: 'tools/call',
                        params : {name: 'healthcheck', arguments: {}}
                    })}\n`)
                }

                if (message.id === 2) {
                    const text = message.result?.content?.[0]?.text;

                    try { finish(text ? JSON.parse(text) : message.result) } catch { finish(message.result) }
                }
            }
        });

        child.stdin.write(`${JSON.stringify({
            jsonrpc: '2.0', id: 1, method: 'initialize',
            params : {protocolVersion: '2024-11-05', capabilities: {}, clientInfo: {name: 'witness', version: '1'}}
        })}\n`)
    })
}

/**
 * @summary Coverage for the Bridge auto-connect boot ordering.
 *
 * `ConnectionService` is a singleton constructed by its own import in `Server.mjs:4`. The entrypoint
 * assigns `ConnectionService.cwd` from `--cwd` much later, at `Server.mjs:185`. Anything that spawns
 * the Bridge during `initAsync()` therefore races that assignment and loses every time.
 *
 * That race is why removing the hidden `process.cwd()` fallback was not sufficient on its own: with
 * the fallback in place a correctly-launched server spawned its Bridge from the WRONG directory, and
 * with it removed the same server failed outright. Both outcomes are produced by a server whose
 * operator supplied a perfectly good `--cwd`, which is the shape of the defect.
 *
 * These assertions are on the exported decision rather than on `initAsync()` because the live branch
 * is gated on `Neo.config.unitTestMode` being false — true in every unit run — and faking that would
 * mean mutating the config singleton.
 */
test.describe('ai/services/neural-link — Bridge auto-connect ordering (#16429)', () => {
    test('#16429 an unresolved cwd DEFERS rather than spawning — the ordinary boot path, not a fault', () => {
        // This is the exact state at construction time on a healthy production boot: autoConnect is
        // on, the harness is not active, and the entrypoint has not reached its assignment yet.
        // Answering anything but 'defer' here is what made the good path fail.
        expect(resolveBridgeAutoConnect({unitTestMode: false, autoConnect: true, cwd: null}))
            .toBe('defer');

        expect(resolveBridgeAutoConnect({unitTestMode: false, autoConnect: true, cwd: ''}))
            .toBe('defer');
    });

    test('#16429 a resolved cwd connects — deferral must not become a permanent refusal', () => {
        // The non-vacuity control for the test above: if this returned 'defer' too, the decision
        // would be a constant and the first test would pass without discriminating anything.
        expect(resolveBridgeAutoConnect({unitTestMode: false, autoConnect: true, cwd: '/repo/neo'}))
            .toBe('connect');
    });

    test('#16429 an unspawnable Bridge does not take the MCP server down with it', async () => {
        // The AC-4 witness, and it has to run a real child process: the survivability guarantee is a
        // property of process LIFETIME, which no in-process assertion can observe. The pure-resolver
        // tests above pass unchanged if the try/catch around `ConnectionService.ready()` is deleted,
        // so they cover the decision and this covers the promise.
        //
        // `UNIT_TEST_MODE` routes `memoryCoreDbPath` to its test sibling (`configBase.mjs:110,169`)
        // WITHOUT setting `Neo.config.unitTestMode`, which is only ever assigned in-process — so the
        // child gets an isolated database while its auto-connect stays live. Disabling auto-connect
        // to make this hermetic would delete the behaviour under test.
        const
            unspawnableCwd = path.join('/', `neo-16429-absent-${process.pid}`),
            child          = spawn(process.execPath, [NEURAL_LINK_ENTRYPOINT, '--cwd', unspawnableCwd], {
                env: {
                    ...process.env,
                    UNIT_TEST_MODE     : 'true',
                    NEO_NL_AUTO_CONNECT: 'true',
                    // Point at a port nothing serves. Without this the test is VACUOUS: a Bridge
                    // already listening on the default 8081 is simply connected to, no spawn is ever
                    // attempted, and the unspawnable cwd never matters — verified by watching a run
                    // log "Verified Neural Link Bridge freshness on port 8081" and pass regardless.
                    // A closed port forces the spawn path, which is the one under test.
                    NEO_NL_PORT        : '34117'
                },
                stdio: ['pipe', 'pipe', 'pipe']
            });

        let exited = null;

        child.on('exit', code => { exited = code ?? 'signal' });

        // Longer than `spawnBridge`'s 2000ms startupDelayMs, so a server that dies during the spawn
        // attempt has finished dying before the assertion reads.
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            // `exitCode === null` is the whole witness: the Bridge could not be spawned from a
            // directory that does not exist, and the server is STILL RUNNING and able to report that
            // through healthcheck. Delete the spawn 'error' listener, or the catch in `Server.mjs`,
            // and the process dies instead — the outcome this whole boot path exists to prevent.
            expect(exited, `MCP server exited (${exited}) instead of surviving an unspawnable Bridge`).toBeNull();
            expect(child.exitCode, 'the server process must still be running').toBeNull();

            // "Alive" is only half the promise. A survivor that misreports its own state sends the
            // operator to the wrong socket, so the witness continues THROUGH the real stdio MCP
            // transport and reads what a client would actually be told.
            const health = await callHealthcheck(child);

            expect(health, 'healthcheck must answer on a surviving server').toBeTruthy();

            // The configured port, not the class-field default. This is the assertion that fails
            // when the payload reads `ConnectionService.port`: a server configured on 34117 answered
            // 8081, which is indistinguishable from a correct answer unless you configured it away
            // from the default on purpose.
            expect(health.bridge?.port, 'healthcheck must report the CONFIGURED bridge port').toBe(34117);

            // Attribution: unhealthy alone cannot tell an operator whether the Bridge is down, slow,
            // or unspawnable. The sanitized code can, and carries no path or argv.
            expect(health.bridge?.connected, 'the Bridge cannot be connected here').toBe(false);
            expect(health.bridge?.spawnFailure, 'healthcheck must attribute the spawn failure').toBe('ENOENT');
        } finally {
            child.kill('SIGKILL')
        }
    });

    test('#16429 a Bridge that STARTS and then dies is attributed — exit, not error', async () => {
        // The production failure is not "the process could not be created" — that is `error`. It is
        // `npm` starting fine and its script exiting non-zero a moment later, which emits `exit` and
        // nothing else. Before this, the spawn resolved, the Bridge was dead, and healthcheck had
        // nothing to say about why.
        const child = new EventEmitter();

        child.unref = () => {};

        const originalSpawn   = ConnectionService.spawnBridgeProcess,
              originalOpenLog = ConnectionService.openBridgeLogFile,
              originalCwd     = ConnectionService.cwd;

        ConnectionService.spawnBridgeProcess = () => child;
        ConnectionService.openBridgeLogFile  = () => 42;
        ConnectionService.cwd                = '/real-seat';

        try {
            await ConnectionService.spawnBridge({logPath: '/tmp', startupDelayMs: 0});

            child.emit('exit', 42, null);

            expect(ConnectionService.getStatus().lastSpawnFailure,
                'a non-zero exit must be attributed, not silently resolved').toBe('BRIDGE_EXIT_42');
        } finally {
            ConnectionService.spawnBridgeProcess = originalSpawn;
            ConnectionService.openBridgeLogFile  = originalOpenLog;
            ConnectionService.cwd                = originalCwd;
            ConnectionService.lastSpawnFailure   = null;
            ConnectionService.bridgeProcess      = null
        }
    });

    test('#16429 a new attempt OWNS the reported state — a stale failure does not outlive it', async () => {
        // The contradictory payload this prevents is `{connected: true, spawnFailure: 'ENOENT'}`:
        // a resolved problem still reported, sending an operator hunting something already fixed.
        const child = new EventEmitter();

        child.unref = () => {};

        const originalSpawn   = ConnectionService.spawnBridgeProcess,
              originalOpenLog = ConnectionService.openBridgeLogFile,
              originalCwd     = ConnectionService.cwd;

        ConnectionService.spawnBridgeProcess = () => child;
        ConnectionService.openBridgeLogFile  = () => 42;
        ConnectionService.cwd                = '/real-seat';
        ConnectionService.lastSpawnFailure   = 'ENOENT';

        try {
            await ConnectionService.spawnBridge({logPath: '/tmp', startupDelayMs: 0});

            expect(ConnectionService.getStatus().lastSpawnFailure,
                'a prior failure must not survive into a fresh attempt').toBeNull();
        } finally {
            ConnectionService.spawnBridgeProcess = originalSpawn;
            ConnectionService.openBridgeLogFile  = originalOpenLog;
            ConnectionService.cwd                = originalCwd;
            ConnectionService.lastSpawnFailure   = null;
            ConnectionService.bridgeProcess      = null
        }
    });

    test('#16429 REACHING connected retires a prior failure — the recovery half, not the attempt half', () => {
        // @neo-gpt archived the exact head, deleted only the success-path clear, and the previous
        // spec still passed 8/8: it started another spawn, which clears at ATTEMPT START, so it never
        // reached a connected state and could not fail. This drives the connected transition itself.
        //
        // The payload this prevents is `{connected: true, spawnFailure: 'ENOENT'}` — a resolved
        // problem still reported, which is worse than silence because it is actionable and wrong.
        const originalSocket = ConnectionService.bridgeSocket;

        ConnectionService.lastSpawnFailure = 'ENOENT';

        try {
            ConnectionService.markBridgeConnected({fake: 'socket'});

            const status = ConnectionService.getStatus();

            expect(status.bridgeConnected, 'the transition must record the live socket').toBe(true);
            expect(status.lastSpawnFailure, 'reaching connected must retire the prior failure').toBeNull();
        } finally {
            ConnectionService.bridgeSocket      = originalSocket;
            ConnectionService.lastSpawnFailure  = null
        }
    });

    test('#16429 the harness and the disabled leaf still win over a resolved cwd', () => {
        // Ordering is the new behaviour; these two are the pre-existing contracts it must not break.
        // Unit specs importing this singleton (via HealthService) must never reach a live Bridge.
        expect(resolveBridgeAutoConnect({unitTestMode: true, autoConnect: true, cwd: '/repo/neo'}))
            .toBe('disabled');

        expect(resolveBridgeAutoConnect({unitTestMode: false, autoConnect: false, cwd: '/repo/neo'}))
            .toBe('disabled');
    });
});
