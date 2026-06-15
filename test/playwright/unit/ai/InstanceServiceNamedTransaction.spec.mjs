import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceNamedTransactionTest';

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

// The `begin_transaction` / `commit_transaction` Neural Link tools group several agent mutations into ONE undoable
// named transaction: while a batch is open, InstanceService.recordUndo captures each op INTO it (instead of
// auto-wrapping per-op), so a later undo reverts the whole intent as a unit. These tests drive the two tools + the
// recordUndo routing against a real TransactionService with a minimal client stub (no live tree).

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

// a minimal valid reverse-op carrying a re-dispatchable forward/reverse + a user-facing label
const op = (label, seq) => ({
    sequenceId       : seq,
    originWriter     : {agentId: 'agent-a', sessionId: 'sess-a'},
    targetSubtreePath: ['root', 'leaf'],
    forward          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}},
    reverse          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 0}}},
    label
});

test.describe('Neo.ai.client.InstanceService — named-transaction batching', () => {
    let service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);
        service            = Neo.create(InstanceService, {client: {transactionService}})
    });

    test('begin_transaction opens a named batch keyed `batch:<name>`', async () => {
        const result = await service.beginTransaction({name: 'add-grid'}, ID);

        expect(result).toEqual({opened: true, txId: 'batch:add-grid'});
        expect(transactionService.openTxId({id: ID})).toBe('batch:add-grid')
    });

    test('begin_transaction fail-closed → no identity / empty name / already-open', async () => {
        expect(await service.beginTransaction({name: 'x'}, null)).toEqual({opened: false, reason: 'no-writer-identity'});
        expect(await service.beginTransaction({name: '   '}, ID)).toEqual({opened: false, reason: 'name-required'});
        expect(await service.beginTransaction({}, ID)).toEqual({opened: false, reason: 'name-required'});

        await service.beginTransaction({name: 'first'}, ID);
        expect(await service.beginTransaction({name: 'second'}, ID))
            .toEqual({opened: false, reason: 'transaction-already-open', txId: 'batch:first'}) // no silent abort of in-flight work
    });

    test('recordUndo accumulates into an open batch — no per-op commit', async () => {
        await service.beginTransaction({name: 'add-grid'}, ID);
        service.recordUndo(ID, op('set x', 's1'));
        service.recordUndo(ID, op('set y', 's2'));

        const {open, committed} = transactionService.stackOf({id: ID});
        expect(open.txId).toBe('batch:add-grid');
        expect(open.ops.length).toBe(2);   // both captured into the one open batch
        expect(committed.length).toBe(0)   // nothing auto-wrapped/committed while the batch is open
    });

    test('recordUndo auto-wraps a standalone mutation when no batch is open', async () => {
        service.recordUndo(ID, op('set x', 's1'));

        const {open, committed} = transactionService.stackOf({id: ID});
        expect(open).toBeNull();              // the auto-wrap opened + committed within the one call
        expect(committed.length).toBe(1);
        expect(committed[0].ops.length).toBe(1)
    });

    test('commit_transaction folds the batch into one committed tx + clears open', async () => {
        await service.beginTransaction({name: 'add-grid'}, ID);
        service.recordUndo(ID, op('set x', 's1'));
        service.recordUndo(ID, op('set y', 's2'));

        expect(await service.commitTransaction({}, ID)).toEqual({committed: true, txId: 'batch:add-grid', ops: 2});

        const {open, committed} = transactionService.stackOf({id: ID});
        expect(open).toBeNull();
        expect(committed.length).toBe(1);
        expect(committed[0].ops.length).toBe(2) // one undoable unit of two mutations
    });

    test('commit_transaction fail-closed → no identity / no open batch / empty batch', async () => {
        expect(await service.commitTransaction({}, null)).toEqual({committed: false, reason: 'no-writer-identity'});
        expect(await service.commitTransaction({}, ID)).toEqual({committed: false, reason: 'no-open-transaction'});

        await service.beginTransaction({name: 'empty'}, ID); // opened but nothing captured
        expect(await service.commitTransaction({}, ID)).toEqual({committed: false, reason: 'empty-transaction'})
    });

    test('a committed batch undoes as a single unit — all ops re-dispatched, tx consumed', async () => {
        const
            calls  = [],
            client = {
                transactionService,
                async handleRequest(tool, args, context) { calls.push({tool, args, undoReplay: context?.undoReplay}) }
            },
            batchService = Neo.create(InstanceService, {client});

        await batchService.beginTransaction({name: 'add-grid'}, ID);
        batchService.recordUndo(ID, op('set x', 's1'));
        batchService.recordUndo(ID, op('set y', 's2'));
        await batchService.commitTransaction({}, ID);

        const result = await batchService.undo({}, ID);

        expect(result.undone).toBe(true);
        expect(result.reverted).toBe(2);                              // both batched ops reverted as one undo
        expect(calls.length).toBe(2);                                 // each reverse re-dispatched exactly once
        expect(calls.every(call => call.undoReplay === true)).toBe(true); // under capture-suppression (no re-capture)
        expect(transactionService.stackOf({id: ID}).committed.length).toBe(0) // the single batched tx consumed
    });

    test('a committed batch redoes as a single unit — forwards re-dispatched in capture order, redo branch consumed', async () => {
        const
            calls  = [],
            client = {
                transactionService,
                async handleRequest(tool, args, context) { calls.push({properties: args?.properties, undoReplay: context?.undoReplay}) }
            },
            batchService = Neo.create(InstanceService, {client}),
            // distinct forwards so the redo re-dispatch order is observable (the shared op() helper's forwards are identical)
            opA = {...op('set x', 's1'), forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}}},
            opB = {...op('set y', 's2'), forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {y: 2}}}};

        await batchService.beginTransaction({name: 'add-grid'}, ID);
        batchService.recordUndo(ID, opA);
        batchService.recordUndo(ID, opB);
        await batchService.commitTransaction({}, ID);

        await batchService.undo({}, ID); // batch → undone, onto the redo branch
        calls.length = 0;                // isolate the redo's forward re-dispatches from the undo's reverses

        const result = await batchService.redo({}, ID);

        expect(result.redone).toBe(true);
        expect(result.reapplied).toBe(2);                              // both batched ops re-applied as ONE redo
        expect(calls.map(call => call.properties)).toEqual([{x: 1}, {y: 2}]); // forwards, in capture order (opA → opB)
        expect(calls.every(call => call.undoReplay === true)).toBe(true);     // under capture-suppression

        const {committed, redo} = transactionService.stackOf({id: ID});
        expect(redo.length).toBe(0);              // redo branch consumed
        expect(committed.length).toBe(1);
        expect(committed[0].ops.length).toBe(2)   // restored as one multi-op unit (undoable again)
    });

    test('list_transactions reports a committed named batch — opCount + all labels (cross-tool integration)', async () => {
        await service.beginTransaction({name: 'add-grid'}, ID);
        service.recordUndo(ID, op('set width',  's1'));
        service.recordUndo(ID, op('set height', 's2'));
        await service.commitTransaction({}, ID);

        const {committed, redo} = await service.listTransactions({}, ID);

        expect(redo).toEqual([]);
        expect(committed).toHaveLength(1);
        // the batch folded 2 mutations into one auditable unit — labels in capture order, raw ops excluded
        expect(committed[0]).toEqual({txId: 'batch:add-grid', status: 'committed', opCount: 2, labels: ['set width', 'set height']})
    });

    test('abort_transaction discards the open batch — committed stack + redo branch untouched', async () => {
        await service.beginTransaction({name: 'keep'}, ID);
        service.recordUndo(ID, op('kept', 'k1'));
        await service.commitTransaction({}, ID);            // committed[0] = batch:keep

        await service.beginTransaction({name: 'discard'}, ID);
        service.recordUndo(ID, op('throwaway', 'd1'));      // open batch:discard, 1 op

        expect(await service.abortTransaction({}, ID)).toEqual({aborted: true, txId: 'batch:discard'});

        const {open, committed, redo} = transactionService.stackOf({id: ID});
        expect(open).toBeNull();                            // the open batch dropped (never undoable)
        expect(committed.map(t => t.txId)).toEqual(['batch:keep']); // the prior committed batch untouched
        expect(redo).toEqual([])                            // redo branch untouched
    });

    test('abort_transaction fail-closed → no identity / no open batch', async () => {
        expect(await service.abortTransaction({}, null)).toEqual({aborted: false, reason: 'no-writer-identity'});
        expect(await service.abortTransaction({}, ID)).toEqual({aborted: false, reason: 'no-open-transaction'}) // nothing open (idempotent)
    });

    test('the batch tools fail closed without a stack authority → no-transaction-service', async () => {
        const bare = Neo.create(InstanceService, {client: {}}); // a client with no transactionService

        expect(await bare.beginTransaction({name: 'x'}, ID)).toEqual({opened: false, reason: 'no-transaction-service'});
        expect(await bare.commitTransaction({}, ID)).toEqual({committed: false, reason: 'no-transaction-service'});
        expect(await bare.abortTransaction({}, ID)).toEqual({aborted: false, reason: 'no-transaction-service'})
    });
});
