import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'WorkstationTopologyControllerTest'}});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../src/Neo.mjs';
import * as core           from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import ComponentManager    from '../../../../../src/manager/Component.mjs';
import Transaction         from '../../../../../src/manager/Transaction.mjs';
import TopologyLibrary     from '../../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import Container           from '../../../../../src/container/Base.mjs';
import Toolbar             from '../../../../../src/toolbar/Base.mjs';
import PopupWorkspace      from '../../../../../apps/workstation/view/PopupWorkspace.mjs';
import Workspace           from '../../../../../apps/workstation/view/Workspace.mjs';
import WorkspaceController from '../../../../../apps/workstation/view/WorkspaceController.mjs';

/**
 * @summary An event-driven storage boundary for a write already in flight.
 * @returns {{promise: Promise, resolve: Function}}
 */
const deferred = () => {
    let resolve;
    const promise = new Promise(done => {resolve = done});
    return {promise, resolve}
};

test.describe('Workstation topology save and close coordination', () => {
    test('topology capture uses live placement instead of the previously stored offsets', () => {
        const document = {
            schema: 'neo.dock.zone.v1', root: 'tabs',
            items : {a: {reference: 'a'}},
            nodes : {tabs: {type: 'tabs', items: ['a'], activeItemId: 'a'}}
        },
              fallbackTarget = {workspaceKey: 'main', nodeId: 'tabs'},
              stored = {details: {dx: 10, dy: 20, fallbackTarget}},
              live = {details: {dx: 450, dy: 80, fallbackTarget}},
              component = {
                  getDockTopologyWorkspaces: () => ({main: document, details: {
                      ...document, items: {b: {reference: 'b'}}, nodes: {tabs: {type: 'tabs', items: ['b'], activeItemId: 'b'}}
                  }}),
                  getPlacementHints : () => live,
                  topologyCollection: {activeLayoutId: 'saved', topologies: {saved: {title: 'Saved', placementHints: stored}}}
              },
              result = WorkspaceController.prototype.captureTopology.call({component});

        expect(result.errors).toEqual([]);
        expect(result.topology.placementHints).toEqual(live);
        expect(component.topologyCollection.topologies.saved.placementHints).toEqual(stored)
    });

    test('a partial carrier refusal compensates cleared windows and closes none', async () => {
        const root      = Transaction.bind({windowId: 'controller-close-root'}),
              popup     = Transaction.bind({...Transaction.reserve({groupId: root.groupId, workspaceKey: 'details'}), windowId: 'controller-close-popup'}),
              restored  = [], closed = [],
              main      = Neo.ns('Neo.Main', true),
              originals = Object.fromEntries(['clearTopologyIdentity', 'setTopologyIdentity', 'closeTopologyWindow'].map(key => [key, main[key]]));

        main.clearTopologyIdentity = ({windowId}) => windowId === root.windowId ? Promise.resolve(true) : Promise.reject(new Error('gone port'));
        main.setTopologyIdentity = data => {restored.push(data); return Promise.resolve(true)};
        main.closeTopologyWindow = data => {closed.push(data); return Promise.resolve(true)};

        try {
            const result = await WorkspaceController.prototype.closeTopology.call({
                component   : {topologyGroupId: root.groupId},
                saveTopology: async () => ({persisted: true, current: true, errors: []})
            });

            expect(result.closed).toBe(false);
            expect(closed).toEqual([]);
            expect(restored).toEqual([expect.objectContaining({
                generationToken: root.generationToken,
                groupId        : root.groupId,
                onlyIfEmpty    : true,
                windowId       : root.windowId,
                workspaceKey   : root.workspaceKey
            })]);
            expect(Transaction.findByWindow(root.windowId)?.groupId).toBe(root.groupId);
            expect(Transaction.findByWindow(popup.windowId)?.groupId).toBe(root.groupId)
        } finally {
            for (const [key, value] of Object.entries(originals)) {
                if (value === undefined) delete main[key];
                else main[key] = value
            }
            Transaction.retireGroup(root.groupId)
        }
    });

    test('a queued document write during storage makes the save stale before close can clear carriers', async () => {
        const root     = Transaction.bind({windowId: 'controller-save-root'}),
              group    = Transaction.get(root.groupId),
              started  = deferred(), acknowledgement = deferred(),
              document = {
                  schema: 'neo.dock.zone.v1', root: 'tabs',
                  items : {a: {reference: 'a', title: 'before'}},
                  nodes : {tabs: {type: 'tabs', items: ['a'], activeItemId: 'a'}}
              },
              library = Neo.create(TopologyLibrary, {persistenceAdapter: {
                  read : async () => null,
                  write: () => {started.resolve(); return acknowledgement.promise}
              }}),
              context = {
                  component: {
                      getDockTopologyWorkspaces: () => ({main: document}),
                      getPlacementHints        : () => ({}),
                      topologyGroupId          : root.groupId,
                      topologyLibrary          : library,
                      get topologyCollection() {return library.collection}
                  },
                  captureTopology: WorkspaceController.prototype.captureTopology,
                  saveTopology   : WorkspaceController.prototype.saveTopology
              };

        try {
            const closing = WorkspaceController.prototype.closeTopology.call(context);
            await started.promise;
            await Transaction.enqueue(group, () => {document.items.a.title = 'newer'});
            acknowledgement.resolve();

            expect((await closing).closed).toBe(false);
            expect(Transaction.findByWindow(root.windowId)?.groupId).toBe(root.groupId);
            expect(document.items.a.title).toBe('newer');
            expect(library.resolve().topology.workspaces.main.items.a.title, 'only the older bytes were acknowledged').toBe('before')
        } finally {
            library.destroy();
            Transaction.retireGroup(root.groupId)
        }
    });

    test('the controller fills only its own buttons and cannot destroy what the toolbar owns', () => {
        // The VIEW's own factory, not a hand-written stand-in. `actions` is where the defect lived:
        // toolbar.Base merges `createActionItemConfigs()` into `items` as a spacer plus one item per
        // action, so the live bar holds five items, not two. A fixture that omits `actions` cannot
        // reproduce the defect and therefore cannot certify the fix — the previous one omitted it.
        const bar = Neo.create(Toolbar, Workspace.prototype.createTopologyBar.call({topologyGroupId: 'spec-group'}));

        expect(bar.items.length, 'two authored items, plus the spacer and one item per action').toBe(5);
        expect(bar.getActionSpacer(), 'the toolbar owns a spacer once actions exist').not.toBeNull();

        // The invariant whose violation threw `Component not found for id` on every viewport sync:
        // a placeholder in the parent vdom must resolve to a live component. `items.length =` and a
        // bare `destroy()` each break it silently — nothing reds until a vdom walk reaches the stub.
        const expectVdomAligned = message => {
            const ids = bar.getVdomItemsRoot().cn.map(node => node.componentId);

            expect(ids.length, message).toBe(bar.items.length);
            expect(ids.filter(id => id && !ComponentManager.get(id)), message).toEqual([])
        };

        expectVdomAligned('aligned before the controller runs');

        let participants = ['alpha'];

        // `isConstructed` sends `controller.Component#construct` down its immediate branch, so the
        // engine's own `onComponentConstructed` seam runs here — the wiring is under test, not just
        // the method it calls.
        const controller = Neo.create(WorkspaceController, {
            component: {
                down          : () => bar,
                getPopupStates: () => participants.map(workspaceId => ({workspaceId})),
                isConstructed : true
            }
        });

        // Ordinary items only: the spacer and the action group are the toolbar's own structure and
        // are asserted separately, because reaching into them is exactly what the defect was.
        const ordinaryTexts = () => bar.items
            .filter(item => item.isToolbarAction !== true && item.isToolbarActionSpacer !== true)
            .map(item => item.text);

        expect(ordinaryTexts(), 'the lifecycle hook already populated it').toEqual([
            'Save workspace', 'Close workspace', 'Open alpha as window', 'Show alpha here'
        ]);

        // Positional `slice(count)` destroyed these three, and `items.length = count` left their
        // vdom placeholders pointing at the corpses.
        expect(bar.getAction('undo'), 'the toolbar keeps its own actions across a sync').not.toBeNull();
        expect(bar.getAction('redo')).not.toBeNull();
        expect(bar.getActionSpacer(), 'and its own spacer').not.toBeNull();
        expectVdomAligned('aligned after the first sync');

        expect(controller.syncTopologyBar()).toBe(true);
        expect(ordinaryTexts(), 'and a resync is not additive').toEqual([
            'Save workspace', 'Close workspace', 'Open alpha as window', 'Show alpha here'
        ]);
        expectVdomAligned('aligned after a resync');

        // The derived buttons join the ordinary items ahead of the `flex: 1` action spacer, rather
        // than stranded past it on the far side of undo/redo.
        expect(bar.items.indexOf(bar.getActionSpacer()), 'derived buttons precede the action group').toBe(4);

        // Each derived button carries the participant it addresses, which is the whole of what the
        // declarative handlers read — no closure over the controller or over this call.
        expect(bar.items.slice(2, 4).map(item => [item.handler, item.workspaceKey])).toEqual([
            ['onOpenTopologyWorkspace', 'alpha'], ['onMountTopologyWorkspace', 'alpha']
        ]);

        // Re-running is not additive, and the authored head survives a resync that removes every
        // participant — the failure mode of replacing the whole list instead of only its own.
        participants = [];

        expect(controller.syncTopologyBar()).toBe(true);
        expect(ordinaryTexts()).toEqual(['Save workspace', 'Close workspace']);
        expect(bar.getAction('undo'), 'an emptied participant set still leaves the actions alone').not.toBeNull();
        expectVdomAligned('aligned after every participant leaves');

        // An unreachable bar is reported, never assumed: a destroyed view must not read as synced.
        bar.destroy();
        expect(controller.syncTopologyBar(), 'a destroyed bar is not a synced bar').toBe(false);

        controller.destroy()
    })
});

