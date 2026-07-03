import {setup} from '../../setup.mjs';

const appName = 'InstanceServiceCreateUndoCaptureTest';

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

// `create_component` is forwarded server-side as a server-stamped `call_method` `parent.add(config)`; the
// app-side Neo.ai.client.InstanceService.callMethod records its inverse (destroy the new child) onto the writer's undo
// stack — but ONLY with the server-stamped `undoKind` marker + the canonical `add(config)` shape. These tests isolate
// the capture wiring: `container.add` is stubbed (its vdom path is Neo's, exercised elsewhere; here it returns a
// controlled instance) so the assertions are on MY capture logic — the marker gate, the reverse descriptor, the
// round-trip revert via the merged `undo` tool, the generic-call_method non-capture (gpt guardrail 1), and fail-closed.

const ID = {agentId: 'agent-a', sessionId: 'sess-a'};

test.describe('Neo.ai.client.InstanceService — create_component undo capture', () => {
    let container, service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);

        const client = {
            transactionService,
            writeGuard   : Neo.create(WriteGuard),
            // mirrors Neo.ai.Client#handleRequest: snake_case tool -> camelCase service method, threading the context
            handleRequest: (method, params, ctx) => service[Neo.snakeToCamel(method)](params, ctx)
        };

        service   = Neo.create(InstanceService, {client});
        container = Neo.create(Container, {appName, id: 'undo-create-container', items: []})
    });

    test.afterEach(() => {
        !container.isDestroyed && container.destroy()
    });

    test('a server-stamped create captures its inverse (destroy the new child) on the writer stack', async () => {
        container.add = () => ({id: 'created-child'}); // stub: the new child the create produced (isolate the capture)

        await service.callMethod({
            id: 'undo-create-container', method: 'add', args: [{ntype: 'component'}], undoKind: 'create_component'
        }, ID);

        const stack = transactionService.stackOf({id: ID});
        expect(stack.committed).toHaveLength(1);

        const op = stack.committed[0].ops[0];
        // the captured reverse re-dispatches as a validated call_method destroy(newId, true)
        expect(op.reverse).toEqual({tool: 'call_method', args: {id: 'created-child', method: 'destroy', args: [true]}});
        expect(op.forward.tool).toBe('create_component');
        expect(op.originWriter).toEqual(ID)
    });

    test('round-trip: a captured create → undo → the new child is destroyed + the transaction consumed', async () => {
        const child = Neo.create(Component, {appName, id: 'rt-child'}); // a real, destroyable child
        container.add = () => child;

        await service.callMethod({
            id: 'undo-create-container', method: 'add', args: [{ntype: 'component', id: 'rt-child'}],
            undoKind: 'create_component'
        }, ID);
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);

        const result = await service.undo({}, ID);

        expect(result.undone).toBe(true);
        expect(Neo.getComponent('rt-child')?.isDestroyed ?? true).toBe(true);     // reverse destroyed the new child
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0)    // transaction consumed
    });

    test('a generic call_method add (NO server-stamped marker) is NOT captured — generic call_method stays non-undoable', async () => {
        container.add = () => ({id: 'unmarked-child'});

        await service.callMethod({
            id: 'undo-create-container', method: 'add', args: [{ntype: 'component'}]
        }, ID); // no undoKind — a plain call_method, exactly what a public caller can reach

        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(0) // nothing captured
    });

    test('buildCreateReverse is fail-closed — only a marked, canonical, attributed, non-replay create captures', () => {
        const base = {
            context: ID, id: 'undo-create-container', method: 'add', args: [{ntype: 'component'}],
            undoKind: 'create_component', result: {id: 'new-x'}
        };

        expect(service.buildCreateReverse(base)).not.toBeNull();                                       // happy path
        expect(service.buildCreateReverse({...base, undoKind: undefined})).toBeNull();                 // no marker (generic call_method)
        expect(service.buildCreateReverse({...base, context: {...ID, undoReplay: true}})).toBeNull();  // undo replay
        expect(service.buildCreateReverse({...base, context: null})).toBeNull();                       // no writer identity
        expect(service.buildCreateReverse({...base, method: 'insert'})).toBeNull();                    // non-canonical method
        expect(service.buildCreateReverse({...base, args: []})).toBeNull();                            // non-canonical args
        expect(service.buildCreateReverse({...base, result: null})).toBeNull()                         // unresolvable new id
    })
});
