import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import Button         from '../../../../../../../src/button/Base.mjs';
import DemoAWorkspace from '../../../../../../../apps/agentos/childapps/dockdemo/view/DemoAWorkspace.mjs';

import {initialDocument} from '../../../../../../../apps/agentos/tour/demoADockChoreography.mjs';

/**
 * @summary Contract specs for the Demo-A workspace: the dock-holder contract, the
 * seam-driven commit loop, real-child tour-bar composition, and the pip progress strip.
 * The full choreography replay lives with the screenplay spec; the live gesture/visual
 * tier rides the reserved whitebox-e2e leaf.
 */
test.describe.serial('AgentOS.childapps.dockdemo.view.DemoAWorkspace', () => {
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
        expect(doc.nodes.root.zones.center).toBe('editor-tabs');
        expect(doc.nodes.root.zones.right).toBe('side-tabs')
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

    test('drop truth is the RELEASE point: a stale hover selection never commits', async () => {
        // Stage a drag session by hand: one hovered zone, the menu lit, the CENTER indicator
        // actively selected (the cached hover truth a wandering pointer leaves behind).
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        indicators.candidateSet = workspace.dockPreviewProducer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });
        indicators.updatePointer({x: 600, y: 300});

        expect(indicators.activeCandidate?.position).toBe('center'); // the stale selection is armed

        // the review falsifier: release far outside every indicator AND every zone —
        // the cached center candidate must NOT commit; nothing must commit
        const before = JSON.stringify(workspace.getDockZoneDocument());

        await workspace.onDockCrossZoneDrop({clientX: 999, clientY: 999, itemId: 'editor', sourceNodeId: 'editor-tabs'});

        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('a candidate built for another item never commits — release truth is item-bound', async () => {
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        // the menu was built for `editor`…
        indicators.candidateSet = workspace.dockPreviewProducer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });

        const before = JSON.stringify(workspace.getDockZoneDocument());

        // …but the release reports `preview` (a stale set across sessions): the candidate is
        // ignored; the fallback excludes the source zone (side-tabs) → nothing commits
        await workspace.onDockCrossZoneDrop({clientX: 600, clientY: 300, itemId: 'preview', sourceNodeId: 'side-tabs'});

        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('a release ON an indicator commits exactly that candidate (positive control)', async () => {
        const indicators = workspace.getReference('drop-indicators');
        const zones      = [{nodeId: 'side-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: null}];

        workspace.dragGeometry = Promise.resolve({hostRect: {x: 0, y: 0, width: 800, height: 600}, root: null, zones});
        indicators.hostRect    = {x: 0, y: 0, width: 800, height: 600};
        indicators.candidateSet = workspace.dockPreviewProducer.produceCandidates({
            pointer: {x: 600, y: 300}, zones, itemId: 'editor', sourceNodeId: 'editor-tabs'
        });

        // release exactly on the CENTER indicator (zone center): tab-into side-tabs
        await workspace.onDockCrossZoneDrop({clientX: 600, clientY: 300, itemId: 'editor', sourceNodeId: 'editor-tabs'});

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
            module    = await import('../../../../../../../apps/agentos/childapps/dockdemo/view/ClockPane.mjs'),
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
