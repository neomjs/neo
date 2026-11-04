/**
 * @file test/playwright/unit/canvas/GraphScene.spec.mjs
 * @summary Pins `Neo.canvas.GraphScene` without a GL context: the pure math it draws and picks with, the
 * scene checks, the level of detail of a clustered scene, the drawing buffer sized by the size message's
 * pixel ratio, and `Neo.app.SharedCanvas` putting that ratio into the message.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasGraphSceneTest'}});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GraphScene         from '../../../../src/canvas/GraphScene.mjs';
import RemoteMethodAccess from '../../../../src/worker/mixin/RemoteMethodAccess.mjs';
import SharedCanvas       from '../../../../src/app/SharedCanvas.mjs';

const FOV = 0.9;

/**
 * The canvas worker's reply seam without a worker: the real mixin, with the replies counted.
 */
class ReplyWorker extends Neo.core.Base {
    static config = {
        className: 'Test.Unit.Canvas.GraphScene.ReplyWorker',
        mixins   : [RemoteMethodAccess]
    }
}

ReplyWorker = Neo.setupClass(ReplyWorker);

/**
 * A WebGL2 stand-in for the sizing path: a canvas with a size, and the viewport calls recorded.
 * @param {Number} [width=300]
 * @param {Number} [height=150]
 * @returns {Object}
 */
const createContext = (width = 300, height = 150) => {
    const context = {canvas: {width, height}, viewports: []};

    context.viewport = (...args) => context.viewports.push(args);

    return context
};

test.describe('Neo.canvas.GraphScene — the math', () => {
    test('the orbit target projects to the surface centre, wherever the target is', () => {
        for (const target of [[0, 0, 0], [5, -3, 12]]) {
            const M = GraphScene.orbitMatrix({dist: 4, pitch: 0.4, target, yaw: 1.1}, 2, FOV);

            expect(GraphScene.project(M, ...target, 800, 400).map(value => Math.round(value * 1000) / 1000)).toEqual([400, 200])
        }
    });

    test('up is up on the surface, and a point behind the camera does not project', () => {
        const M = GraphScene.orbitMatrix({dist: 4, pitch: 0, target: [0, 0, 0], yaw: 0}, 1, FOV);

        expect(GraphScene.project(M, 0, 1, 0, 400, 400)[1]).toBeLessThan(200);
        expect(GraphScene.project(M, 0, 0, 8, 400, 400)).toBeNull()
    });

    test('at the fitted distance the sphere fills its share of the tighter axis', () => {
        const
            radius = 2.5,
            fill   = 0.86,
            // a wide surface: the vertical axis is the tighter one
            dist   = GraphScene.fitDistance({aspect: 2, fill, fov: FOV, radius}),
            M      = GraphScene.orbitMatrix({dist, pitch: 0, target: [0, 0, 0], yaw: 0}, 2, FOV);

        // the matrix is a Float32Array, so the last digits are single-precision noise
        expect(GraphScene.project(M, 0, radius, 0, 800, 400)[1]).toBeCloseTo((0.5 - fill / 2) * 400, 3);

        // a tall surface: the horizontal axis is
        const tallDist = GraphScene.fitDistance({aspect: 0.5, fill, fov: FOV, radius});

        expect(tallDist).toBeGreaterThan(dist)
    });

    test('the bounding sphere is centred on the box and reaches the farthest node; an empty scene gets a unit radius', () => {
        const sphere = GraphScene.boundingSphere(new Float32Array([0, 0, 0,  4, 0, 0,  2, 2, 0]));

        expect(sphere.center).toEqual([2, 1, 0]);
        expect(sphere.radius).toBeCloseTo(Math.hypot(2, 1), 6);
        expect(GraphScene.boundingSphere(new Float32Array(0))).toEqual({center: [0, 0, 0], radius: 1})
    });

    test('pick answers the nearest node within the radius, and -1 beyond it', () => {
        const
            M         = GraphScene.orbitMatrix({dist: 5, pitch: 0, target: [0, 0, 0], yaw: 0}, 1, FOV),
            positions = new Float32Array([0, 0, 0,  0.1, 0, 0,  2, 2, 0]),
            centre    = GraphScene.project(M, 0.1, 0, 0, 400, 400);

        expect(GraphScene.pickNearest({M, height: 400, positions, radius: 14, width: 400, x: centre[0], y: centre[1]})).toBe(1);
        expect(GraphScene.pickNearest({M, height: 400, positions, radius: 14, width: 400, x: 5, y: 5})).toBe(-1)
    });
});

