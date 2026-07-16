import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'WorkstationDragAffordancesTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import Workspace      from '../../../../../apps/workstation/view/Workspace.mjs';

import {initialDocument} from '../../../../../apps/workstation/tour/denseWorkstation.mjs';

/**
 * @summary The affordance-pipeline witness for the workstation's cross-zone drag family.
 *
 * Drives the worker-side seams the browser journey cannot isolate: overlay OBJECT PERMANENCE
 * across a reducer-driven re-projection, the release-truth drop seam committing EXACTLY the
 * previewed descriptor through `previewToOperation`, cancel hygiene with zero model mutation,
 * and the late-measurement race guard (a superseded geometry promise can never resurrect its
 * gesture's overlays).
 *
 * `dragGeometry` is the designed injection seam — it memoizes a promise precisely so a gesture
 * measures once; the witness injects a synthetic measurement (viewport === host-local space)
 * and exercises the real producer, indicator menu, preview renderer, and dock reducer beneath it.
 */
test.describe.serial('Workstation drag affordances (the cross-zone pipeline witness)', () => {
    /**
     * Builds the synthetic one-gesture geometry over the REAL initial document's zones:
     * `scale-tabs` fills the left column, `heavy-tabs` the right; host at the viewport origin
     * so local space equals pointer space.
     * @returns {Object}
     */
    const syntheticGeometry = () => ({
        hostRect: {x: 0, y: 0, width: 1200, height: 800},
        root    : {nodeId: 'witness-root', rect: {x: 0, y: 0, width: 1200, height: 800}},
        zones   : [
            {nodeId: 'scale-tabs', rect: {x: 0,   y: 0, width: 600, height: 800}, orientation: 'horizontal'},
            {nodeId: 'heavy-tabs', rect: {x: 600, y: 0, width: 600, height: 800}, orientation: 'horizontal'}
        ]
    });

    /**
     * Injects the synthetic geometry the way `ensureDragGeometry` would have produced it:
     * the memoized promise plus the indicator layer's coordinate origin.
     * @param {Workstation.view.Workspace} workspace
     * @returns {Object} the injected geometry
     */
    const injectGeometry = workspace => {
        const geometry = syntheticGeometry();

        workspace.dragGeometry = Promise.resolve(geometry);
        workspace.getReference('drop-indicators').hostRect = geometry.hostRect;

        return geometry
    };

    test('overlays are persistent siblings: same instances across a reducer re-projection, cleared at its head', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                host       = workspace.getReference('dock-host'),
                preview    = workspace.getReference('dock-preview'),
                indicators = workspace.getReference('drop-indicators');

            // the composition contract: projection child at 0, the two overlays persistent behind it
            expect(host.items[1]).toBe(preview);
            expect(host.items[2]).toBe(indicators);

            injectGeometry(workspace);

            const result = workspace.applyDockZoneOperation({
                operation   : 'splitNode',
                itemId      : 'security',
                targetNodeId: 'scale-tabs',
                orientation : 'vertical',
                edge        : 'bottom',
                sizes       : [0.7, 0.3]
            });

            expect(result.errors).toEqual([]);
            workspace.onDockZoneDocumentChange(result.document);
            await workspace.refreshPromise;

            // object permanence: the exact instances survive, still mounted at their slots
            expect(workspace.getReference('dock-preview')).toBe(preview);
            expect(workspace.getReference('drop-indicators')).toBe(indicators);
            expect(host.items[1]).toBe(preview);
            expect(host.items[2]).toBe(indicators);
            expect(preview.isDestroyed).toBeFalsy();
            expect(indicators.isDestroyed).toBeFalsy();

            // re-projection hygiene: the refresh head retired the gesture's transient state
            expect(workspace.dragGeometry).toBe(null);
            expect(preview.dockPreview).toBe(null)
        } finally {
            workspace.destroy()
        }
    });

    test('move renders the menu + preview; the drop commits exactly the previewed descriptor (release truth)', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                preview    = workspace.getReference('dock-preview'),
                indicators = workspace.getReference('drop-indicators'),
                gesture    = {itemId: 'security', sourceNodeId: 'heavy-tabs'},
                // the scale-tabs zone center: the cross's CENTER indicator sits here → tab-into
                pointer    = {clientX: 300, clientY: 400};

            injectGeometry(workspace);
            const securityPane = workspace.resolvePane('security', initialDocument.items.security);

            await workspace.onDockCrossZoneDragMove({...pointer, ...gesture});

            expect(indicators.candidateSet?.zone?.nodeId).toBe('scale-tabs');
            expect(preview.dockPreview, 'the hovered center candidate feeds the renderer').toBeTruthy();
            expect(preview.dockPreview.placement.kind).toBe('tab-into');
            expect(preview.dockPreview.target.nodeId).toBe('scale-tabs');
            expect(preview.dockPreview.itemId).toBe('security');
            expect(preview.dockPreview.feedback.state).toBe('accepted');

            await workspace.onDockCrossZoneDrop({...pointer, ...gesture});
            await workspace.refreshPromise;

            // the committed document IS the previewed operation: tab-into scale-tabs
            expect(workspace.dockModel.nodes['scale-tabs'].items).toContain('security');
            expect(workspace.dockModel.nodes['heavy-tabs'].items).not.toContain('security');

            // the drop retired the gesture, and the pane survived the move with its identity
            expect(workspace.dragGeometry).toBe(null);
            expect(preview.dockPreview).toBe(null);
            expect(workspace.resolvePane('security', initialDocument.items.security)).toBe(securityPane);
            expect(securityPane.isDestroyed).toBeFalsy()
        } finally {
            workspace.destroy()
        }
    });

    test('cancel clears every affordance and commits nothing', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                preview = workspace.getReference('dock-preview'),
                gesture = {itemId: 'security', sourceNodeId: 'heavy-tabs'},
                before  = JSON.stringify(workspace.dockModel);

            injectGeometry(workspace);
            await workspace.onDockCrossZoneDragMove({clientX: 300, clientY: 400, ...gesture});
            expect(preview.dockPreview).toBeTruthy();

            workspace.onDockCrossZoneDragCancel(gesture);

            expect(workspace.dragGeometry).toBe(null);
            expect(preview.dockPreview).toBe(null);
            expect(JSON.stringify(workspace.dockModel), 'zero model mutation on cancel').toBe(before)
        } finally {
            workspace.destroy()
        }
    });

    test('a superseded geometry promise can never resurrect its overlays (the late-measurement guard)', async () => {
        const workspace = Neo.create(Workspace, {});

        try {
            const
                preview = workspace.getReference('dock-preview'),
                gesture = {itemId: 'security', sourceNodeId: 'heavy-tabs'};

            injectGeometry(workspace);

            // the move suspends at its geometry await; the gesture is cancelled underneath it —
            // the handler's promise-identity re-check must discard the resumed frame entirely
            const moveInFlight = workspace.onDockCrossZoneDragMove({clientX: 300, clientY: 400, ...gesture});

            workspace.clearDragAffordances();
            await moveInFlight;

            expect(preview.dockPreview, 'the late frame rendered nothing').toBe(null);
            expect(workspace.dragGeometry).toBe(null)
        } finally {
            workspace.destroy()
        }
    })
});
