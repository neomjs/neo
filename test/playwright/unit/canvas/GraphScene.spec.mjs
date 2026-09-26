/**
 * @file test/playwright/unit/canvas/GraphScene.spec.mjs
 * @summary Pins `Neo.canvas.GraphScene` without a GL context: the pure math it draws and picks with, the
 * scene checks, the drawing buffer sized by the size message's pixel ratio, and `Neo.app.SharedCanvas`
 * putting that ratio into the message.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasGraphSceneTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import GraphScene, {boundingSphere, fitDistance, normalizeScene, orbitMatrix, pickNearest, project} from '../../../../src/canvas/GraphScene.mjs';
import SharedCanvas   from '../../../../src/app/SharedCanvas.mjs';

const FOV = 0.9;

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
            const M = orbitMatrix({dist: 4, pitch: 0.4, target, yaw: 1.1}, 2, FOV);

            expect(project(M, ...target, 800, 400).map(value => Math.round(value * 1000) / 1000)).toEqual([400, 200])
        }
    });

    test('up is up on the surface, and a point behind the camera does not project', () => {
        const M = orbitMatrix({dist: 4, pitch: 0, target: [0, 0, 0], yaw: 0}, 1, FOV);

        expect(project(M, 0, 1, 0, 400, 400)[1]).toBeLessThan(200);
        expect(project(M, 0, 0, 8, 400, 400)).toBeNull()
    });

    test('at the fitted distance the sphere fills its share of the tighter axis', () => {
        const
            radius = 2.5,
            fill   = 0.86,
            // a wide surface: the vertical axis is the tighter one
            dist   = fitDistance({aspect: 2, fill, fov: FOV, radius}),
            M      = orbitMatrix({dist, pitch: 0, target: [0, 0, 0], yaw: 0}, 2, FOV);

        // the matrix is a Float32Array, so the last digits are single-precision noise
        expect(project(M, 0, radius, 0, 800, 400)[1]).toBeCloseTo((0.5 - fill / 2) * 400, 3);

        // a tall surface: the horizontal axis is
        const tallDist = fitDistance({aspect: 0.5, fill, fov: FOV, radius});

        expect(tallDist).toBeGreaterThan(dist)
    });

    test('the bounding sphere is centred on the box and reaches the farthest node; an empty scene gets a unit radius', () => {
        const sphere = boundingSphere(new Float32Array([0, 0, 0,  4, 0, 0,  2, 2, 0]));

        expect(sphere.center).toEqual([2, 1, 0]);
        expect(sphere.radius).toBeCloseTo(Math.hypot(2, 1), 6);
        expect(boundingSphere(new Float32Array(0))).toEqual({center: [0, 0, 0], radius: 1})
    });

    test('pick answers the nearest node within the radius, and -1 beyond it', () => {
        const
            M         = orbitMatrix({dist: 5, pitch: 0, target: [0, 0, 0], yaw: 0}, 1, FOV),
            positions = new Float32Array([0, 0, 0,  0.1, 0, 0,  2, 2, 0]),
            centre    = project(M, 0.1, 0, 0, 400, 400);

        expect(pickNearest({M, height: 400, positions, radius: 14, width: 400, x: centre[0], y: centre[1]})).toBe(1);
        expect(pickNearest({M, height: 400, positions, radius: 14, width: 400, x: 5, y: 5})).toBe(-1)
    });
});

test.describe('Neo.canvas.GraphScene — the scene checks', () => {
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

        expect(renderer.getStats().counts, 'a call without positions clears the surface').toBeNull()
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
