import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceUndoCaptureTest';

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

// Neo.ai.client.InstanceService.setInstanceProperties is the app-side write-path for the `set_instance_properties`
// Neural Link tool. After the multi-writer enforcement grant, it captures the reverse-op (set⁻¹ = set(oldValues))
// onto the heap's TransactionService undo stack, keyed on the live (agentId, sessionId) writer pair — so an agent
// can undo the write. These tests drive a real component through the write-path with a real TransactionService +
// WriteGuard (the in-heap authorities a Client owns), and assert the captured reverse + the legacy-skip.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

test.describe('Neo.ai.client.InstanceService — set_instance_properties undo capture', () => {
    let component, service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);
        service            = Neo.create(InstanceService, {
            client: {transactionService, writeGuard: Neo.create(WriteGuard)}
        });
        component = Neo.create(Component, {appName, id: 'undo-capture-cmp', width: 100})
    });

    test.afterEach(() => {
        component.destroy()
    });

    test('captures set⁻¹ (the old values) onto the writer stack for an enforcement-granted agent write', () => {
        const result = service.setInstanceProperties({id: 'undo-capture-cmp', properties: {width: 200}}, ID);

        expect(result).toEqual({success: true});
        expect(component.width).toBe(200); // the forward write applied

        const stack = transactionService.stackOf({id: ID});

        expect(stack.committed).toHaveLength(1);

        const op = stack.committed[0].ops[0];

        // the captured reverse is set(oldValues) — re-dispatchable as the same validated tool
        expect(op.reverse).toEqual({tool: 'set_instance_properties', args: {id: 'undo-capture-cmp', properties: {width: 100}}});
        expect(op.forward).toEqual({tool: 'set_instance_properties', args: {id: 'undo-capture-cmp', properties: {width: 200}}});
        expect(op.originWriter).toEqual(ID);                  // provenance = the writer
        expect(op.targetSubtreePath).toEqual(['undo-capture-cmp']) // parentless component → single-element audit path
    });

    test('multiple agent writes accumulate as separate committed transactions (most-recent undoable first)', () => {
        service.setInstanceProperties({id: 'undo-capture-cmp', properties: {width: 200}}, ID);
        service.setInstanceProperties({id: 'undo-capture-cmp', properties: {width: 300}}, ID);

        const stack = transactionService.stackOf({id: ID});

        expect(stack.committed).toHaveLength(2);
        // the most-recent write's reverse restores the prior value (200), the older restores the original (100)
        expect(stack.committed[1].ops[0].reverse.args.properties).toEqual({width: 200});
        expect(stack.committed[0].ops[0].reverse.args.properties).toEqual({width: 100})
    });

    test('a legacy write (no context) applies but is NOT captured — no writer identity, no per-writer stack', () => {
        service.setInstanceProperties({id: 'undo-capture-cmp', properties: {width: 300}}, null);

        expect(component.width).toBe(300);                                       // the write still applies
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0)   // but nothing is captured
    });
});
