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
 * @summary Server-side validation and dispatch coverage for Neural Link instance service tools.
 *
 * The public MCP boundary must stay data-only: class identity is represented by `className` or `ntype`,
 * not a class reference, and function-bearing config is rejected before the request reaches the App Worker.
 */
test.describe('Neo.ai.services.neural-link.InstanceService - server boundary', () => {
    let ConnectionService, InstanceService, RecorderService, calls, recorderCalls,
        originalCall, originalDefaultSession, originalGetArchive, originalRecordReplay, originalReady, originalSaveArchive;

    test.beforeAll(async () => {
        (await import('../../../../../../ai/mcp/server/neural-link/config.mjs')).default.data.autoConnect = false;

        ConnectionService  = (await import('../../../../../../ai/services/neural-link/ConnectionService.mjs')).default;
        originalReady      = ConnectionService.ready;
        ConnectionService.ready = async () => {};
        InstanceService    = (await import('../../../../../../ai/services/neural-link/InstanceService.mjs')).default;
        RecorderService    = (await import('../../../../../../ai/services/neural-link/RecorderService.mjs')).default;
    });

    test.afterAll(() => {
        ConnectionService.ready = originalReady
    });

    test.beforeEach(() => {
        calls                  = [];
        recorderCalls          = [];
        originalCall           = ConnectionService.call;
        originalDefaultSession = ConnectionService.getDefaultSessionId;
        originalGetArchive     = RecorderService.getTransactionArchive;
        originalRecordReplay   = RecorderService.recordTransactionReplay;
        originalSaveArchive    = RecorderService.saveTransactionArchive;

        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {id: 'created-instance', className: payload.className || 'Neo.button.Base'}
        }

        ConnectionService.getDefaultSessionId = () => 'default-session';
        RecorderService.saveTransactionArchive = payload => {
            recorderCalls.push({type: 'save', payload});
            return {saved: true, archiveId: 'archive-1', sourceTxId: payload.transaction.txId}
        };
        RecorderService.getTransactionArchive = ({archiveId}) => archiveId === 'archive-1' ? {
            archiveId,
            committedAt : 1234,
            ops         : [{forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}}}],
            originWriter: {agentId: 'agent-a', sessionId: 'sess-a'},
            sourceTxId  : 'batch:add-grid'
        } : null;
        RecorderService.recordTransactionReplay = payload => {
            recorderCalls.push({type: 'replay', payload});
            return {updated: true}
        }
    });

    test.afterEach(() => {
        ConnectionService.call                = originalCall;
        ConnectionService.getDefaultSessionId = originalDefaultSession;
        RecorderService.saveTransactionArchive = originalSaveArchive;
        RecorderService.getTransactionArchive  = originalGetArchive;
        RecorderService.recordTransactionReplay = originalRecordReplay
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
            config   : {module: 'Neo.button.Base'},
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

    test('saveTransaction archives the App Worker snapshot through RecorderService', async () => {
        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {
                saved      : true,
                transaction: {
                    txId        : payload.txId,
                    status      : 'committed',
                    originWriter: {agentId: 'agent-a', sessionId: 'sess-a'},
                    ops         : []
                }
            }
        };

        const result = await InstanceService.saveTransaction({
            name: 'Add grid',
            txId: 'batch:add-grid'
        });

        expect(result).toEqual({saved: true, archiveId: 'archive-1', sourceTxId: 'batch:add-grid'});
        expect(calls).toEqual([{sessionId: undefined, op: 'save_transaction', payload: {txId: 'batch:add-grid'}}]);
        expect(recorderCalls).toEqual([{
            type   : 'save',
            payload: {
                appSessionId: 'default-session',
                name        : 'Add grid',
                transaction : {
                    txId        : 'batch:add-grid',
                    status      : 'committed',
                    originWriter: {agentId: 'agent-a', sessionId: 'sess-a'},
                    ops         : []
                }
            }
        }])
    });

    test('saveTransaction returns App Worker recoverable misses without archiving', async () => {
        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {saved: false, reason: 'transaction-not-found'}
        };

        expect(await InstanceService.saveTransaction({sessionId: 's1', txId: 'missing'}))
            .toEqual({saved: false, reason: 'transaction-not-found'});
        expect(recorderCalls).toEqual([])
    });

    test('replayTransaction rehydrates an archive through App Worker dispatch and records success', async () => {
        ConnectionService.call = async (sessionId, op, payload) => {
            calls.push({sessionId, op, payload});
            return {replayed: true, txId: `replay:${payload.archiveId}`, ops: payload.ops.length}
        };

        const result = await InstanceService.replayTransaction({sessionId: 's1', archiveId: 'archive-1'});

        expect(result).toEqual({replayed: true, txId: 'replay:archive-1', ops: 1});
        expect(calls).toEqual([{
            sessionId: 's1',
            op       : 'replay_transaction',
            payload  : {
                archiveId         : 'archive-1',
                ops               : [{forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}}}],
                sourceCommittedAt : 1234,
                sourceOriginWriter: {agentId: 'agent-a', sessionId: 'sess-a'},
                sourceTxId        : 'batch:add-grid'
            }
        }]);
        expect(recorderCalls).toEqual([{type: 'replay', payload: {archiveId: 'archive-1'}}])
    });

    test('replayTransaction fails closed when the archive is missing', async () => {
        expect(await InstanceService.replayTransaction({sessionId: 's1', archiveId: 'missing'}))
            .toEqual({replayed: false, reason: 'archive-not-found'});
        expect(calls).toEqual([]);
        expect(recorderCalls).toEqual([])
    });
});
