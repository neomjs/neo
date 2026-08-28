import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import '../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Button                   from '../../../../../../src/button/Base.mjs';
import ClockPane                from '../../../../../../examples/dashboard/choreography/ClockPane.mjs';
import DemoAWorkspace           from '../../../../../../examples/dashboard/choreography/DemoAWorkspace.mjs';
import DockProjectionReconciler from '../../../../../../src/dashboard/dock/projection/Reconciler.mjs';

import {initialDocument} from '../../../../../../examples/dashboard/choreography/demoADockChoreography.mjs';

/**
 * @summary Contract specs for the Demo-A workspace: the dock-holder contract, the
 * seam-driven commit loop, real-child tour-bar composition, and the pip progress strip.
 * The full choreography replay lives with the screenplay spec; the live gesture/visual
 * tier rides the reserved whitebox-e2e leaf.
 */
test.describe.serial('Neo.examples.dashboard.choreography.DemoAWorkspace', () => {
    let workspace;

    test.beforeEach(() => {
        workspace = Neo.create(DemoAWorkspace, {})
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('the holder contract: an own cloned stage, readable before any operation', () => {
        const doc = workspace.getDockZoneDocument();

        expect(doc).not.toBe(initialDocument);            // a clone, never the shared module constant
        expect(doc.nodes.root.zones.center.nodeId).toBe('editor-tabs');
        expect(doc.nodes.root.zones.right.nodeId).toBe('side-tabs')
    });

    test('applyDockZoneOperation is the pure reducer: fail-closed result, no self-mutation', () => {
        const result = workspace.applyDockZoneOperation({operation: 'setItemAutoHidden', itemId: 'ghost', autoHidden: true});

        expect(result.errors.join()).toContain('unknown item');
        // the committed document only advances through onDockZoneDocumentChange
        expect(workspace.getDockZoneDocument().items.ghost).toBeUndefined()
    });

    test('the seam loop commits: executeDockOperation → view-sync → advanced committed document', async () => {
        const result = await workspace.dockService.executeDockOperation({
            componentId: workspace.id,
            descriptor : {operation: 'setItemAutoHidden', itemId: 'preview', autoHidden: true}
        });

        expect(result.applied).toBe(true);
        expect(workspace.getDockZoneDocument().items.preview.autoHidden).toBe(true)
    });

    /**
     * The engine base class hands every resolver `(itemId, item)`; this workspace once took a bare
     * `componentRef`. Both spellings are one-argument-compatible at the call site, so a host that
     * kept the old signature after adopting the base class reads an ITEM ID as a COMPONENT REF and
     * nothing throws — the panes simply resolve to the wrong thing.
     *
     * These arms discriminate because the two values differ in this screenplay: item ids are the
     * lower-cased refs (`editor` for `Editor`). Under the old signature the editor comparison fails
     * against the id and the clock witness silently degrades to a generic pane, which is why the
     * assertion is on the resolved MODULE rather than on the call succeeding.
     */
    test('panes resolve from the item record, not from the id read as a component ref', () => {
        const
            editorItem = {componentRef: 'Editor', title: 'Editor', kind: 'panel'},
            logsItem   = {componentRef: 'Logs',   title: 'Logs',   kind: 'panel'};

        // The witness pane: keyed off `item.componentRef`, never off the id it is filed under.
        expect(workspace.resolvePane('editor', editorItem).module, 'the editor must resolve to the clock witness')
            .toBe(ClockPane);

        // The negative half — an id whose ref is absent must NOT masquerade as the editor.
        expect(workspace.resolvePane('editor', {componentRef: 'Logs'}).module, 'resolution follows the ref, not the id')
            .toBeUndefined();

        // Plain panes render the ref's own casing; reading arg0 would render the lower-cased id.
        expect(workspace.resolvePane('logs', logsItem).html).toBe('Logs')
    });

    test('the FLIP marker is stamped by the engine, keyed on the item id', () => {
        // `resolveProjectedPane` is the resolution the projection actually consumes. The marker is
        // the demo's own prefix, so the pane classes survive the migration byte-identical — and it
        // is now derived from the stable identity rather than hand-written per pane.
        const projected = workspace.resolveProjectedPane('editor', {componentRef: 'Editor'});

        expect(projected.cls).toContain('agentos-dockdemo-pane-editor');
        expect(projected.cls).toContain('agentos-dockdemo-clock-pane')
    });

    test('reconciliation preserves overlays and surviving chrome while a dissolved tabs node retires once', async () => {
        const
            host                = workspace.getReference('dock-host'),
            previewOverlay      = host.items[1],
            indicators          = host.items[2],
            tabsBefore          = DockProjectionReconciler.collectProjectedTabs(host.items[0]),
            editorTab           = tabsBefore.get('editor-tabs'),
            sideTab             = tabsBefore.get('side-tabs'),
            editorBody          = editorTab.getCardContainer(),
            editorBar           = editorTab.getTabBar(),
            sideBody            = sideTab.getCardContainer(),
            sideBar             = sideTab.getTabBar(),
            editorPane          = editorBody.items[0],
            previewPane         = sideBody.items[0],
            editorButton        = editorBar.items[0],
            previewButton       = sideBar.items[0],
            destroyCounts       = new Map(),
            originalResolvePane = workspace.resolvePane.bind(workspace);

        [
            sideTab,
            sideBar,
            sideBody,
            sideTab.getTabStrip(),
            sideBar.getPlugin('tab-overflow')
        ].filter(Boolean).forEach(component => {
            const destroy = component.destroy.bind(component);

            destroyCounts.set(component, 0);
            component.destroy = (...args) => {
                destroyCounts.set(component, destroyCounts.get(component) + 1);
                return destroy(...args)
            }
        });

        let resolverCalls = 0;

        workspace.resolvePane = (...args) => {
            resolverCalls++;
            return originalResolvePane(...args)
        };

        const result = workspace.applyDockZoneOperation({
            operation : 'addTab',
            itemId    : 'preview',
            tabsNodeId: 'editor-tabs'
        });

        expect(result.errors).toEqual([]);
        workspace.onDockZoneDocumentChange(result.document);
        await workspace.refreshPromise;

        const
            tabsAfter = DockProjectionReconciler.collectProjectedTabs(host.items[0]),
            itemIds   = editorBar.sortZoneConfig.dockItemIds;

        expect(host.items[1]).toBe(previewOverlay);
        expect(host.items[2]).toBe(indicators);
        expect(tabsAfter.get('editor-tabs')).toBe(editorTab);
        expect(tabsAfter.has('side-tabs')).toBe(false);
        expect(editorBody.items[itemIds.indexOf('editor')]).toBe(editorPane);
        expect(editorBody.items[itemIds.indexOf('preview')]).toBe(previewPane);
        expect(editorBar.items[itemIds.indexOf('editor')]).toBe(editorButton);
        expect(editorBar.items[itemIds.indexOf('preview')]).toBe(previewButton);
        expect(resolverCalls).toBe(0);
        destroyCounts.forEach(count => expect(count).toBe(1))
    });

    test('drop truth is the RELEASE point: a stale hover selection never commits', async () => {
        // Stage a drag session by hand: one hovered zone, the menu lit, the CENTER indicator
        // actively selected (the cached hover truth a wandering pointer leaves behind).
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragAffordances.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        indicators.candidateSet = workspace.dragAffordances.producer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });
        indicators.updatePointer({x: 600, y: 300});

        expect(indicators.activeCandidate?.position).toBe('center'); // the stale selection is armed

        // the review falsifier: release far outside every indicator AND every zone —
        // the cached center candidate must NOT commit; nothing must commit
        const before = JSON.stringify(workspace.getDockZoneDocument());

        await workspace.dragAffordances.onDrop({clientX: 999, clientY: 999, itemId: 'editor', sourceNodeId: 'editor-tabs'});

        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('a candidate built for another item never commits — release truth is item-bound', async () => {
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragAffordances.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        // the menu was built for `editor`…
        indicators.candidateSet = workspace.dragAffordances.producer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });

        const before = JSON.stringify(workspace.getDockZoneDocument());

        // …but the release reports `preview` (a stale set across sessions): the candidate is
        // ignored; the fallback excludes the source zone (side-tabs) → nothing commits
        await workspace.dragAffordances.onDrop({clientX: 600, clientY: 300, itemId: 'preview', sourceNodeId: 'side-tabs'});

        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('the drag-cancel seam invalidates geometry and clears both affordance layers', () => {
        const
            indicators = workspace.getReference('drop-indicators'),
            preview    = workspace.getReference('dock-preview');

        workspace.dragAffordances.dragGeometry = Promise.resolve({hostRect: {}, zones: []});
        indicators.candidateSet = {candidates: []};
        preview.dockPreview     = {itemId: 'editor'};

        workspace.dragAffordances.onDragCancel({itemId: 'editor', sourceNodeId: 'editor-tabs'});

        expect(workspace.dragAffordances.dragGeometry).toBeNull();
        expect(indicators.candidateSet).toBeNull();
        expect(preview.dockPreview).toBeNull()
    });

    test('a release ON an indicator commits exactly that candidate (positive control)', async () => {
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragAffordances.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        indicators.candidateSet = workspace.dragAffordances.producer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });

        // release exactly on the CENTER indicator (zone center): tab-into side-tabs
        await workspace.dragAffordances.onDrop({clientX: 600, clientY: 300, itemId: 'editor', sourceNodeId: 'editor-tabs'});

        const doc = workspace.getDockZoneDocument();

        expect(doc.nodes['side-tabs'].items).toContain('editor');   // the tab-merge landed
        expect(doc.nodes['side-tabs'].activeItemId).toBe('editor')
    });

    test('the tour bar composes real button children riding the handler contract', () => {
        const playButton = workspace.getReference('tour-play');

        expect(playButton instanceof Button).toBe(true);
        expect(typeof playButton.handler).toBe('function')
    });

    test('the pip strip: one pip per screenplay step, progress lights and resets', () => {
        const
            pips  = workspace.getReference('tour-pips'),
            total = DemoAWorkspace.totalBeats().length,
            done  = () => pips.vdom.cn.filter(pip => pip.cls.includes('agentos-dockdemo-pip-done')).length;

        expect(pips.vdom.cn).toHaveLength(total);
        expect(done()).toBe(0);

        workspace.setPipProgress(3);
        expect(done()).toBe(3);

        workspace.setPipProgress(0);
        expect(done()).toBe(0)
    });

    test('a second play-click mid-run is a true no-op — the active stage survives', async () => {
        const firstRun = workspace.startTour();      // demo mode: pause-paced, long-running

        await new Promise(resolve => setTimeout(resolve, 50));

        const liveDoc = workspace.dockModel;

        await workspace.startTour();                 // must return before touching any stage state

        expect(workspace.tourRunner.running).toBe(true);
        expect(workspace.dockModel).toBe(liveDoc);   // reference identity: no clone-reset happened
        expect(workspace.getReference('tour-caption').html).toContain('already running');

        workspace.destroy();                         // ends the in-flight tour quietly
        workspace = null;

        const result = await firstRun;

        expect(result).toBeUndefined()               // startTour resolves void; the runner's partial log died with it
    });

    test('destroy tears down the runner and the seam with the workspace', () => {
        const {dockService, tourRunner} = workspace;

        workspace.destroy();
        workspace = null;

        expect(tourRunner.isDestroyed).toBe(true);
        expect(dockService.isDestroyed).toBe(true)
    });

    test('ClockPane: renders wall time on demand, mount-toggles and destroys without leaking', async () => {
        const
            module    = await import('../../../../../../examples/dashboard/choreography/ClockPane.mjs'),
            ClockPane = module.default,
            clock     = Neo.create(ClockPane, {});

        expect(clock.vdom.cn[1].html).toBe('—');

        clock.updateTime();
        expect(clock.vdom.cn[1].html).toMatch(/^\d{2}:\d{2}:\d{2}$/);

        // the tick interval follows the mount lifecycle; toggling must never throw or leak
        clock.mounted = true;
        clock.mounted = false;
        clock.mounted = true;

        clock.destroy();
        expect(clock.isDestroyed).toBe(true)
    });
});
