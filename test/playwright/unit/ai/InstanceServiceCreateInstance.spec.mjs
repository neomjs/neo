import {setup} from '../../setup.mjs';

const appName = 'ClientInstanceServiceCreateInstanceTest';

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
import Store              from '../../../../src/data/Store.mjs';
import ComponentManager   from '../../../../src/manager/Component.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import StoreManager       from '../../../../src/manager/Store.mjs';
import InstanceService    from '../../../../src/ai/client/InstanceService.mjs';
import TransactionService from '../../../../src/ai/TransactionService.mjs';
import WriteGuard         from '../../../../src/ai/WriteGuard.mjs';

const ID  = {agentId: 'agent-a', sessionId: 'sess-a'};
const ID2 = {agentId: 'agent-b', sessionId: 'sess-b'};

/**
 * @summary App-worker coverage for `create_instance`: standalone creation, parent attach, undo, and write guard.
 *
 * This exercises the actual heap mutation path behind the MCP tool. Standalone data instances do not have a
 * component subtree, while parent-attached components must still compose with the existing `WriteGuard`.
 */
test.describe('Neo.ai.client.InstanceService - create_instance', () => {
    let container, service, transactionService;

    test.beforeEach(() => {
        transactionService = Neo.create(TransactionService);

        const client = {
            transactionService,
            writeGuard   : Neo.create(WriteGuard),
            handleRequest: (method, params, ctx) => service[Neo.snakeToCamel(method)](params, ctx)
        };

        service   = Neo.create(InstanceService, {client});
        container = Neo.create(Container, {appName, id: 'create-instance-container', items: []});
        container.promiseUpdate = async () => ({})
    });

    test.afterEach(() => {
        if (container && !container.isDestroyed) {
            container.destroy()
        }

        const store = Neo.get('created-store');
        if (store && !store.isDestroyed) {
            store.destroy()
        }
    });

    test('creates a standalone Store and undo destroys it', async () => {
        const result = service.createInstance({
            className: 'Neo.data.Store',
            config   : {
                id   : 'created-store',
                data : [{id: 'row-1', label: 'Alpha'}],
                model: {fields: [{name: 'id'}, {name: 'label'}]}
            }
        }, ID);

        expect(result).toEqual({id: 'created-store', className: 'Neo.data.Store'});
        expect(Neo.get('created-store')).toBeInstanceOf(Store);
        expect(StoreManager.items.map(store => store.id)).toContain('created-store');
        expect(transactionService.stackOf({id: ID}).committed).toHaveLength(1);

        const undo = await service.undo({}, ID);

        expect(undo.undone).toBe(true);
        expect(Neo.get('created-store')).toBeNull()
    });

    test('creates and attaches a component under a write-guarded parent', async () => {
        const result = service.createInstance({
            ntype   : 'component',
            parentId: 'create-instance-container',
            config  : {id: 'created-button', text: 'Created'}
        }, ID);

        expect(result).toEqual({
            id       : 'created-button',
            className: 'Neo.component.Base',
            parentId : 'create-instance-container'
        });
        expect(Neo.getComponent('created-button')).toBeInstanceOf(Component);
        expect(Neo.getComponent('created-button').parentId).toBe('create-instance-container');
        expect(container.items.map(item => item.id)).toContain('created-button');

        const undo = await service.undo({}, ID);

        expect(undo.undone).toBe(true);
        expect(Neo.getComponent('created-button')?.isDestroyed ?? true).toBe(true)
    });

    test('rejects `module` class references at top level and nested (recursive boundary)', () => {
        expect(() => service.createInstance({
            config: {module: 'Neo.button.Base'}
        }, ID)).toThrow(/module.*cannot cross/);

        expect(() => service.createInstance({
            config: {items: [{module: 'Neo.button.Base'}]}
        }, ID)).toThrow(/module.*cannot cross/);

        expect(() => service.createInstance({
            className: 'Neo.container.Base',
            config   : {items: [{ntype: 'button', config: {module: 'Neo.button.Base'}}]}
        }, ID)).toThrow(/module.*cannot cross/);
    });

    test('denies a conflicting parent-attached create through WriteGuard', () => {
        service.createInstance({
            ntype   : 'component',
            parentId: 'create-instance-container',
            config  : {id: 'created-button'}
        }, ID);

        expect(() => service.createInstance({
            ntype   : 'component',
            parentId: 'create-instance-container',
            config  : {id: 'conflict-button'}
        }, ID2)).toThrow(/Write denied/);

        expect(Neo.getComponent('conflict-button')).toBeNull()
    });

    test('internal destroy_instance is replay-only', () => {
        service.createInstance({
            className: 'Neo.data.Store',
            config   : {id: 'created-store'}
        }, ID);

        expect(() => service.destroyInstance({id: 'created-store'}, ID)).toThrow(/internal undo\/redo replay/);
        expect(Neo.get('created-store')).toBeInstanceOf(Store)
    });

    test('the captured create forward-op retains a top-level ntype despite instantiation (regression lock, #13412)', () => {
        service.createInstance({
            ntype   : 'component',
            parentId: 'create-instance-container',
            config  : {id: 'capture-button', text: 'Captured'}
        }, ID);

        const op = transactionService.stackOf({id: ID}).committed[0].ops[0];

        expect(op.forward.tool).toBe('create_instance');
        // Neo.ntype / Neo.create consume the meta keys off the live createConfig during instantiation,
        // so the redo forward-op must carry a pre-instantiation snapshot — else a redo re-dispatch has
        // no class to instantiate and fails closed.
        expect(op.forward.args.config.ntype).toBe('component')
    });

    test('create -> undo -> redo re-applies the create (the undo/redo cycle, #13412)', async () => {
        service.createInstance({
            ntype   : 'component',
            parentId: 'create-instance-container',
            config  : {id: 'redo-button', text: 'Redo me'}
        }, ID);
        expect(Neo.getComponent('redo-button')).toBeInstanceOf(Component);

        const undo = await service.undo({}, ID);
        expect(undo.undone).toBe(true);
        expect(Neo.getComponent('redo-button')?.isDestroyed ?? true).toBe(true);

        // Pre-fix this returned {redone:false, reason:'redo-denied: provide className or ntype'} — the
        // captured forward-op had lost its ntype. redone:true + reapplied:1 locks the re-dispatch.
        const redo = await service.redo({}, ID);
        expect(redo.redone).toBe(true);
        expect(redo.reapplied).toBe(1)
    })
});
