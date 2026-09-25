import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'WorkstationTopologyControllerTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import Base             from '../../../../../src/core/Base.mjs';
import ComponentManager from '../../../../../src/manager/Component.mjs';
import Transaction      from '../../../../../src/manager/Transaction.mjs';
import TopologyLibrary  from '../../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import Container        from '../../../../../src/container/Base.mjs';
// The controller loads before the views it serves: an import path from the controller back to the
// app entry point would evaluate `Workspace` before this binding exists, and this order exposes it.
import WorkspaceController from '../../../../../apps/workstation/view/WorkspaceController.mjs';
import ViewportController  from '../../../../../apps/workstation/view/ViewportController.mjs';
import PopupWorkspace      from '../../../../../apps/workstation/view/PopupWorkspace.mjs';
import Workspace           from '../../../../../apps/workstation/view/Workspace.mjs';


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
                  getPlacementHints    : () => live,
                  perspectiveProvenance: () => ({declaredPerspective: 'shipped'}),
                  topologyCollection   : {activeLayoutId: 'saved', topologies: {saved: {title: 'Saved', placementHints: stored}}}
              },
              result = Workspace.prototype.captureTopology.call(component);

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
                component: {
                    topologyGroupId: root.groupId,
                    saveTopology   : async () => ({persisted: true, current: true, errors: []})
                }
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

    test('a topology window opens the page its opener is on, in every build', async () => {
        // A webpack build turns `new URL('../index.html', import.meta.url)` into a bundled copy of the
        // source page, whose neo-config.json does not exist beside it, so nothing boots. The opener's
        // own document is the app page in source, dist/esm, dist/development and dist/production alike.
        const root     = Transaction.bind({windowId: 'controller-open-root'}),
              main     = Neo.ns('Neo.Main', true),
              opened   = [],
              original = main.windowOpen;

        main.windowOpen = data => {opened.push(data); return Promise.resolve(true)};

        try {
            const result = await WorkspaceController.prototype.openTopologyWorkspace.call({
                component: {
                    getPopupState  : key => key === 'details' ? {} : null,
                    theme          : 'neo-theme-neo-dark',
                    topologyGroupId: root.groupId,
                    windowId       : root.windowId
                }
            }, 'details');

            expect(result.opened).toBe(true);
            expect(new URL(opened[0].url, 'https://host/dist/production/apps/workstation/index.html?workspace=main').href)
                .toBe('https://host/dist/production/apps/workstation/index.html?workspace=details&theme=neo-theme-neo-dark')
        } finally {
            if (original === undefined) delete main.windowOpen;
            else main.windowOpen = original;
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
              // The command cluster lives on the component; the controller reaches it there.
              context = {
                  component: {
                      getDockTopologyWorkspaces: () => ({main: document}),
                      getPlacementHints        : () => ({}),
                      perspectiveProvenance    : () => ({declaredPerspective: 'shipped'}),
                      topologyGroupId          : root.groupId,
                      topologyLibrary          : library,
                      get topologyCollection() {return library.collection},
                      captureTopology: Workspace.prototype.captureTopology,
                      saveTopology   : Workspace.prototype.saveTopology
                  }
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

    test('popup membership keeps exactly Reset, Undo and Redo and preserves their component identities', () => {
        const windowId = 'controller-membership-root',
              binding  = Transaction.bind({windowId, workspaceKey: 'main'}),
              root     = Neo.create(Workspace, {windowId}),
              bar      = root.controller.getReference('topology-toolbar'),
              controls = () => bar.items.filter(item => item.ntype === 'button'),
              initial  = controls(),
              document = key => ({
                  schema: 'neo.dock.zone.v1', root: 'tabs',
                  items : {[key]: {reference: key}},
                  nodes : {tabs: {type: 'tabs', items: [key], activeItemId: key}}
              }),
              assertControls = () => {
                  expect(controls().map(item => item.text)).toEqual(['Reset to default', 'Undo', 'Redo']);
                  expect(controls()).toEqual(initial);
                  expect(bar.items.filter(item => item.isToolbarActionSpacer !== true)).toEqual(initial);
                  expect(bar.getVdomItemsRoot().cn.map(node => ComponentManager.get(node.componentId)))
                      .toEqual(bar.items)
              };

        try {
            assertControls();

            const alpha = root.createPopupWorkspace('alpha', document('alpha'), {committed: true, windowId: null}),
                  beta  = root.createPopupWorkspace('beta', document('beta'), {committed: true, windowId: null});

            expect(root.workspaceSet.ids()).toEqual(expect.arrayContaining(['alpha', 'beta']));
            assertControls();
            alpha.host.destroy();
            assertControls();
            beta.host.destroy();
            assertControls()
        } finally {
            root.destroy();
            Transaction.retireGroup(binding.groupId)
        }
    })
});

/** The arriving side's fail-closed answer to a saved-window URL it cannot be adopted under. */
const REFUSAL = 'This saved window is waiting for its original workspace.';

/**
 * @summary A stand-in for the App worker with the engine's own event surface, so `connect` can be FIRED.
 *
 * The harness worker stub has `on` and `un` as no-ops and no `fire`; an arm about the subscription itself
 * needs the real Observable behind those three and nothing else about the worker.
 */
class ObservableWorker extends Base {
    static config = {className: 'Test.Workstation.ObservableWorker'}
    static observable = true
}

Neo.setupClass(ObservableWorker);

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
     * @param {Object} [options]
     * @param {Function} [options.bind] Binds the window before its main view constructs, as admission precedes the view.
     * @param {Function} [options.controller] The main view's controller — the real arriving one, when an arm couples both sides.
     * @returns {{windowId: String, target: Neo.container.Base}}
     */
    const connectWindow = (search, {bind, controller} = {}) => {
        const windowId = `${rootWindowId}-w${windows.length + 1}`;

        Neo.windowConfigs[windowId] = {url: {search}};
        bind?.(windowId);

        const target = Neo.create(Container, {controller, windowId});

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

    // After a whole-stack return the retained vessel holds an empty document. The next tear-out of the
    // same item arrives under the same key, pre-terminal: the tear-out lifecycle stages its pane and
    // mounts this host once the terminal has filled it. Remounting the empty host here seats it beside
    // the staged pane, each at half the window.
    test('a vessel window arriving under an emptied retained vessel\'s key is the next tear-out, not a reload: nothing is remounted', async () => {
        const fixture = createAdoptionFixture(), {root} = fixture, key = root.tearOutWorkspaceKey('alerts');

        try {
            const state = fixture.registerPopup(key);

            expect(Object.keys(state.document.items), 'the retained vessel is empty').toHaveLength(0);
            Transaction.bind({...Transaction.reserve({groupId: root.topologyGroupId, workspaceKey: key}), windowId: `${root.windowId}-w1`});

            const {windowId, target} = fixture.connectWindow('?popout=alerts');

            expect(await root.controller.onWindowConnect({windowId}), 'an emptied vessel is not remounted into its item\'s next vessel').toBe(false);
            expect(state.host.parent, 'the arriving window holds no dock host').not.toBe(target);
            expect(target.items).toHaveLength(0);
            expect(state).toMatchObject({disconnected: true, windowId: null})
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
    });

    test('both sides read one intent: a rebound root slot whose URL carries `workspace=` with no key is refused by the arriving controller and not adopted by the owner', async () => {
        const fixture = createAdoptionFixture(), {root, rootBinding} = fixture;

        // Each row rebinds the root's own slot to a new window whose main view runs the REAL arriving
        // controller, so the refusal and the adoption decision are read off the same window.
        let previous = root.windowId;

        const rebind = search => fixture.connectWindow(search, {
            controller: ViewportController,
            bind      : windowId => {
                Transaction.release(previous);
                Transaction.bind({groupId: rootBinding.groupId, workspaceKey: 'main', generationToken: rootBinding.generationToken, windowId});
                previous = windowId
            }
        });

        try {
            for (const [search, refused, adopted] of [['', false, true], ['?workspace=details', true, false], ['?workspace=', true, false]]) {
                const {windowId, target} = rebind(search), label = search || '(no search)';

                expect(target.items.some(item => item.html === REFUSAL), `${label}: the arriving side refuses`).toBe(refused);
                expect(await root.controller.onWindowConnect({windowId}), `${label}: the owner adopts`).toBe(adopted);
                expect(root.parent === target, `${label}: the root is in that window`).toBe(adopted)
            }
        } finally {
            fixture.destroy()
        }
    });

    test('the owner adopts through the worker\'s own connect event, and stops listening when it is destroyed', () => {
        const harnessWorker = Neo.currentWorker,
              worker        = Neo.create(ObservableWorker);

        // Whatever the engine asks a worker for while a Workspace constructs stays the harness stub's answer;
        // only the event surface is the real one.
        Object.assign(worker, {
            getAddon        : harnessWorker.getAddon,
            insertThemeFiles: harnessWorker.insertThemeFiles,
            isSharedWorker  : false,
            promiseMessage  : harnessWorker.promiseMessage,
            sendMessage     : harnessWorker.sendMessage
        });
        Neo.currentWorker = worker;

        const subscribers = () => (worker.toJSON().listeners.connect ?? []).map(({scope}) => scope.id);

        let fixture;

        try {
            fixture = createAdoptionFixture();

            const {root, rootBinding} = fixture,
                  controllerId        = root.controller.id;

            expect(subscribers(), 'constructing the root subscribed its controller').toContain(controllerId);

            const {windowId, target} = fixture.connectWindow('', {
                bind: windowId => {
                    Transaction.release(root.windowId);
                    Transaction.bind({groupId: rootBinding.groupId, workspaceKey: 'main', generationToken: rootBinding.generationToken, windowId})
                }
            });

            // The payload `Neo.worker.App` publishes, fired the way it fires it — nothing calls the handler.
            worker.fire('connect', {appName: 'Workstation', windowData: {}, windowId});

            expect(root.parent, 'the event alone moved the root').toBe(target);
            expect(root.windowId).toBe(windowId);

            const before = subscribers().length;

            root.destroy();

            expect(subscribers(), 'destroying the root unsubscribed its controller').not.toContain(controllerId);
            expect(subscribers().length, 'and nothing else').toBe(before - 1)
        } finally {
            fixture?.destroy();
            Neo.currentWorker = harnessWorker;
            worker.destroy()
        }
    })
});
