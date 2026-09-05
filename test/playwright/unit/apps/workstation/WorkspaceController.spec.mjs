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
                  items : {a: {componentRef: 'a', title: 'before'}},
                  nodes : {tabs: {type: 'tabs', items: ['a'], activeItemId: 'a'}}
              },
              library = Neo.create(TopologyLibrary, {persistenceAdapter: {
                  read : async () => null,
                  write: () => {started.resolve(); return acknowledgement.promise}
              }}),
              context = {
                  component: {
                      getDockTopologyWorkspaces: () => ({main: document}),
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
    })
});
