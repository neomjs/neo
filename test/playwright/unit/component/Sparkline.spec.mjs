/**
 * @file test/playwright/unit/component/Sparkline.spec.mjs
 * @summary Pins the owning-window route used while Sparkline ensures its Canvas Worker, and the `drawn` flag:
 * set only once the renderer answered for the values and for a measured size.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'ComponentSparklineRoutingTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import Sparkline       from '../../../../src/component/Sparkline.mjs';

test.describe('Neo.component.Sparkline worker routing', () => {
    test('the idempotent startWorker ensure carries the component windowId exactly once', async () => {
        const
            originalCanvas      = Neo.worker.Canvas,
            originalStartWorker = Neo.worker.Manager.startWorker,
            startCalls          = [];
        let sparkline;

        Neo.worker.Canvas = {loadModule: async () => {}};
        Neo.worker.Manager.startWorker = async data => {
            startCalls.push(data);
            return true
        };

        try {
            sparkline = Neo.create(Sparkline, {
                appName : 'ComponentSparklineRoutingTest',
                id      : 'component-sparkline-routing',
                windowId: 'sparkline-window'
            });

            await sparkline.ready();

            expect(startCalls).toEqual([{
                name    : 'canvas',
                windowId: 'sparkline-window'
            }])
        } finally {
            sparkline?.destroy();
            Neo.worker.Manager.startWorker = originalStartWorker;

            if (originalCanvas === undefined) {
                delete Neo.worker.Canvas
            } else {
                Neo.worker.Canvas = originalCanvas
            }
        }
    })
});

test.describe('Neo.component.Sparkline drawn', () => {
    let calls, originalCanvas, originalRenderer, originalStartWorker, sparkline;

    /**
     * Waits for the renderer call the component sends next and answers it.
     * @param {String} name
     */
    const answer = async name => {
        await expect.poll(() => calls[0]?.name, {message: `the component sends ${name}`}).toBe(name);
        calls.shift().resolve()
    };

    /**
     * Every renderer call stays open until the arm answers it, as a remote call does until the canvas worker replies.
     * @param {String} name
     * @returns {Function}
     */
    const held = name => data => new Promise(resolve => calls.push({data, name, resolve}));

    test.beforeEach(() => {
        calls               = [];
        originalCanvas      = Neo.worker.Canvas;
        originalRenderer    = Neo.ns('Neo.canvas.Sparkline');
        originalStartWorker = Neo.worker.Manager.startWorker;

        Neo.worker.Canvas              = {loadModule: async () => {}, unregisterCanvas() {}};
        Neo.worker.Manager.startWorker = async () => true;
        Neo.ns('Neo.canvas', true).Sparkline = {
            register  : held('register'),
            unregister: async () => {},
            updateData: held('updateData'),
            updateSize: held('updateSize')
        }
    });

    test.afterEach(() => {
        sparkline?.destroy();
        sparkline                      = null;
        Neo.worker.Manager.startWorker = originalStartWorker;
        Neo.canvas.Sparkline           = originalRenderer;

        if (originalCanvas === undefined) {
            delete Neo.worker.Canvas
        } else {
            Neo.worker.Canvas = originalCanvas
        }
    });

    /**
     * @param {Object} [config]
     * @returns {Promise<Neo.component.Sparkline>}
     */
    const createSparkline = async config => {
        sparkline = Neo.create(Sparkline, {
            appName : 'ComponentSparklineRoutingTest',
            windowId: 'sparkline-window',
            ...config
        });

        sparkline.getDomRect = async () => ({height: 45, width: 139});

        await sparkline.ready();
        return sparkline
    };

    test('drawn waits for the answers to the values and the measured size, and leaves with the canvas', async () => {
        await createSparkline({values: [3, 1, 4, 1, 5]});

        sparkline.offscreenRegistered = true;

        await answer('register');
        await answer('updateData');
        expect(sparkline.drawn, 'values without a size draw nothing yet').toBe(false);

        await answer('updateSize');
        await expect.poll(() => sparkline.drawn, {message: 'both answers stand for drawn pixels'}).toBe(true);
        expect(sparkline.vdom['data-drawn']).toBe('true');

        sparkline.offscreenRegistered = false;

        expect(sparkline.drawn, 'a canvas the worker let go shows nothing').toBe(false);
        expect(sparkline.vdom['data-drawn']).toBe(null)
    });

    test('values that arrive after the size sync set drawn once the renderer answered for them', async () => {
        await createSparkline();

        sparkline.offscreenRegistered = true;

        await answer('register');
        await answer('updateSize');
        expect(sparkline.drawn, 'a measured canvas without values shows nothing').toBe(false);

        sparkline.values = [2, 7, 1, 8];

        await expect.poll(() => calls[0]?.name).toBe('updateData');
        expect(sparkline.drawn, 'no answer yet').toBe(false);

        await answer('updateData');
        await expect.poll(() => sparkline.drawn).toBe(true)
    });

    test('cleared values reset drawn', async () => {
        await createSparkline({values: [3, 1, 4, 1, 5]});

        sparkline.offscreenRegistered = true;

        await answer('register');
        await answer('updateData');
        await answer('updateSize');
        await expect.poll(() => sparkline.drawn).toBe(true);

        sparkline.values = null;

        expect(sparkline.drawn, 'a canvas without values shows no content').toBe(false);
        expect(sparkline.vdom['data-drawn']).toBe(null)
    });

    test('a sparkline destroyed while the renderer answers sends nothing more', async () => {
        await createSparkline({values: [3, 1, 4, 1, 5]});

        sparkline.offscreenRegistered = true;

        await answer('register');
        await expect.poll(() => calls[0]?.name).toBe('updateData');

        const destroyed    = sparkline;
        let   domRectReads = 0;

        sparkline = null;
        destroyed.destroy();

        // destroy() deleted the instance's own stub: a size sync would now reach this one
        destroyed.getDomRect = async () => {domRectReads++; return {height: 45, width: 139}};

        calls.shift().resolve();

        // Microtask turns only: each awaited call continues inside them
        for (let turn = 0; turn < 10; turn++) await Promise.resolve();

        expect(domRectReads, 'no size read').toBe(0);
        expect(calls.map(call => call.name), 'no renderer call').toEqual([])
    })
});
