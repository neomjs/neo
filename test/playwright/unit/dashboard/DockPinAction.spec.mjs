import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockPinActionTest'
    }
});

import {test, expect}           from '@playwright/test';
import Neo                      from '../../../../src/Neo.mjs';
import * as core                from '../../../../src/core/_export.mjs';
import DockWorkspace            from '../../../../src/dashboard/dock/Workspace.mjs';
import Reconciler               from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import TransactionManager       from '../../../../src/manager/Transaction.mjs';
import WorkspaceDocument        from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';
import {createDockWorkspaceSet} from '../../../../src/dashboard/dock/window/WorkspaceSet.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * @summary A committed document whose `inspector` item is PINNED and owned by the `right` edge.
 *
 * Both properties are load-bearing for `#18448`. Edge ownership is what `handleDockPinAction`
 * requires before it will commit at all, and `pinned: true` is what makes the collapse a TWO-step
 * sequence — the model refuses `autoHidden` on a pinned item, so the action must first unpin. A
 * single-step collapse cannot reproduce the defect, because there is no second step to starve.
 * @returns {Object}
 */
function createDocument() {
    return {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {
            center   : {componentRef: 'Center',    title: 'Center',    kind: 'panel'},
            inspector: {componentRef: 'Inspector', title: 'Inspector', kind: 'panel', pinned: true}
        },
        nodes: {
            root: {
                type : 'edge-zone',
                zones: {
                    center: {nodeId: 'center-tabs'},
                    right : {nodeId: 'inspector-tabs', extent: 0.25, resizable: true}
                }
            },
            'center-tabs'   : {type: 'tabs', items: ['center'],    activeItemId: 'center'},
            'inspector-tabs': {type: 'tabs', items: ['inspector'], activeItemId: 'inspector'}
        }
    }
}

/** @summary Workspace fixture that mounts the real projected tab composition once. */
class PinWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockPinAction.Workspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

PinWorkspace = Neo.setupClass(PinWorkspace);

/**
 * @summary Resolves the projected `inspector-tabs` container and collapses it through the real action.
 *
 * `handleDockPinAction` publishes but does not RETURN the publish — under a Group that publish is a
 * pending transaction, so an assertion made straight after the call would read the document before
 * the Group has adopted it and would pass or fail on timing rather than on the fix. The pass-through
 * below captures that promise without altering what the action does.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Promise<{document:Object,errors:String[]}|null>}
 */
async function collapseInspector(workspace) {
    const tabContainer = Reconciler.collectProjectedTabs(workspace.items[0]).get('inspector-tabs'),
          original     = workspace.onDockZoneDocumentChange;

    let published = null;

    workspace.onDockZoneDocumentChange = function(...args) {
        published = original.apply(this, args);
        return published
    };

    try {
        const result = workspace.handleDockPinAction({dockNodeId: 'inspector-tabs', tabContainer});
        await published;
        return result
    } finally {
        delete workspace.onDockZoneDocumentChange
    }
}

test.describe.serial('Dock pin action (#18448)', () => {
    let groupId, set;

    test.beforeEach(() => {
        groupId = TransactionManager.bind({windowId: 'dock-pin-action-root', workspaceKey: 'main'}).groupId;
        set     = createDockWorkspaceSet({manager: TransactionManager, getGroupId: () => groupId, documentModel: WorkspaceDocument})
    });

    test.afterEach(() => TransactionManager.retireGroup(groupId));

    test('the two-step collapse reaches autoHidden under a registered Group participant', async () => {
        const workspace = Neo.create(PinWorkspace, {
            dockModel: createDocument(), topologyGroupId: groupId, workspaceKey: 'main', workspaceSet: set
        });

        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value
        });

        try {
            await collapseInspector(workspace);

            // The whole ticket, in two assertions. Step 1 unpins; step 2 auto-hides. Before the fix,
            // step 1's publish returned `pending` without advancing `dockModel`, so step 2 reduced
            // against a document where `inspector` was STILL pinned — and the model refuses
            // `autoHidden` on a pinned item. `pinned` therefore landed and `autoHidden` did not,
            // which is precisely the half-applied gesture this arm pins down.
            const committed = set.getDocument('main');

            expect(committed.items.inspector.pinned,     'step 1 must land').toBe(false);
            expect(committed.items.inspector.autoHidden, 'step 2 must land — this is the defect').toBe(true)
        } finally {
            workspace.destroy()
        }
    });

    test('pin, restore, pin again — the SECOND collapse also reaches autoHidden', async () => {
        const workspace = Neo.create(PinWorkspace, {
            dockModel: createDocument(), topologyGroupId: groupId, workspaceKey: 'main', workspaceSet: set
        });

        set.register('main', {
            componentId: workspace.id,
            getDocument: () => workspace.dockModel,
            setDocument: value => workspace.dockModel = value
        });

        try {
            await collapseInspector(workspace);
            expect(set.getDocument('main').items.inspector.autoHidden, 'first collapse').toBe(true);

            // Restore to the pinned, visible state so the next collapse is a two-step sequence again
            // rather than the single-step path an already-unpinned item would take.
            const restored = workspace.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'inspector', autoHidden: false});
            expect(restored.errors).toEqual([]);
            await workspace.onDockZoneDocumentChange(restored.document, {operation: 'setItemAutoHidden', itemId: 'inspector', autoHidden: false});

            const repinned = workspace.applyDockZoneOperation({operation: 'setItemPinned', itemId: 'inspector', pinned: true});
            expect(repinned.errors).toEqual([]);
            await workspace.onDockZoneDocumentChange(repinned.document, {operation: 'setItemPinned', itemId: 'inspector', pinned: true});
            expect(set.getDocument('main').items.inspector.pinned, 'restore must re-pin').toBe(true);

            await collapseInspector(workspace);

            const committed = set.getDocument('main');

            expect(committed.items.inspector.pinned,     'second collapse, step 1').toBe(false);
            expect(committed.items.inspector.autoHidden, 'second collapse, step 2').toBe(true)
        } finally {
            workspace.destroy()
        }
    });

    test('the direct path — no Group participant — is unchanged', async () => {
        // The fix must not trade one path for the other. This workspace has neither `workspaceSet`
        // nor `topologyGroupId`, so `onDockZoneDocumentChange` takes its synchronous branch and
        // `dockModel` is assigned directly. It passed before the fix and must keep passing.
        const workspace = Neo.create(PinWorkspace, {dockModel: createDocument()});

        try {
            await collapseInspector(workspace);

            expect(workspace.dockModel.items.inspector.pinned,     'step 1 on the direct path').toBe(false);
            expect(workspace.dockModel.items.inspector.autoHidden, 'step 2 on the direct path').toBe(true)
        } finally {
            workspace.destroy()
        }
    });

    test('an item no edge owns is refused, and the committed document is untouched', async () => {
        // `center` sits in the root centre, which §2.7 forbids collapsing. The guard is what keeps a
        // stale-but-still-dispatchable header action from committing, so it is worth its own arm.
        const workspace = Neo.create(PinWorkspace, {dockModel: createDocument()}),
              before    = WorkspaceDocument.clone(workspace.dockModel);

        try {
            const tabContainer = Reconciler.collectProjectedTabs(workspace.items[0]).get('center-tabs'),
                  result       = workspace.handleDockPinAction({dockNodeId: 'center-tabs', tabContainer});

            expect(result.errors).toEqual(['Dock pin action requires an item owned by an edge zone']);
            expect(workspace.dockModel).toEqual(before)
        } finally {
            workspace.destroy()
        }
    });
});
