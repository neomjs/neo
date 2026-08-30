import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockDragAffordancesTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import DockDragAffordances from '../../../../src/dashboard/dock/interaction/DragAffordances.mjs';
import DockDropIndicators  from '../../../../src/dashboard/dock/interaction/DropIndicators.mjs';
import DockPreview         from '../../../../src/dashboard/dock/interaction/Preview.mjs';
import Operations          from '../../../../src/dashboard/dock/model/Operations.mjs';

/**
 * @summary The shared gesture controller's discrimination and generation witnesses.
 *
 * Four truths the superseded per-app copies never pinned:
 * 1. RELEASE TRUTH — the drop commits what sits under the RELEASE point, never a cached
 *    hover selection (hover zone A, release over zone B ⇒ exactly B's descriptor commits;
 *    release over nothing ⇒ nothing commits).
 * 2. The DROP generation guard — a gesture cancelled while its geometry await is in flight
 *    commits NOTHING (the prototype-proven drop-after-cancel defect, pinned dead).
 * 3. The MOVE generation guard — a superseded geometry promise renders nothing.
 * 4. OWNERSHIP — the producer is created and destroyed WITH the controller.
 *
 * The geometry tests drive the PRODUCTION `ensureGeometry` path through a stubbed host
 * transport (real measure → map → self-heal code), not only the injected-promise seam.
 */
