import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import Workspace        from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceSet     from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Document         from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import TopologyDiff     from '../../../../src/dashboard/dock/model/TopologyDiff.mjs';
import PerspectiveState from '../../../../src/dashboard/dock/projection/PerspectiveState.mjs';
import Transaction      from '../../../../src/manager/Transaction.mjs';
import Provider         from '../../../../src/state/Provider.mjs';

setup({appConfig: {name: 'DockPerspectiveStateTest'}});

/** @summary A consumer-owned Provider class with its own data and formula defaults. */
class ConsumerProvider extends Provider {
    static config = {
        className: 'Test.Unit.DockPerspectiveState.ConsumerProvider',
        data     : {fromClass: 'retained'},
        formulas : {caption: data => data.dock?.perspective?.active ?? 'absent'}
    }
}
ConsumerProvider = Neo.setupClass(ConsumerProvider);

/** @summary Creates real selection and publication owners, optionally joined to a Group. */
function fixture({group = false, stateProvider, ...config} = {}) {
    const windowId  = `perspective-state-${Neo.getId('test')}`,
          binding   = group && Transaction.bind({windowId, workspaceKey: 'main'}),
          workspace = Neo.create(Workspace, {
              windowId,
              enableDockMaximizeAction: false,
              panes                   : {editor: {ntype: 'component'}, preview: {ntype: 'component'}, inspector: {ntype: 'component'}},
              perspectives            : {
                  operator: {center: ['editor', 'preview'], right: {items: ['inspector'], resizable: true}},
                  review  : {center: ['editor', 'preview', 'inspector']}
              },
              activePerspective: 'operator',
              stateProvider    : stateProvider ?? {data: {custom: 'kept', dock: {other: 7}}},
              ...config
          }),
          set = group && Neo.create(WorkspaceSet, {
              manager: Transaction, getGroupId: () => binding.groupId, documentModel: Document
          });
    if (group) {
        Transaction.setHistoryDepth({groupId: binding.groupId, depth: 10});
        workspace.workspaceKey = 'main';
        workspace.workspaceSet = set;
        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value,
            project    : context => workspace.projectDockCommit(context)
        })
    }
    return {workspace, set, groupId: binding?.groupId,
        state: () => workspace.stateProvider.getData('dock.perspective'),
        async select(name) {workspace.activePerspective = name; return workspace.perspectiveSelection.pending},
        async write(document) {return workspace.onDockZoneDocumentChange(document)},
        destroy() {
            if (!workspace.isDestroyed) workspace.destroy();
            set && set.destroy();
            binding && Transaction.retireGroup(binding.groupId)
        }
    }
}

/** @summary Makes asynchronous preparation controllable without timers. */
function gate() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

test('a received provider is seeded for its first formula and owns every later publication', async () => {
    const seen = [], f = fixture({stateProvider: {data: {custom: 'kept', dock: {other: 7}}, formulas: {
        label: data => {seen.push(data.dock?.perspective?.active); return data.dock?.perspective?.active}
    }}});
    try {
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null});
        expect(seen[0]).toBe('operator');
        expect(f.workspace.stateProvider.getData('custom')).toBe('kept');
        expect(f.workspace.stateProvider.getData('dock.other')).toBe(7);
        await f.select('review');
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null});
        expect(f.workspace.stateProvider.getData('label')).toBe('review');
        expect(seen).toContain('review')
    } finally {f.destroy()}
});

test('one-sided edge extent changes count; policy and sub-epsilon changes do not', async () => {
    const f = fixture();
    try {
        const baseline   = Document.clone(f.workspace.dockModel),
              descriptor = {operation: 'resizeEdgeZone', edgeZoneId: 'root', edge: 'right', extent: 0.3},
              resized    = f.workspace.applyDockZoneOperation(descriptor);
        expect(resized.errors).toEqual([]);
        await f.workspace.onDockZoneDocumentChange(resized.document, descriptor);
        expect(f.state().modified, 'an absent-to-present extent differs').toBe(true);
        await f.workspace.resetPerspective();
        expect(f.state().modified).toBe(false);

        const policy = Document.clone(baseline);
        policy.nodes.root.zones.right.resizable = false;
        await f.write(policy);
        expect(f.state().modified, 'resizable is not user-modification truth').toBe(false)
    } finally {f.destroy()}

    const sized = fixture({perspectives: {operator: {
        center: ['editor', 'preview'], right: {items: ['inspector'], extent: 0.3}
    }}});
    try {
        const document = Document.clone(sized.workspace.dockModel);
        document.nodes.root.zones.right.extent += TopologyDiff.SIZE_EPSILON / 2;
        await sized.write(document);
        expect(sized.state().modified).toBe(false)
    } finally {sized.destroy()}
});

