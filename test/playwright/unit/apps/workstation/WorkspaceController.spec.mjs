import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'WorkstationTopologyControllerTest'}});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../src/Neo.mjs';
import * as core           from '../../../../../src/core/_export.mjs';
import Transaction         from '../../../../../src/manager/Transaction.mjs';
import TopologyLibrary     from '../../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
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
            schema: 'neo.dock.zone.v2', root: 'tabs',
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
                  schema: 'neo.dock.zone.v2', root: 'tabs',
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

    test('the topology bar carries undo and redo as bound actions that dispatch to the Group and own no history logic', () => {
        // Popup rows come from Group participant identity; supplying none keeps the arm on the two
        // Group actions rather than on the bar's row building.
        const component  = {getPopupStates: () => [], topologyGroupId: 'topology-bar-group'},
              bar        = WorkspaceController.prototype.createTopologyBar.call({component}),
              actions    = Object.fromEntries((bar.actions || []).map(action => [action.action, action])),
              dispatched = [];

        expect(Object.keys(actions).sort()).toEqual(['redo', 'undo']);

        // Persistent, not focus-gated: an undo control that appears only once the bar holds focus is
        // undiscoverable exactly when a user reaches for it.
        expect(actions.undo.showOnFocus).toBe(false);
        expect(actions.redo.showOnFocus).toBe(false);

        // Enablement reads the Group's own leaf where it lives. `getData` resolves to that leaf's
        // `core.Config`, so a binding effect running this formatter registers it and re-runs when it
        // changes — no copy is held here, so there is no second publication path that could go stale
        // when `setHistoryDepth` publishes without a commit.
        const group = Transaction.bind({windowId: 'topology-bar-window', workspaceKey: 'main'});

        component.topologyGroupId = group.groupId;

        expect(actions.undo.bind.disabled(), 'an empty history disables Undo').toBe(true);
        expect(actions.redo.bind.disabled()).toBe(true);

        Transaction.getProvider(group.groupId).setData({canRedo: true, canUndo: true});

        expect(actions.undo.bind.disabled(), 'the Group\'s own leaf enables it').toBe(false);
        expect(actions.redo.bind.disabled()).toBe(false);

        // Fails closed on the SAME expression rather than through a separate teardown path.
        Transaction.retireGroup(group.groupId);
        expect(actions.undo.bind.disabled(), 'a retired Group reads disabled').toBe(true);

        component.topologyGroupId = 'topology-bar-group';

        const originals = {redo: Transaction.redo, undo: Transaction.undo};

        Transaction.redo = data => {dispatched.push(['redo', data]); return Promise.resolve()};
        Transaction.undo = data => {dispatched.push(['undo', data]); return Promise.resolve()};

        try {
            actions.undo.handler();
            actions.redo.handler()
        } finally {
            Object.assign(Transaction, originals)
        }

        // The whole of the consumer's contribution: the Group id and the command name.
        expect(dispatched).toEqual([
            ['undo', {groupId: 'topology-bar-group'}],
            ['redo', {groupId: 'topology-bar-group'}]
        ])
    })
});
