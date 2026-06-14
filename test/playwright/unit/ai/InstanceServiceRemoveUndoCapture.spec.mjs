import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceRemoveUndoCaptureTest';

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
import Container          from '../../../../src/container/Base.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs'; // binds Neo.getComponent + registers components
import InstanceManager    from '../../../../src/manager/Instance.mjs';  // binds Neo.get + registers instances
import InstanceService    from '../../../../src/ai/client/InstanceService.mjs';
import TransactionService from '../../../../src/ai/TransactionService.mjs';
import WriteGuard         from '../../../../src/ai/WriteGuard.mjs';

// `remove_component` forwards server-side as a server-stamped `call_method` `destroy(true)`; the app-side
// InstanceService.callMethod captures the reverse (`insert(index, config)` on the parent) BEFORE destroy runs — the
// component's parent/index/config must be snapshotted before it is gone. These tests isolate the capture wiring
// (`indexOf`/`insert`/`destroy` are stubbed — their vdom path is Neo's, exercised elsewhere), asserting the
// position-preserving reverse, the round-trip re-dispatch, the generic-call_method non-capture (gpt guardrail 1),
// and the `buildRemoveReverse` fail-closed branches.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};
let seq = 0; // unique ids per test (Date/random are unavailable; a stubbed destroy won't unregister)

test.describe('Neo.ai.client.InstanceService — remove_component undo capture', () => {
    let parent, child, parentId, childId, service, transactionService, dispatched;

    test.beforeEach(() => {
        seq++;
        parentId = `rm-parent-${seq}`;
        childId  = `rm-child-${seq}`;

        transactionService = Neo.create(TransactionService);
        dispatched         = [];

        const client = {
            transactionService,
            writeGuard   : Neo.create(WriteGuard),
            // mirrors Neo.ai.Client#handleRequest; records the undo re-dispatch + routes it back to the service
            handleRequest: (method, params, ctx) => {
                dispatched.push({method, params});
                return service[Neo.snakeToCamel(method)]?.(params, ctx)
            }
        };

        service = Neo.create(InstanceService, {client});
        parent  = Neo.create(Container, {appName, id: parentId, items: []});
        child   = Neo.create(Component, {appName, id: childId, width: 120});

        child.parentId = parentId;
        child.toJSON   = () => ({ntype: 'component', id: childId, width: 120}); // stub: a small JSON-safe config — a real toJSON can exceed record()'s payload cap / carry non-serializable refs (the documented serializable-config bound)
        parent.indexOf = () => 2;     // stub: the child's tree position (real indexOf needs it mounted in items)
        parent.insert  = () => child; // stub: the re-insert (its vdom path is Neo's; we assert the re-dispatch args)
        child.destroy  = () => {}      // stub: skip the unitTestMode vdom teardown (capture happens before destroy)
    });

    test.afterEach(() => {
        !parent.isDestroyed && parent.destroy()
    });

    test('captures remove\'s inverse — insert(index, config) on the parent — snapshotted before destroy', async () => {
        await service.callMethod({id: childId, method: 'destroy', args: [true], undoKind: 'remove_component'}, ID);

        const stack = transactionService.stackOf({id: ID});
        expect(stack.committed).toHaveLength(1);

        const op = stack.committed[0].ops[0];
        expect(op.forward).toEqual({tool: 'remove_component', args: {componentId: childId}});
        expect(op.reverse.tool).toBe('call_method');
        expect(op.reverse.args.id).toBe(parentId);
        expect(op.reverse.args.method).toBe('insert');
        expect(op.reverse.args.args[0]).toBe(2);                       // the captured index (position-preserving)
        expect(op.reverse.args.args[1]).toMatchObject({id: childId});  // the captured config (toJSON snapshot)
        expect(op.originWriter).toEqual(ID)
    });

    test('round-trip: a captured remove → undo → re-dispatches insert(index, config) + consumes the tx', async () => {
        await service.callMethod({id: childId, method: 'destroy', args: [true], undoKind: 'remove_component'}, ID);
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);

        const result = await service.undo({}, ID);

        expect(result.undone).toBe(true);
        const insertCall = dispatched.find(d => d.params?.method === 'insert');
        expect(insertCall).toBeTruthy();
        expect(insertCall.params.id).toBe(parentId);
        expect(insertCall.params.args[0]).toBe(2);                     // re-inserted at the original index
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0) // tx consumed
    });

    test('a generic call_method destroy (NO server-stamped marker) is NOT captured — generic call_method stays non-undoable', async () => {
        await service.callMethod({id: childId, method: 'destroy', args: [true]}, ID); // no undoKind

        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0)
    });

    test('buildRemoveReverse is fail-closed — only a marked, canonical, attributed, non-replay remove captures', () => {
        const base = {context: ID, id: childId, method: 'destroy', args: [true], undoKind: 'remove_component', instance: child};

        expect(service.buildRemoveReverse(base)).not.toBeNull();                                          // happy path
        expect(service.buildRemoveReverse({...base, undoKind: undefined})).toBeNull();                    // no marker
        expect(service.buildRemoveReverse({...base, context: {...ID, undoReplay: true}})).toBeNull();     // undo replay
        expect(service.buildRemoveReverse({...base, context: null})).toBeNull();                          // no writer identity
        expect(service.buildRemoveReverse({...base, method: 'hide'})).toBeNull();                         // non-canonical method
        expect(service.buildRemoveReverse({...base, args: [false]})).toBeNull();                          // non-canonical arg (not destroy(true))
        expect(service.buildRemoveReverse({...base, instance: {parentId: null, toJSON: () => ({})}})).toBeNull() // unresolvable parent
    })
});
