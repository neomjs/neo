import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'WorkstationTopologyControllerTest'}});

import {test, expect}      from '@playwright/test';
import Neo                 from '../../../../../src/Neo.mjs';
import * as core           from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import Transaction         from '../../../../../src/manager/Transaction.mjs';
import TopologyLibrary     from '../../../../../src/dashboard/dock/persistence/TopologyLibrary.mjs';
import Toolbar             from '../../../../../src/toolbar/Base.mjs';
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

    test('the controller fills only the tail of the view-declared bar and cannot destroy what the view authored', () => {
        // A real toolbar, so `bar.add` and `item.destroy` are the engine's and not a double's; the
        // reference is how the controller finds it, exactly as it does in the live view.
        const bar = Neo.create(Toolbar, {
            items    : [{ntype: 'button', handler: 'saveTopology', text: 'Save workspace'},
                        {ntype: 'button', handler: 'closeTopology', text: 'Close workspace'}],
            reference: 'topology-toolbar'
        });

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

        expect(bar.items.map(item => item.text), 'the lifecycle hook already populated it').toEqual([
            'Save workspace', 'Close workspace', 'Open alpha as window', 'Show alpha here'
        ]);

        expect(controller.syncTopologyBar()).toBe(true);
        expect(bar.items.map(item => item.text), 'and a resync is not additive').toEqual([
            'Save workspace', 'Close workspace', 'Open alpha as window', 'Show alpha here'
        ]);

        // Each derived button carries the participant it addresses, which is the whole of what the
        // declarative handlers read — no closure over the controller or over this call.
        expect(bar.items.slice(2).map(item => [item.handler, item.workspaceKey])).toEqual([
            ['onOpenTopologyWorkspace', 'alpha'], ['onMountTopologyWorkspace', 'alpha']
        ]);

        // Re-running is not additive, and the authored head survives a resync that removes every
        // participant — the failure mode of replacing the whole list instead of its tail.
        participants = [];

        expect(controller.syncTopologyBar()).toBe(true);
        expect(bar.items.map(item => item.handler)).toEqual(['saveTopology', 'closeTopology']);

        // An unreachable bar is reported, never assumed: a destroyed view must not read as synced.
        bar.destroy();
        expect(controller.syncTopologyBar(), 'a destroyed bar is not a synced bar').toBe(false);

        controller.destroy()
    })
});
