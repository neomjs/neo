import {setup} from '../../../../setup.mjs';

const appName = 'ComponentServiceTest';

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
 * @summary Coverage for `ComponentService.createComponent` — the `create_component` Neural Link tool.
 *
 * The tool is a `write-locked`, schema-validated alternative to the admin-tier `call_method(container.add())`:
 * it validates the config server-side (fail-fast, no dispatch on bad input) and delegates a valid create to
 * the existing `call_method` transport op as `parent.add(config)`. These tests mock `ConnectionService.call`
 * so they assert the server-side validation + the exact delegated dispatch, without a live App Worker.
 */
test.describe('Neo.ai.services.neural-link.ComponentService — createComponent', () => {
    let ComponentService, ConnectionService, calls, originalCall, originalReady;

    test.beforeAll(async () => {
        // Prevent the ConnectionService singleton from auto-spawning a Bridge process at import time
        // (autoConnect → initAsync → spawnBridge) — it pollutes the unit run (port 8081 EPERM / bridge.log)
        // and is the isolation blocker. Set autoConnect=false on the shared NL config BEFORE importing
        // ConnectionService (mirrors McpServerListToolsSmoke.spec). A post-import ready-stub alone is too
        // late: the spawn fires from ConnectionService's own initAsync, gated by this config leaf.
        (await import('../../../../../../ai/mcp/server/neural-link/config.mjs')).default.data.autoConnect = false;

        ConnectionService = (await import('../../../../../../ai/services/neural-link/ConnectionService.mjs')).default;
        // Also stub the readiness gate so the ComponentService singleton's initAsync resolves without a live bridge.
        originalReady          = ConnectionService.ready;
        ConnectionService.ready = async () => {};
        ComponentService = (await import('../../../../../../ai/services/neural-link/ComponentService.mjs')).default;
    });

    test.afterAll(() => {
        ConnectionService.ready = originalReady;
    });

    test.beforeEach(() => {
        calls        = [];
        originalCall = ConnectionService.call;
        // Mock the transport: record the dispatch and return a canned success.
        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {success: true, id: 'neo-created-1'};
        };
    });

    test.afterEach(() => {
        ConnectionService.call = originalCall;
    });

    test('rejects a missing parentId without dispatching', async () => {
        await expect(ComponentService.createComponent({config: {module: 'X'}, sessionId: 's1'}))
            .rejects.toThrow(/parentId/);
        expect(calls.length).toBe(0);
    });

    test('rejects a non-object config without dispatching', async () => {
        await expect(ComponentService.createComponent({parentId: 'p1', config: 'nope', sessionId: 's1'}))
            .rejects.toThrow(/config/);
        await expect(ComponentService.createComponent({parentId: 'p1', config: ['arr'], sessionId: 's1'}))
            .rejects.toThrow(/config/);
        expect(calls.length).toBe(0);
    });

    test('rejects a config with no module / ntype / className without dispatching', async () => {
        await expect(ComponentService.createComponent({parentId: 'p1', config: {flex: 1}, sessionId: 's1'}))
            .rejects.toThrow(/module.*ntype.*className/);
        expect(calls.length).toBe(0);
    });

    test('delegates a valid config to call_method as parent.add(config)', async () => {
        const config = {module: 'Neo.button.Base', text: 'Save'};
        const result = await ComponentService.createComponent({parentId: 'toolbar-1', config, sessionId: 's1'});

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({
            sessionId: 's1',
            op       : 'call_method',
            payload  : {id: 'toolbar-1', method: 'add', args: [config]}
        });
        expect(result).toEqual({success: true, id: 'neo-created-1'});
    });

    test('accepts ntype-only and className-only configs', async () => {
        await ComponentService.createComponent({parentId: 'p1', config: {ntype: 'button'},          sessionId: 's1'});
        await ComponentService.createComponent({parentId: 'p1', config: {className: 'Neo.x.Y'}, sessionId: 's1'});
        expect(calls.length).toBe(2);
        expect(calls.every(c => c.op === 'call_method' && c.payload.method === 'add')).toBe(true);
    });
});
