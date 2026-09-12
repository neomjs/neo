import {setup}        from '../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';
import Workspace    from '../../../../src/dashboard/dock/Workspace.mjs';
import WorkspaceSet from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import Document     from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Transaction  from '../../../../src/manager/Transaction.mjs';
import Provider     from '../../../../src/state/Provider.mjs';
import Persistence  from '../../../../src/dashboard/dock/model/Persistence.mjs';
import Placement    from '../../../../src/dashboard/dock/window/Placement.mjs';

setup({appConfig: {name: 'DockPerspectiveSelectionTest'}});

/** @summary Creates a real declarative workspace and optionally registers it in a Group. */
function fixture({group = false, depth = 5, active = 'operator', perspectives, stateProvider} = {}) {
    const windowId  = `perspective-${Neo.getId('test')}`,
          binding   = group && Transaction.bind({windowId, workspaceKey: 'main'}),
          workspace = Neo.create(Workspace, {
              windowId,
              enableDockMaximizeAction: false,
              panes                   : {editor: {ntype: 'component'}, preview: {ntype: 'component'}},
              perspectives            : perspectives ?? {
                  operator: {center: ['editor', 'preview']},
                  review  : {center: ['editor', 'preview']},
                  triage  : {center: ['editor', 'preview']}
              },
              activePerspective: active,
              stateProvider    : stateProvider ?? {data: {chosen: active}},
              bind             : {activePerspective: {key: 'chosen', twoWay: true}}
          }),
          set = group && Neo.create(WorkspaceSet, {
              manager: Transaction, getGroupId: () => binding.groupId, documentModel: Document
          });

    if (group) {
        Transaction.setHistoryDepth({groupId: binding.groupId, depth});
        workspace.workspaceKey = 'main';
        workspace.workspaceSet = set;
        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value,
            project    : context => workspace.projectDockCommit(context)
        });
    }

    return {workspace, set, groupId: binding?.groupId,
        async settle() {await workspace.perspectiveSelection?.pending; await workspace.refreshPromise},
        destroy() {
            set && set.destroy();
            if (!workspace.isDestroyed) workspace.destroy();
            binding && Transaction.retireGroup(binding.groupId)
        }}
}

test('a construction binding chooses the initial declaration and runtime writes select once', async () => {
    const f = fixture({active: 'review', perspectives: {
        operator: {center: 'editor'}, review: {center: 'preview'}
    }}), {workspace} = f;
    try {
        expect(Document.findContainingTabsId(workspace.dockModel, 'preview')).toBeTruthy();
        expect(Document.findContainingTabsId(workspace.dockModel, 'editor')).toBeNull();
        workspace.stateProvider.setData('chosen', 'operator');
        await f.settle();
        expect(workspace.activePerspective).toBe('operator');
        expect(Document.findContainingTabsId(workspace.dockModel, 'editor')).toBeTruthy();
    } finally {f.destroy()}
});

/** @summary A deterministic gate for a participant's asynchronous preparation. @returns {Object} */
function gate() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

test('F1: an older refusal leaves the newer accepted intent intact', async () => {
    const f           = fixture({group: true}), {workspace, groupId} = f,
          entered     = gate(), release = gate(),
          participant = Transaction.getParticipant(groupId, 'main'), prepare = participant.prepare;
    let first = true;
    participant.prepare = async (...args) => {
        if (first) {
            first = false;
            entered.resolve();
            await release.promise;
            throw new Error('first selection refused')
        }
        return prepare(...args)
    };
    try {
        workspace.activePerspective = 'review';
        await entered.promise;
        workspace.activePerspective = 'triage';
        expect(workspace.activePerspective).toBe('triage');
        expect(workspace.perspectiveSelection.publishedName).toBe('operator');
        expect(workspace.perspectiveSelection.pendingName).toBe('triage');
        release.resolve();
        await f.settle();
        expect(workspace.activePerspective).toBe('triage');
        expect(workspace.stateProvider.getData('chosen')).toBe('triage');
        expect(Transaction.get(groupId).history.current).toMatchObject({before: 'operator', after: 'triage'});
        expect(Transaction.get(groupId).history.count).toBe(1);
    } finally {release.resolve(); f.destroy()}
});

