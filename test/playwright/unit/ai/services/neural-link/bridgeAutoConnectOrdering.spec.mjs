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
import Neo                        from '../../../../../../src/Neo.mjs';
import * as core                  from '../../../../../../src/core/_export.mjs';
import {resolveBridgeAutoConnect} from '../../../../../../ai/services/neural-link/ConnectionService.mjs';

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

    test('#16429 the harness and the disabled leaf still win over a resolved cwd', () => {
        // Ordering is the new behaviour; these two are the pre-existing contracts it must not break.
        // Unit specs importing this singleton (via HealthService) must never reach a live Bridge.
        expect(resolveBridgeAutoConnect({unitTestMode: true, autoConnect: true, cwd: '/repo/neo'}))
            .toBe('disabled');

        expect(resolveBridgeAutoConnect({unitTestMode: false, autoConnect: false, cwd: '/repo/neo'}))
            .toBe('disabled');
    });
});
