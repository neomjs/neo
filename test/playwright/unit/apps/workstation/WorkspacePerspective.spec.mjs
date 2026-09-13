import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationPerspectiveTest'
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import WorkspaceDocument  from '../../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import Operations         from '../../../../../src/dashboard/dock/model/Operations.mjs';
import '../../../../../src/manager/Instance.mjs';
import TransactionManager from '../../../../../src/manager/Transaction.mjs';
import Workspace          from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

const MAIN = Workspace.MAIN_WORKSPACE_ID, ITEM = 'alerts';

/**
 * @summary A saved topology whose main document lost one pane to that pane's vessel.
 * @returns {{savedMain: Object, vessel: Object, vesselId: String}}
 */
function tornOutTopology() {
    const scratch  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          vesselId = Workspace.vesselWorkspaceId(ITEM),
          detached = Operations.applyOperation(WorkspaceDocument.clone(initialDocument), {operation: 'detachItem', itemId: ITEM});

    try {
        expect(detached.errors).toEqual([]);
        scratch.dockModel = detached.document;

        const owner = Operations.transferItem(detached.document, scratch.createVesselWorkspaceDocument(ITEM), {
            itemId           : ITEM,
            sourceWorkspaceId: MAIN,
            targetWorkspaceId: vesselId,
            target           : {operation: 'addTab', tabsNodeId: Workspace.vesselTabsNodeId(ITEM), index: 0}
        });

        expect(owner.errors).toEqual([]);

        return {savedMain: owner.sourceDocument, vessel: owner.targetDocument, vesselId}
    } finally {
        scratch.destroy()
    }
}

test('a fresh Workstation reads its shipped perspective, unmodified', () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});

    try {
        expect(workspace.activePerspective).toBe('shipped');
        expect(workspace.getState('dock.perspective')).toEqual({active: 'shipped', modified: false, pending: null})
    } finally {
        workspace.destroy()
    }
});

test('a cold boot from a torn-out topology keeps the saved documents registered and reads modified against the shipped perspective', async () => {
    const {savedMain, vessel, vesselId} = tornOutTopology(),
          binding   = TransactionManager.bind({windowId: Neo.config.windowId, workspaceKey: MAIN}),
          // Supplying the shipped document here instead is what the single-owner check refuses.
          workspace = Neo.create(Workspace, {
              initialTopology: {workspaces: {[MAIN]: savedMain, [vesselId]: vessel}},
              topologyGroupId: binding.groupId,
              windowId       : Neo.config.windowId
          });

    try {
        await TransactionManager.write({
            cause       : 'cold-hydrate',
            changes     : [{workspaceKey: MAIN, input: savedMain}, {workspaceKey: vesselId, input: vessel}],
            cursorAction: 'preserve',
            descriptor  : {operation: 'hydrateTopology', layoutId: 'default'},
            groupId     : binding.groupId,
            provenance  : {source: 'cold-hydrate'}
        });
        await workspace.refreshPromise;

        expect(workspace.dockModel.items[ITEM], 'main stays without the torn-out pane').toBeUndefined();
        expect(workspace.workspaceSet.getParticipant(vesselId).getDocument().items[ITEM], 'its vessel keeps it').toBeTruthy();
        expect(workspace.getState('dock.perspective')).toEqual({active: 'shipped', modified: true, pending: null})
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('a cold boot after one user commit first reads the shipped perspective, already modified', async () => {
    const saved = Operations.applyOperation(WorkspaceDocument.clone(initialDocument), {
        operation: 'resizeSplit', splitNodeId: 'split-main', sizes: [0.25, 0.75]
    });

    expect(saved.errors).toEqual([]);

    const binding   = TransactionManager.bind({windowId: Neo.config.windowId, workspaceKey: MAIN}),
          workspace = Neo.create(Workspace, {
              initialTopology: {workspaces: {[MAIN]: saved.document}},
              topologyGroupId: binding.groupId,
              windowId       : Neo.config.windowId
          });

    try {
        const reset = workspace.getController().getReference('topology-toolbar').items.find(item => item.text === 'Reset to default');

        // Read before any await: a bound control's first value is the declared name, never `null` or a
        // saved record's name, and the departure from `shipped` is already true.
        expect({state: workspace.getState('dock.perspective'), resetDisabled: reset.disabled})
            .toEqual({state: {active: 'shipped', modified: true, pending: null}, resetDisabled: false});

        await TransactionManager.write({
            cause       : 'cold-hydrate',
            changes     : [{workspaceKey: MAIN, input: saved.document}],
            cursorAction: 'preserve',
            descriptor  : {operation: 'hydrateTopology', layoutId: 'default'},
            groupId     : binding.groupId,
            provenance  : {source: 'cold-hydrate'}
        });
        await workspace.refreshPromise;

        expect(workspace.getState('dock.perspective'), 'the cold-hydrate write keeps both')
            .toEqual({active: 'shipped', modified: true, pending: null})
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('a captured topology records the shipped perspective as its origin', () => {
    const binding   = TransactionManager.bind({windowId: Neo.config.windowId, workspaceKey: MAIN}),
          workspace = Neo.create(Workspace, {topologyGroupId: binding.groupId, windowId: Neo.config.windowId});

    try {
        const {topology, errors} = workspace.getController().captureTopology('probe');

        expect(errors).toEqual([]);
        expect(topology.metadata.declaredPerspective).toBe('shipped')
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('the topology library refuses a record that takes the shipped perspective name', () => {
    const binding   = TransactionManager.bind({windowId: Neo.config.windowId, workspaceKey: MAIN}),
          workspace = Neo.create(Workspace, {topologyGroupId: binding.groupId, windowId: Neo.config.windowId});

    try {
        const {topology, errors} = workspace.getController().captureTopology('shipped');

        expect(errors).toEqual([]);
        expect(workspace.topologyLibrary.save(topology).errors.join()).toContain('names a declared perspective')
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});
