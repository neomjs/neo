import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationPlanningArrangementTest'
    }
});

import {test, expect}    from '@playwright/test';
import Neo               from '../../../../../src/Neo.mjs';
import * as core         from '../../../../../src/core/_export.mjs';
import Operations        from '../../../../../src/dashboard/dock/model/Operations.mjs';
import WorkspaceDocument from '../../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import '../../../../../src/manager/Instance.mjs';
import TransactionManager from '../../../../../src/manager/Transaction.mjs';
import GanttPane          from '../../../../../apps/workstation/view/GanttPane.mjs';
import SchedulerPane      from '../../../../../apps/workstation/view/SchedulerPane.mjs';
import Workspace          from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

const MAIN = Workspace.MAIN_WORKSPACE_ID;

/**
 * @summary A bound Workstation, as the root window's boot creates one.
 * @param {Object} [config={}]
 * @returns {{binding: Object, workspace: Workstation.view.Workspace}}
 */
function boundWorkspace(config={}) {
    const binding   = TransactionManager.bind({windowId: Neo.config.windowId, workspaceKey: MAIN}),
          workspace = Neo.create(Workspace, {topologyGroupId: binding.groupId, windowId: Neo.config.windowId, ...config});

    return {binding, workspace}
}

/** @summary The pane ids a document lists, sorted. @param {Object} document @returns {String[]} */
const itemsOf = document => Object.keys(document.items).sort();

test('the Workstation declares a planning arrangement beside the shipped one', () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});

    try {
        expect(workspace.declaredPerspectives()).toEqual(['shipped', 'planning']);
        expect(itemsOf(workspace.perspectiveSelection.document('planning'))).toEqual(['gantt', 'scheduler']);
        expect(workspace.activePerspective, 'a cold boot still opens on the shipped arrangement').toBe('shipped')
    } finally {
        workspace.destroy()
    }
});

test('the planning panes borrow the root provider\'s stores rather than holding their own', () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});

    try {
        const provider  = workspace.getStateProvider(),
              planning  = workspace.perspectiveSelection.document('planning'),
              scheduler = workspace.resolvePane('scheduler', planning.items.scheduler),
              gantt     = workspace.resolvePane('gantt', planning.items.gantt),
              day       = provider.getStore('workItems').baseDate;

        expect(scheduler).toBeInstanceOf(SchedulerPane);
        expect(scheduler.eventStore, 'the work-item store a board binds too').toBe(provider.getStore('workItems'));
        expect(scheduler.store).toBe(provider.getStore('people'));
        expect(scheduler.timeAxis.start < day && day < scheduler.timeAxis.end, 'the schedule opens around the plan day').toBe(true);

        expect(gantt).toBeInstanceOf(GanttPane);
        expect(gantt.store).toBe(provider.getStore('planTasks'));
        expect(gantt.dependencyStore).toBe(provider.getStore('planLinks'));

        expect(workspace.resolvePane('scheduler', planning.items.scheduler), 'one pane per item').toBe(scheduler)
    } finally {
        workspace.destroy()
    }
});

