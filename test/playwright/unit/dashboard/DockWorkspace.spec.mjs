import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockWorkspaceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import '../../../../src/tab/Container.mjs';    // registers the `tab-container` ntype the projection emits
import Container                from '../../../../src/container/Base.mjs';
import DockLayoutAdapter        from '../../../../src/dashboard/DockLayoutAdapter.mjs';
import DockProjectionReconciler from '../../../../src/dashboard/DockProjectionReconciler.mjs';
import DockService              from '../../../../src/ai/client/DockService.mjs';
import DockWorkspace            from '../../../../src/dashboard/DockWorkspace.mjs';

const createDocument = () => ({
    schema: 'neo.harness.dockZone.v1',
    root  : 'root',
    items : {
        editor  : {componentRef: 'Editor',   title: 'Editor',   kind: 'panel'},
        preview : {componentRef: 'Preview',  title: 'Preview',  kind: 'panel'},
        terminal: {componentRef: 'Terminal', title: 'Terminal', kind: 'terminal'}
    },
    nodes: {
        root         : {type: 'edge-zone', zones: {center: 'root-split'}},
        'root-split' : {type: 'split', orientation: 'horizontal', children: ['editor-tabs', 'side-tabs'], sizes: [0.6, 0.4]},
        'editor-tabs': {type: 'tabs', items: ['editor'],              activeItemId: 'editor'},
        'side-tabs'  : {type: 'tabs', items: ['preview', 'terminal'], activeItemId: 'preview'}
    }
});

/**
 * The minimal consumer: the document arrives as a config-assigned field, the projection sits at
 * shell index 0 of the workspace itself, and nothing is overridden.
 */
class PlainWorkspace extends DockWorkspace {
    static config = {
        className: 'Test.Unit.Dashboard.DockWorkspace.PlainWorkspace',
        layout   : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add(this.projectDockModel())
    }
}

/**
 * A consumer with app chrome ahead of the shell and every hook overridden.
 */
class ChromeWorkspace extends DockWorkspace {
    static config = {
        className           : 'Test.Unit.Dashboard.DockWorkspace.ChromeWorkspace',
        dockProjectionConfig: {flex: 1},
        dockShellIndex      : 1,
        flipMarkerPrefix    : 'chrome-pane-',
        layout              : {ntype: 'vbox', align: 'stretch'}
    }

    beforeRefreshCalls = []
    preserved          = ['terminal']

    construct(config) {
        super.construct(config);
        this.add([{module: Container, cls: ['chrome-bar'], flex: 'none'}, this.projectDockModel()])
    }

    beforeRefreshDockWorkspace(document, refreshOptions) {
        this.beforeRefreshCalls.push({document, refreshOptions})
    }

    getDockProjectionOptions() {
        return {autoHideRevealOnHover: true}
    }

    getPreservedItemIds() {
        return this.preserved
    }

    getRefreshOptions(descriptor) {
        return {geometryOnly: descriptor?.operation === 'resizeSplit'}
    }

    resolvePane(itemId, item) {
        return {cls: ['custom-pane'], html: item.title, ntype: 'component'}
    }
}

/**
 * A consumer mounting the projection into a dedicated dock-host child beside persistent siblings.
 */
class HostedWorkspace extends DockWorkspace {
    static config = {
        className        : 'Test.Unit.Dashboard.DockWorkspace.HostedWorkspace',
        dockHostReference: 'dock-host',
        layout           : {ntype: 'vbox', align: 'stretch'}
    }

    construct(config) {
        super.construct(config);
        this.add([{module: Container, cls: ['chrome-bar'], flex: 'none'}, {
            module   : Container,
            layout   : {ntype: 'fit'},
            reference: 'dock-host',
            items    : [this.projectDockModel(), {module: Container, cls: ['overlay-sibling']}]
        }])
    }
}

Neo.setupClass(PlainWorkspace);
Neo.setupClass(ChromeWorkspace);
Neo.setupClass(HostedWorkspace);

const
    tabsOf  = shell => DockProjectionReconciler.collectProjectedTabs(shell),
    collect = (config, predicate, out=[]) => {
        if (config && typeof config === 'object') {
            predicate(config) && out.push(config);
            (config.items || []).forEach(item => collect(item, predicate, out))
        }

        return out
    };

/**
 * @summary Contract specs for the engine-owned dock workspace host: the holder contract, the
 * single mutation path, the atomic deferred re-projection chain, the hooks a consumer owns, the
 * dock-host indirection, and teardown.
 */
