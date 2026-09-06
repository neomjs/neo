import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'DockGroupHistoryBindingTest'}});

import {expect, test}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import Transaction              from '../../../../src/manager/Transaction.mjs';
import StateProvider            from '../../../../src/state/Provider.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceDocument        from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import {createDockWorkspaceSet} from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * @summary One item-disjoint, validated dock document.
 * @param {String} key
 * @returns {Object}
 */
function document(key) {
    return {
        schema: WorkspaceDocument.SCHEMA,
        root  : 'root',
        items : {[key]: {componentRef: key, kind: 'panel'}},
        nodes : {root: {type: 'tabs', items: [key], activeItemId: key}}
    }
}

/**
 * A consumer with no state of its own: the engine default provider is the whole surface under test.
 */
class HistoryWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockGroupHistoryBinding.HistoryWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }
}

Neo.setupClass(HistoryWorkspace);

test.describe.serial('Dock workspaces read their Group\'s history as a projection on their own provider', () => {
    let groupId, windowId = 'group-history-window';

    test.beforeEach(() => {
        ({groupId} = Transaction.bind({windowId, workspaceKey: 'main'}))
    });

    test.afterEach(() => {
        Transaction.retireGroup(groupId)
    });

    test('learning a Group projects its history, and every workspace of that Group reads the one source', () => {
        const a = Neo.create(HistoryWorkspace, {dockModel: document('a')}),
              b = Neo.create(HistoryWorkspace, {dockModel: document('b')});

        // Before the Group is known there is nothing to read from and nothing is installed.
        expect(a.groupHistoryProvider, 'nothing is projected before the Group is known').toBeNull();

        a.topologyGroupId = groupId;
        b.topologyGroupId = groupId;

        const groupProvider = Transaction.getProvider(groupId);

        // One provider per Group whatever asks: the two hosts do not get copies of the answer.
        // One provider per Group whatever asks: the two hosts project from the SAME source rather
        // than each deriving its own answer.
        expect(a.groupHistoryProvider).toBe(groupProvider);
        expect(b.groupHistoryProvider).toBe(groupProvider);
        expect(a.stateProvider.getData('dockHistory.canUndo')).toBe(false);

        a.destroy();
        b.destroy()
    });

    test('the Group\'s five history leaves are projected and re-published on a real commit', async () => {
        const workspace = Neo.create(HistoryWorkspace, {dockModel: document('a')}),
              documents = {main: document('a')},
              set       = createDockWorkspaceSet({
                  documentModel: WorkspaceDocument,
                  getGroupId   : () => groupId,
                  manager      : Transaction
              });

        set.register('main', {
            getDocument: () => documents.main,
            setDocument: value => documents.main = value
        });

        Transaction.setHistoryDepth({groupId, depth: 5});
        workspace.topologyGroupId = groupId;

        // Read from the CONSUMER's own provider, never the Group's: the projection is under test.
        expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false);
        expect(workspace.stateProvider.getData('dockHistory.canRedo')).toBe(false);
        expect(workspace.stateProvider.getData('dockHistory.historyLength')).toBe(0);
        expect(workspace.stateProvider.getData('dockHistory.historyCursor')).toBe(-1);

        await Transaction.write({
            cause  : 'group-history-binding-commit',
            changes: [{workspaceKey: 'main', input: document('b')}],
            groupId
        });

        // `publishHistory` wrote to the Group's provider and the manager's `commit` signal carried
        // it across; the consumer owns no stack and re-derives nothing.
        expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(true);
        expect(workspace.stateProvider.getData('dockHistory.historyLength')).toBe(1);
        expect(workspace.stateProvider.getData('dockHistory.historyCursor')).toBe(0);

        await Transaction.undo({groupId});

        expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false);
        expect(workspace.stateProvider.getData('dockHistory.canRedo')).toBe(true);

        workspace.destroy()
    });

    test('a history-disabled Group still answers the chain, and binding to it imports no history module', async () => {
        const documents = {main: document('a')},
              loads     = [],
              original  = Transaction.importHistory,
              workspace = Neo.create(HistoryWorkspace, {dockModel: document('a')}),
              set       = createDockWorkspaceSet({
                  documentModel: WorkspaceDocument,
                  getGroupId   : () => groupId,
                  manager      : Transaction
              });

        set.register('main', {
            getDocument: () => documents.main,
            setDocument: value => documents.main = value
        });

        // The manager's default depth is 0, so this Group was never given a history at all.
        Transaction.importHistory = function(...args) {
            loads.push(args);
            return original.apply(this, args)
        };

        try {
            workspace.topologyGroupId = groupId;

            // The projection still installs and still answers — `historyState` reads through
            // `history?.`, so an absent history is `false`, not an error and not a reason to load one.
            expect(workspace.groupHistoryProvider).toBe(Transaction.getProvider(groupId));
            expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false);
            expect(workspace.stateProvider.getData('dockHistory.canRedo')).toBe(false);
            expect(workspace.stateProvider.getData('dockHistory.historyDepth')).toBe(0);

            // Remains functional: the document commits with no history to append to.
            await Transaction.write({
                cause  : 'group-history-disabled-commit',
                changes: [{workspaceKey: 'main', input: document('b')}],
                groupId
            });

            expect(documents.main.items).toHaveProperty('b');

            // The load is a method precisely so a harness can watch it. Reading history state must
            // never be what drags the module into a single-window app's closure. Asserted here,
            // immediately after the only call that could have triggered it.
            expect(loads, 'the history module was never imported').toEqual([]);
            expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false)
        } finally {
            Transaction.importHistory = original
        }

        workspace.destroy()
    });

    test('retiring the Group publishes the empty shape rather than reading a destroyed provider', () => {
        const workspace = Neo.create(HistoryWorkspace, {dockModel: document('a')});

        workspace.topologyGroupId = groupId;
        expect(workspace.groupHistoryProvider).toBe(Transaction.getProvider(groupId));

        Transaction.retireGroup(groupId);

        expect(workspace.stateProvider.getData('dockHistory.canUndo'), 'a readable false, not undefined').toBe(false);
        expect(workspace.groupHistoryProvider).toBeNull();

        workspace.destroy()
    });

    test('a VALID Group leaves consumer ancestry intact BEFORE, WHILE and AFTER it is bound', () => {
        const own       = Neo.create(StateProvider, {data: {consumerLeaf: 'consumer-owned'}}),
              workspace = Neo.create(HistoryWorkspace, {dockModel: document('a')});

        workspace.stateProvider.parent = own;

        // BEFORE — the baseline the two readings below are measured against, not assumed.
        expect(workspace.stateProvider.getData('consumerLeaf')).toBe('consumer-owned');

        workspace.topologyGroupId = groupId;

        // WHILE — the criterion. Enabling docking history must not cost the consumer the stores and
        // application data it inherits for the whole running lifetime, so the chain is untouched and
        // the Group's leaves arrive as a projection beside it rather than in place of it.
        expect(workspace.stateProvider.parent, 'the configured parent is still the parent').toBe(own);
        expect(workspace.stateProvider.getData('consumerLeaf'), 'inherited data still resolves while bound').toBe('consumer-owned');
        expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false);

        Transaction.retireGroup(groupId);

        // AFTER — nothing to restore, because nothing was taken. The namespace stays a readable
        // empty shape so a bound formatter reads `false` rather than `undefined` as its Group goes.
        expect(workspace.stateProvider.parent).toBe(own);
        expect(workspace.stateProvider.getData('consumerLeaf')).toBe('consumer-owned');
        expect(workspace.stateProvider.getData('dockHistory.canUndo')).toBe(false);

        workspace.destroy();
        own.destroy()
    });

    test('a parent the consumer configured for itself survives a Group that has no provider', () => {
        const own       = Neo.create(StateProvider, {data: {consumerLeaf: 'consumer-owned'}}),
              workspace = Neo.create(HistoryWorkspace, {dockModel: document('a')});

        workspace.stateProvider.parent = own;
        workspace.topologyGroupId      = 'group-history-unknown-group';

        // An unresolvable Group installs no projection and touches no chain. Weaker than the arm
        // above, which is the point: this one holds even for a Group that never existed.
        expect(workspace.stateProvider.parent).toBe(own);
        expect(workspace.groupHistoryProvider).toBeNull();
        expect(workspace.stateProvider.getData('consumerLeaf')).toBe('consumer-owned');

        workspace.destroy();
        own.destroy()
    })
});
