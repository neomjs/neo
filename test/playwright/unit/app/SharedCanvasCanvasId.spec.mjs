/**
 * @file test/playwright/unit/app/SharedCanvasCanvasId.spec.mjs
 * @summary Pins that `Neo.app.SharedCanvas` names its canvas on every renderer call: the seven remotes carry
 * `canvasId` beside `windowId` at every call site, the clear names the canvas and window the host started, and two
 * hosts of one renderer class that keeps its state per canvas each reach their own entry.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'SharedCanvasCanvasIdTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import SharedCanvas   from '../../../../src/app/SharedCanvas.mjs';

const remotes = ['clearGraph', 'initGraph', 'pause', 'resume', 'setTheme', 'updateMouseState', 'updateSize'];

/**
 * A host without its worker and DOM seams: the renderer is preloaded, no canvas transfers, and the first sizing reads
 * the host's own `rect` in place of the DOM.
 * @class Neo.test.app.CanvasIdHost
 * @extends Neo.app.SharedCanvas
 */
class CanvasIdHost extends SharedCanvas {
    static config = {
        className         : 'Neo.test.app.CanvasIdHost',
        monitorSize       : false,
        offscreen         : false,
        rendererClassName : 'Neo.test.app.CanvasIdRenderer',
        rendererImportPath: null
    }

    rect = null
    registration = null

    /** @summary Keeps the production hook's promise, so a test can await the started graph. */
    afterSetOffscreenRegistered(value, oldValue) {
        return this.registration = super.afterSetOffscreenRegistered(value, oldValue)
    }

    /** @summary Answers the measurement of the first sizing. */
    async getDomRect() {
        return this.rect
    }
}

Neo.setupClass(CanvasIdHost);

/**
 * A renderer that keeps its state per canvas, the way `Neo.canvas.Sparkline` keys its `items`: each remote files its
 * payload under the canvas the payload names.
 * @returns {Object}
 */
function createRenderer() {
    const renderer = {calls: [], canvases: {}};

    for (const name of remotes) {
        renderer[name] = data => {
            renderer.calls.push([name, data]);
            (renderer.canvases[data.canvasId] ??= {})[name] = data
        }
    }

    return renderer
}

test.describe('Neo.app.SharedCanvas — every renderer call names the host\'s canvas', () => {
    let canvasWorker, hosts, renderer;

    test.beforeEach(() => {
        canvasWorker      = Neo.worker.Canvas;
        Neo.worker.Canvas = {unregisterCanvas() {}}; // a registered canvas unregisters when its host is destroyed
        hosts             = [];
        renderer          = Neo.ns('Neo.test.app', true).CanvasIdRenderer = createRenderer()
    });

    test.afterEach(() => {
        hosts.forEach(host => host.isDestroyed || host.destroy());
        Neo.worker.Canvas = canvasWorker;
        delete Neo.ns('Neo.test.app').CanvasIdRenderer
    });

    /**
     * @param {Object} config
     * @returns {Object}
     */
    function create(config) {
        const host = Neo.create(CanvasIdHost, {windowId: 'canvas-id-window', ...config});

        hosts.push(host);

        return host
    }

    /**
     * Starts the host's graph the way a registered offscreen canvas does.
     * @param {Object} host
     * @returns {Promise<Object>}
     */
    async function start(host) {
        await host.ready();
        host.offscreenRegistered = true;
        await host.registration;

        return host
    }

    test('all seven remotes carry canvasId beside windowId, at every call site', async () => {
        const host = create({id: 'canvas-id-host', rect: {height: 100, left: 10, top: 20, width: 200}});

        host.pause(); // held before the canvas is ready, so the ready hook sends it
        await start(host);

        host.resume();
        host.pause();
        host.onClick({clientX: 40, clientY: 50});
        host.onMouseLeave({});
        host.theme = 'neo-theme-dark';
        host.destroy();

        expect(renderer.calls.map(([name]) => name)).toEqual([
            'initGraph', 'setTheme', 'pause', 'updateSize', 'resume', 'pause', 'updateMouseState', 'updateMouseState',
            'setTheme', 'clearGraph'
        ]);
        expect(new Set(renderer.calls.map(([name]) => name))).toEqual(new Set(remotes));

        for (const [name, data] of renderer.calls) {
            expect(data, name).toMatchObject({canvasId: 'canvas-id-host', windowId: 'canvas-id-window'})
        }
    });

    test('the clear names the canvas and window the host started, whatever the host reads afterwards', async () => {
        const host = await start(create({id: 'canvas-id-moved', rect: {height: 100, left: 0, top: 0, width: 200}}));

        host.canvasId = 'canvas-id-renamed';
        host.windowId = 'canvas-id-window-b';
        host.destroy();

        expect(renderer.calls.at(-1)).toEqual(['clearGraph', {canvasId: 'canvas-id-moved', windowId: 'canvas-id-window'}])
    });

    test('two hosts of one renderer class each reach their own canvas entry', async () => {
        const a = await start(create({id: 'canvas-id-a', rect: {height: 100, left: 0, top: 0, width: 200}})),
              b = await start(create({id: 'canvas-id-b', rect: {height: 150, left: 300, top: 0, width: 300}}));

        a.pause();
        b.onClick({clientX: 340, clientY: 50});
        a.destroy();

        const {canvases} = renderer;

        expect(Object.keys(canvases).sort(), 'no call lands outside its canvas').toEqual(['canvas-id-a', 'canvas-id-b']);

        expect(canvases['canvas-id-a'].updateSize).toMatchObject({height: 100, width: 200});
        expect(canvases['canvas-id-b'].updateSize).toMatchObject({height: 150, width: 300});

        expect(canvases['canvas-id-a'].pause, 'the pause reaches the host that paused').toBeDefined();
        expect(canvases['canvas-id-b'].pause).toBeUndefined();

        expect(canvases['canvas-id-b'].updateMouseState).toMatchObject({click: true, x: 40, y: 50});
        expect(canvases['canvas-id-a'].updateMouseState).toBeUndefined();

        expect(canvases['canvas-id-a'].clearGraph, 'the clear releases the host that left').toBeDefined();
        expect(canvases['canvas-id-b'].clearGraph).toBeUndefined()
    })
});