test.describe('Neo.canvas.GraphScene — labels and flights, the math', () => {
    test('labels are placed in their order, clear of each other, on the surface and in front of the camera, up to the most a frame draws', () => {
        const
            boxes   = [[40, 10], [40, 10], [40, 10], [40, 10], [40, 10]],
            anchors = [[50, 50], [60, 52], null, [-30, 50], [50, 70]],
            place   = options => GraphScene.placeLabels({anchors, boxes, gap: 4, height: 100, max: 30, width: 100, ...options});

        expect(place(), 'the second overlaps the first, the third is behind the camera, the fourth is off the surface').toEqual([0, 4]);
        expect(place({gap: 12}), 'a wider gap keeps the fifth out too').toEqual([0]);
        expect(place({max: 1}), 'a frame stops at the most it draws').toEqual([0]);
        expect(place({anchors: [[60, 52], [50, 50], null, [-30, 50], [50, 70]]}), 'of two overlapping labels, the earlier wins').toEqual([0, 4])
    });

    test('the atlas packs labels whole: one wider than the atlas is left out, never clipped, the labels after it keep packing, and one past the last row does not fit', () => {
        const pack = boxes => GraphScene.packLabels({boxes, limit: 100});

        expect(pack([[40, 10], [120, 10], [50, 10]]), 'a normal label, one wider than the atlas, a later ordinary one')
            .toEqual({fits: Uint8Array.from([1, 0, 1]), height: 10, origins: [[0, 0], null, [40, 0]], width: 90});
        expect(pack([[60, 40], [60, 40], [60, 40]]), 'rows wrap at the limit, and the row past its height does not fit')
            .toEqual({fits: Uint8Array.from([1, 1, 0]), height: 100, origins: [[0, 0], [0, 40], [0, 80]], width: 60});
        // the same two texts measured at a pixel ratio of 1, then of 2
        expect(pack([[40, 10], [60, 10]]).fits).toEqual(Uint8Array.from([1, 1]));
        expect(pack([[80, 20], [120, 20]]).fits, 'at twice the ratio the second is wider than the atlas').toEqual(Uint8Array.from([1, 0]))
    });

    test('a label sits at its node, and at its node\'s cluster centroid while the frame draws centroids', () => {
        const
            positions = Float32Array.from([0, 0, 0,  2, 0, 0,  10, 10, 10]),
            lod       = GraphScene.clusterScene({clusters: Uint32Array.from([7, 7, 9]), colors: new Float32Array(9), edges: new Uint32Array(0), positions, sizes: new Float32Array(3).fill(1)}),
            nodes     = Uint32Array.from([1, 2]);

        expect(Array.from(GraphScene.labelAnchors({nodes, positions}))).toEqual([2, 0, 0,  10, 10, 10]);
        expect(Array.from(GraphScene.labelAnchors({lod, nodes, positions})), 'node 1 shares cluster 7 with node 0: their centroid').toEqual([1, 0, 0,  10, 10, 10])
    });

    test('a label sits above the point it names, its lower edge `lift` away, so it never hides the point', () => {
        const centres = GraphScene.labelCentres({anchors: [[50, 50], null, [20, 80]], boxes: [[40, 20], [40, 20], [30, 10]], lift: 6});

        expect(centres, 'a centre is the half height plus the lift above its point; behind the camera stays without one').toEqual([[50, 34], null, [20, 69]])
    });

    test('a flight eases from its start to its end, the distance by a constant ratio', () => {
        const flight = {from: {dist: 8, target: [0, 0, 0]}, to: {dist: 2, target: [4, -2, 0]}};

        expect(GraphScene.flightStep(flight, 0)).toEqual({dist: 8, target: [0, 0, 0]});
        expect(GraphScene.flightStep(flight, -1), 'a share before the start holds at the start').toEqual({dist: 8, target: [0, 0, 0]});
        expect(GraphScene.flightStep(flight, 0.5), 'halfway in time: the middle of the line and the geometric middle of the distances').toEqual({dist: 4, target: [2, -1, 0]});
        expect(GraphScene.flightStep(flight, 2), 'a share past the end holds at the end').toEqual({dist: 2, target: [4, -2, 0]})
    })
});

