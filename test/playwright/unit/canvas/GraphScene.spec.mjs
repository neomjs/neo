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

    test('near draws the own edges of the clusters nearest the camera, and the stats count what is drawn', () => {
        renderer.setScene(clusteredScene());
        renderer.lod    = {...renderer.lod, nearClusters: 1};
        // the eye on the positive x axis, beside cluster 9
        renderer.camera = {...renderer.camera, dist: renderer.fittedDistance * 0.5, pitch: 0, target: [0, 0, 0], touched: true, yaw: -Math.PI / 2};

        expect(GraphScene.eyePosition(renderer.camera)[0]).toBeGreaterThan(0);
        expect(renderer.getStats().lod).toEqual({bundles: 2, clusters: 3, edgesDrawn: 3, level: 'near', near: [2]});

        renderer.camera.dist = renderer.fittedDistance;
        expect(renderer.getStats().lod, 'far draws the bundles only').toEqual({bundles: 2, clusters: 3, edgesDrawn: 2, level: 'far', near: []})
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
