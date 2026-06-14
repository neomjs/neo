import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceUndoTest';

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

// Neo.ai.client.InstanceService.undo is the app-side `undo` Neural Link tool. It peeks the requester's last committed
// transaction (non-consuming), re-dispatches each captured reverse through the enforced dispatch path (re-entering
// admitWrite as the CURRENT caller, with an `undoReplay` marker that suppresses re-capture), and consumes the
// transaction only on full success. These tests drive a real component through capture → undo with a real
// TransactionService + WriteGuard, plus a `handleRequest` stub that routes the replay back to the service (the role
// Neo.ai.Client plays in the live heap), and assert the revert, the single-level suppression, and preserve-on-fail.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

test.describe('Neo.ai.client.InstanceService — the `undo` tool', () => {
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
        component = Neo.create(Component, {appName, id: 'undo-cmp', width: 100})
    });

    test.afterEach(() => {
        !component.isDestroyed && component.destroy()
    });

    test('reverts the last committed set on the live tree and consumes the transaction', async () => {
        service.setInstanceProperties({id: 'undo-cmp', properties: {width: 200}}, ID);
        expect(component.width).toBe(200);                                       // forward write applied
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);

        const result = await service.undo({}, ID);

        expect(result.undone).toBe(true);
        expect(result.reverted).toBe(1);
        expect(component.width).toBe(100);                                       // reverted to the pre-set value
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0)   // transaction consumed (committed -> undone)
    });

    test('the undo-replay is NOT itself captured — a second undo finds nothing (single-level, no redo enqueued)', async () => {
        service.setInstanceProperties({id: 'undo-cmp', properties: {width: 200}}, ID);

        const first = await service.undo({}, ID);
        expect(first.undone).toBe(true);

        // The replayed set(width:100) carried the `undoReplay` marker, so it was not captured. Had it been captured,
        // the stack would now hold a redoable transaction — single-level Slice-1 forbids that.
        const second = await service.undo({}, ID);
        expect(second).toEqual({undone: false, reason: 'nothing-to-undo'})
    });

    test('nothing to undo → recoverable no-op error', async () => {
        expect(await service.undo({}, ID)).toEqual({undone: false, reason: 'nothing-to-undo'})
    });

    test('a legacy call with no writer identity → recoverable no-op error', async () => {
        service.setInstanceProperties({id: 'undo-cmp', properties: {width: 200}}, ID); // an agent write exists on the stack
        expect(await service.undo({}, null)).toEqual({undone: false, reason: 'no-writer-identity'})
    });

    test('an absent transactionService → recoverable no-op error', async () => {
        const service2 = Neo.create(InstanceService, {client: {writeGuard: Neo.create(WriteGuard)}});
        expect(await service2.undo({}, ID)).toEqual({undone: false, reason: 'no-transaction-service'})
    });

    test('a denied / unresolvable re-dispatch → no-op + recoverable error, transaction PRESERVED (fail-closed)', async () => {
        service.setInstanceProperties({id: 'undo-cmp', properties: {width: 200}}, ID);
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);

        // simulate a denied enforcement / unresolvable target on the revert re-dispatch
        service.client.handleRequest = () => { throw new Error('Write denied for undo-cmp: subtree-locked') };

        const result = await service.undo({}, ID);

        expect(result.undone).toBe(false);
        expect(result.reason).toMatch(/^undo-denied:/);
        // preserve-on-fail: the transaction is NOT consumed — it stays committed for a later retry
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1)
    })
});
