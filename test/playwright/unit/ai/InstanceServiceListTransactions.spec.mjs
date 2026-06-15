import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceListTransactionsTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceService    from '../../../../src/ai/client/InstanceService.mjs';
import TransactionService from '../../../../src/ai/TransactionService.mjs';

// Neo.ai.client.InstanceService.listTransactions is the read-only `list_transactions` tool: a non-consuming
// projection of the writer's undo state (TransactionService.stackOf) into a {committed, redo} audit summary
// ({txId, status, opCount, labels} per tx). Pure read — no live tree, no handleRequest, no enforcement — so
// these tests drive it against a real TransactionService with a minimal client stub.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

// a minimal valid reverse-op carrying a user-facing label
const op = (label, seq) => ({
    sequenceId       : seq,
    originWriter     : {agentId: 'agent-a', sessionId: 'sess-a'},
    targetSubtreePath: ['root', 'leaf'],
    forward          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}},
    reverse          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 0}}},
    label
});

test.describe('Neo.ai.client.InstanceService — the `list_transactions` tool', () => {
    let service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);
        service            = Neo.create(InstanceService, {client: {transactionService}})
    });

    const commit = (txId, label) => {
        transactionService.begin ({id: ID, txId});
        transactionService.record({id: ID, txId, op: op(label, `${txId}:1`)});
        return transactionService.commit({id: ID, txId})
    };

    test('projects the committed stack + the redo branch to an audit summary', async () => {
        commit('tx-1', 'set x on leaf');
        commit('tx-2', 'set y on panel');
        transactionService.undo({id: ID}); // tx-2 → undone, onto the redo branch

        const result = await service.listTransactions({}, ID);

        expect(result.committed.map(t => t.txId)).toEqual(['tx-1']);                  // tx-1 still undoable
        expect(result.committed[0]).toEqual({txId: 'tx-1', status: 'committed', opCount: 1, labels: ['set x on leaf']});
        expect(result.redo.map(t => t.txId)).toEqual(['tx-2']);                       // tx-2 redoable
        expect(result.redo[0].status).toBe('undone');
        expect(result.redo[0].labels).toEqual(['set y on panel'])
    });

    test('read-only — multiple reads never mutate the stack', async () => {
        commit('tx-1', 'a');

        await service.listTransactions({}, ID);
        await service.listTransactions({}, ID);

        expect(transactionService.stackOf({id: ID}).committed.map(t => t.txId)).toEqual(['tx-1']) // unchanged + still undoable
    });

    test('fail-closed → empty lists for a no-writer-identity caller or an absent stack service', async () => {
        commit('tx-1', 'a');

        expect(await service.listTransactions({}, null)).toEqual({committed: [], redo: []}); // no writer identity

        const bare = Neo.create(InstanceService, {client: {}});
        expect(await bare.listTransactions({}, ID)).toEqual({committed: [], redo: []})       // no transactionService
    });
});