test('choosing an arrangement is one undoable commit that carries its name', async () => {
    const {binding, workspace} = boundWorkspace(),
          status               = () => workspace.down({reference: 'status-bar'}).html,
          caption              = () => workspace.down({reference: 'tour-caption'}).html;

    try {
        expect(await workspace.resetTopology('planning')).toMatchObject({errors: [], reset: true});
        await workspace.refreshPromise;

        expect(itemsOf(workspace.dockModel)).toEqual(['gantt', 'scheduler']);
        expect(workspace.getState('dock.perspective')).toEqual({active: 'planning', modified: false, pending: null});
        expect(workspace.captureTopology('probe').topology.metadata.declaredPerspective, 'a save records the arrangement').toBe('planning');
        expect(status(), 'the readout states the planning desk\'s own facts').toBe('<span>6 people</span><span>15 work items</span><span>15 plan tasks</span>');
        expect(caption(), 'and so does the caption').toContain('planning desk');

        await TransactionManager.undo({groupId: binding.groupId});
        await workspace.refreshPromise;

        expect(itemsOf(workspace.dockModel)).toEqual(itemsOf(initialDocument));
        expect(workspace.getState('dock.perspective')).toEqual({active: 'shipped', modified: false, pending: null});
        expect(status(), 'the operations room gets its own readout back').toContain('scale rows');
        expect(caption()).not.toContain('planning desk')
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('Reset to default restores the arrangement the workspace is in', async () => {
    const {binding, workspace} = boundWorkspace();

    try {
        await workspace.resetTopology('planning');
        await workspace.refreshPromise;

        const split   = Object.entries(workspace.dockModel.nodes).find(([, node]) => node.type === 'split')[0],
              resized = Operations.applyOperation(WorkspaceDocument.clone(workspace.dockModel), {
                  operation: 'resizeSplit', splitNodeId: split, sizes: [0.2, 0.8]
              });

        expect(resized.errors).toEqual([]);
        expect((await workspace.commitDockTopologyWorkspaces({[MAIN]: resized.document},
            {name: 'resize', provenance: {origin: 'human'}})).errors).toEqual([]);
        await workspace.refreshPromise;
        expect(workspace.getState('dock.perspective')).toEqual({active: 'planning', modified: true, pending: null});

        expect(await workspace.resetTopology()).toMatchObject({errors: [], reset: true});
        await workspace.refreshPromise;

        expect(workspace.dockModel).toEqual(workspace.perspectiveSelection.document('planning'));
        expect(workspace.getState('dock.perspective')).toEqual({active: 'planning', modified: false, pending: null})
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('choosing an arrangement takes its panes back from their windows', async () => {
    const scratch  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          planning = scratch.perspectiveSelection.document('planning'),
          vesselId = Workspace.vesselWorkspaceId('scheduler'),
          detached = Operations.applyOperation(WorkspaceDocument.clone(planning), {operation: 'detachItem', itemId: 'scheduler'});

    // The vessel document names its pane from the document the pane leaves
    scratch.dockModel = detached.document;

    const owner = Operations.transferItem(detached.document, scratch.createVesselWorkspaceDocument('scheduler'), {
        itemId           : 'scheduler',
        sourceWorkspaceId: MAIN,
        targetWorkspaceId: vesselId,
        target           : {operation: 'addTab', tabsNodeId: Workspace.vesselTabsNodeId('scheduler'), index: 0}
    });

    scratch.destroy();
    expect(owner.errors).toEqual([]);

    // The schedule was popped out while planning; the viewer then went back to the shipped arrangement
    const shipped              = WorkspaceDocument.clone(initialDocument),
          {binding, workspace} = boundWorkspace({initialTopology: {workspaces: {[MAIN]: shipped, [vesselId]: owner.targetDocument}}});

    try {
        await TransactionManager.write({
            cause       : 'cold-hydrate',
            changes     : [{workspaceKey: MAIN, input: shipped}, {workspaceKey: vesselId, input: owner.targetDocument}],
            cursorAction: 'preserve',
            descriptor  : {operation: 'hydrateTopology', layoutId: 'default'},
            groupId     : binding.groupId,
            provenance  : {source: 'cold-hydrate'}
        });
        await workspace.refreshPromise;

        expect(await workspace.resetTopology('planning')).toMatchObject({errors: [], reset: true});
        await workspace.refreshPromise;

        expect(itemsOf(workspace.dockModel), 'main shows the whole planning arrangement').toEqual(['gantt', 'scheduler']);
        expect(workspace.workspaceSet.getParticipant(vesselId).getDocument().items.scheduler, 'its window gave the schedule back').toBeUndefined();
        expect(workspace.getState('dock.perspective').active).toBe('planning')
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});

test('an undeclared arrangement is refused before anything is written', async () => {
    const {binding, workspace} = boundWorkspace();

    try {
        expect(await workspace.resetTopology('kanban')).toEqual({errors: ['"kanban" is not a declared arrangement'], reset: false, transactionId: null});
        expect(workspace.getState('dock.perspective').active).toBe('shipped')
    } finally {
        workspace.destroy();
        TransactionManager.retireGroup(binding.groupId)
    }
});
