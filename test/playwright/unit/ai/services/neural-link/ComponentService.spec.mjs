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
 * @summary Coverage for `ComponentService.createComponent` + `removeComponent` — the `create_component`
 * and `remove_component` Neural Link tools.
 *
 * Both are `write-locked`, schema-validated alternatives to the admin-tier `call_method(...)`: they validate
 * server-side (fail-fast, no dispatch on bad input) and delegate to the existing `call_method` transport op —
 * create as `parent.add(config)`, remove as `component.destroy(true)` (the pinned `true` = `updateParentVdom`,
 * so the DOM node is detached, not orphaned). These tests mock `ConnectionService.call` so they assert the
 * server-side validation + the exact delegated dispatch, without a live App Worker.
 */
test.describe('Neo.ai.services.neural-link.ComponentService — createComponent + removeComponent', () => {
    let ComponentService, ConnectionService, calls, originalCall, originalReady;

    test.beforeAll(async () => {
        // Prevent the ConnectionService singleton from auto-spawning a Bridge process at import time
        // (autoConnect → initAsync → spawnBridge) — it pollutes the unit run (port 8081 EPERM and
        // `.neo-ai-data/logs/neural-link-bridge-stdio.log`) and is the isolation blocker. Set
        // autoConnect=false on the shared NL config BEFORE importing ConnectionService (mirrors
        // McpServerListToolsSmoke.spec). A post-import ready-stub alone is too late: the spawn fires
        // from ConnectionService's own initAsync, gated by this config leaf.
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

    test('rejects a non-class `module` (a class reference cannot cross the wire) — guides to ntype/className', async () => {
        // The footgun: an agent naturally tries `module: 'Neo.button.Base'` (a string); over the wire a
        // class can't serialize, and the string would crash the worker-side container.add at createItem.
        await expect(ComponentService.createComponent({parentId: 'p1', config: {module: 'Neo.button.Base'}, sessionId: 's1'}))
            .rejects.toThrow(/class reference|ntype/);
        expect(calls.length).toBe(0);
    });

    test('delegates a valid config to call_method as parent.add(config)', async () => {
        const config = {className: 'Neo.button.Base', text: 'Save'};
        const result = await ComponentService.createComponent({parentId: 'toolbar-1', config, sessionId: 's1'});

        expect(calls.length).toBe(1);
        expect(calls[0]).toEqual({
            sessionId: 's1',
            op       : 'call_method',
            payload  : {id: 'toolbar-1', method: 'add', args: [config], undoKind: 'create_component'} // server-stamped undo-capture marker
        });
        expect(result).toEqual({success: true, id: 'neo-created-1'});
    });

    test('accepts ntype-only and className-only configs', async () => {
        await ComponentService.createComponent({parentId: 'p1', config: {ntype: 'button'},          sessionId: 's1'});
        await ComponentService.createComponent({parentId: 'p1', config: {className: 'Neo.x.Y'}, sessionId: 's1'});
        expect(calls.length).toBe(2);
        expect(calls.every(c => c.op === 'call_method' && c.payload.method === 'add')).toBe(true);
    });

    test('removeComponent rejects a missing componentId without dispatching', async () => {
        await expect(ComponentService.removeComponent({sessionId: 's1'}))
            .rejects.toThrow(/componentId/);
        expect(calls.length).toBe(0);
    });

    test('removeComponent delegates a valid id to call_method as component.destroy(true)', async () => {
        await ComponentService.removeComponent({componentId: 'dialog-1', sessionId: 's1'});

        expect(calls.length).toBe(1);
        // The pinned `true` is destroy's `updateParentVdom` flag — it detaches the DOM node, not just the
        // instance (the framework default `destroy(false)` would orphan the node in the live DOM).
        expect(calls[0]).toEqual({
            sessionId: 's1',
            op       : 'call_method',
            payload  : {id: 'dialog-1', method: 'destroy', args: [true], undoKind: 'remove_component'} // server-stamped undo-capture marker
        });
    });
});
