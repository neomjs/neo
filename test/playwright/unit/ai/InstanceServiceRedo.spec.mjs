import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceRedoTest';

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
import Component          from '../../../../src/component/Base.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs'; // binds Neo.getComponent + registers components
import InstanceManager    from '../../../../src/manager/Instance.mjs';  // binds Neo.get + registers instances
import InstanceService    from '../../../../src/ai/client/InstanceService.mjs';
import TransactionService from '../../../../src/ai/TransactionService.mjs';
import WriteGuard         from '../../../../src/ai/WriteGuard.mjs';

// Neo.ai.client.InstanceService.redo is the app-side `redo` Neural Link tool — the symmetric counterpart of `undo`. It
// peeks the requester's redo branch (the transactions undo retained, non-consuming), re-dispatches each captured
// FORWARD through the enforced dispatch path in capture order (re-entering admitWrite as the CURRENT caller, with the
// same `undoReplay` marker that suppresses re-capture), and consumes the redo entry only on full success. These tests
// drive a real component through capture → undo → redo with a real TransactionService + WriteGuard + the same
// `handleRequest` stub the undo spec uses, and assert the re-apply, the no-double-enqueue, the divergence clear, and
// preserve-on-fail.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

test.describe('Neo.ai.client.InstanceService — the `redo` tool', () => {
    let component, service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);

        const client = {
            transactionService,
            writeGuard   : Neo.create(WriteGuard),
            // mirrors Neo.ai.Client#handleRequest: snake_case tool -> camelCase service method, threading the context
            handleRequest: (method, params, ctx) => service[Neo.snakeToCamel(method)](params, ctx)
        };

        service   = Neo.create(InstanceService, {client});
        component = Neo.create(Component, {appName, id: 'redo-cmp', width: 100})
    });

    test.afterEach(() => {
        !component.isDestroyed && component.destroy()
    });

    test('re-applies the last undone set on the live tree and consumes the redo entry', async () => {
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 200}}, ID);
        expect((await service.undo({}, ID)).undone).toBe(true);
        expect(component.width).toBe(100);                                    // reverted to the pre-set value
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(1);   // retained on the redo branch

        const result = await service.redo({}, ID);

        expect(result.redone).toBe(true);
        expect(result.reapplied).toBe(1);
        expect(component.width).toBe(200);                                       // forward re-applied
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);  // restored — undoable again
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(0)        // redo entry consumed
    });

    test('the redo-replay is NOT itself captured — no new transaction is enqueued (single-level)', async () => {
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 200}}, ID);
        await service.undo({}, ID);

        const result = await service.redo({}, ID);
        expect(result.redone).toBe(true);

        // The replayed set(width:200) carried the `undoReplay` marker, so it was not captured: the committed stack holds
        // exactly the one restored transaction (not a second), and a follow-up redo finds the branch empty.
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);
        expect(await service.redo({}, ID)).toEqual({redone: false, reason: 'nothing-to-redo'})
    });

    test('nothing to redo → recoverable no-op error', async () => {
        expect(await service.redo({}, ID)).toEqual({redone: false, reason: 'nothing-to-redo'})
    });

    test('a legacy call with no writer identity → recoverable no-op error', async () => {
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 200}}, ID);
        await service.undo({}, ID); // a redoable transaction exists on the branch
        expect(await service.redo({}, null)).toEqual({redone: false, reason: 'no-writer-identity'})
    });

    test('an absent transactionService → recoverable no-op error', async () => {
        const service2 = Neo.create(InstanceService, {client: {writeGuard: Neo.create(WriteGuard)}});
        expect(await service2.redo({}, ID)).toEqual({redone: false, reason: 'no-transaction-service'})
    });

    test('a denied / unresolvable re-dispatch → no-op + recoverable error, redo branch PRESERVED (fail-closed)', async () => {
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 200}}, ID);
        await service.undo({}, ID);
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(1);

        // simulate a denied enforcement / unresolvable target on the re-apply re-dispatch
        service.client.handleRequest = () => { throw new Error('Write denied for redo-cmp: subtree-locked') };

        const result = await service.redo({}, ID);

        expect(result.redone).toBe(false);
        expect(result.reason).toMatch(/^redo-denied:/);
        // preserve-on-fail: the redo entry is NOT consumed — it stays on the branch for a later retry
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(1)
    });

    test('a new committed mutation clears the redo branch — a later redo finds nothing (divergence)', async () => {
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 200}}, ID);
        await service.undo({}, ID);
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(1);

        // a fresh agent write commits a new transaction → diverges history → the redo branch is invalidated
        service.setInstanceProperties({id: 'redo-cmp', properties: {width: 300}}, ID);
        expect(transactionService.stackOf({id: ID}).redo).toHaveLength(0);
        expect(await service.redo({}, ID)).toEqual({redone: false, reason: 'nothing-to-redo'})
    })
});
