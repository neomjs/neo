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

import {test, expect}             from '@playwright/test';
import {spawn}                    from 'node:child_process';
import path                       from 'node:path';
import {fileURLToPath}            from 'node:url';
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import {resolveBridgeAutoConnect} from '../../../../../../ai/services/neural-link/ConnectionService.mjs';

const NEURAL_LINK_ENTRYPOINT = fileURLToPath(
    new URL('../../../../../../ai/mcp/server/neural-link/mcp-server.mjs', import.meta.url)
);

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
        } finally {
            child.kill('SIGKILL')
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