test.describe('Neo.canvas.GraphScene — the scene checks', () => {
    let renderer;

    test.beforeEach(() => {
        renderer = Neo.create(GraphScene)
    });

    test.afterEach(() => {
        renderer.destroy()
    });

    const normalizeScene = scene => renderer.normalizeScene(scene);

    test('colours and sizes default, and every array settles into its typed form', () => {
        const scene = normalizeScene({positions: [0, 0, 0, 1, 1, 1], edges: [0, 1], paths: [[0, 1]]});

        expect(scene.count).toBe(2);
        expect(scene.colors).toEqual(new Float32Array(6).fill(1));
        expect(scene.sizes).toEqual(new Float32Array(2).fill(16));
        expect(scene.edges).toBeInstanceOf(Uint32Array);
        expect(scene.paths[0]).toBeInstanceOf(Uint32Array);
        expect(normalizeScene(null)).toBeNull()
    });

    test('a length or an index that does not fit the nodes is refused with its reason', () => {
        expect(() => normalizeScene({positions: [0, 0]})).toThrow(/three per node/);
        expect(() => normalizeScene({positions: [0, 0, 0], sizes: [1, 2]})).toThrow(/1 size values/);
        expect(() => normalizeScene({positions: [0, 0, 0], edges: [0]})).toThrow(/index pairs/);
        expect(() => normalizeScene({positions: [0, 0, 0], paths: [[0, 3]]})).toThrow(/names a node/)
    });

    test('a scene without positions is refused, naming the keys it carries', () => {
        expect(() => normalizeScene({nodes: [{id: 'a'}], links: []})).toThrow(/needs positions, got nodes, links/)
    });

    test('labels pair a text and a size with each node they name and settle into typed forms; a scene without labels has none', () => {
        const {labels} = normalizeScene({positions: [0, 0, 0, 1, 1, 1], labels: {nodes: [1, 0], texts: ['b', 7]}});

        expect(labels.nodes).toEqual(Uint32Array.from([1, 0]));
        expect(labels.texts, 'a text is a string').toEqual(['b', '7']);
        expect(labels.sizes, 'the style\'s size by default').toEqual(new Float32Array(2).fill(renderer.labelStyle.size));
        expect(labels).toMatchObject({color: '#ffffff', outline: '#000000'});
        expect(normalizeScene({positions: [0, 0, 0]}).labels).toBeNull()
    });

    test('a label without its text or size, or naming no node, is refused with its reason', () => {
        expect(() => normalizeScene({positions: [0, 0, 0], labels: {nodes: [0], texts: []}})).toThrow(/1 labels need 1 texts and sizes, got 0 and 1/);
        expect(() => normalizeScene({positions: [0, 0, 0], labels: {nodes: [0], texts: ['a'], sizes: [12, 14]}})).toThrow(/got 1 and 2/);
        expect(() => normalizeScene({positions: [0, 0, 0], labels: {nodes: [1], texts: ['a']}})).toThrow(/names one of the 1 nodes/)
    });
});

