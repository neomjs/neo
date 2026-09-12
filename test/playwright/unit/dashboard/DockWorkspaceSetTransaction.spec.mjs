import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockWorkspaceSetTransactionTest'}});

import {expect, test}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import TransactionManager       from '../../../../src/manager/Transaction.mjs';
import DockService              from '../../../../src/ai/client/DockService.mjs';
import InstanceService          from '../../../../src/ai/client/InstanceService.mjs';
import LegacyTransactionService from '../../../../src/ai/TransactionService.mjs';
import WriteGuard               from '../../../../src/ai/WriteGuard.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import {dispatchServiceMethod}  from '../../../../src/ai/client/resolveServiceMethod.mjs';
import PopupWorkspace           from '../../../../apps/workstation/view/PopupWorkspace.mjs';
import WorkstationWorkspace     from '../../../../apps/workstation/view/Workspace.mjs';
import Operations               from '../../../../src/dashboard/dock/model/Operations.mjs';
import Persistence              from '../../../../src/dashboard/dock/model/Persistence.mjs';
import WorkspaceDocument        from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import PerspectiveLibrary       from '../../../../src/dashboard/dock/persistence/PerspectiveLibrary.mjs';
import WorkspaceSet             from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';

/** @summary Creates a valid, item-disjoint dock document. @param {String} key @param {String} title @returns {Object} */
function document(key, title = 'before') {
    return {
        schema: WorkspaceDocument.SCHEMA,
        root  : 'root',
        items : {[key]: {reference: key, title}},
        nodes : {root: {type: 'tabs', items: [key], activeItemId: key}}
    }
}