test('captured names and baselines survive edits to the initial declaration object', async () => {
    const f = fixture();
    try {
        delete f.workspace.perspectives.operator;
        await f.select('review');
        await f.select('operator');
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null});
        const tabs       = Document.findContainingTabsId(f.workspace.dockModel, 'editor');
        const descriptor = {operation: 'moveItem', itemId: 'preview', targetNodeId: tabs, index: 0},
              result = f.workspace.applyDockZoneOperation(descriptor);
        expect(result.errors ?? []).toEqual([]);
        await f.workspace.onDockZoneDocumentChange(result.document, descriptor);
        expect(f.state().modified).toBe(true)
    } finally {f.destroy()}
});

test('held acceptance publishes pending separately and a stale refusal cannot clear its successor', async () => {
    const f           = fixture({group: true}), first = gate(), releaseFirst = gate(), second = gate(), releaseSecond = gate(),
          participant = Transaction.getParticipant(f.groupId, 'main'), prepare = participant.prepare;
    const project = participant.project;
    let   calls   = 0, projections = 0;
    participant.project = context => {projections++; return project(context)};
    participant.prepare = async (...args) => {
        if (++calls === 1) {
            first.resolve(); await releaseFirst.promise; throw new Error('first refused')
        }
        second.resolve(); await releaseSecond.promise; return prepare(...args)
    };
    try {
        const rejected = f.select('review');
        await first.promise;
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: 'review'});
        expect(Transaction.get(f.groupId).history?.count ?? 0).toBe(0);
        expect(projections).toBe(0);
        const accepted = f.select('operator');
        expect(f.state().pending).toBe('operator');
        releaseFirst.resolve();
        await second.promise;
        expect((await rejected).errors).toContain('first refused');
        expect(f.state().pending, 'stale rejection did not clear the new pending name').toBe('operator');
        releaseSecond.resolve(); await accepted;
        expect(projections).toBe(1);
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null})
    } finally {releaseFirst.resolve(); releaseSecond.resolve(); f.destroy()}
});

test('the modification predicate tolerates split fractions, counts removals, and never mutates its inputs', () => {
    const before = {schema: Document.SCHEMA, root: 'split', items: {a: {}, b: {}}, nodes: {
        split: {type: 'split', orientation: 'horizontal', children: ['a', 'b'], sizes: [0.4, 0.6]},
        a    : {type: 'tabs', items: ['a'], activeItemId: 'a'},
        b    : {type: 'tabs', items: ['b'], activeItemId: 'b'}
    }}, after = Document.clone(before), snapshot = JSON.stringify(before);
    after.nodes.split.sizes = [0.4005, 0.5995];
    const afterSnapshot = JSON.stringify(after);
    expect(PerspectiveState.isModified(after, before)).toBe(false);
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(JSON.stringify(after)).toBe(afterSnapshot);
    after.nodes.split.sizes = [0.41, 0.59];
    expect(PerspectiveState.isModified(after, before)).toBe(true);
    const f = fixture({perspectives: {operator: {center: ['editor', 'preview'], right: {items: ['inspector'], extent: 0.3}}}});
    try {
        const original = f.workspace.dockModel, removed = Document.clone(original);
        delete removed.nodes.root.zones.right.extent;
        expect(PerspectiveState.isModified(removed, original)).toBe(true)
    } finally {f.destroy()}
});

test('acceptance updates committed leaves, refusal clears pending, and undo publishes the carried name', async () => {
    const f = fixture({group: true});
    try {
        await f.select('review');
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null});
        await Transaction.undo({groupId: f.groupId});
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null});
        const participant = Transaction.getParticipant(f.groupId, 'main');
        participant.prepare = () => {throw new Error('refused')};
        expect((await f.select('review')).errors).toContain('refused');
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null})
    } finally {f.destroy()}
});