test.describe('Neo.canvas.GraphScene — the renderer without a GL context', () => {
    let renderer;

    test.beforeEach(() => {
        renderer = Neo.create(GraphScene);
        // no frame is scheduled: the sizing path is what these arms read
        renderer.isPaused = true
    });

    test.afterEach(() => {
        renderer.destroy()
    });

    test('the drawing buffer is the size times the message\'s pixel ratio, and 1:1 without one', () => {
        renderer.context = createContext();

        renderer.updateSize({width: 200, height: 100, devicePixelRatio: 2});

        expect([renderer.gl.canvas.width, renderer.gl.canvas.height]).toEqual([400, 200]);
        expect(renderer.gl.viewports.at(-1)).toEqual([0, 0, 400, 200]);

        renderer.updateSize({width: 200, height: 100});

        expect([renderer.gl.canvas.width, renderer.gl.canvas.height]).toEqual([200, 100])
    });

    test('a scene is kept, counted and framed; the camera centres on it until the pointer takes it', () => {
        renderer.context = createContext(400, 200);

        renderer.setScene({positions: [10, 0, 0,  12, 0, 0], edges: [0, 1], paths: [[0, 1]], windowId: 'window-1'});

        expect(renderer.getStats().counts).toEqual({nodes: 2, edges: 1, paths: 1});
        expect(renderer.camera.target).toEqual([11, 0, 0]);

        renderer.camera.touched = true;
        renderer.setScene({positions: [0, 0, 0], windowId: 'window-1'});

        expect(renderer.camera.target, 'a taken camera keeps its framing').toEqual([11, 0, 0]);

        renderer.setScene({windowId: 'window-1'});

        expect(renderer.getStats().counts, 'a call carrying only its routing key clears the surface').toBeNull()
    });

    test('a scene the checks refuse throws and leaves the drawn scene; null clears', () => {
        renderer.context = createContext(400, 200);
        renderer.setScene({positions: [0, 0, 0,  1, 0, 0], edges: [0, 1], windowId: 'window-1'});

        expect(() => renderer.setScene({nodes: [{id: 'a'}, {id: 'b'}], edges: [0, 1], windowId: 'window-1'}))
            .toThrow(/needs positions, got nodes, edges/);
        expect(renderer.getStats().counts, 'the refused scene leaves the drawn one').toEqual({nodes: 2, edges: 1, paths: 0});

        renderer.setScene(null);

        expect(renderer.getStats().counts).toBeNull()
    });

    test('through the reply seam, a refused scene answers the App Worker with one rejection', () => {
        const
            worker   = Neo.create(ReplyWorker),
            replies  = {rejected: [], resolved: 0},
            logError = console.error,
            call     = data => worker.onRemoteMethod({remoteClassName: 'Neo.canvas.GraphScene', remoteMethod: 'setScene', remoteId: renderer.id, data});

        worker.resolve   = () => {replies.resolved++};
        worker.reject    = (msg, err) => {replies.rejected.push(err)};
        renderer.context = createContext(400, 200);

        call({positions: [0, 0, 0,  1, 0, 0], edges: [0, 1], windowId: 'window-1'});
        console.error = () => {};

        try {
            call({nodes: [{id: 'a'}, {id: 'b'}], edges: [0, 1], windowId: 'window-1'})
        } finally {
            console.error = logError;
            worker.destroy()
        }

        expect(replies.resolved, 'only the drawn scene resolved').toBe(1);
        expect(replies.rejected.map(err => err.message)).toEqual([expect.stringMatching(/needs positions, got nodes, edges/)]);
        expect(renderer.getStats().counts, 'the refused scene leaves the drawn one').toEqual({nodes: 2, edges: 1, paths: 0})
    });

    test('a subclass normalizeScene receives a scene of its own shape, without the routing key', () => {
        let received;

        class NodeScene extends GraphScene {
            static config = {
                className: 'Test.Unit.Canvas.GraphScene.NodeScene'
            }

            normalizeScene(scene) {
                received = scene;
                return super.normalizeScene(scene && {positions: scene.nodes.flatMap(node => node.xyz)})
            }
        }

        NodeScene = Neo.setupClass(NodeScene);

        const nodeScene = Neo.create(NodeScene);

        nodeScene.isPaused = true;
        nodeScene.context  = createContext(400, 200);
        nodeScene.setScene({nodes: [{xyz: [0, 0, 0]}, {xyz: [2, 0, 0]}], windowId: 'window-1'});

        expect(received).toEqual({nodes: [{xyz: [0, 0, 0]}, {xyz: [2, 0, 0]}]});
        expect(nodeScene.getStats().counts).toEqual({nodes: 2, edges: 0, paths: 0});
        expect(nodeScene.camera.target).toEqual([1, 0, 0]);

        nodeScene.destroy()
    });

    test('the stats count a scene\'s labels and list none drawn before a frame; a scene without labels has none', () => {
        renderer.context = createContext(400, 200);
        renderer.setScene({positions: [0, 0, 0,  1, 0, 0], labels: {nodes: [0, 1], texts: ['a', 'b']}, windowId: 'window-1'});

        expect(renderer.getStats().labels).toEqual({count: 2, drawn: []});

        renderer.setScene({positions: [0, 0, 0], windowId: 'window-1'});

        expect(renderer.getStats().labels).toBeNull()
    });

    test('a flight lands on its node at a distance the zoom allows; the wheel ends it; a node the scene lacks changes nothing', () => {
        renderer.context = createContext(400, 200);
        renderer.setScene({positions: [0, 0, 0,  2, 1, 0], windowId: 'window-1'});

        const {fittedDistance} = renderer, before = renderer.getStats().camera;

        renderer.flyTo({index: 5});
        renderer.flyTo({index: -1});

        expect(renderer.getStats().camera, 'an index the scene lacks changes nothing').toEqual(before);

        renderer.flyTo({index: 1, distance: 0.01, duration: 0});

        const landed = renderer.getStats();

        expect(landed.camera.target).toEqual([2, 1, 0]);
        expect(landed.camera.dist, 'held at the nearest the zoom allows').toBeCloseTo(fittedDistance * renderer.zoom.min);
        expect(landed.camera.touched, 'a flown camera counts as taken').toBe(true);
        expect(landed.flying).toBe(false);

        renderer.flyTo({index: 0, distance: 1, duration: 100});
        renderer.flightPlan.start = performance.now() - 50;
        renderer.stepFlight();

        expect(renderer.camera.target[0], 'halfway in time is halfway along').toBeCloseTo(1, 0);
        expect(renderer.getStats().flying).toBe(true);

        renderer.onWheel({wheel: {deltaY: 100}});

        expect(renderer.getStats().flying, 'the wheel ends the flight').toBe(false);
        expect(renderer.camera.target[0], 'where it is').toBeCloseTo(1, 0);

        renderer.flyTo({index: 0, distance: 1, duration: 100});
        renderer.flightPlan.start = performance.now() - 200;
        renderer.stepFlight();

        expect(renderer.camera.target, 'its last step lands exactly on the end').toEqual([0, 0, 0]);
        expect(renderer.camera.dist).toBe(fittedDistance);
        expect(renderer.getStats().flying).toBe(false)
    });

    test('a lost context keeps the scene, drops its GL objects and leaves the buffer alone until the restore', () => {
        let prevented = false;

        renderer.context = createContext(400, 200);
        renderer.setScene({positions: [0, 0, 0], windowId: 'window-1'});
        renderer.onContextLost({preventDefault: () => {prevented = true}});

        expect(prevented, 'the default is prevented, so the context can come back').toBe(true);
        expect(renderer.contextLost).toBe(true);
        expect(renderer.canRender).toBe(false);
        expect(renderer.getStats().counts, 'the scene waits for the restore').toEqual({nodes: 1, edges: 0, paths: 0});

        renderer.updateSize({width: 100, height: 50, devicePixelRatio: 2});

        expect([renderer.gl.canvas.width, renderer.gl.canvas.height], 'a lost context is not resized').toEqual([400, 200]);
        expect(renderer.canvasSize, 'the size waits for the restore').toMatchObject({width: 100, height: 50})
    });
});

