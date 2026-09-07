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
import DockWorkspace       from '../../../../src/dashboard/dock/Workspace.mjs';
import Operations          from '../../../../src/dashboard/dock/model/Operations.mjs';
import WindowManager       from '../../../../src/manager/Window.mjs';

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
                getDockHost() {
                    return controller.host
                },
                // BORROWED, never reimplemented: the rig stands in for a dock owner, so the root
                // chip's boundary has to be resolved by the production seam. A stub that computed
                // its own answer could agree with the assertion while the shipped one disagrees.
                resolveDockableRoot: DockWorkspace.prototype.resolveDockableRoot,
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

        controller.dragGeometry = Promise.resolve(controller.geometry = GEOMETRY());
        rig.indicators.hostRect = GEOMETRY().hostRect;

        // hover the LEFT zone center: candidate set + preview build for left-tabs
        await controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});
        expect(rig.indicators.candidateSet?.zone?.nodeId).toBe('left-tabs');
        expect(rig.preview.dockPreview?.target?.nodeId).toBe('left-tabs');

        // release far RIGHT — outside the left zone's indicator cluster, inside right-tabs...
        // gamma's own source zone is excluded from pointer inference, so use beta as a probe:
        destroyAll(rig);

        const rig2 = compose();

        rig2.controller.dragGeometry = Promise.resolve(rig2.controller.geometry = GEOMETRY());
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

        rig.controller.dragGeometry = Promise.resolve(rig.controller.geometry = GEOMETRY());
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

    test('an edge-zone root offers the root edge chips against the boundary its owner declares', async () => {
        // Two regressions share this fixture. The older one: `zones.center` is a DESCRIPTOR
        // ({nodeId}), and passing it raw where the producer requires an id string tripped the
        // fail-closed guard — root: null, every container edge chip silently off. The newer one is
        // why the id is no longer read from zone shape at all: retargeting to the CENTER while the
        // chip is still drawn from the HOST rect promises the full width and delivers a corner.
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

        // The pairing invariant: the chip's nodeId names the node its rect covers. The rect is the
        // whole host, so the id must be the whole arrangement — not the center inside it.
        expect(geometry.root).toEqual({nodeId: 'root', rect: rects.host});

        await rig.controller.onDragMove({clientX: 200, clientY: 300, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        expect(rig.indicators.candidateSet?.zone?.nodeId).toBe('left-tabs');
        expect(rig.indicators.candidateSet?.root, 'the root chip family must be offered').toBeTruthy();
        expect(rig.indicators.candidateSet.root.nodeId).toBe('root');
        expect(rig.indicators.candidateSet.root.chips.map(chip => chip.edge)).toEqual(['top', 'right', 'bottom', 'left']);

        destroyAll(rig)
    });

    test('a bottom root-edge drop on an edge-zone root spans the whole arrangement', async () => {
        // The operator-reported defect, at the seam that produced it: the bottom chip previewed the
        // full window width and the drop landed a pane the width of the CENTER, because the side
        // bands were never inside the node being wrapped. Asserted on the committed TREE — a
        // rendered width could be reached by another route, a direct root child could not.
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

        // 592 sits in the 24px root strip above the host's bottom edge; the whole gesture runs the
        // production hover and release paths, so nothing here can inject the target by hand.
        await rig.controller.onDragMove({clientX: 400, clientY: 592, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        expect(rig.preview.dockPreview?.placement?.kind).toBe('edge-bottom');
        expect(rig.preview.dockPreview?.target?.nodeId, 'the preview must aim at the whole arrangement').toBe('root');

        await rig.controller.onDrop({clientX: 400, clientY: 592, itemId: 'gamma', sourceNodeId: 'right-tabs'});

        expect(rig.committed).toHaveLength(1);

        const doc      = rig.committed[0],
              children = doc.nodes[doc.root]?.children ?? [],
              dropped  = children.find(childId => doc.nodes[childId]?.items?.includes('gamma'));

        expect(doc.root, 'the drop wraps the arrangement in a NEW root').not.toBe('root');
        expect(doc.nodes[doc.root].orientation).toBe('vertical');
        // Both halves of the corner question in one line: the edge-zone (with its side bands) and
        // the dropped pane are SIBLINGS, so the pane runs the full width beneath everything.
        expect(children).toEqual(['root', dropped]);
        expect(doc.nodes.root.type, 'the bands travel inside the wrapped node').toBe('edge-zone');

        destroyAll(rig)
    });

    test('two sequential root-edge drops: the last one takes the corner', async () => {
        // The operator's stated semantics, and the reason the boundary must be resolved LIVE:
        // the bottom drop rewrites `document.root`, so the following right drop has to wrap what
        // that produced. A captured root id would re-wrap the inner node and leave the bottom pane
        // OUTSIDE the new right column — the corner rule silently inverted one gesture later.
        const rig   = compose(),
              rects = {
                  host : {x: 0, y: 0, width: 800, height: 600},
                  left : {x: 0,   y: 0,   width: 400, height: 450},
                  right: {x: 400, y: 0,   width: 400, height: 450},
                  band : {x: 0,   y: 450, width: 800, height: 150}
              };

        // An EDGE-ZONE root with an occupied band — the flagship's shape, and the only one where
        // this test can fail: with a plain split root both the old and new resolution agree. The
        // third left pane keeps either drag from emptying its source, since a node the drag empties
        // collapses away and would move the tree for a reason unrelated to corners.
        rig.owner.dockModel = {
            schema: 'neo.dock.zone.v1',
            root  : 'root',
            items : {
                ...rig.owner.dockModel.items,
                delta  : {componentRef: 'ref-delta',   title: 'Delta',   kind: 'pane'},
                epsilon: {componentRef: 'ref-epsilon', title: 'Epsilon', kind: 'pane'}
            },
            nodes: {
                root        : {type: 'edge-zone', zones: {center: {nodeId: 'split-main'}, bottom: {nodeId: 'band-tabs', extent: 0.25, resizable: true}}},
                'split-main': {type: 'split', orientation: 'horizontal', children: ['left-tabs', 'right-tabs'], sizes: [0.5, 0.5]},
                'left-tabs' : {type: 'tabs', items: ['alpha', 'beta', 'delta'], activeItemId: 'alpha'},
                'right-tabs': {type: 'tabs', items: ['gamma'], activeItemId: 'gamma'},
                'band-tabs' : {type: 'tabs', items: ['epsilon'], activeItemId: 'epsilon'}
            }
        };

        rig.controller.host = {
            id: 'host-1',
            down(selector) {
                return {'left-tabs': {id: 'zone-left'}, 'right-tabs': {id: 'zone-right'}, 'band-tabs': {id: 'zone-band'}}[selector.dockNodeId] ?? null
            },
            getDomRect: async () => [rects.host, rects.left, rects.right, rects.band]
        };

        const originalRoot = rig.owner.dockModel.root;

        // 1. bottom: 592 is inside the 24px strip above the host's bottom edge
        await rig.controller.onDragMove({clientX: 400, clientY: 592, itemId: 'alpha', sourceNodeId: 'left-tabs'});
        await rig.controller.onDrop    ({clientX: 400, clientY: 592, itemId: 'alpha', sourceNodeId: 'left-tabs'});

        const afterBottom = rig.owner.dockModel,
              bottomPane  = afterBottom.nodes[afterBottom.root].children
                  .find(childId => afterBottom.nodes[childId]?.items?.includes('alpha'));

        expect(afterBottom.nodes[afterBottom.root]).toMatchObject({type: 'split', orientation: 'vertical'});
        expect(afterBottom.nodes[afterBottom.root].children).toEqual([originalRoot, bottomPane]);

        // 2. right: 792 is inside the strip left of the host's right edge
        await rig.controller.onDragMove({clientX: 792, clientY: 300, itemId: 'beta', sourceNodeId: 'left-tabs'});
        await rig.controller.onDrop    ({clientX: 792, clientY: 300, itemId: 'beta', sourceNodeId: 'left-tabs'});

        const afterRight = rig.owner.dockModel,
              rightPane  = afterRight.nodes[afterRight.root].children
                  .find(childId => afterRight.nodes[childId]?.items?.includes('beta'));

        expect(afterRight.nodes[afterRight.root]).toMatchObject({type: 'split', orientation: 'horizontal'});
        // The right pane's sibling is the WHOLE bottom arrangement, so the right column runs the
        // full height and the bottom pane — now one level deeper — gives up the corner.
        expect(afterRight.nodes[afterRight.root].children).toEqual([afterBottom.root, rightPane]);
        expect(afterRight.nodes[afterBottom.root].children).toContain(bottomPane);

        destroyAll(rig)
    });

    test('a sole-pane root-edge drop is refused before it can strand an empty half', async () => {
        // `normalizeTree` deletes emptied tabs and splits but RETAINS an emptied edge-zone on
        // purpose — it stays a re-attachment anchor. So wrapping an edge-zone root whose only
        // content is the item being dragged would leave an empty sibling in the committed tree
        // forever. The refusal lands at preview time, so the affordance never promises it either.
        const rig   = compose(),
              rects = {
                  host  : {x: 0, y: 0, width: 800, height: 600},
                  center: {x: 0, y: 0, width: 800, height: 600}
              };

        rig.owner.dockModel = {
            schema: 'neo.dock.zone.v1',
            root  : 'shell',
            items : {alpha: rig.owner.dockModel.items.alpha},
            nodes : {
                shell        : {type: 'edge-zone', zones: {center: {nodeId: 'center-tabs'}}},
                'center-tabs': {type: 'tabs', items: ['alpha'], activeItemId: 'alpha'}
            }
        };

        rig.controller.host = {
            id: 'host-1',
            down(selector) {
                return selector.dockNodeId === 'center-tabs' ? {id: 'zone-center'} : null
            },
            getDomRect: async () => [rects.host, rects.center]
        };

        await rig.controller.onDragMove({clientX: 400, clientY: 592, itemId: 'alpha', sourceNodeId: 'center-tabs'});
        await rig.controller.onDrop    ({clientX: 400, clientY: 592, itemId: 'alpha', sourceNodeId: 'center-tabs'});

        const doc = rig.owner.dockModel,
              // every node that can hold content, and whether it actually holds any
              stranded = Object.entries(doc.nodes).filter(([, node]) =>
                  (node.type === 'tabs' && !node.items?.length) ||
                  (node.type === 'edge-zone' && !Object.values(node.zones || {}).length));

        expect(rig.preview.dockPreview, 'the affordance never promised the drop').toBe(null);
        expect(rig.committed, 'and nothing committed').toHaveLength(0);

        // The MENU tier is guarded too, not just pointer inference: an indicator hit outranks
        // inference, so a root chip selected from the menu would otherwise light up and then be
        // refused on release — the promise/commit mismatch this seam exists to end, in miniature.
        rig.controller.indicators.updatePointer = () => ({
            preview: {itemId: 'alpha', placement: {kind: 'edge-bottom'}, target: {nodeId: 'shell'}}
        });

        await rig.controller.onDragMove({clientX: 400, clientY: 300, itemId: 'alpha', sourceNodeId: 'center-tabs'});

        expect(rig.preview.dockPreview, 'a menu-selected root chip is refused as well').toBe(null);
        expect(stranded, `no node may be left empty — ${JSON.stringify(doc.nodes)}`).toEqual([]);
        expect(doc.nodes.shell.zones.center.nodeId, 'the shell keeps its content').toBe('center-tabs');

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

    test('a resize replaces the measurement once and a late old frame cannot overwrite it', async () => {
        const rig = compose(), originalGet = WindowManager.get, requests = [];
        let width = 800, height = 600;
        WindowManager.get = () => ({innerRect: {width, height}});
        rig.controller.host = {
            id: 'resizing-host', windowId: 'resizing-window',
            down: ({dockNodeId}) => ({id: dockNodeId}),
            getDomRect: () => new Promise(resolve => requests.push({resolve, width, height}))
        };
        const resolve = request => request.resolve([
            {x: 0, y: 0, width: request.width, height: request.height},
            {x: 0, y: 0, width: request.width / 2, height: request.height},
            {x: request.width / 2, y: 0, width: request.width / 2, height: request.height}
        ]);

        try {
            const old = rig.controller.ensureGeometry();
            expect(rig.controller.ensureGeometry()).toBe(old);
            expect(requests).toHaveLength(1);

            width = 1200;
            const current = rig.controller.ensureGeometry();
            expect(current, 'a resized window needs a new generation').not.toBe(old);
            expect(rig.controller.ensureGeometry()).toBe(current);
            expect(requests).toHaveLength(2);

            resolve(requests[1]);
            await current;
            resolve(requests[0]);
            await old;
            expect(rig.controller.geometry.hostRect.width).toBe(1200);
            expect(rig.indicators.hostRect.width).toBe(1200);

            rig.controller.clear();
            const pending = rig.controller.ensureGeometry();
            height = 800;
            resolve(requests[2]);
            expect(await pending, 'a resize during measurement cannot publish the old frame').toBeNull();
            expect(rig.controller.geometry).toBeNull()
        } finally {
            WindowManager.get = originalGet;
            destroyAll(rig)
        }
    });

    test('release refuses a cached pre-resize frame and a fresh gesture still commits', async () => {
        const rig = compose(), originalGet = WindowManager.get;
        let width = 800;
        WindowManager.get = () => ({innerRect: {width, height: 600}});
        rig.controller.host = {
            id: 'release-resize-host', windowId: 'release-resize-window',
            down: ({dockNodeId}) => ({id: dockNodeId}),
            getDomRect: async () => [
                {x: 0, y: 0, width, height: 600},
                {x: 0, y: 0, width: width / 2, height: 600},
                {x: width / 2, y: 0, width: width / 2, height: 600}
            ]
        };

        try {
            await rig.controller.onDragMove({clientX: 600, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});
            width = 1200;
            await rig.controller.onDrop({clientX: 600, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});
            expect(rig.committed, 'release must not consume old indicator bounds').toHaveLength(0);
            expect(rig.preview.dockPreview).toBeNull();

            await rig.controller.onDragMove({clientX: 900, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});
            await rig.controller.onDrop({clientX: 900, clientY: 300, itemId: 'alpha', sourceNodeId: 'left-tabs'});
            expect(rig.committed).toHaveLength(1);
            expect(rig.owner.dockModel.nodes['right-tabs'].items).toContain('alpha')
        } finally {
            WindowManager.get = originalGet;
            destroyAll(rig)
        }
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

    test('synchronous remote selection and local moves share current-item menu candidates', async () => {
        const rig                               = compose(),
              {controller, indicators, preview} = rig;

        controller.dragGeometry = Promise.resolve(controller.geometry = GEOMETRY());
        indicators.hostRect = controller.geometry.hostRect;

        try {
            const data   = {itemId: 'gamma', pointer: {x: 200, y: 262}, sourceNodeId: 'right-tabs'},
                  remote = controller.resolvePreview(data);

            expect(indicators.activeCandidate?.position).toBe('top');
            expect(remote.placement.kind, 'the central indicator wins over tab inference').toBe('edge-top');
            expect(preview.dockPreview, 'resolution leaves publication to the caller').toBeNull();

            await controller.onDragMove({clientX: 200, clientY: 262, itemId: 'gamma', sourceNodeId: 'right-tabs'});
            expect(preview.dockPreview).toEqual(remote);

            const next = controller.resolvePreview({...data, itemId: 'beta', groupNodeId: 'another-stack'});
            expect(next.itemId).toBe('beta');
            expect(next.groupNodeId).toBe('another-stack');
            expect(indicators.candidateSet.itemId).toBe('beta');

            controller.geometry = GEOMETRY();
            controller.geometry.zones[0].rect.x = 50;
            controller.resolvePreview({...data, itemId: 'beta', groupNodeId: 'another-stack'});
            expect(indicators.candidateSet.zone.rect.x, 'a new measurement moves the same zone menu').toBe(50);

            controller.resolvePreview({...data, pointer: {x: 900, y: 900}});
            expect(indicators.candidateSet).toBeNull()
        } finally {
            destroyAll(rig)
        }
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

            rig.controller.dragGeometry = Promise.resolve(rig.controller.geometry = GEOMETRY());
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

            rig.controller.dragGeometry = Promise.resolve(rig.controller.geometry = GEOMETRY());
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