test('F1: committed projection reads its carried name while a newer prepare is held', async () => {
    const f           = fixture({group: true}), {workspace, groupId} = f,
          entered     = gate(), release = gate(), projected = gate(),
          participant = Transaction.getParticipant(groupId, 'main'), prepare = participant.prepare,
          project     = workspace.projectDockCommit.bind(workspace);
    let count = 0;
    participant.prepare = async (...args) => {
        if (++count === 2) {entered.resolve(); await release.promise}
        return prepare(...args)
    };
    workspace.projectDockCommit = context => {
        const result = project(context);
        if (context.descriptor.after === 'review') projected.resolve();
        return result
    };
    try {
        workspace.activePerspective = 'review';
        workspace.activePerspective = 'triage';
        await entered.promise;
        await projected.promise;
        expect(workspace.perspectiveSelection.committedName).toBe('review');
        expect(workspace.perspectiveSelection.publishedName).toBe('review');
        expect(workspace.activePerspective).toBe('triage');
        expect(workspace.perspectiveSelection.pendingName).toBe('triage');
        release.resolve();
        await f.settle();
        expect(workspace.perspectiveSelection.publishedName).toBe('triage');
    } finally {release.resolve(); f.destroy()}
});

test('unknown names are refused and captured declarations survive later mutations', async () => {
    const f      = fixture({group: true}), {workspace, groupId} = f,
          errors = [], originalError = console.error;
    console.error = (...args) => errors.push(args);
    try {
        workspace.activePerspective = 'missing';
        expect(workspace.activePerspective).toBe('operator');
        expect(errors).toHaveLength(1);
        expect(Transaction.get(groupId).history).toBeNull();
        delete workspace.perspectives.review;
        workspace.perspectives.operator.center.length = 0;
        workspace.activePerspective = 'review';
        await f.settle();
        expect(workspace.activePerspective).toBe('review');
        expect(Document.findContainingTabsId(workspace.dockModel, 'editor')).toBeTruthy();
        expect(errors).toHaveLength(1);
    } finally {console.error = originalError; f.destroy()}
});

test('an equal assignment does not reset; the explicit reset restores the captured document', async () => {
    const f = fixture({group: true}), {workspace, groupId} = f;
    try {
        const initial    = Document.clone(workspace.dockModel),
              descriptor = {operation: 'moveItem', itemId: 'editor', targetNodeId: Document.findContainingTabsId(initial, 'editor'), index: 1},
              changed    = workspace.applyDockZoneOperation(descriptor);
        expect(changed.errors).toEqual([]);
        await workspace.onDockZoneDocumentChange(changed.document, descriptor);
        await workspace.refreshPromise;
        expect(workspace.dockModel).not.toEqual(initial);
        workspace.activePerspective = 'operator';
        expect(Transaction.get(groupId).history.count).toBe(1);
        expect((await workspace.resetPerspective()).errors).toEqual([]);
        await workspace.refreshPromise;
        expect(workspace.dockModel).toEqual(initial);
        expect(Transaction.get(groupId).history.count).toBe(2);
    } finally {f.destroy()}
});

test('F3: re-parenting the provider switches selection and two-way writes target the new parent', async () => {
    const first  = Neo.create(Provider, {data: {chosen: 'review'}}),
          second = Neo.create(Provider, {data: {chosen: 'operator'}}),
          f      = fixture({stateProvider: {parent: first, data: {}}}), {workspace} = f;
    try {
        expect(workspace.activePerspective).toBe('review');
        workspace.stateProvider.parent = second;
        await f.settle();
        expect(workspace.activePerspective).toBe('operator');
        workspace.activePerspective = 'triage';
        await f.settle();
        expect(second.getData('chosen')).toBe('triage');
        expect(first.getData('chosen')).toBe('review');
    } finally {f.destroy(); first.destroy(); second.destroy()}
});