test.describe('Neo.canvas.GraphScene — the level of detail', () => {
    let renderer;

    /**
     * Three clusters with sparse ids along the x axis, two nodes each; one own edge per cluster and three
     * edges between them, two of those joining the same pair.
     * @returns {Object}
     */
    const clusteredScene = () => ({
        clusters : [7, 7, 3, 3, 9, 9],
        edges    : [0, 1,  2, 3,  1, 2,  3, 4,  0, 2,  4, 5],
        positions: [-2.2, 0, 0,  -1.8, 0, 0,  -0.2, 0, 0,  0.2, 0, 0,  1.8, 0, 0,  2.2, 0, 0],
        windowId : 'window-1'
    });

    test.beforeEach(() => {
        renderer = Neo.create(GraphScene);
        // no frame is scheduled: the level and the draw plan are what these arms read
        renderer.isPaused = true;
        renderer.context  = createContext(400, 200);
        renderer.updateSize({width: 400, height: 200, devicePixelRatio: 1})
    });

    test.afterEach(() => {
        renderer.destroy()
    });

    test('a clustered scene groups each cluster\'s own edges into one range and bundles the pairs between clusters', () => {
        const {edges, lod} = renderer.normalizeScene(clusteredScene());

        expect(lod.ids, 'dense indices follow first sight').toEqual([7, 3, 9]);
        expect(Array.from(lod.ranges), 'one start, count pair of edge indices per cluster').toEqual([0, 2,  2, 2,  4, 2]);
        expect(Array.from(edges), 'own edges first, cluster by cluster, then the edges between').toEqual([0, 1,  2, 3,  4, 5,  1, 2,  3, 4,  0, 2]);
        expect(Array.from(lod.bundles), 'one line per connected cluster pair').toEqual([0, 1,  1, 2]);
        expect(Array.from(lod.weights), 'and the edges each stands for').toEqual([2, 1]);
        expect(Array.from(lod.centroids.slice(0, 3))).toEqual([-2, 0, 0]);
        expect(lod.sizes[0], 'two members of size 16').toBeCloseTo(16 * Math.SQRT2)
    });

    test('a clusters array that does not fit the nodes is refused with both lengths', () => {
        expect(() => renderer.normalizeScene({...clusteredScene(), clusters: [1, 2, 3]})).toThrow(/6 nodes need 6 cluster ids, got 3/)
    });

    test('the camera distance picks the level against the fitted distance; a forced level wins; no clusters draw in full', () => {
        renderer.setScene(clusteredScene());

        const fitted = renderer.fittedDistance, at = ratio => {renderer.camera.dist = fitted * ratio; return renderer.getLodLevel()};

        expect(at(1),    'the fitted overview is far').toBe('far');
        expect(at(0.7)).toBe('mid');
        expect(at(0.5)).toBe('near');

        renderer.lodLevel = 'full';
        expect(renderer.getLodLevel()).toBe('full');
        expect(renderer.getLodPlan().edgesDrawn, 'full draws every edge').toBe(6);

        renderer.lodLevel = null;
        renderer.setScene({positions: [0, 0, 0,  1, 0, 0], edges: [0, 1], windowId: 'window-1'});
        expect(renderer.getLodLevel(), 'a scene without clusters').toBe('full');
        expect(renderer.getStats().lod).toBeNull()
    });

    test('near draws the own edges of the clusters nearest the camera target, and the stats count what is drawn', () => {
        renderer.setScene(clusteredScene());
        renderer.lod    = {...renderer.lod, nearClusters: 1};
        // the target on cluster 9's centroid
        renderer.camera = {...renderer.camera, dist: renderer.fittedDistance * 0.5, pitch: 0, target: [2, 0, 0], touched: true, yaw: 0};

        expect(renderer.getStats().lod).toEqual({bundles: 2, clusters: 3, edgesDrawn: 3, level: 'near', near: [2]});

        renderer.camera.dist = renderer.fittedDistance;
        expect(renderer.getStats().lod, 'far draws the bundles only').toEqual({bundles: 2, clusters: 3, edgesDrawn: 2, level: 'far', near: []})
    });

    test('an orbit around an unmoved target keeps the near clusters, wherever the eye passes', () => {
        renderer.setScene(clusteredScene());
        renderer.lod    = {...renderer.lod, nearClusters: 1};
        // the target on cluster 3; yaw -π/2 puts the eye beside cluster 9 (+x), yaw π/2 beside cluster 7 (-x)
        renderer.camera = {...renderer.camera, dist: renderer.fittedDistance * 0.5, pitch: 0, target: [0, 0, 0], touched: true, yaw: -Math.PI / 2};

        expect(renderer.getLodPlan().near, 'the eye beside cluster 9').toEqual([1]);

        renderer.camera.yaw = Math.PI / 2;
        expect(renderer.getLodPlan().near, 'the eye beside cluster 7').toEqual([1])
    });

    test('a level change uploads nothing, and at the far level no node answers a pick', () => {
        let uploads = 0;

        renderer.setScene(clusteredScene());

        const upload = renderer.upload;

        renderer.upload = () => {uploads++; upload.call(renderer)};

        const [x, y] = GraphScene.project(renderer.matrix(), -2.2, 0, 0, 400, 200);

        expect(renderer.getLodLevel()).toBe('far');
        expect(renderer.pick({x, y}), 'far draws centroids, not nodes').toBe(-1);

        renderer.camera.dist = renderer.fittedDistance * 0.7;

        const [mx, my] = GraphScene.project(renderer.matrix(), -2.2, 0, 0, 400, 200);

        expect(renderer.pick({x: mx, y: my}), 'mid draws the nodes').toBe(0);

        renderer.lodLevel    = 'near';
        renderer.camera.dist = renderer.fittedDistance * 0.5;
        renderer.getStats();

        expect(uploads, 'levels choose draw ranges only').toBe(0)
    });
});

test.describe('Neo.app.SharedCanvas — the size message', () => {
    test('carries the host\'s devicePixelRatio beside the size and the window', async () => {
        const
            sizes    = [],
            host     = Object.create(SharedCanvas.prototype),
            previous = Neo.config.devicePixelRatio;

        // Own data properties shadow the prototype's config accessors, which need a constructed instance.
        for (const [key, value] of Object.entries({
            offscreenRegistered: true,
            ready              : async () => {},
            renderer           : {updateSize: async size => {sizes.push(size)}},
            windowId           : 'window-1'
        })) {
            Object.defineProperty(host, key, {value, writable: true})
        }

        Neo.config.devicePixelRatio = 2;

        try {
            await host.updateSize({width: 200, height: 100})
        } finally {
            Neo.config.devicePixelRatio = previous
        }

        expect(sizes).toEqual([{devicePixelRatio: 2, height: 100, width: 200, windowId: 'window-1'}])
    })
});