test.describe('Neo.dashboard.dock.interaction.DragAffordances', () => {
    /**
     * A real two-zone document: `left-tabs` (alpha, beta) | `right-tabs` (gamma).
     * @returns {Object}
     */
    const makeDocument = () => ({
        schema: 'neo.dock.zone.v1',
        root  : 'split-main',
        items : {
            alpha: {componentRef: 'ref-alpha', title: 'Alpha', kind: 'pane'},
            beta : {componentRef: 'ref-beta',  title: 'Beta',  kind: 'pane'},
            gamma: {componentRef: 'ref-gamma', title: 'Gamma', kind: 'pane'}
        },
        nodes: {
            'split-main': {type: 'split', orientation: 'horizontal', children: ['left-tabs', 'right-tabs'], sizes: [0.5, 0.5]},
            'left-tabs' : {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'},
            'right-tabs': {type: 'tabs', items: ['gamma'], activeItemId: 'gamma'}
        }
    });

    // viewport-space geometry: host at origin; left zone 0-400, right zone 400-800
    const GEOMETRY = () => ({
        hostRect: {x: 0, y: 0, width: 800, height: 600},
        root    : {nodeId: 'split-main', rect: {x: 0, y: 0, width: 800, height: 600}},
        zones   : [
            {nodeId: 'left-tabs',  rect: {x: 0,   y: 0, width: 400, height: 600}, orientation: 'horizontal'},
            {nodeId: 'right-tabs', rect: {x: 400, y: 0, width: 400, height: 600}, orientation: 'horizontal'}
        ]
    });

    /**
     * Composes a controller over REAL overlay instances and a reducer-container owner.
     * @returns {Object} {controller, owner, indicators, preview, committed}
     */
    const compose = () => {
        const
            committed  = [],
            indicators = Neo.create(DockDropIndicators),
            preview    = Neo.create(DockPreview),
            owner      = {
                dockModel: makeDocument(),
                applyDockZoneOperation(descriptor) {
                    return Operations.applyOperation(this.dockModel, descriptor)
                },
                onDockZoneDocumentChange(document) {
                    this.dockModel = document;
                    committed.push(document)
                }
            },
            controller = Neo.create(DockDragAffordances, {indicators, owner, preview});

        return {committed, controller, indicators, owner, preview}
    };

    const destroyAll = ({controller, indicators, preview}) => {
        controller.destroy();
        indicators.destroy();
        preview.destroy()
    };

    test('release truth: hover zone A, release over zone B — exactly B\'s descriptor commits', async () => {
        const rig                            = compose(),
              {controller, committed, owner} = rig;

        controller.dragGeometry = Promise.resolve(GEOMETRY());
        rig.indicators.hostRect = GEOMETRY().hostRect;

        // hover the LEFT zone center: candidate set + preview build for left-tabs
        await controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});
        expect(rig.indicators.candidateSet?.zone?.nodeId).toBe('left-tabs');
        expect(rig.preview.dockPreview?.target?.nodeId).toBe('left-tabs');

        // release far RIGHT — outside the left zone's indicator cluster, inside right-tabs...
        // gamma's own source zone is excluded from pointer inference, so use beta as a probe:
        destroyAll(rig);

        const rig2 = compose();

        rig2.controller.dragGeometry = Promise.resolve(GEOMETRY());
        rig2.indicators.hostRect = GEOMETRY().hostRect;

        // hover LEFT (build the left candidate set), then release over RIGHT for item alpha
        await rig2.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});
        expect(rig2.indicators.candidateSet?.zone?.nodeId).toBe('left-tabs');

        // release at the RIGHT zone's center — the tab-into placement for right-tabs
        await rig2.controller.onDrop({clientX: 600, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});

        // the RELEASE point (right zone) won — never the cached left-side hover
        expect(rig2.committed).toHaveLength(1);
        const doc = rig2.owner.dockModel;
        expect(doc.nodes['right-tabs'].items).toContain('alpha');
        expect(doc.nodes['left-tabs'].items).not.toContain('alpha');

        // the gesture retired
        expect(rig2.controller.dragGeometry).toBe(null);
        expect(rig2.preview.dockPreview).toBe(null);
        destroyAll(rig2)
    });

    test('a release over nothing commits nothing — stale hover never wins', async () => {
        const rig    = compose(),
              before = JSON.stringify(rig.owner.dockModel);

        rig.controller.dragGeometry = Promise.resolve(GEOMETRY());
        rig.indicators.hostRect = GEOMETRY().hostRect;

        await rig.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});
        expect(rig.preview.dockPreview).toBeTruthy();

        // release OUTSIDE every zone rect (below the host) — no indicator, no zone inference
        await rig.controller.onDrop({clientX: 900, clientY: 900, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        expect(rig.committed).toHaveLength(0);
        expect(JSON.stringify(rig.owner.dockModel), 'zero model mutation').toBe(before);
        destroyAll(rig)
    });

    test('the drop generation guard: a gesture cancelled mid-await commits nothing', async () => {
        const rig    = compose(),
              before = JSON.stringify(rig.owner.dockModel);

        let resolveGeometry;
        rig.controller.dragGeometry = new Promise(resolve => { resolveGeometry = resolve });
        rig.indicators.hostRect = GEOMETRY().hostRect;

        // the drop suspends at its geometry await; the gesture is cancelled underneath it
        const dropInFlight = rig.controller.onDrop({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        rig.controller.clear();
        resolveGeometry(GEOMETRY());
        await dropInFlight;

        // the prototype-proven defect, pinned dead: the retired gesture emitted NOTHING
        expect(rig.committed).toHaveLength(0);
        expect(JSON.stringify(rig.owner.dockModel)).toBe(before);
        destroyAll(rig)
    });

    test('the move generation guard: a superseded geometry promise renders nothing', async () => {
        const rig = compose();

        let resolveGeometry;
        rig.controller.dragGeometry = new Promise(resolve => { resolveGeometry = resolve });

        const moveInFlight = rig.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        rig.controller.clear();
        resolveGeometry(GEOMETRY());
        await moveInFlight;

        expect(rig.preview.dockPreview).toBe(null);
        expect(rig.indicators.candidateSet ?? null).toBe(null);
        destroyAll(rig)
    });

    test('an edge-zone root with a descriptor-shaped center still offers the root edge chips', async () => {
        // The regression fingerprint: `zones.center` is a DESCRIPTOR ({nodeId}) in the current
        // schema, and passing it raw where the producer requires a node-id string trips the
        // fail-closed guard — the candidate set arrives with root: null and every container
        // edge chip stays off, silently, for every edge-zone-rooted workspace.
        const rig   = compose(),
              rects = {
                  host : {x: 0, y: 0, width: 800, height: 600},
                  left : {x: 0, y: 0, width: 400, height: 600},
                  right: {x: 400, y: 0, width: 400, height: 600}
              };

        rig.owner.dockModel = {
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : rig.owner.dockModel.items,
            nodes : {
                root        : {type: 'edge-zone', zones: {center: {nodeId: 'split-main'}, bottom: {nodeId: 'left-tabs', extent: 0.25, resizable: true}}},
                'split-main': {type: 'split', orientation: 'horizontal', children: ['left-tabs', 'right-tabs'], sizes: [0.5, 0.5]},
                'left-tabs' : {type: 'tabs', items: ['alpha', 'beta'], activeItemId: 'alpha'},
                'right-tabs': {type: 'tabs', items: ['gamma'], activeItemId: 'gamma'}
            }
        };

        rig.controller.host = {
            id: 'host-1',
            down(selector) {
                return {'left-tabs': {id: 'zone-left'}, 'right-tabs': {id: 'zone-right'}}[selector.dockNodeId] ?? null
            },
            getDomRect: async () => [rects.host, rects.left, rects.right]
        };

        const geometry = await rig.controller.ensureGeometry();

        // the unwrapped STRING is what the producer's id guard accepts
        expect(geometry.root.nodeId).toBe('split-main');

        await rig.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        expect(rig.indicators.candidateSet?.zone?.nodeId).toBe('left-tabs');
        expect(rig.indicators.candidateSet?.root, 'the root chip family must be offered').toBeTruthy();
        expect(rig.indicators.candidateSet.root.nodeId).toBe('split-main');
        expect(rig.indicators.candidateSet.root.chips.map(chip => chip.edge)).toEqual(['top', 'right', 'bottom', 'left']);

        destroyAll(rig)
    });

    test('the production measurement path: measure, map, and the degenerate self-heal', async () => {
        const rig   = compose(),
              rects = {
                  host : {x: 10, y: 20, width: 800, height: 600},
                  left : {x: 10, y: 20, width: 400, height: 600},
                  right: {x: 410, y: 20, width: 400, height: 600}
              };

        // a stubbed host transport drives the REAL ensureGeometry code (measure → map → cache)
        rig.controller.host = {
            id: 'host-1',
            down(selector) {
                return {'left-tabs': {id: 'zone-left'}, 'right-tabs': {id: 'zone-right'}}[selector.dockNodeId] ?? null
            },
            getDomRect: async ids => [rects.host, rects.left, rects.right]
        };

        const geometry = await rig.controller.ensureGeometry();

        expect(geometry.hostRect).toEqual(rects.host);
        expect(geometry.root).toEqual({nodeId: 'split-main', rect: rects.host});
        expect(geometry.zones.map(zone => zone.nodeId)).toEqual(['left-tabs', 'right-tabs']);
        expect(geometry.zones[0].orientation).toBe('horizontal');
        expect(rig.indicators.hostRect).toEqual(rects.host);

        // memoization: the same promise instance is the gesture's generation token
        expect(rig.controller.ensureGeometry()).toBe(rig.controller.dragGeometry);

        // the degenerate self-heal: an unmeasurable frame must not latch for the gesture
        rig.controller.clear();
        rig.controller.host.getDomRect = async ids => [null, null, null];

        expect(await rig.controller.ensureGeometry()).toBe(null);
        expect(rig.controller.dragGeometry, 'degenerate measure uncaches — the next frame re-measures').toBe(null);

        // zero-AREA rects are truthy but equally unmeasurable (a node measured before its
        // layout settles reports 0×0 and can never contain a pointer) — the flagship-boot
        // frame shape, verbatim: collapsed host, every zone at zero area
        rig.controller.clear();
        rig.controller.host.getDomRect = async ids => [
            {x: 0, y: 119, width: 24, height: 24},
            {x: 220, y: 131, width: 0, height: 0},
            {x: 226, y: 131, width: 180, height: 0}
        ];

        expect(await rig.controller.ensureGeometry(), 'zero-area zones = degenerate').toBe(null);
        expect(rig.controller.dragGeometry, 'zero-area frame uncaches — the session self-heals once layout lands').toBe(null);
        destroyAll(rig)
    });

    test('ownership: the producer lives and dies with the controller', () => {
        const rig        = compose(),
              {producer} = rig.controller;

        expect(producer).toBeTruthy();
        expect(producer.isDestroyed).toBeFalsy();

        rig.controller.destroy();

        expect(producer.isDestroyed).toBeTruthy();
        // core.Base#destroy wipes instance fields — falsy is the contract, not literal null
        expect(rig.controller.producer).toBeFalsy();
        expect(rig.controller.owner).toBeFalsy();

        rig.indicators.destroy();
        rig.preview.destroy()
    });

    /**
     * The root-edge border strip, driven through the production gesture rather than the producer.
     *
     * `produce()` receiving a root is what turns a pointer near the container border into a ROOT edge
     * placement instead of the zone under it. The producer's own specs prove that mapping; they say
     * nothing about whether the controller actually PASSES the root, and it must pass it on two
     * independent call sites — the hover path and the release path. A producer-only witness leaves
     * both wires free to be deleted.
     *
     * The strip is 24px inward from the root rect, so `clientY: 10` sits inside it while remaining
     * deep inside `left-tabs` — which is the whole point: without the root argument, zone inference
     * owns that pointer and the assertions below describe a different target.
     */
    test.describe('the root-edge strip is wired on both gesture paths', () => {
        /** Captures the descriptor the owner is asked to apply, without disturbing the commit. */
        const withDescriptorCapture = rig => {
            const seen     = [],
                  original = rig.owner.applyDockZoneOperation.bind(rig.owner);

            rig.owner.applyDockZoneOperation = function (descriptor) {
                seen.push(descriptor);
                return original(descriptor)
            };

            return seen
        };

        test('hover inside the strip previews the ROOT edge, not the zone beneath it', async () => {
            const rig = compose();

            rig.controller.dragGeometry = Promise.resolve(GEOMETRY());
            rig.indicators.hostRect     = GEOMETRY().hostRect;

            await rig.controller.onDragMove({clientX: 200, clientY: 10, itemId: 'gamma', sourceNodeId: 'right-tabs'});

            const {dockPreview} = rig.preview;

            // Control: the same x deeper into the surface must resolve the ZONE, or this test would
            // pass on any pointer and prove nothing about the strip.
            expect(dockPreview?.target?.nodeId, 'the strip must resolve the ROOT').toBe('split-main');
            expect(dockPreview?.placement?.kind).toBe('edge-top');

            await rig.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});
            expect(rig.preview.dockPreview?.target?.nodeId, 'away from the border the zone owns it').toBe('left-tabs');

            destroyAll(rig)
        });

        test('release inside the strip commits against the ROOT target', async () => {
            const rig         = compose(),
                  descriptors = withDescriptorCapture(rig);

            rig.controller.dragGeometry = Promise.resolve(GEOMETRY());
            rig.indicators.hostRect     = GEOMETRY().hostRect;

            await rig.controller.onDragMove({clientX: 200, clientY: 10, itemId: 'gamma', sourceNodeId: 'right-tabs'});
            await rig.controller.onDrop    ({clientX: 200, clientY: 10, itemId: 'gamma', sourceNodeId: 'right-tabs'});

            expect(descriptors).toHaveLength(1);

            // The release path passes its own root; the descriptor is what proves it arrived, since a
            // committed document could reach a similar shape by another route.
            expect(descriptors[0].targetNodeId, 'the commit must target the ROOT').toBe('split-main');
            expect(rig.committed).toHaveLength(1);

            destroyAll(rig)
        })
    })
});