test('F5: destroying a host during preparation settles without a later selection event', async () => {
    const f           = fixture({group: true}), {workspace, groupId} = f,
          entered     = gate(), release = gate(), events = [],
          participant = Transaction.getParticipant(groupId, 'main'), prepare = participant.prepare;
    participant.prepare = async (...args) => {entered.resolve(); await release.promise; return prepare(...args)};
    workspace.on('activePerspectiveChange', event => events.push(event.value));
    try {
        workspace.activePerspective = 'review';
        const pending = workspace.perspectiveSelection.pending;
        await entered.promise;
        workspace.destroy();
        const count = events.length;
        release.resolve();
        await pending;
        expect(events).toHaveLength(count);
    } finally {release.resolve(); f.destroy()}
});

test('F11: a restore refuses a pane held by a sibling without changing either document', async () => {
    const f     = fixture({group: true}), {workspace, groupId, set} = f;
    let   popup = {schema: 'neo.dock.zone.v1', root: 'root', items: {}, nodes: {
        root        : {type: 'edge-zone', zones: {center: {nodeId: 'popup-tabs'}}},
        'popup-tabs': {type: 'tabs', items: []}
    }};
    set.register('popup', {getDocument: () => popup, setDocument: value => popup = value});
    try {
        await set.transfer({operation: 'transferItem', itemId: 'preview', sourceWorkspaceId: 'main',
            targetWorkspaceId: 'popup', target: {operation: 'addTab', tabsNodeId: 'popup-tabs', index: 0}});
        await workspace.refreshPromise;
        const before = Document.clone(workspace.dockModel), popupBefore = Document.clone(popup);
        workspace.activePerspective = 'review';
        const result = await workspace.perspectiveSelection.pending;
        expect(result.errors.join()).toContain('duplicate a pane');
        expect(workspace.activePerspective).toBe('operator');
        expect(workspace.stateProvider.getData('chosen')).toBe('operator');
        expect(workspace.dockModel).toEqual(before);
        expect(popup).toEqual(popupBefore);
        expect(Transaction.get(groupId).history.count).toBe(1);
        expect(Persistence.captureTopologyPerspective({main: workspace.dockModel, popup}, {layoutId: 'refused'}).errors).toEqual([]);
    } finally {f.destroy()}
});

test('F10: queued alias selections retain accepted before-names and undo restores the preceding name', async () => {
    const f = fixture({group: true}), {workspace, groupId} = f;
    try {
        const initial = Document.clone(workspace.dockModel);
        workspace.activePerspective = 'review';
        workspace.activePerspective = 'triage';
        await f.settle();
        const history = Transaction.get(groupId).history;
        expect(history?.count ?? 0).toBe(2);
        expect(history.current).toMatchObject({workspaceKey: 'main', before: 'review', after: 'triage'});
        expect(workspace.dockModel).toEqual(initial);
        await Transaction.undo({groupId});
        await workspace.refreshPromise;
        expect(workspace.activePerspective).toBe('review');
        expect(workspace.stateProvider.getData('chosen')).toBe('review');
        await Transaction.redo({groupId});
        await workspace.refreshPromise;
        expect(workspace.activePerspective).toBe('triage');
        expect(workspace.stateProvider.getData('chosen')).toBe('triage');
        expect(history.count).toBe(2);
    } finally {f.destroy()}
});

test('a failing commit observer cannot change an accepted selection or its next before-name', async () => {
    const f        = fixture({group: true}), {workspace, groupId} = f,
          observer = () => {throw new Error('observer failed')};
    Transaction.on({commit: observer});
    try {
        workspace.activePerspective = 'review';
        await f.settle();
        expect(workspace.activePerspective).toBe('review');
        workspace.activePerspective = 'triage';
        await f.settle();
        expect(Transaction.get(groupId).history.current.before).toBe('review');
    } finally {Transaction.un({commit: observer}); f.destroy()}
});

