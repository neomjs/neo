/**
 * @file test/playwright/unit/canvas/ContextAcquisition.spec.mjs
 * @summary Pins how `Neo.canvas.Base#waitForCanvas` acquires its context: the declared `contextType` and
 * `contextAttributes` reach `getContext()`, the default stays a bare `'2d'`, and a null context leaves the
 * renderer idle instead of starting a loop it cannot draw.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasContextAcquisitionTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CanvasBase     from '../../../../src/canvas/Base.mjs';

/**
 * A renderer that records the two lifecycle effects a context acquisition triggers.
 * @class Neo.test.canvas.DefaultContextRenderer
 * @extends Neo.canvas.Base
 */
class DefaultContextRenderer extends CanvasBase {
    static config = {
        className: 'Neo.test.canvas.DefaultContextRenderer'
    }

    mountedCalls = []
    renderCalls  = 0

    onGraphMounted(width, height) {
        this.mountedCalls.push([width, height])
    }

    render() {
        this.renderCalls++
    }
}

Neo.setupClass(DefaultContextRenderer);

/**
 * The opt-in shape: a WebGL2 renderer naming its creation attributes.
 * @class Neo.test.canvas.WebglContextRenderer
 * @extends Neo.test.canvas.DefaultContextRenderer
 */
class WebglContextRenderer extends DefaultContextRenderer {
    static config = {
        className        : 'Neo.test.canvas.WebglContextRenderer',
        contextAttributes: {alpha: false, antialias: false, powerPreference: 'high-performance'},
        contextType      : 'webgl2'
    }
}

Neo.setupClass(WebglContextRenderer);

const windowId = 'window-1';

/**
 * A transferred canvas stand-in: `getContext` records its arguments and answers with `context`.
 * @param {Object|null} context
 * @returns {Object}
 */
const createCanvas = context => {
    const canvas = {calls: [], height: 45, width: 139};

    canvas.getContext = (...args) => {
        canvas.calls.push(args);
        return context
    };

    return canvas
};

test.describe('Neo.canvas.Base — context acquisition', () => {
    const errors    = [],
          renderers = [];

    // The worker outlives this file: `Neo.currentWorker` is shared by every spec in the process, so the suite
    // draws on its own map and hands the previous one back — including the case where there was none.
    let consoleError, hadCanvasWindowMap, previousCanvasWindowMap;

    /**
     * Places the stand-in in the worker's map and runs the remote entry point, which finds it synchronously.
     * @param {Function} RendererClass
     * @param {Object} canvas
     * @returns {Neo.canvas.Base}
     */
    const mount = (RendererClass, canvas) => {
        const renderer = Neo.create(RendererClass),
              canvasId = `canvas-${renderers.length}`;

        renderers.push(renderer);
        Neo.currentWorker.canvasWindowMap[canvasId] = {[windowId]: canvas};
        renderer.initGraph({canvasId, windowId});

        return renderer
    };

    test.beforeAll(() => {
        hadCanvasWindowMap      = Object.hasOwn(Neo.currentWorker, 'canvasWindowMap');
        previousCanvasWindowMap = Neo.currentWorker.canvasWindowMap;

        Neo.currentWorker.canvasWindowMap = {};

        consoleError  = console.error;
        console.error = (...args) => errors.push(args.join(' '))
    });

    test.afterAll(() => {
        console.error = consoleError;
        renderers.forEach(renderer => renderer.destroy());

        if (hadCanvasWindowMap) {
            Neo.currentWorker.canvasWindowMap = previousCanvasWindowMap
        } else {
            delete Neo.currentWorker.canvasWindowMap
        }

        // The restore is part of the contract this file makes with the files after it.
        expect(Object.hasOwn(Neo.currentWorker, 'canvasWindowMap')).toBe(hadCanvasWindowMap);
        expect(Neo.currentWorker.canvasWindowMap).toBe(previousCanvasWindowMap)
    });

    test.beforeEach(() => {
        errors.length = 0
    });

    test('the default renderer asks for a bare 2d context', () => {
        const context  = {canvas: {}},
              canvas   = createCanvas(context),
              renderer = mount(DefaultContextRenderer, canvas);

        expect(canvas.calls, 'one getContext call, type only').toEqual([['2d']]);
        expect(renderer.context).toBe(context);
        expect(renderer.canvasSize).toEqual({width: 139, height: 45});
        expect(renderer.mountedCalls, 'the mounted hook sees the canvas size').toEqual([[139, 45]]);
        expect(renderer.renderCalls, 'the first initGraph starts the loop').toBe(1);
        expect(errors).toEqual([])
    });

    test('a subclass declares the context type and its creation attributes', () => {
        const context  = {canvas: {}},
              canvas   = createCanvas(context),
              renderer = mount(WebglContextRenderer, canvas);

        expect(canvas.calls).toEqual([['webgl2', {alpha: false, antialias: false, powerPreference: 'high-performance'}]]);
        expect(canvas.calls[0][1], 'the config object itself is passed').toBe(renderer.contextAttributes);
        expect(renderer.context).toBe(context);
        expect(renderer.mountedCalls).toEqual([[139, 45]]);
        expect(renderer.renderCalls).toBe(1);
        expect(errors).toEqual([])
    });

    test('a null context leaves the renderer idle and says why', () => {
        const canvas   = createCanvas(null),
              renderer = mount(WebglContextRenderer, canvas);

        expect(canvas.calls.length).toBe(1);
        expect(renderer.context).toBeNull();
        expect(renderer.canvasSize, 'no size update without a context').toBeNull();
        expect(renderer.mountedCalls, 'no mounted hook without a context').toEqual([]);
        expect(renderer.renderCalls, 'no loop without a context').toBe(0);
        expect(renderer.animationId).toBeNull();
        expect(errors.length, 'one error names the class and the type').toBe(1);
        expect(errors[0]).toContain('Neo.test.canvas.WebglContextRenderer');
        expect(errors[0]).toContain("getContext('webgl2')")
    });
});
