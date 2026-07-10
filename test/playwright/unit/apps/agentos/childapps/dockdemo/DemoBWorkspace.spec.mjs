import {setup} from '../../../../../setup.mjs';

setup({
    appConfig: {
        name: 'DockDemoWorkspaceBTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import '../../../../../../../src/manager/Instance.mjs'; // defines Neo.get — the container child-add path resolves parents through it
import DemoBWorkspace from '../../../../../../../apps/agentos/childapps/dockdemo/view/DemoBWorkspace.mjs';

import {initialDocument} from '../../../../../../../apps/agentos/tour/demoBPerspectives.mjs';

/**
 * @summary Contract specs for the Demo-B workspace: the dock-holder contract, the live
 * perspective capture→load round-trip over the real store, pane-instance permanence across
 * re-projections, the pop-out bookkeeping guards, and the store-born switcher. The window
 * side of pop-out (real popup + reparent) is live-surface behavior; the e2e sibling leaf
 * owns it post-merge — these specs pin every seam the workspace itself decides.
 */
test.describe.serial('AgentOS.childapps.dockdemo.view.DemoBWorkspace', () => {
    let workspace;

    test.beforeEach(() => {
        workspace = Neo.create(DemoBWorkspace, {})
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        workspace = null
    });

    test('the holder contract: an own cloned stage, readable before any operation', () => {
        const doc = workspace.getDockZoneDocument();

        expect(doc).not.toBe(initialDocument);
        expect(doc.nodes.root.zones.center).toBe('workbench-tabs');
        expect(doc.nodes['side-tabs'].items).toEqual(['inspector', 'timeline', 'console'])
    });

    test('capture → load round-trip through the REAL store: one committed swap, honest names', () => {
        // capture the boot stage under a name
        const captured = workspace.capturePerspective('Focus');

        expect(captured.saved).toBe(true);
        expect(captured.errors).toEqual([]);

        // mutate the live document (a committed split)
        const result = workspace.applyDockZoneOperation({
            operation  : 'splitNode', itemId: 'timeline', targetNodeId: 'workbench-tabs',
            orientation: 'vertical', edge: 'bottom'
        });

        expect(result.errors).toEqual([]);
        workspace.dockModel = result.document;

        expect(workspace.getDockZoneDocument().nodes['split-workbench-tabs-0']).toBeTruthy();

        // loading the name restores the captured shape — the split is gone again
        const loaded = workspace.loadPerspectiveByName('Focus');

        expect(loaded.loaded).toBe(true);
        expect(workspace.getDockZoneDocument().nodes['split-workbench-tabs-0']).toBeUndefined();
        expect(workspace.getDockZoneDocument().nodes.root.zones.center).toBe('workbench-tabs')
    });

    test('loading an unknown perspective fails closed and mutates nothing', () => {
        const before = JSON.stringify(workspace.getDockZoneDocument());
        const loaded = workspace.loadPerspectiveByName('Nope');

        expect(loaded.loaded).toBe(false);
        expect(loaded.errors.join()).toContain('no perspective named');
        expect(JSON.stringify(workspace.getDockZoneDocument())).toBe(before)
    });

    test('pane instances are PERMANENT: the same objects survive a re-projection', async () => {
        const workbenchBefore = workspace.resolvePane('workbench', initialDocument.items.workbench);
        const inspectorBefore = workspace.resolvePane('inspector', initialDocument.items.inspector);

        await workspace.refreshDockWorkspace();

        expect(workspace.resolvePane('workbench', initialDocument.items.workbench)).toBe(workbenchBefore);
        expect(workspace.resolvePane('inspector', initialDocument.items.inspector)).toBe(inspectorBefore);
        expect(workbenchBefore.isDestroyed).toBeFalsy()
    });

    test('popOutPane guards: unknown, uncached, and double detach all fail closed', async () => {
        // unknown item: no cache entry, no home
        let result = await workspace.popOutPane('ghost');
        expect(result.detached).toBe(false);

        // materialize the pane cache, then detach legitimately would need window seams —
        // assert the DOUBLE-detach guard by staging the bookkeeping directly
        workspace.resolvePane('workbench', initialDocument.items.workbench);
        workspace.detachedPanes.workbench = {tabsNodeId: 'workbench-tabs', windowId: null};

        result = await workspace.popOutPane('workbench');
        expect(result.detached).toBe(false);
        expect(result.errors.join()).toContain('workbench')
    });

    test('reattachPane falls back to the first tabs node when the remembered home left the tree', async () => {
        // stage: pane cached, marked detached from a node that no longer exists,
        // and the document no longer contains the item in any tabs node
        workspace.resolvePane('workbench', initialDocument.items.workbench);

        const detached = workspace.applyDockZoneOperation({operation: 'detachItem', itemId: 'workbench'});
        expect(detached.errors).toEqual([]);
        workspace.dockModel = detached.document;

        workspace.detachedPanes.workbench = {tabsNodeId: 'vanished-tabs', windowId: null};

        const result = await workspace.reattachPane('workbench', {windowAlreadyClosed: true});

        expect(result.reattached).toBe(true);

        const doc  = workspace.getDockZoneDocument();
        const home = Object.keys(doc.nodes).find(id => doc.nodes[id].type === 'tabs' && doc.nodes[id].items.includes('workbench'));

        expect(home, 'the returning pane found a real tabs home').toBeTruthy()
    });

    test('the switcher is BORN from store lifecycle: buttons appear per capture', () => {
        const bar = workspace.getReference('switcher-bar');

        expect(bar.items.length).toBe(1); // the label only, pre-capture

        workspace.capturePerspective('Focus');
        workspace.capturePerspective('Review');

        const labels = bar.items.slice(1).map(item => item.text);

        expect(labels).toEqual(['Focus', 'Review'])
    });

    test('re-capturing a name is the update flow, never a collision dispute', () => {
        expect(workspace.capturePerspective('Focus').saved).toBe(true);

        // mutate + re-capture under the same name (the tour-rerun path)
        const result = workspace.applyDockZoneOperation({
            operation  : 'splitNode', itemId: 'console', targetNodeId: 'side-tabs',
            orientation: 'vertical', edge: 'bottom'
        });
        workspace.dockModel = result.document;

        const recaptured = workspace.capturePerspective('Focus');

        expect(recaptured.saved).toBe(true);
        expect(recaptured.errors).toEqual([]);

        // one button, not two — the store replaced, the switcher rebuilt
        const bar = workspace.getReference('switcher-bar');
        expect(bar.items.slice(1).map(item => item.text)).toEqual(['Focus'])
    });

    test('destroy tears down the runner, seam, store, and every cached pane', () => {
        const pane                                        = workspace.resolvePane('workbench', initialDocument.items.workbench);
        const {dockService, perspectiveStore, tourRunner} = workspace;

        workspace.destroy();

        expect(tourRunner.isDestroyed).toBeTruthy();
        expect(dockService.isDestroyed).toBeTruthy();
        expect(perspectiveStore.isDestroyed).toBeTruthy();
        expect(pane.isDestroyed).toBeTruthy();

        workspace = null
    })
});
