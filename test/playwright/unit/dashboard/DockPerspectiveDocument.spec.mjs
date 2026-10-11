import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockPerspectiveDocumentTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import '../../../../src/tab/Container.mjs';    // registers the `tab-container` ntype the projection emits
import DockService        from '../../../../src/ai/client/DockService.mjs';
import DockWorkspace      from '../../../../src/dashboard/dock/Workspace.mjs';
import TransactionManager from '../../../../src/manager/Transaction.mjs';
import WorkspaceDocument  from '../../../../src/dashboard/dock/model/WorkspaceDocument.mjs';

const createDocument = () => ({
    schema: 'neo.dock.zone.v1',
    root  : 'root',
    items : {
        editor  : {reference: 'Editor',   title: 'Editor'},
        preview : {reference: 'Preview',  title: 'Preview'},
        terminal: {reference: 'Terminal', title: 'Terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: {nodeId: 'root-split'}}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['editor-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'editor-tabs': {type: 'tabs', items: ['editor'],              activeItemId: 'editor'},
        'side-tabs'  : {type: 'tabs', items: ['preview', 'terminal'], activeItemId: 'preview'}
    }
});

/** @summary A workspace that projects its own document, bound into its Group like a booted host. */
class PlainWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockPerspectiveDocument.PlainWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        TransactionManager.bind({windowId: this.windowId, workspaceKey: 'main'});
        this.add(this.projectDockModel())
    }
}

Neo.setupClass(PlainWorkspace);

/**
 * @summary What a window-scope capture records while a pane is away in a vessel. The live
 * document spells that pane exactly like a closed one — catalog record, no placement — so a
 * record of it restores a window without the pane. The perspective document is the window the
 * pane's return would leave, which is why every fold below is held against the REAL return.
 */
test.describe('Neo.dashboard.dock.Workspace#getPerspectiveDocument', () => {
    let originalGetComponent, workspace;

    const
        armed  = () => Neo.create(PlainWorkspace, {dockModel: createDocument(), enableDockTearOutLifecycle: true}),
        detach = itemId => {
            const result = workspace.applyTearOutOperation({operation: 'detachItem', itemId});

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document)
        },
        comeHome = async itemId => {
            const recorded = workspace.getPerspectiveDocument();

            expect(await workspace.tearOutHandlers.reintegrateItem(itemId, null)).toBe(true);
            expect(recorded, 'the record is the window the return leaves').toEqual(workspace.dockModel);

            return recorded
        };

    test.beforeEach(() => {
        originalGetComponent = Neo.getComponent
    });

    test.afterEach(() => {
        Neo.getComponent = originalGetComponent;
        workspace?.destroy();
        workspace = null
    });

    test('a pane away in a vessel is recorded in its home, at its index', async () => {
        workspace = armed();
        detach('preview');

        expect(WorkspaceDocument.findContainingTabsId(workspace.dockModel, 'preview'), 'the live document places it nowhere').toBeNull();

        const recorded = await comeHome('preview');

        expect(recorded.nodes['side-tabs'].items).toEqual(['preview', 'terminal'])
    });

    test('a home that collapsed with the detach is rebuilt in the record', async () => {
        workspace = armed();
        detach('editor');

        expect(workspace.dockModel.nodes['editor-tabs'], 'the emptied home is gone').toBeUndefined();

        const recorded = await comeHome('editor'),
              tabsId   = WorkspaceDocument.findContainingTabsId(recorded, 'editor');

        expect(recorded.nodes[tabsId].items).toEqual(['editor']);
        expect(Object.values(recorded.nodes).some(node => node.type === 'split'), 'the split came back with it').toBe(true)
    });

    test('a recorded home that resolves to nothing takes the host\'s no-home answer, as the return does', async () => {
        workspace = armed();
        detach('editor');

        Object.assign(workspace.tearOutHandlers.peekPlacement('editor').home, {parentId: 'gone', siblingId: 'gone-too'});

        const recorded = await comeHome('editor');

        expect(WorkspaceDocument.findContainingTabsId(recorded, 'editor')).not.toBeNull()
    });

    test('the read commits nothing and keeps the recorded home', () => {
        workspace = armed();
        detach('preview');

        const live     = workspace.dockModel,
              snapshot = JSON.stringify(live);

        workspace.getPerspectiveDocument();

        expect(workspace.dockModel).toBe(live);
        expect(JSON.stringify(workspace.dockModel)).toBe(snapshot);
        expect(workspace.tearOutHandlers.peekPlacement('preview')).toMatchObject({index: 0, tabsNodeId: 'side-tabs'})
    });

    test('a pane the document places while it is away stays where the document has it', () => {
        workspace = armed();
        detach('preview');

        // a perspective restored while the vessel stands seats the pane somewhere else than its old home
        const moved = Neo.clone(workspace.dockModel, true);

        moved.nodes['editor-tabs'].items.push('preview');
        workspace.onDockZoneDocumentChange(moved);

        expect(workspace.tearOutHandlers.peekPlacement('preview'), 'the old home is still recorded').toMatchObject({tabsNodeId: 'side-tabs'});
        expect(workspace.getPerspectiveDocument()).toBe(workspace.dockModel)
    });

    test('a fold the reducer refuses leaves the record as the live document has it', () => {
        workspace = armed();
        detach('preview');

        // the pane left the catalog while it was away: nothing can seat it, under any home
        const {preview, ...items} = workspace.dockModel.items;

        workspace.onDockZoneDocumentChange({...workspace.dockModel, items});

        expect(workspace.getPerspectiveDocument()).toBe(workspace.dockModel)
    });

    test('with nothing away, or no tear-out lifecycle, the record is the live document', () => {
        workspace = armed();
        expect(workspace.getPerspectiveDocument()).toBe(workspace.dockModel);
        workspace.destroy();

        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});
        expect(workspace.tearOutHandlers).toBeNull();
        expect(workspace.getPerspectiveDocument()).toBe(workspace.dockModel)
    });

    test('the Neural Link window capture records the perspective document; a holder without the read keeps its live one', async () => {
        const service = Neo.create(DockService, {});

        workspace = armed();
        detach('preview');

        Neo.getComponent = () => workspace;

        const away = await service.capturePerspective({componentId: workspace.id, layoutId: 'away'});

        expect(away.errors).toEqual([]);
        expect(WorkspaceDocument.findContainingTabsId(away.layout.dockZone, 'preview')).toBe('side-tabs');

        Neo.getComponent = () => ({getDockZoneDocument: () => workspace.dockModel});

        const live = await service.capturePerspective({componentId: 'plain-holder', layoutId: 'live'});

        expect(live.errors).toEqual([]);
        expect(WorkspaceDocument.findContainingTabsId(live.layout.dockZone, 'preview')).toBeNull();

        service.destroy()
    })
});