/**
 * @summary A root Workspace whose window is bound into a Group, plus one connected window with a live main view.
 * @returns {Object}
 */
function createAdoptionFixture() {
    const rootWindowId = `adoption-root-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          rootBinding  = Transaction.bind({windowId: rootWindowId, workspaceKey: 'main'}),
          root         = Neo.create(Workspace, {windowId: rootWindowId}),
          windows      = [];

    Neo.windowConfigs ??= {};

    /**
     * @param {String} search The URL the arriving window booted with.
     * @returns {{windowId: String, target: Neo.container.Base}}
     */
    const connectWindow = search => {
        const windowId = `${rootWindowId}-w${windows.length + 1}`,
              target   = Neo.create(Container, {windowId});

        Neo.windowConfigs[windowId] = {url: {search}};
        Neo.apps[windowId] = {mainView: target};
        windows.push({windowId, target});

        return {windowId, target}
    };

    /**
     * @param {String} workspaceKey
     * @returns {Object} The popup owner's runtime state.
     */
    const registerPopup = workspaceKey => {
        const host = Neo.create(PopupWorkspace, {
            dockModel      : root.createVesselWorkspaceDocument('alerts'), rootWorkspace: root,
            topologyGroupId: root.topologyGroupId, workspaceKey, workspaceSet: root.workspaceSet
        });

        host.runtimeState = {
            committed: true, disconnected: true, host, windowId: null, workspaceId: workspaceKey,
            get document() { return host.dockModel },
            set document(value) { host.dockModel = value }
        };

        return host.runtimeState
    };

    const destroy = () => {
        windows.forEach(({windowId, target}) => {
            delete Neo.apps[windowId];
            delete Neo.windowConfigs[windowId];
            target.destroy()
        });
        root.destroy();
        Transaction.retireGroup(rootBinding.groupId)
    };

    return {connectWindow, destroy, registerPopup, root, rootBinding}
}

test.describe('Workstation topology adoption on window connect', () => {
    test('a restored window bound under its declared key is adopted once, and a second connect is a no-op', async () => {
        const fixture = createAdoptionFixture(), {root} = fixture, key = 'details';

        try {
            const state = fixture.registerPopup(key);

            Transaction.bind({...Transaction.reserve({groupId: root.topologyGroupId, workspaceKey: key}), windowId: `${root.windowId}-w1`});

            const {windowId, target} = fixture.connectWindow(`?workspace=${key}`);

            expect(await root.controller.onWindowConnect({windowId}), 'the root adopts the arrival').toBe(true);
            expect(state.host.parent, 'the popup owner renders into the arriving window').toBe(target);
            expect(state).toMatchObject({disconnected: false, windowId});

            expect(await root.controller.onWindowConnect({windowId}), 'an already-mounted host is left alone').toBe(false);
            expect(state.host.parent).toBe(target)
        } finally {
            fixture.destroy()
        }
    });

    test('an arrival whose URL declares a different key than its binding is ignored, not adopted', async () => {
        const fixture = createAdoptionFixture(), {root} = fixture, key = 'details';

        try {
            const state = fixture.registerPopup(key);

            Transaction.bind({...Transaction.reserve({groupId: root.topologyGroupId, workspaceKey: key}), windowId: `${root.windowId}-w1`});

            const {windowId, target} = fixture.connectWindow('?workspace=other');

            expect(await root.controller.onWindowConnect({windowId})).toBe(false);
            expect(state.host.parent, 'a non-matching arrival mounts nothing').not.toBe(target);
            expect(state).toMatchObject({disconnected: true, windowId: null})
        } finally {
            fixture.destroy()
        }
    });

    test('a window bound into another Group is not this root\'s to adopt', async () => {
        const fixture = createAdoptionFixture(), {root} = fixture;

        let foreign;

        try {
            const {windowId} = fixture.connectWindow('');

            foreign = Transaction.bind({windowId});

            expect(foreign.groupId).not.toBe(root.topologyGroupId);
            expect(await root.controller.onWindowConnect({windowId})).toBe(false)
        } finally {
            fixture.destroy();
            foreign && Transaction.retireGroup(foreign.groupId)
        }
    });

    test('the root\'s own slot rebound to a new window moves the root, unless that window declares another intent', async () => {
        const fixture = createAdoptionFixture(), {root, rootBinding} = fixture;

        try {
            const {windowId, target} = fixture.connectWindow('?workspace=details');

            // The main window reloaded while this worker lives: its slot is released, then rebound to the new window.
            Transaction.release(root.windowId);
            Transaction.bind({groupId: rootBinding.groupId, workspaceKey: 'main', generationToken: rootBinding.generationToken, windowId});

            expect(await root.controller.onWindowConnect({windowId}), 'a root slot whose window asks for a saved workspace is refused').toBe(false);
            expect(root.parent, 'and the root stays where it is').toBeNull();

            Neo.windowConfigs[windowId].url.search = '';

            expect(await root.controller.onWindowConnect({windowId}), 'the same slot with no declared intent is the reload').toBe(true);
            expect(root.parent).toBe(target);
            expect(root.windowId).toBe(windowId)
        } finally {
            fixture.destroy()
        }
    })
});