/** @summary Exercises the dock adapter through the real Group writer and document validator. */
test.describe.serial('Dock WorkspaceSet transaction participants', () => {
    let binding, groupId, set;

    test.beforeEach(() => {
        binding = TransactionManager.bind({windowId: 'workspace-set-transaction-root', workspaceKey: 'main'});
        groupId = binding.groupId;
        TransactionManager.setHistoryDepth({groupId, depth: 5});
        const popup = TransactionManager.reserve({groupId, workspaceKey: 'popup'});
        TransactionManager.bind({...popup, windowId: 'workspace-set-transaction-popup'});
        set = Neo.create(WorkspaceSet, {manager: TransactionManager, getGroupId: () => groupId, documentModel: WorkspaceDocument})
    });

    test.afterEach(() => {
        set?.destroy();
        TransactionManager.retireGroup(groupId)
    });

    /** @summary Registers a document holder without reading it during registration. @param {String} key @param {Object} options @returns {Object} */
    function holder(key, {project, fail} = {}) {
        const state = {document: document(key), reads: 0, writes: []};
        state.seams = {
            getDocument: () => { state.reads++; return state.document },
            setDocument: value => {
                state.writes.push(value);
                state.document = value;
                if (fail?.(value)) throw new Error('second setter refused')
            },
            project
        };
        expect(set.register(key, state.seams)).toBe(true);
        expect(state.reads).toBe(0);
        return state
    }

    const write = (workspaces, options = {}) => set.write(workspaces, {cause: 'replace-workspaces', provenance: {origin: 'unit'}, ...options});

    test('addItem creates and places through a registered Group, preserving a queued lock and history', async () => {
        const main       = holder('main'),
              descriptor = {operation: 'addItem', itemId: 'created', item: {reference: 'created', title: 'Created'},
                  target: {operation: 'addTab', tabsNodeId: 'root'}},
              direct     = Operations.applyOperation(main.document, descriptor);

        const lock = set.commit('main', [{operation: 'setItemLocked', itemId: 'main', locked: true}]),
              add  = set.commit('main', [descriptor]);
        await Promise.all([lock, add]);

        expect(direct.errors).toEqual([]);
        expect(main.document.items.created).toEqual(descriptor.item);
        expect(main.document.nodes.root.items).toEqual(['main', 'created']);
        expect(main.document.nodes).toEqual(direct.document.nodes);
        expect(main.document.items.main.locked).toBe(true);
        expect(TransactionManager.get(groupId).history.count).toBe(2);

        await TransactionManager.undo({groupId});
        expect(main.document.items.created).toBeUndefined();
        expect(main.document.nodes.root.items).toEqual(['main']);
        expect(main.document.items.main.locked).toBe(true);
        await TransactionManager.redo({groupId});
        expect(main.document.items.created).toEqual(descriptor.item);
        expect(main.document.nodes.root.activeItemId).toBe('created');
        expect(main.document.items.main.locked).toBe(true)
    });

    test('addItem creates an unplaced record and refuses a queued duplicate without another history entry', async () => {
        const main  = holder('main'),
              first = {operation: 'addItem', itemId: 'created', item: {reference: 'created', title: 'First'}};
        const results = await Promise.allSettled([
            set.commit('main', [first]),
            set.commit('main', [{...first, item: {...first.item, title: 'Duplicate'}}])
        ]);

        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].reason.message).toContain('already exists');
        expect(main.document.items.created).toEqual(first.item);
        expect(main.document.nodes).toEqual(document('main').nodes);
        expect(TransactionManager.get(groupId).history.count).toBe(1)
    });

    test('addItem invalid placement and the old out-of-band seed path leave Group truth untouched', async () => {
        const main   = holder('main'), original = main.document,
              seeded = WorkspaceDocument.clone(original);
        seeded.items.created = {reference: 'created'};
        const placement = {operation: 'addTab', itemId: 'created', tabsNodeId: 'root'};
        expect(Operations.applyOperation(seeded, placement).errors).toEqual([]);
        await expect(set.commit('main', [placement])).rejects.toThrow('unknown item "created"');
        await expect(set.commit('main', [{operation: 'addItem', itemId: 'created', item: seeded.items.created,
            target: {operation: 'addTab', tabsNodeId: 'missing'}}])).rejects.toThrow('not a tabs node');
        expect(main.document).toBe(original);
        expect(main.writes).toEqual([]);
        expect(TransactionManager.get(groupId).history).toBeNull()
    });

    test('registered callbacks survive adapter disposal through queued write, compensation and undo', async () => {
        const projected   = [],
              main        = holder('main', {project: context => projected.push(context.preserveItemIds)}),
              popup       = holder('popup', {fail: value => value.items.popup.title === 'refused'}),
              participant = TransactionManager.getParticipant(groupId, 'main'),
              prepare     = participant.prepare,
              adapterId   = set.id;
        let release, entered;
        const gate      = new Promise(resolve => release = resolve),
              preparing = new Promise(resolve => entered = resolve);

        participant.prepare = async (...args) => {
            entered();
            await gate;
            return prepare(...args)
        };

        expect(Neo.get(adapterId)).toBe(set);
        const pending = write({main: document('main', 'queued')});
        await preparing;
        set.destroy();
        release();

        expect(Neo.get(adapterId)).toBeFalsy();
        expect(TransactionManager.participantKeys(groupId)).toEqual(['main', 'popup']);
        expect((await pending).snapshot.participants.main).toEqual(document('main', 'queued'));
        expect(main.document.items.main.title).toBe('queued');
        await expect.poll(() => projected).toEqual([['popup']]);

        await expect(TransactionManager.write({groupId, cause: 'after-adapter-disposal', changes: [
            {workspaceKey: 'main', input: document('main', 'compensate')},
            {workspaceKey: 'popup', input: document('popup', 'refused')}
        ]})).rejects.toThrow('second setter refused');

        expect(main.document.items.main.title).toBe('queued');
        expect(popup.document).toEqual(document('popup'));
        await TransactionManager.undo({groupId});
        expect(main.document).toEqual(document('main'));
        await expect.poll(() => projected.length).toBe(2);
        expect(projected.at(-1)).toEqual(['popup'])
    });

    test('Neural Link A and human B share one Group cursor and undo newest-first', async () => {
        const main   = holder('main'), context = {agentId: 'dock-writer-a', sessionId: 'dock-session-a'};
        const legacy = Neo.create(LegacyTransactionService);
        const client = {transactionService: legacy, writeGuard: Neo.create(WriteGuard)};
        const dock   = Neo.create(DockService, {client}), commands = Neo.create(InstanceService, {client});
        client.services = {dock, instance: commands};
        const originalGetComponent = Neo.getComponent;
        const component            = {
            id                      : 'group-history-holder', topologyGroupId: groupId, workspaceKey: 'main', workspaceSet: set,
            getDockZoneDocument     : () => main.document,
            onDockZoneDocumentChange: value => main.document = value
        };
        set.register('main', {...main.seams, componentId: component.id});
        Neo.getComponent = id => id === component.id ? component : originalGetComponent(id);

        try {
            expect((await dock.executeDockOperation({componentId: component.id,
                descriptor: {operation: 'setItemLocked', itemId: 'main', locked: true}}, context)).applied).toBe(true);
            const humanDocument = WorkspaceDocument.clone(main.document);
            humanDocument.items.main.title = 'human B';
            await write({main: humanDocument}, {provenance: {origin: 'human'}});

            expect(TransactionManager.get(groupId).history.count).toBe(2);
            expect(legacy.stackOf({id: context}).committed).toEqual([]);
            expect((await commands.undo({groupId}, context)).undone).toBe(true);
            expect(main.document.items.main).toMatchObject({title: 'before', locked: true});
            expect((await commands.undo({groupId}, context)).undone).toBe(true);
            expect(main.document).toEqual(document('main'));
            expect((await commands.redo({groupId}, context)).redone).toBe(true);
            expect((await commands.redo({groupId}, context)).redone).toBe(true);
            expect(main.document.items.main).toMatchObject({title: 'human B', locked: true});
            const listed = await commands.listTransactions({groupId}, context);
            expect(listed.committed).toHaveLength(2);
            expect(listed.redo).toEqual([]);
            const saved = await commands.saveTransaction({groupId, txId: listed.committed[1].txId}, context);
            expect(saved.saved).toBe(true);
            expect(saved.transaction.originWriter).toBeNull();
            expect(saved.transaction.ops[0].provenance).toEqual({origin: 'human'});
            expect(JSON.stringify(saved.transaction)).not.toContain(component.id);
            expect((await commands.replayTransaction({groupId, archiveId: 'saved-human', ops: saved.transaction.ops}, context)).replayed).toBe(true);
            expect(TransactionManager.get(groupId).history.count).toBe(3);
            const denied = await commands.undo({groupId}, {agentId: 'other-writer', sessionId: 'other-session'});
            expect(denied.undone).toBe(false);
            expect(denied.reason).toContain('Write denied');
            expect(TransactionManager.get(groupId).history.cursor).toBe(2)
        } finally {
            Neo.getComponent = originalGetComponent;
            dock.destroy();
            commands.destroy();
            client.writeGuard.destroy();
            legacy.destroy()
        }
    });

    test('window perspective restore uses the Group cursor and refuses before moving the library pointer', async () => {
        const main  = holder('main'), original = WorkspaceDocument.clone(main.document);
        const store = Neo.create(PerspectiveLibrary), dock = Neo.create(DockService);
        for (const [layoutId, title] of [['current', 'before'], ['saved', 'restored']]) {
            const layout = Persistence.capturePerspective(document('main', title), {layoutId, title}).layout;
            expect(store.savePerspective(layout, {activate: layoutId === 'current'}).saved).toBe(true)
        }
        const component = {id: 'restore-holder', topologyGroupId: groupId, workspaceSet: set,
            perspectiveStore        : store, getDockZoneDocument: () => main.document,
            onDockZoneDocumentChange: value => main.document = value};
        set.register('main', {...main.seams, componentId: component.id});
        const lookup = Neo.getComponent, commit = set.commit;
        Neo.getComponent = id => id === component.id ? component : lookup(id);
        try {
            set.commit = async () => { throw new Error('restore refused') };
            expect(await dock.restorePerspective({componentId: component.id, name: 'saved'}))
                .toMatchObject({switched: false, errors: ['restore refused']});
            expect(store.collection.activeLayoutId).toBe('current');
            expect(main.document).toEqual(original);
            expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0);

            set.commit = commit;
            expect(await dock.restorePerspective({componentId: component.id, name: 'saved'}))
                .toMatchObject({switched: true, errors: []});
            expect(store.collection.activeLayoutId).toBe('saved');
            expect(main.document.items.main.title).toBe('restored');
            expect(TransactionManager.get(groupId).history.count).toBe(1);
            await TransactionManager.undo({groupId});
            expect(main.document).toEqual(original)
        } finally {
            set.commit = commit;
            Neo.getComponent = lookup;
            dock.destroy();
            store.destroy()
        }
    });

    test('a named dock batch prepares both operations before one Group commit', async () => {
        const main   = holder('main'), context = {agentId: 'batch-writer', sessionId: 'batch-session'};
        const legacy = Neo.create(LegacyTransactionService), client = {transactionService: legacy, writeGuard: Neo.create(WriteGuard)};
        const dock   = Neo.create(DockService, {client}), commands = Neo.create(InstanceService, {client});
        client.services = {dock, instance: commands};
        const originalGetComponent = Neo.getComponent;
        const component            = {id: 'batch-holder', topologyGroupId: groupId, workspaceSet: set,
            getDockZoneDocument: () => main.document};
        set.register('main', {...main.seams, componentId: component.id});
        Neo.getComponent = id => id === component.id ? component : originalGetComponent(id);
        try {
            expect((await commands.beginTransaction({groupId, name: 'lock and unpin'}, context)).opened).toBe(true);
            for (const descriptor of [{operation: 'setItemLocked', itemId: 'main', locked: true},
                {operation: 'setItemPinned', itemId: 'main', pinned: false}]) {
                expect((await dock.executeDockOperation({componentId: component.id, descriptor}, context)).staged).toBe(true)
            }
            expect(main.document).toEqual(document('main'));
            const serviceMap = {set_instance_properties: commands};
            await expect(dispatchServiceMethod(serviceMap, 'set_instance_properties',
                {id: 'unrelated', properties: {text: 'must not run'}}, context)).rejects.toThrow('mixed-dock-non-dock-batch');
            expect((await commands.commitTransaction({groupId}, context)).committed).toBe(true);
            expect(main.document.items.main).toMatchObject({locked: true, pinned: false});
            expect(TransactionManager.get(groupId).history.count).toBe(1);
            expect((await commands.undo({groupId}, context)).undone).toBe(true);
            expect(main.document).toEqual(document('main'))
        } finally {
            Neo.getComponent = originalGetComponent;
            dock.destroy(); commands.destroy(); client.writeGuard.destroy(); legacy.destroy()
        }
    });

    test('mixed replay is refused before the first dock or non-dock effect', async () => {
        holder('main');
        const calls   = [], legacy = Neo.create(LegacyTransactionService);
        const service = Neo.create(InstanceService, {client: {transactionService: legacy,
            handleRequest: (...args) => { calls.push(args); return {applied: true} }}});
        try {
            const result = await service.replayTransaction({groupId, archiveId: 'mixed', ops: [
                {forward: {tool: 'execute_dock_operation', args: {workspaceKey: 'main', descriptor: {operation: 'closeItem', itemId: 'main'}}}},
                {forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {text: 'changed'}}}}
            ]}, {agentId: 'replay-writer', sessionId: 'replay-session'});
            expect(result).toMatchObject({replayed: false, reason: 'mixed-dock-non-dock-batch'});
            expect(calls).toEqual([])
        } finally {
            service.destroy(); legacy.destroy()
        }
    });

    for (const kind of ['main', 'popup']) {
        test(`${kind} participant preserves maximize when a Group commit activates a local tab`, async () => {
            const key     = kind === 'main' ? WorkstationWorkspace.MAIN_WORKSPACE_ID : 'popup',
                  initial = document(key);
            initial.items.second = {reference: 'second', title: 'Second'};
            initial.nodes.root.items.push('second');

            const owner = Neo.create(kind === 'main' ? DockWorkspace : PopupWorkspace, {
                dockModel: initial, topologyGroupId: groupId,
                ...(kind === 'popup' ? {workspaceSet: set, workspaceKey: key,
                    rootWorkspace: {resolvePane: () => ({ntype: 'component'})}} : {})
            });
            owner.refreshDockWorkspace = async () => {};
            if (kind === 'main') {
                owner.workspaceSet = set;
                owner.dockHistoryDepth = 5;
                owner.dockPlacement = {};
                expect(WorkstationWorkspace.prototype.registerMainWorkspace.call(owner)).toBe(true)
            }

            const plugin     = owner.getPlugin('dock-maximize'),
                  descriptor = {operation: 'setActiveItem', tabsNodeId: 'root', itemId: 'second'},
                  events     = [];
            plugin._maximizedNodeId = 'root';
            owner.on('beforeDockZoneDocumentChange', event => events.push(event));
            try {
                const result = owner.applyDockZoneOperation(descriptor);
                await owner.onDockZoneDocumentChange(result.document, descriptor);
                await expect.poll(() => events.length).toBe(1);
                await owner.refreshPromise;
                expect(owner.dockModel.nodes.root.activeItemId).toBe('second');
                expect(plugin.maximizedNodeId).toBe('root');
                expect(TransactionManager.get(groupId).history.count).toBe(1)
            } finally {
                owner.destroy()
            }
        })
    }

    test('a full popup Workspace commits a human tab activation to its Group document', async () => {
        const initial = document('popup');
        initial.items.second = {reference: 'second', title: 'Second'};
        initial.nodes.root.items.push('second');
        const popup = Neo.create(PopupWorkspace, {
            dockModel      : initial, rootWorkspace: {resolvePane: () => ({ntype: 'component'})},
            topologyGroupId: groupId, workspaceKey: 'popup', workspaceSet: set
        });
        set.register('popup', {componentId: popup.id, getDocument: () => popup.dockModel,
            setDocument: value => popup.dockModel = value});
        try {
            const descriptor = {operation: 'setActiveItem', tabsNodeId: 'root', itemId: 'second'};
            const result     = popup.applyDockZoneOperation(descriptor);
            await popup.onDockZoneDocumentChange(result.document, descriptor);
            expect(set.getDocument('popup').nodes.root.activeItemId).toBe('second');
            expect(TransactionManager.get(groupId).history.count).toBe(1);
            await TransactionManager.undo({groupId});
            expect(popup.dockModel.nodes.root.activeItemId).toBe('popup')
        } finally {
            popup.destroy()
        }
    });

    test('ordinary popup birth commits its first document before the pane handoff', async () => {
        const key = WorkstationWorkspace.MAIN_WORKSPACE_ID, main = holder(key), itemId = key;
        main.document.nodes.tabs = main.document.nodes.root;
        main.document.nodes.root = {type: 'edge-zone', zones: {center: {nodeId: 'tabs'}}};
        const initial = WorkspaceDocument.clone(main.document);
        const root    = {
            get dockModel() { return main.document },
            workspaceSet                 : set, topologyGroupId: groupId,
            getPopupState                : WorkstationWorkspace.prototype.getPopupState,
            getPopupStates               : WorkstationWorkspace.prototype.getPopupStates,
            createPopupWorkspace         : WorkstationWorkspace.prototype.createPopupWorkspace,
            stateProvider                : TransactionManager.getProvider(groupId),
            resolvePane                  : () => ({ntype: 'component'}),
            createVesselWorkspaceDocument: WorkstationWorkspace.prototype.createVesselWorkspaceDocument,
            tearOutHandlers              : {capturePane: () => true, adoptPane() {
                expect(main.document.items[itemId]).toBeUndefined();
                expect(TransactionManager.get(groupId).history.count).toBe(1)
            }}
        };
        try {
            expect(await WorkstationWorkspace.prototype.onTearOutDocumentChange.call(root, null,
                {operation: 'detachItem', itemId}, {})).toBe(true);
            const popup = root.getPopupState(WorkstationWorkspace.vesselWorkspaceId(itemId)).host;
            expect(popup).toBeInstanceOf(PopupWorkspace);
            expect(popup.dockModel.items[itemId]).toEqual(document(key).items[itemId]);
            expect(TransactionManager.get(groupId).history.count).toBe(1);
            await TransactionManager.undo({groupId});
            expect(main.document).toEqual(initial);
            expect(Object.keys(popup.dockModel.items)).toHaveLength(0)
        } finally {
            for (const state of root.getPopupStates()) state.host.destroy()
        }
    });

    test('two valid documents commit once through the Group; projection observes both committed owners', async () => {
        const projected = [];
        const main      = holder('main', {project: context => projected.push({
            transactionId: context.transactionId,
            main         : main.document.items.main.title,
            popup        : popup.document.items.popup.title,
            count        : TransactionManager.get(groupId).history.count
        })});
        const popup    = holder('popup');
        const mainNext = document('main', 'after'), popupNext = document('popup', 'after');

        const result = await write({popup: popupNext, main: mainNext}, {descriptor: {kind: 'paired-layout'}});

        expect(main.document).toEqual(mainNext);
        expect(popup.document).toEqual(popupNext);
        expect(main.document).not.toBe(mainNext);
        expect(main.document).not.toBe(result.row.participants[0].after);
        expect(result.row.kind).toBe('paired-layout');
        expect(result.row.participants.map(entry => entry.workspaceKey)).toEqual(['main', 'popup']);
        expect(result.row.participants[0].before).toEqual(document('main'));
        expect(result.snapshot.participants).toEqual({main: mainNext, popup: popupNext});
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(1);
        await expect.poll(() => projected.length).toBe(1);
        expect(projected[0]).toEqual({transactionId: result.transactionId, main: 'after', popup: 'after', count: 1})
    });

    test('an invalid second candidate refuses before either document is written', async () => {
        const main    = holder('main'), popup = holder('popup');
        const invalid = {...document('popup'), root: 'missing'};

        await expect(write({main: document('main', 'after'), popup: invalid})).rejects.toThrow(/invalid dock document/);

        expect(main.writes).toEqual([]);
        expect(popup.writes).toEqual([]);
        expect(main.document).toEqual(document('main'));
        expect(popup.document).toEqual(document('popup'));
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0)
    });

    test('a second setter that mutates then throws compensates both documents and restores reference revisions', async () => {
        let   refuse = true;
        const main   = holder('main');
        const popup  = holder('popup', {fail: value => refuse && value.items.popup.title === 'after'});

        await expect(write({main: document('main', 'after'), popup: document('popup', 'after')})).rejects.toThrow('second setter refused');

        expect(main.document).toEqual(document('main'));
        expect(popup.document).toEqual(document('popup'));
        expect(main.writes.map(value => value.items.main.title)).toEqual(['after', 'before']);
        expect(popup.writes.map(value => value.items.popup.title)).toEqual(['after', 'before']);
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(0);
        expect(TransactionManager.getParticipant(groupId, 'popup').capture().revision).toBe(0);
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0);
        expect(TransactionManager.get(groupId).snapshot ?? null).toBeNull();

        refuse = false;
        await write({main: document('main', 'next'), popup: document('popup', 'next')});
        expect(TransactionManager.get(groupId).history.count).toBe(1);
        expect(TransactionManager.getParticipant(groupId, 'main').capture().revision).toBe(1)
    });

    test('a generation changing during preparation refuses before document adoption', async () => {
        const main        = holder('main'), popup = holder('popup');
        const participant = TransactionManager.getParticipant(groupId, 'main'), prepare = participant.prepare;
        let entered, release;
        const started = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
        participant.prepare = async (...args) => { const candidate = prepare(...args); entered(); await gate; return candidate };

        const pending = write({main: document('main', 'after'), popup: document('popup', 'after')});
        await started;
        TransactionManager.release(binding.windowId);
        TransactionManager.bind({...binding, windowId: 'workspace-set-transaction-reloaded'});
        expect(TransactionManager.getBinding(groupId, 'main').generation).toBe(2);
        release();

        await expect(pending).rejects.toThrow(/changed/);
        expect(main.writes).toEqual([]);
        expect(popup.writes).toEqual([]);
        expect(TransactionManager.get(groupId).history?.count ?? 0).toBe(0)
    });

    test('a document key distinct from its window binding rejects a reload during preparation', async () => {
        const main = holder('workstation-main');
        set.register('workstation-main', {...main.seams, bindingKey: 'main', componentId: 'live-workspace'});
        const participant = TransactionManager.getParticipant(groupId, 'workstation-main');
        const prepare     = participant.prepare;
        let entered, release;
        const started = new Promise(resolve => entered = resolve), gate = new Promise(resolve => release = resolve);
        participant.prepare = async (...args) => { const candidate = prepare(...args); entered(); await gate; return candidate };

        const pending = write({'workstation-main': document('workstation-main', 'after')});
        await started;
        TransactionManager.release(binding.windowId);
        TransactionManager.bind({...binding, windowId: 'workspace-set-transaction-reloaded'});
        release();

        await expect(pending).rejects.toThrow(/changed/);
        expect(main.writes).toEqual([]);
        expect(participant.capture().generation).toBe(2);
        expect(participant.componentId).toBe('live-workspace');
        expect(participant.capture()).not.toHaveProperty('componentId');
        participant.prepare = prepare;
        const result = await write({'workstation-main': document('workstation-main', 'next')});
        expect(JSON.stringify(result.snapshot)).not.toContain('live-workspace')
    });

    test('reference revisions observe outside document replacements, while an explicit revision getter remains authoritative', () => {
        const main        = holder('main');
        const participant = TransactionManager.getParticipant(groupId, 'main');
        expect(participant.capture().revision).toBe(0);
        main.document = WorkspaceDocument.clone(main.document);
        expect(participant.capture().revision).toBe(1);
        expect(participant.capture().revision).toBe(1);

        let revision = 42, reads = 0;
        set.register('main', {...main.seams, getRevision: () => { reads++; return revision }});
        expect(reads).toBe(0);
        const explicit = TransactionManager.getParticipant(groupId, 'main');
        expect(explicit.capture().revision).toBe(42);
        revision++;
        expect(explicit.capture().revision).toBe(43)
    });

    test('read-only slots contribute capture to the Group snapshot but cannot receive a write', async () => {
        const main = holder('main'), popup = holder('popup');
        set.register('popup', {getDocument: popup.seams.getDocument});
        const readOnly = TransactionManager.getParticipant(groupId, 'popup');
        expect(typeof readOnly.capture).toBe('function');
        expect(readOnly.adopt).toBeUndefined();
        expect(readOnly.compensate).toBeUndefined();

        const result = await write({main: document('main', 'after')});
        expect(result.snapshot.participants.popup).toEqual(document('popup'));
        await expect(write({popup: document('popup', 'after')})).rejects.toThrow(/compensatable/);
        expect(main.document.items.main.title).toBe('after');
        expect(popup.writes).toEqual([])
    });

    test('the model seam is required by queued writes without changing synchronous adoption', async () => {
        const main   = holder('main');
        const legacy = Neo.create(WorkspaceSet, {manager: TransactionManager, getGroupId: () => groupId});
        legacy.register('main', main.seams);

        expect(legacy.adoptAll({main: document('main', 'synchronous')})).toBe(true);
        await expect(legacy.write({main: document('main', 'queued')}, {cause: 'test'})).rejects.toThrow(/injected documentModel/);
        expect(main.document.items.main.title).toBe('synchronous');
        expect(main.writes).toHaveLength(1);
        legacy.destroy()
    });

    test('membership is a reactive config: register and unregister each publish once, a same-id replacement publishes nothing, a destroyed observer hears nothing', () => {
        const observer = Neo.create(core.Base), seen = [];

        try {
            observer.observeConfig(set, 'memberIds', value => seen.push([...value]));
            expect(set.memberIds, 'nothing registered yet').toEqual([]);

            // `holder` registers as it builds, so the first publication is its registration.
            const main = holder('main');

            expect(seen, 'a registration publishes the new membership').toEqual([['main']]);

            expect(set.register('main', main.seams), 'replacing the same id is a registration').toBe(true);
            expect(seen, 'and not a membership change — the set is equal').toHaveLength(1);

            const popup = holder('popup');

            expect(seen.at(-1)).toEqual(['main', 'popup']);

            expect(set.unregister('popup')).toBe(true);
            expect(seen.at(-1), 'a removal publishes too').toEqual(['main']);
            expect(seen).toHaveLength(3);

            observer.destroy();

            expect(set.register('popup', popup.seams)).toBe(true);
            expect(seen, 'a destroyed observer hears nothing').toHaveLength(3);
            expect(set.memberIds, 'while the set itself moved on').toEqual(['main', 'popup'])
        } finally {
            observer.isDestroyed || observer.destroy()
        }
    })
});
