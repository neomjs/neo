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

    test('the atlas packs labels whole: one it cannot hold is left out, never clipped, claims no space, and the labels after it keep packing', () => {
        const pack = boxes => GraphScene.packLabels({boxes, limit: 100});

        expect(pack([[40, 10], [120, 10], [50, 10]]), 'a normal label, one wider than the atlas, a later ordinary one')
            .toEqual({height: 10, origins: [[0, 0], null, [40, 0]], width: 90});
        expect(pack([[10, 10], [20, 120], [90, 10]]), 'one taller than the atlas leaves the row its height: the later one shares it')
            .toEqual({height: 10, origins: [[0, 0], null, [10, 0]], width: 100});
        expect(pack([[60, 40], [60, 40], [60, 30], [40, 20]]), 'rows wrap at the limit; one past the last row claims none, a later one packs into the row with room')
            .toEqual({height: 80, origins: [[0, 0], [0, 40], null, [60, 40]], width: 100});
        // the same two texts measured at a pixel ratio of 1, then of 2
        expect(pack([[40, 10], [60, 10]]).origins).toEqual([[0, 0], [40, 0]]);
        expect(pack([[80, 20], [120, 20]]).origins, 'at twice the ratio the second is wider than the atlas').toEqual([[0, 0], null])
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

        expect(centres, 'a centre is the half height plus the lift above its point; behind the camera stays without one').toEqual([[50, 34], null, [20, 69]]);
        expect(GraphScene.labelCentres({anchors: [[50, 50], [20, 80]], boxes: [[40, 20], [30, 10]], lift: 6, radii: [10, 2]}), 'a point drawn wider than the lift lifts its label clear of it')
            .toEqual([[50, 30], [20, 69]])
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

    test('a requested frame is owed until it runs', async () => {
        renderer.context = createContext();

        expect(renderer.getStats().owed, 'nothing is owed before a request').toBe(false);

        renderer.isPaused = false;
        renderer.requestFrame();

        expect(renderer.getStats().owed, 'the request owes a frame').toBe(true);

        // paused before its slot, the frame starts and returns: the stub context has nothing to draw with
        renderer.isPaused = true;

        await expect.poll(() => renderer.getStats().owed, {message: 'the frame that runs settles it'}).toBe(false)
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
        test('held pointer moves orbit only for a primary press on this canvas and stop after up, leave, or buttons 0', () => {
        renderer.context = createContext(400, 200);
        renderer.setScene({positions: [0, 0, 0,  2, 1, 0], windowId: 'window-1'});

        const
            initialYaw   = renderer.camera.yaw,
            initialPitch = renderer.camera.pitch;

        // 1. Move with buttons: 1 and no down (drag from outside canvas) changes nothing
        renderer.updateMouseState({x: 10, y: 20, buttons: 1});
        renderer.updateMouseState({x: 60, y: 40, buttons: 1});

        expect(renderer.camera.yaw).toBe(initialYaw);
        expect(renderer.camera.pitch).toBe(initialPitch);
        expect(renderer.camera.touched).toBe(false);
        expect(renderer.flightPlan).toBeNull();

        // Same during an active flight: flightPlan survives
        renderer.flyTo({index: 0, distance: 1, duration: 100});
        const activeFlight = renderer.flightPlan;

        renderer.updateMouseState({x: 90, y: 50, buttons: 1});
        expect(renderer.flightPlan).toBe(activeFlight);
        expect(renderer.camera.yaw).toBe(initialYaw);
        expect(renderer.camera.pitch).toBe(initialPitch);

        // 2. Press on canvas followed by moves orbits and ends the flight
        renderer.updateMouseState({x: 20, y: 20, buttons: 0});
        renderer.updateMouseState({x: 20, y: 20, button: 0, buttons: 1, down: true});
        renderer.updateMouseState({x: 70, y: 50, buttons: 1});

        expect(renderer.flightPlan).toBeNull();
        expect(renderer.camera.touched).toBe(true);
        expect(renderer.camera.yaw).toBeCloseTo(initialYaw + 50 * renderer.orbitSpeed, 10);
        expect(renderer.camera.pitch).toBeCloseTo(initialPitch + 30 * renderer.orbitSpeed, 10);

        // 3a. After up, a held move without a new down does not orbit
        let lockedYaw   = renderer.camera.yaw,
            lockedPitch = renderer.camera.pitch;

        renderer.updateMouseState({x: 70, y: 50, button: 0, buttons: 0, up: true});
        renderer.updateMouseState({x: 110, y: 70, buttons: 1});

        expect(renderer.camera.yaw).toBe(lockedYaw);
        expect(renderer.camera.pitch).toBe(lockedPitch);

        // 3b. After leave, a later held move without a new down does not orbit
        renderer.updateMouseState({x: 110, y: 70, button: 0, buttons: 1, down: true});
        renderer.updateMouseState({leave: true});
        renderer.updateMouseState({x: 30, y: 20, buttons: 1});
        renderer.updateMouseState({x: 80, y: 60, buttons: 1});

        expect(renderer.camera.yaw).toBe(lockedYaw);
        expect(renderer.camera.pitch).toBe(lockedPitch);

        // 3c. After a report with buttons: 0 (no up), a later held move does not orbit
        renderer.updateMouseState({x: 80, y: 60, button: 0, buttons: 1, down: true});
        renderer.updateMouseState({x: 30, y: 25, buttons: 0});
        renderer.updateMouseState({x: 90, y: 75, buttons: 1});

        expect(renderer.camera.yaw).toBe(lockedYaw);
        expect(renderer.camera.pitch).toBe(lockedPitch)
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

test.describe('Neo.canvas.GraphScene — the near look', () => {
    let renderer;

    /**
     * A dense read: nodes spread through the cube around the origin by a seeded generator, in 64 clusters, each
     * named after its index.
     * @param {Number} [count=100000]
     * @returns {Object}
     */
    const denseScene = (count = 100000) => {
        const positions = new Float32Array(count * 3), clusters = new Uint32Array(count), texts = [];
        let   seed      = 7;

        const random = () => (seed = seed * 16807 % 2147483647) / 2147483647;

        for (let node = 0; node < count; node++) {
            positions.set([random() * 2 - 1, random() * 2 - 1, random() * 2 - 1], node * 3);
            clusters[node] = node % 64;
            texts.push(`node ${node}`)
        }

        return {clusters, names: {texts}, positions, sizes: new Float32Array(count).fill(0.4), windowId: 'window-1'}
    };

    /**
     * Puts the camera at a multiple of the fitted distance, its target on a node.
     * @param {Number} ratio
     * @param {Number} [node=0]
     */
    const lookAt = (ratio, node = 0) => {
        const {positions} = renderer.scene;

        renderer.camera = {...renderer.camera, dist: renderer.fittedDistance * ratio, target: Array.from(positions.subarray(node * 3, node * 3 + 3)), touched: true}
    };

    /**
     * The squared distance between a node and a point.
     * @param {Number} node
     * @param {Number[]} point
     * @returns {Number}
     */
    const distance = (node, [x, y, z]) => {
        const {positions} = renderer.scene;

        return (positions[node * 3] - x) ** 2 + (positions[node * 3 + 1] - y) ** 2 + (positions[node * 3 + 2] - z) ** 2
    };

    test.beforeEach(() => {
        renderer = Neo.create(GraphScene);
        // no frame is scheduled: what a frame would draw is what these arms read
        renderer.isPaused = true;
        renderer.context  = createContext(1200, 800);
        renderer.updateSize({width: 1200, height: 800, devicePixelRatio: 1});
        // this runtime has no 2D context to measure with: seven pixels a character
        renderer.measureNames = texts => texts.map(text => 7 * text.length)
    });

    test.afterEach(() => {
        renderer.surfaces = null;
        renderer.destroy()
    });

    test('names pair one text with every node, a missing one empty, and settle with their colours; a count that does not fit is refused', () => {
        const {names} = renderer.normalizeScene({positions: [0, 0, 0,  1, 1, 1], names: {texts: ['a', null], color: '#123456'}});

        expect(names).toEqual({color: '#123456', outline: '#000000', texts: ['a', '']});
        expect(renderer.normalizeScene({positions: [0, 0, 0]}).names).toBeNull();
        expect(() => renderer.normalizeScene({positions: [0, 0, 0], names: {texts: []}})).toThrow(/1 nodes need 1 names, got 0/)
    });

    test('the nearest nodes come nearest first, as many as asked, among those admitted', () => {
        const positions = Float32Array.from([5, 0, 0,  1, 0, 0,  3, 0, 0,  2, 0, 0,  4, 0, 0]), target = [0, 0, 0];

        expect(GraphScene.nearestNodes({limit: 3, positions, target})).toEqual([1, 3, 2]);
        expect(GraphScene.nearestNodes({accept: node => node !== 3, limit: 3, positions, target})).toEqual([1, 2, 4]);
        expect(GraphScene.nearestNodes({limit: 0, positions, target})).toEqual([])
    });

    test('a name keeps its cell while drawn; a new one takes a free cell, then the one drawn longest ago, never one its own frame draws', () => {
        const table = GraphScene.nameCells(2);

        expect(GraphScene.claimCells(table, [7, 8])).toEqual({cells: [0, 1], fresh: [0, 1]});
        expect(GraphScene.claimCells(table, [8])).toEqual({cells: [1], fresh: []});
        expect(GraphScene.claimCells(table, [9]), '7 was drawn longest ago').toEqual({cells: [0], fresh: [0]});
        expect(GraphScene.claimCells(table, [10, 9, 11]), 'three names, two cells: the third finds none this frame').toEqual({cells: [1, 0, null], fresh: [1]});
        expect(table.evictions).toBe(2);
        expect([...table.cellOf]).toEqual([[9, 0], [10, 1]])
    });

    test('a node draws at least the floor at the camera\'s target closer than near, as sent beyond the band, rising evenly in the wheel\'s travel across it, and still reads its depth', () => {
        renderer.setScene(denseScene(1000));
        renderer.nearStyle = {...renderer.nearStyle, floor: 6};

        const
            {fade} = renderer.nearStyle,
            {near} = renderer.lod,
            drawn  = ratio => {
                lookAt(ratio);
                return GraphScene.pointSize({depth: 1, floor: renderer.nearFloor(), scale: 1, size: 0.4})
            };

        expect(drawn(near * 0.5), 'closer than near: the floor').toBe(6);
        expect(drawn(near * fade * 1.01), 'beyond the band: the size as sent').toBeCloseTo(0.4, 6);

        // the band from its outer edge in to near, in equal steps of the wheel's (logarithmic) travel
        [1, 0.8, 0.6, 0.4, 0.2, 0].map(step => drawn(near * fade ** step)).forEach((size, step) => {
            expect(size, `step ${step} of the band`).toBeCloseTo([0.4, 1.2, 2.4, 3.6, 4.8, 6][step], 6)
        });

        expect(GraphScene.pointSize({depth: 2, floor: 6, scale: 1, size: 0.4}), 'a node behind the target draws smaller').toBe(3);
        expect(GraphScene.pointSize({depth: 1, floor: 0, scale: 2, size: 5}), 'no floor: the size on the surface\'s scale').toBe(10);

        renderer.updateSize({width: 1200, height: 800, devicePixelRatio: 2});
        lookAt(near * 0.5);

        expect(renderer.nearFloor(), 'the floor counts CSS pixels').toBe(12);
        expect(renderer.getStats()).toMatchObject({names: null, near: {floor: 12, share: 1}})
    });

    test('the names fade in across the same band: none beyond it, half there halfway, whole from near in; a clustered scene\'s forced level shows the look whole or not at all', () => {
        renderer.setScene(denseScene(1000));

        const
            {fade} = renderer.nearStyle,
            {near} = renderer.lod,
            at     = ratio => {
                lookAt(ratio);
                return renderer.frameLabels()
            },
            half   = at(near * Math.sqrt(fade));

        expect(at(near * fade * 1.01)).toMatchObject({names: [], share: 0});
        expect(half.share, 'the names\' opacity halfway along the band').toBeCloseTo(0.5, 6);
        expect(half.names.length).toBeGreaterThan(0);
        expect(at(near * 0.5).share).toBe(1);
        expect(GraphScene.nearShare({fade: 1, near, ratio: near * 1.01}), 'no band: the look switches at near').toBe(0);

        renderer.lodLevel = 'far';
        lookAt(near * 0.5);
        expect(renderer.getNearShare()).toBe(0);

        renderer.lodLevel = 'near';
        lookAt(1);
        expect(renderer.getNearShare()).toBe(1)
    });

    test('closer than near, a dense read names at most the labels a frame draws: the nodes nearest the target that place, nearest first, each clear of its point as drawn; a new target names others, and the atlas stays within its cells', () => {
        renderer.setScene(denseScene());
        // wider than the lift, so the drawn radius is what lifts the names
        renderer.nearStyle = {...renderer.nearStyle, floor: 20};

        const
            {lift, max} = renderer.labelStyle,
            names       = node => {
                lookAt(0.1, node);
                return renderer.frameLabels().names
            },
            first       = names(0),
            {target}    = renderer.camera,
            nearest     = GraphScene.nearestNodes({limit: renderer.nearStyle.candidates, positions: renderer.scene.positions, target}),
            sorted      = Array.from({length: renderer.scene.count}, (item, node) => node).sort((a, b) => distance(a, target) - distance(b, target));

        expect(nearest, 'the candidates are the nearest of a full sort').toEqual(sorted.slice(0, nearest.length));
        expect(first.length, 'names place').toBeGreaterThan(5);
        expect(first.length).toBeLessThanOrEqual(max);
        expect(first.every(({node}) => nearest.includes(node)), 'each named node is a candidate').toBe(true);
        expect(first.every(({node}, index) => !index || distance(node, target) >= distance(first[index - 1].node, target)), 'nearest first').toBe(true);
        expect(first.some(({radius}) => radius > lift), 'the floor draws points wider than the lift').toBe(true);
        expect(first.every(({box, centre, point, radius}) => centre[1] + box[1] / 2 <= point[1] - Math.max(lift, radius) + 1e-6), 'no name hides its point').toBe(true);

        renderer.labelStyle = {...renderer.labelStyle, max: 4};
        expect(names(0).length, 'the most a frame draws binds').toBe(4);
        renderer.labelStyle = {...renderer.labelStyle, max};

        expect(names(99999).some(({node}) => first.some(name => name.node === node)), 'a new target names other nodes').toBe(false);

        // the atlas's cells over frames that sweep the target through the read: twice the labels a frame draws
        const table = GraphScene.nameCells(2 * max);

        [0, 25000, 50000, 75000, 99999].forEach(node => {
            expect(GraphScene.claimCells(table, names(node).map(name => name.node)).cells, `every name finds a cell at node ${node}`).not.toContain(null)
        });

        expect(table.cellOf.size, 'the names resident never outnumber the cells').toBe(2 * max);
        expect(table.evictions, 'the names drawn longest ago made room').toBeGreaterThan(0)
    });

    test('a scene label clears its point as the floor enlarges it, and sits as before at the default floor', () => {
        const {names, ...scene} = denseScene(1000);

        renderer.setScene({...scene, labels: {nodes: [0], texts: ['a']}});
        // the atlas uploadLabels measures, without a GL context
        renderer.surfaces = {labels: {boxes: [[30, 20]], origins: [[0, 0]], ratio: 1}};
        // the target on node 0, closer than near: the look has arrived, and node 0 sits at depth 1
        lookAt(0.3, 0);

        const
            {lift}   = renderer.labelStyle,
            labelled = () => renderer.frameLabels().own[0],
            plain    = labelled();

        expect(plain.centre[1] + plain.box[1] / 2, 'the default floor: the lower edge lift above the point').toBeCloseTo(plain.point[1] - lift, 6);

        renderer.nearStyle = {...renderer.nearStyle, floor: 20};

        const floored = labelled();

        // 20 px drawn at depth 1 dwarfs the node's own 0.4 × 2 px: a radius of 10, beyond the lift of 6
        expect(floored.centre[1] + floored.box[1] / 2, 'the lower edge clears the floored point').toBeLessThanOrEqual(floored.point[1] - 10 + 1e-6)
    });

    test('a scene without names draws as before: no names and no floor at any distance, and its own labels placed as the pipeline always placed them', () => {
        const {names, ...scene} = denseScene(1000);

        renderer.setScene({...scene, labels: {nodes: [0, 1, 2], texts: ['a', 'b', 'c']}});
        // the atlas uploadLabels measures, without a GL context
        renderer.surfaces = {labels: {boxes: [[30, 20], [30, 20], [30, 20]], origins: [[0, 0], [30, 0], [60, 0]], ratio: 1}};

        let placedAny = false;

        for (const ratio of [1, 0.6, 0.1]) {
            lookAt(ratio);

            const
                frame    = renderer.frameLabels(),
                M        = renderer.matrix(),
                {labels} = renderer.scene,
                {boxes}  = renderer.surfaces.labels,
                points   = GraphScene.labelAnchors({lod: renderer.getLodLevel() === 'far' ? renderer.scene.lod : null, nodes: labels.nodes, positions: renderer.scene.positions}),
                anchors  = Array.from(labels.nodes, (node, label) => GraphScene.project(M, points[label * 3], points[label * 3 + 1], points[label * 3 + 2], 1200, 800)),
                placed   = GraphScene.placeLabels({anchors: GraphScene.labelCentres({anchors, boxes, lift: 6}), boxes, gap: 4, height: 800, max: 30, width: 1200});

            expect(frame.names, `no names at ${ratio}`).toEqual([]);
            expect(frame.own.map(({label}) => label), `the own labels at ${ratio}`).toEqual(placed);
            expect(renderer.nearFloor(), `no floor at ${ratio}`).toBe(0);
            placedAny ||= placed.length > 0
        }

        expect(placedAny, 'the comparison saw placed labels').toBe(true)
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