test('adoption failure compensates the identity and document together', async () => {
    const f                    = fixture({group: true, perspectives: {operator: {center: 'editor'}, review: {center: 'preview'}}}),
          {workspace, groupId} = f,
          participant          = Transaction.getParticipant(groupId, 'main'), adopt = participant.adopt,
          initial              = Document.clone(workspace.dockModel);
    participant.adopt = (...args) => {adopt(...args); throw new Error('adoption refused')};
    try {
        workspace.activePerspective = 'review';
        const result = await workspace.perspectiveSelection.pending;
        expect(result.errors).toEqual(['adoption refused']);
        expect(workspace.dockModel).toEqual(initial);
        expect(workspace.perspectiveSelection.committedName).toBe('operator');
        expect(workspace.perspectiveSelection.publishedName).toBe('operator');
        expect(workspace.activePerspective).toBe('operator');
        expect(Transaction.get(groupId).history.count).toBe(0);
    } finally {f.destroy()}
});

test('accepted identity works without retained history and remains outside document membership', async () => {
    const f = fixture({group: true, depth: 0}), {workspace, groupId, set} = f;
    try {
        workspace.activePerspective = 'review';
        workspace.activePerspective = 'triage';
        await f.settle();
        expect(workspace.activePerspective).toBe('triage');
        expect(workspace.perspectiveSelection.committedName).toBe('triage');
        expect(Transaction.get(groupId).history).toBeNull();
        expect(set.ids()).toEqual(['main']);
        expect(Persistence.captureTopologyPerspective({main: workspace.dockModel}, {layoutId: 'no-history'}).errors).toEqual([]);
    } finally {f.destroy()}
});

test('public selection events and two-way synchronization occur once per effective name', async () => {
    const f = fixture({group: true}), {workspace, groupId} = f, events = [];
    workspace.on('activePerspectiveChange', ({value}) => events.push(value));
    try {
        workspace.activePerspective = 'review';
        await f.settle();
        workspace.activePerspective = 'review';
        await Transaction.undo({groupId});
        await workspace.refreshPromise;
        await Transaction.redo({groupId});
        await workspace.refreshPromise;
        expect(events).toEqual(['review', 'operator', 'review']);
        expect(Transaction.get(groupId).history.count).toBe(1);
        expect(workspace.items).toHaveLength(1);
    } finally {f.destroy()}
});

test('Placement projection ignores selection metadata and the replay envelope', async () => {
    const observed = [], host = {participantKey: 'placementHints',
        applyHint: async (key, hint) => observed.push({key, hint})},
          context = {cursorAction: 'undo', cause: 'history', captured: {value: {popup: {dx: 0, dy: 0}}},
              snapshot: {participants: {placementHints: {popup: {dx: 20, dy: 30}}}}};
    await Placement.prototype.project.call(host, context);
    const control = observed.splice(0);
    await Placement.prototype.project.call(host, {...context,
        descriptor: {operation: 'restorePerspective', workspaceKey: 'main', before: 'operator', after: 'review'},
        replayRow : {operation: 'restorePerspective', workspaceKey: 'main', before: 'operator', after: 'review'}});
    expect(observed).toEqual(control);
    expect(observed).toEqual([{key: 'popup', hint: {dx: 20, dy: 30}}]);
});

test('a host without declarations refuses a runtime selection rather than silently accepting it', () => {
    const workspace = Neo.create(Workspace, {enableDockMaximizeAction: false}), errors = [], original = console.error;
    console.error = (...args) => errors.push(args);
    try {
        workspace.activePerspective = 'unknown';
        expect(workspace.activePerspective).toBeNull();
        expect(errors).toHaveLength(1);
    } finally {console.error = original; workspace.destroy()}
});