test('identical document aliases publish distinct names through selection, undo and redo', async () => {
    const zones = {center: ['editor', 'preview', 'inspector']},
          f     = fixture({group: true, perspectives: {operator: zones, review: zones}});
    try {
        await f.select('review');
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null});
        await Transaction.undo({groupId: f.groupId});
        expect(f.state()).toEqual({active: 'operator', modified: false, pending: null});
        await Transaction.redo({groupId: f.groupId});
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null})
    } finally {f.destroy()}
});

test('a failed projection after acceptance is one handled receipt and does not revert published truth', async () => {
    const f         = fixture({group: true}), received = gate(), receipts = [],
          onReceipt = ({groupId, receipt}) => {
              if (groupId === f.groupId) {receipts.push(receipt); received.resolve()}
          };
    Transaction.on('effectReceipt', onReceipt);
    try {
        f.workspace.refreshDockWorkspace = async () => {throw new Error('projection failed')};
        const result = await f.select('review');
        expect(result.errors).toEqual([]);
        await received.promise;
        expect(receipts).toEqual([expect.objectContaining({kind: 'projection', error: 'projection failed'})]);
        expect(Transaction.get(f.groupId).history.count).toBe(1);
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null})
    } finally {Transaction.un('effectReceipt', onReceipt); f.destroy()}
});

test('provider instances and replacement keep consumer data while receiving current perspective truth', async () => {
    const provider = Neo.create(Provider, {data: {custom: 9}}), f = fixture({stateProvider: provider});
    try {
        expect(f.state().active).toBe('operator');
        expect(provider.getData('custom')).toBe(9);
        await f.select('review');
        f.workspace.stateProvider = {data: {next: true}};
        expect(f.state()).toEqual({active: 'review', modified: false, pending: null});
        expect(f.workspace.stateProvider.getData('next')).toBe(true)
    } finally {f.destroy()}
});

test('consumer Provider classes and descriptors retain their defaults and construction bindings settle the initial name', async () => {
    for (const stateProvider of [ConsumerProvider, {module: ConsumerProvider, data: {chosen: 'review'}}]) {
        const f = fixture({stateProvider, ...(stateProvider === ConsumerProvider ? {} : {bind: {activePerspective: 'chosen'}})});
        try {
            const name = stateProvider === ConsumerProvider ? 'operator' : 'review';
            expect(f.state()).toEqual({active: name, modified: false, pending: null});
            expect(f.workspace.stateProvider.getData('fromClass')).toBe('retained');
            expect(f.workspace.stateProvider.getData('caption')).toBe(name)
        } finally {f.destroy()}
    }
});

test('a replacement publishes the retained Group identity when attachment completes', async () => {
    const f = fixture({group: true});
    let replacement;
    try {
        await f.select('review');
        const document = Document.clone(f.workspace.dockModel), windowId = f.workspace.windowId;
        f.workspace.destroy();
        replacement = fixture({windowId, dockModel: document});
        const workspace = replacement.workspace;
        workspace.workspaceKey = 'main';
        workspace.workspaceSet = f.set;
        f.set.register('main', {
            componentId: workspace.id, getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value,
            project    : context => workspace.projectDockCommit(context)
        });
        await workspace.perspectiveSelection.pending;
        expect(replacement.state()).toEqual({active: 'review', modified: false, pending: null});
        expect(Transaction.get(f.groupId).history.count).toBe(1)
    } finally {replacement?.destroy(); f.destroy()}
});

test('a selection-free write queued at commit keeps the accepted name', async () => {
    const f = fixture({group: true}), queued = gate();
    let successor;
    const onCommit = ({groupId, row, snapshot}) => {
        if (groupId !== f.groupId || row?.operation !== 'restorePerspective') return;
        const document = Document.clone(snapshot.participants.main);
        document.items.editor.locked = true;
        successor = f.set.write({main: document}, {cause: 'lock-after-selection'});
        queued.resolve()
    };
    Transaction.on('commit', onCommit);
    try {
        await f.select('review');
        await queued.promise;
        await successor;
        await f.workspace.refreshPromise;
        expect(f.workspace.perspectiveSelection.committedName).toBe('review');
        expect(f.state()).toEqual({active: 'review', modified: true, pending: null})
    } finally {Transaction.un('commit', onCommit); f.destroy()}
});