test.describe('Neo.dashboard.DockWorkspace', () => {
    let workspace;

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('the holder contract: a config-assigned document is readable before any operation', () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        expect(workspace.getDockZoneDocument()).toBe(document);
        expect(workspace.getDockHost()).toBe(workspace);
        expect(tabsOf(workspace.items[0]).size).toBe(2)
    });

    test('DockService resolves the class as a holder without any service change', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            dockService = Neo.create(DockService, {}),
            result      = await dockService.executeDockOperation({
                componentId: workspace.id,
                descriptor : {operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1}
            });

        await workspace.refreshPromise;

        expect(result.applied).toBe(true);
        expect(workspace.getDockZoneDocument().nodes['editor-tabs'].items).toEqual(['editor', 'terminal']);

        dockService.destroy()
    });

    test('applyDockZoneOperation is the pure reducer: fail-closed result, no self-mutation', () => {
        const document = createDocument();

        workspace = Neo.create(PlainWorkspace, {dockModel: document});

        const before = JSON.stringify(document),
              result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'ghost', targetNodeId: 'editor-tabs', index: 0});

        expect(result.errors.length).toBeGreaterThan(0);
        expect(workspace.getDockZoneDocument()).toBe(document);
        expect(JSON.stringify(document)).toBe(before)
    });

    test('rapid commits advance the document synchronously and stage one transaction at a time', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            first    = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1}),
            second   = workspace.applyDockZoneOperation.call({dockModel: first.document}, {operation: 'moveItem', itemId: 'preview', targetNodeId: 'editor-tabs', index: 0}),
            timeline = [],
            original = workspace.refreshDockWorkspace.bind(workspace);

        let inFlight = 0;

        workspace.refreshDockWorkspace = async (...args) => {
            timeline.push(`start:${++inFlight}`);
            const result = await original(...args);

            timeline.push(`end:${inFlight--}`);

            return result
        };

        workspace.onDockZoneDocumentChange(first.document, {operation: 'moveItem'});
        workspace.onDockZoneDocumentChange(second.document, {operation: 'moveItem'});

        // the committed document is truth immediately; the projection follows one tick later
        expect(workspace.getDockZoneDocument()).toBe(second.document);

        await workspace.refreshPromise;

        expect(timeline).toEqual(['start:1', 'end:1', 'start:1', 'end:1']);
        expect(workspace.items.length).toBe(1);
        expect(tabsOf(workspace.items[0]).get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['preview', 'editor', 'terminal'])
    });

    test('a destroyed workspace drops its pending refresh without throwing', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(result.document);

        const pending = workspace.refreshPromise;

        workspace.destroy();
        workspace = null;

        await expect(pending).resolves.toBeUndefined()
    });

    test('the add-tab correlation is minted only for a globally absent header', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const
            withNewItem = createDocument(),
            relocated   = createDocument();

        withNewItem.items.notes = {componentRef: 'Notes', title: 'Notes'};
        withNewItem.nodes['editor-tabs'].items.push('notes');
        relocated.nodes['side-tabs'].items = ['terminal'];
        relocated.nodes['editor-tabs'].items.push('preview');

        expect(workspace.getTabInsertProjectionDescriptor(withNewItem, {operation: 'addTab', itemId: 'notes', tabsNodeId: 'editor-tabs', extra: true}))
            .toEqual({itemId: 'notes', operation: 'addTab', tabsNodeId: 'editor-tabs'});
        // an item that already lives in a tabs node relocates by identity — FLIP alone
        expect(workspace.getTabInsertProjectionDescriptor(relocated, {operation: 'addTab', itemId: 'preview', tabsNodeId: 'editor-tabs'})).toBeNull();
        expect(workspace.getTabInsertProjectionDescriptor(relocated, {operation: 'moveItem', itemId: 'preview', tabsNodeId: 'editor-tabs'})).toBeNull();
        expect(workspace.getTabInsertProjectionDescriptor(withNewItem, null)).toBeNull()
    });

    test('the default resolver renders a titled placeholder stamped with the FLIP marker', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const config = workspace.resolveProjectedPane('editor', workspace.dockModel.items.editor);

        expect(config.ntype).toBe('component');
        expect(config.html).toBe('Editor');
        expect(config.cls).toEqual(['neo-dock-workspace-placeholder', 'dock-flip-item-editor']);
        // live instances are never stamped — their identity resolves through the document
        expect(workspace.decorateFlipMarker(workspace, 'editor')).toBe(workspace)
    });

    test('a consumer owns its panes, chrome sync, preserved ids, projection options and refresh options', async () => {
        workspace = Neo.create(ChromeWorkspace, {dockModel: createDocument()});

        const
            shell = workspace.items[1],
            panes = collect(shell, config => Array.isArray(config.cls) && config.cls.includes('custom-pane'));

        expect(workspace.items[0].cls).toContain('chrome-bar');
        expect(shell.flex).toBe(1);
        expect(panes.length).toBe(3);
        panes.forEach(pane => expect(pane.cls.some(cls => cls.startsWith('chrome-pane-'))).toBe(true));

        let captured      = null,
            preservedSeen = null;

        const
            project   = DockLayoutAdapter.project,
            reconcile = DockProjectionReconciler.reconcileProjection;

        DockLayoutAdapter.project = (model, options) => {
            captured = options;
            return project.call(DockLayoutAdapter, model, options)
        };
        DockProjectionReconciler.reconcileProjection = options => {
            preservedSeen = [...options.preserveItemIds];
            return reconcile.call(DockProjectionReconciler, options)
        };

        try {
            const result = workspace.applyDockZoneOperation({operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.5, 0.5]});

            workspace.onDockZoneDocumentChange(result.document, {operation: 'resizeSplit'});
            await workspace.refreshPromise
        } finally {
            DockLayoutAdapter.project                 = project;
            DockProjectionReconciler.reconcileProjection = reconcile
        }

        expect(workspace.beforeRefreshCalls.length).toBe(1);
        expect(workspace.beforeRefreshCalls[0].document.nodes['root-split'].sizes).toEqual([0.5, 0.5]);
        expect(workspace.beforeRefreshCalls[0].refreshOptions).toEqual({geometryOnly: true});
        expect(captured.autoHideRevealOnHover).toBe(true);
        expect(typeof captured.applyDockZoneOperation).toBe('function');
        expect(typeof captured.onDockZoneDocumentChange).toBe('function');
        expect(preservedSeen).toEqual(['terminal']);
        expect(workspace.items.length).toBe(2)
    });

    test('the projection mounts into the referenced dock host and leaves its siblings alone', async () => {
        workspace = Neo.create(HostedWorkspace, {dockModel: createDocument()});

        const
            host    = workspace.getReference('dock-host'),
            sibling = host.items[1];

        expect(workspace.getDockHost()).toBe(host);
        expect(tabsOf(host.items[0]).size).toBe(2);

        const result = workspace.applyDockZoneOperation({operation: 'moveItem', itemId: 'terminal', targetNodeId: 'editor-tabs', index: 1});

        workspace.onDockZoneDocumentChange(result.document);
        await workspace.refreshPromise;

        expect(host.items.length).toBe(2);
        expect(host.items[1]).toBe(sibling);
        expect(workspace.items.length).toBe(2);
        expect(tabsOf(host.items[0]).get('editor-tabs').getTabBar().sortZoneConfig.dockItemIds).toEqual(['editor', 'terminal'])
    });

    test('a cross-zone release over another zone commits exactly one semantic operation', async () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const commits = [],
              apply   = workspace.applyDockZoneOperation.bind(workspace);

        // two zones side by side: editor-tabs on the left, side-tabs on the right
        workspace.getDomRect = async ids => ids.map((id, index) => ({x: index * 500, y: 0, width: 500, height: 600}));
        workspace.applyDockZoneOperation = descriptor => {
            commits.push(descriptor);
            return apply(descriptor)
        };

        // `terminal` leaves side-tabs; the only other zone is editor-tabs, whose rect starts at x=0
        await workspace.onDockCrossZoneDrop({clientX: 250, clientY: 300, itemId: 'terminal', sourceNodeId: 'side-tabs'});
        await workspace.refreshPromise;

        expect(commits.length).toBe(1);
        expect(commits[0].itemId).toBe('terminal');
        expect(workspace.getDockZoneDocument().nodes['side-tabs'].items).toEqual(['preview']);

        // a release over no zone commits nothing
        await workspace.onDockCrossZoneDrop({clientX: 5000, clientY: 5000, itemId: 'preview', sourceNodeId: 'side-tabs'});

        expect(commits.length).toBe(1)
    });

    test('destroy tears down the producer and the refresh chain with the workspace', () => {
        workspace = Neo.create(PlainWorkspace, {dockModel: createDocument()});

        const producer = workspace.dockPreviewProducer;

        expect(producer).toBeTruthy();

        workspace.destroy();
        workspace = null;

        expect(producer.isDestroyed).toBe(true)
    })
});
