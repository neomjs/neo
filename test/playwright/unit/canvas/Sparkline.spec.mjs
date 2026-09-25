/**
 * @file test/playwright/unit/canvas/Sparkline.spec.mjs
 * @summary Pins the Canvas Worker sparkline renderer's update contract: a snap update wins over a
 * transition still in flight, so the picture on glass is the data the App Worker last sent.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasSparklineRendererTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import renderer       from '../../../../src/canvas/Sparkline.mjs';

/**
 * A 2d context stand-in: every method is a no-op, gradients accept colour stops, properties stick.
 * @returns {Object}
 */
const createContext = () => new Proxy({}, {
    get(target, key) {
        if (key in target) {
            return target[key]
        }

        return () => ({addColorStop() {}})
    }
});

/**
 * The worker holds transferred canvases in `Neo.worker.Canvas.map`; a plain object stands in for one.
 * @param {String} id
 * @returns {Object}
 */
const createCanvas = id => ({getContext: createContext, height: 45, id, width: 139});

test.describe('Neo.canvas.Sparkline — the update contract', () => {
    const canvasId = 'canvas-sparkline-snap';
    let originalCanvasWorker;

    /**
     * The loop reschedules itself every 16 ms in a worker without rAF; a unit arm drives ticks by hand.
     */
    const stopLoop = () => {
        clearTimeout(renderer.animationId);
        renderer.animationId = null
    };

    test.beforeEach(() => {
        originalCanvasWorker = Neo.worker.Canvas;
        Neo.worker.Canvas    = {map: {[canvasId]: createCanvas(canvasId)}}
    });

    test.afterEach(() => {
        stopLoop();
        renderer.unregister({canvasId});

        if (originalCanvasWorker === undefined) {
            delete Neo.worker.Canvas
        } else {
            Neo.worker.Canvas = originalCanvasWorker
        }
    });

    test('a snap update during an in-flight transition is what the next tick keeps', () => {
        renderer.register({canvasId, windowId: 'w1'});
        stopLoop();

        const item = renderer.items.get(canvasId);

        expect(item, 'the stand-in canvas registers an item').toBeTruthy();

        renderer.updateData({canvasId, values: [1, 2, 3]});
        renderer.updateData({canvasId, values: [2, 3, 4]});
        stopLoop();

        expect(item.isTransitioning, 'the second update starts a transition').toBe(true);
        expect(renderer.activeItems.has(item)).toBe(true);

        // The receipt's precondition: pulse and transition switched off, then new data arrives
        // while the transition above is still in flight — the update must snap.
        renderer.updateConfig({canvasId, usePulse: false, useTransition: false});
        renderer.updateData({canvasId, values: [9, 9, 9]});

        expect(item.values, 'the snap lands').toEqual([9, 9, 9]);

        renderer.renderLoop();
        stopLoop();

        expect(item.values, 'the loop must not roll the snap back to the old transition target').toEqual([9, 9, 9]);
        expect(item.isTransitioning).toBe(false);
        expect(renderer.activeItems.has(item), 'nothing animates a pulse-less, transition-less item').toBe(false)
    });

    test('a snap on a pulsing item retires its transition but keeps the pulse alive', () => {
        renderer.register({canvasId, windowId: 'w1'});
        stopLoop();

        const item = renderer.items.get(canvasId);

        renderer.updateData({canvasId, values: [1, 2, 3]});
        renderer.updateData({canvasId, values: [2, 3, 4]});
        stopLoop();
        renderer.updateConfig({canvasId, useTransition: false});
        renderer.updateData({canvasId, values: [7, 7, 7]});

        expect(item.values).toEqual([7, 7, 7]);
        expect(item.isTransitioning).toBe(false);
        expect(renderer.activeItems.has(item), 'a pulsing item stays with the loop').toBe(true);

        renderer.renderLoop();
        stopLoop();

        expect(item.values, 'a pulse frame never rewrites the data').toEqual([7, 7, 7])
    })
});
