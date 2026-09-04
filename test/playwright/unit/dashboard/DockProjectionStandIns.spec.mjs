import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoDashboardDockProjectionStandInsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import DockWorkspace  from '../../../../src/dashboard/dock/Workspace.mjs';
import Operations     from '../../../../src/dashboard/dock/model/Operations.mjs';
import Reconciler     from '../../../../src/dashboard/dock/projection/Reconciler.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/tab/Container.mjs';

/**
 * A refresh materializes a hidden stand-in component per projected item. For an item whose tabs
 * node the current shell already renders, that stand-in is discarded with the node's config and
 * never enters a parent, so it must not be constructed at all. Only an item inside a NEW tabs node
 * needs one: the staged container is built from the config, and the stand-in's index pairs the
 * projected tab button with the live pane that replaces it.
 *
 * The arms count two things across the commit classes: stand-ins constructed (through the factory
 * hook) and components destroyed (through the base destroy), and they read the header chrome ids
 * before and after so instance permanence is asserted rather than assumed.
 */
const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'Editor',   title: 'Editor',   kind: 'panel'},
        preview : {componentRef: 'Preview',  title: 'Preview',  kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['editor-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'editor-tabs': {type: 'tabs', items: ['editor'],              activeItemId: 'editor'},
        'side-tabs'  : {type: 'tabs', items: ['preview', 'terminal'], activeItemId: 'preview'}
    }
});

const standIns = [];

class StandInWorkspace extends DockWorkspace {
    static config = {
        className           : 'Test.Unit.Dashboard.DockProjectionStandIns.Workspace',
        enableDockLockAction: true,
        layout              : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }

    /**
     * Records every stand-in the refresh asks for, then builds it like the engine does.
     * @param {String} itemId
     * @param {Object} item
     * @param {String} componentRef
     * @returns {Neo.component.Base}
     */
    createProjectionPlaceholder(itemId, item, componentRef) {
        standIns.push(itemId);
        return super.createProjectionPlaceholder(itemId, item, componentRef)
    }
}

StandInWorkspace = Neo.setupClass(StandInWorkspace);

let destroyed       = 0,
    originalDestroy = null;

/**
 * The header chrome of every projected tabs node: the ids permanence is asserted on.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @returns {Object}
 */
function chrome(workspace) {
    const shell = workspace.getDockHost().items[workspace.dockShellIndex],
          out   = {};

    Reconciler.collectProjectedTabs(shell).forEach((tab, nodeId) => {
        const bar = tab.getTabBar();

        out[nodeId] = {
            tab    : tab.id,
            bar    : bar.id,
            buttons: tab.getTabButtons().map(button => button.id),
            actions: bar.getActionItems().map(action => `${action.action}:${action.id}`)
        }
    });

    return out
}

/**
 * Commits one operation the way a committing surface does and waits for its refresh to land.
 * @param {Neo.dashboard.dock.Workspace} workspace
 * @param {Object} descriptor
 * @param {Object} [document=workspace.dockModel]
 * @returns {Promise<{destroyed: Number, standIns: String[]}>}
 */
async function commit(workspace, descriptor, document=workspace.dockModel) {
    const before = destroyed,
          mark   = standIns.length,
          result = Operations.applyOperation(document, descriptor);

    expect(result.errors, `${descriptor.operation} must be accepted`).toEqual([]);

    workspace.onDockZoneDocumentChange(result.document, descriptor, workspace);
    // The refresh chain resolves once the projection has landed and the post-commit sweeps ran.
    await workspace.refreshPromise;

    return {destroyed: destroyed - before, standIns: standIns.slice(mark)}
}

test.describe('Neo.dashboard.dock.Workspace projection stand-ins (#18274)', () => {
    let workspace;

    test.beforeAll(() => {
        originalDestroy = Component.prototype.destroy;
        Component.prototype.destroy = function(...args) {
            destroyed++;
            return originalDestroy.apply(this, args)
        }
    });

    test.afterAll(() => {
        Component.prototype.destroy = originalDestroy
    });

    test.beforeEach(async () => {
        standIns.length = 0;
        workspace = Neo.create(StandInWorkspace, {dockModel: createDocument()});
        await workspace.refreshPromise
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('AC-1 an item-flag commit constructs nothing and destroys nothing', async () => {
        const before = chrome(workspace),
              lock   = await commit(workspace, {operation: 'setItemLocked', itemId: 'editor', locked: true});

        expect(lock.standIns, 'no stand-in for a retained node').toEqual([]);
        expect(lock.destroyed, 'the lock commit destroys no component').toBe(0);
        expect(chrome(workspace), 'header chrome keeps every instance').toEqual(before)
    });

    test('AC-2/AC-3 topology commits on retained nodes construct no stand-in and keep the chrome', async () => {
        const before = chrome(workspace);

        const activate = await commit(workspace, {operation: 'setActiveItem', tabsNodeId: 'side-tabs', itemId: 'terminal'});
        expect(activate.standIns, 'a tab click builds no stand-in').toEqual([]);
        expect(chrome(workspace)).toEqual(before);

        const withNotes = structuredClone(workspace.dockModel);
        withNotes.items.notes = {componentRef: 'Notes', title: 'Notes', kind: 'panel'};

        const add = await commit(workspace, {operation: 'addTab', itemId: 'notes', tabsNodeId: 'side-tabs', index: 2}, withNotes);
        expect(add.standIns, 'a tab added to a retained node builds no stand-in').toEqual([]);

        const afterAdd = chrome(workspace);
        expect(afterAdd['editor-tabs']).toEqual(before['editor-tabs']);
        expect(afterAdd['side-tabs'].tab).toBe(before['side-tabs'].tab);
        expect(afterAdd['side-tabs'].bar).toBe(before['side-tabs'].bar);
        expect(afterAdd['side-tabs'].actions).toEqual(before['side-tabs'].actions);
        expect(afterAdd['side-tabs'].buttons.slice(0, 2), 'the existing tab buttons survive').toEqual(before['side-tabs'].buttons);
        expect(afterAdd['side-tabs'].buttons.length, 'the added item renders its tab').toBe(3);

        const close = await commit(workspace, {operation: 'closeItem', itemId: 'notes'});
        expect(close.standIns, 'closing builds no stand-in').toEqual([]);
        expect(chrome(workspace)).toEqual(before);

        const noop = await commit(workspace, {operation: 'setActiveItem', tabsNodeId: 'side-tabs', itemId: 'terminal'});
        expect(noop.standIns, 'a byte-identical re-commit builds no stand-in').toEqual([]);
        expect(chrome(workspace)).toEqual(before)
    });

    test('AC-2 a NEW tabs node still receives exactly one stand-in per item, and pairing holds', async () => {
        const before = chrome(workspace),
              split  = await commit(workspace, {operation: 'splitNode', itemId: 'terminal', targetNodeId: 'editor-tabs', orientation: 'vertical', position: 'after'});

        expect(split.standIns, 'only the new node\'s item gets a stand-in').toEqual(['terminal']);

        const after = chrome(workspace);

        expect(after['editor-tabs'], 'the retained split target keeps its chrome').toEqual(before['editor-tabs']);
        expect(after['side-tabs'].tab).toBe(before['side-tabs'].tab);
        expect(after['side-tabs'].buttons, 'the moved item left its old node').toEqual(before['side-tabs'].buttons.slice(0, 1));

        const newNode = Object.keys(after).find(nodeId => !(nodeId in before));

        expect(newNode, 'a new tabs node projected').toBeTruthy();
        expect(after[newNode].buttons, 'the new node pairs one button with its one pane').toHaveLength(1)
    });
});
