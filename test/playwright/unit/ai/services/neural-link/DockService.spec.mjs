import {setup} from '../../../../setup.mjs';

const appName = 'NeuralLinkDockServiceTest';

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

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Right-hemisphere coverage for the perspective tool trio — `capture_perspective`,
 * `list_perspectives` and `restore_perspective` on `Neo.ai.services.neural-link.DockService`.
 *
 * The server-side services are deliberately THIN passthroughs: all behavior (scope validation,
 * store verdicts, reconciliation) lives worker-side, so what the right hemisphere owes is exact
 * dispatch fidelity — the correct App Worker tool name and a parameter payload forwarded without
 * loss or invention. These tests mock `ConnectionService.call` and pin exactly that.
 */
test.describe('Neo.ai.services.neural-link.DockService — perspective tool passthroughs', () => {
    let ConnectionService, DockService, calls, originalCall, originalReady;

    test.beforeAll(async () => {
        // Prevent the ConnectionService singleton from auto-spawning a Bridge process at import
        // time (autoConnect → initAsync → spawnBridge) — mirrors ComponentService.spec.mjs.
        (await import('../../../../../../ai/mcp/server/neural-link/config.template.mjs')).default.data.autoConnect = false;

        ConnectionService = (await import('../../../../../../ai/services/neural-link/ConnectionService.mjs')).default;
        originalReady           = ConnectionService.ready;
        ConnectionService.ready = async () => {};
        DockService = (await import('../../../../../../ai/services/neural-link/DockService.mjs')).default;
    });

    test.afterAll(() => {
        ConnectionService.ready = originalReady;
    });

    test.beforeEach(() => {
        calls        = [];
        originalCall = ConnectionService.call;
        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({op, payload, sessionId});
            return {forwarded: true};
        };
    });

    test.afterEach(() => {
        ConnectionService.call = originalCall;
    });

    test('capturePerspective dispatches capture_perspective with the full parameter set forwarded verbatim', async () => {
        const result = await DockService.capturePerspective({
            captureScope   : 'topology',
            componentId    : 'cockpit-1',
            layoutId       : 'topo-1',
            perspectiveName: 'Everything',
            replace        : true,
            sessionId      : 's-1',
            title          : 'Everything view'
        });

        expect(result).toEqual({forwarded: true});
        expect(calls).toEqual([{
            op     : 'capture_perspective',
            payload: {
                captureScope   : 'topology',
                componentId    : 'cockpit-1',
                layoutId       : 'topo-1',
                perspectiveName: 'Everything',
                replace        : true,
                title          : 'Everything view'
            },
            sessionId: 's-1'
        }])
    });

    test('listPerspectives dispatches list_perspectives with the holder id only', async () => {
        await DockService.listPerspectives({componentId: 'cockpit-1', sessionId: 's-2'});

        expect(calls).toEqual([{
            op       : 'list_perspectives',
            payload  : {componentId: 'cockpit-1'},
            sessionId: 's-2'
        }])
    });

    test('restorePerspective dispatches restore_perspective with the name resolved worker-side', async () => {
        await DockService.restorePerspective({componentId: 'cockpit-1', name: 'Everything', sessionId: 's-3'});

        expect(calls).toEqual([{
            op       : 'restore_perspective',
            payload  : {componentId: 'cockpit-1', name: 'Everything'},
            sessionId: 's-3'
        }])
    });
});
