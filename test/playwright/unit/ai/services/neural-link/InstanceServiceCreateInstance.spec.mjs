import {setup} from '../../../../setup.mjs';

const appName = 'NeuralLinkServerInstanceServiceCreateInstanceTest';

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
 * @summary Server-side validation and dispatch coverage for the `create_instance` Neural Link tool.
 *
 * The public MCP boundary must stay data-only: class identity is represented by `className` or `ntype`,
 * not a class reference, and function-bearing config is rejected before the request reaches the App Worker.
 */
test.describe('Neo.ai.services.neural-link.InstanceService - createInstance', () => {
    let ConnectionService, InstanceService, calls, originalCall, originalReady;

    test.beforeAll(async () => {
        (await import('../../../../../../ai/mcp/server/neural-link/config.mjs')).default.data.autoConnect = false;

        ConnectionService  = (await import('../../../../../../ai/services/neural-link/ConnectionService.mjs')).default;
        originalReady      = ConnectionService.ready;
        ConnectionService.ready = async () => {};
        InstanceService    = (await import('../../../../../../ai/services/neural-link/InstanceService.mjs')).default;
    });

    test.afterAll(() => {
        ConnectionService.ready = originalReady
    });

    test.beforeEach(() => {
        calls        = [];
        originalCall = ConnectionService.call;

        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {id: 'created-instance', className: payload.className || 'Neo.button.Base'}
        }
    });

    test.afterEach(() => {
        ConnectionService.call = originalCall
    });

    test('rejects missing or ambiguous class identity before dispatch', async () => {
        await expect(InstanceService.createInstance({config: {id: 'x'}, sessionId: 's1'}))
            .rejects.toThrow(/className.*ntype/);

        await expect(InstanceService.createInstance({className: 'Neo.data.Store', ntype: 'store', sessionId: 's1'}))
            .rejects.toThrow(/exactly one/);

        expect(calls.length).toBe(0)
    });

    test('rejects module class references and function-bearing config before dispatch', async () => {
        await expect(InstanceService.createInstance({
            config  : {module: 'Neo.button.Base'},
            sessionId: 's1'
        })).rejects.toThrow(/module.*cannot cross/);

        await expect(InstanceService.createInstance({
            className: 'Neo.button.Base',
            config   : {listeners: {click: () => {}}},
            sessionId: 's1'
        })).rejects.toThrow(/function-bearing config/);

        expect(calls.length).toBe(0)
    });

    test('rejects `module` nested in arrays and objects (recursive boundary)', async () => {
        await expect(InstanceService.createInstance({
            config   : {items: [{module: 'Neo.button.Base'}]},
            sessionId: 's1'
        })).rejects.toThrow(/module.*cannot cross/);

        await expect(InstanceService.createInstance({
            className: 'Neo.container.Base',
            config   : {items: [{ntype: 'button', config: {module: 'Neo.button.Base'}}]},
            sessionId: 's1'
        })).rejects.toThrow(/module.*cannot cross/);

        expect(calls.length).toBe(0)
    });

    test('delegates a standalone Store create request to the App Worker', async () => {
        const config = {
            id   : 'nl-store-1',
            data : [{id: 'row-1'}],
            model: {fields: [{name: 'id'}]}
        };

        const result = await InstanceService.createInstance({
            className: 'Neo.data.Store',
            config,
            sessionId: 's1'
        });

        expect(calls).toEqual([{
            sessionId: 's1',
            op       : 'create_instance',
            payload  : {className: 'Neo.data.Store', config, ntype: undefined, parentId: undefined}
        }]);
        expect(result).toEqual({id: 'created-instance', className: 'Neo.data.Store'})
    });

    test('delegates a parent-attached ntype create request', async () => {
        const result = await InstanceService.createInstance({
            ntype    : 'button',
            parentId : 'container-1',
            config   : {id: 'button-1', text: 'Save'},
            sessionId: 's1'
        });

        expect(calls).toEqual([{
            sessionId: 's1',
            op       : 'create_instance',
            payload  : {
                className: undefined,
                config   : {id: 'button-1', text: 'Save'},
                ntype    : 'button',
                parentId : 'container-1'
            }
        }]);
        expect(result.id).toBe('created-instance')
    });
});
