/**
 * @file test/playwright/unit/app/SharedCanvasVisibility.spec.mjs
 * @summary Pins when `Neo.app.SharedCanvas` lets its renderer loop run: never while its window is hidden, never
 * while the host holds its own pause, and a window becoming visible never lifts the host's own pause. The host
 * listens to the `visibilitychange` of the window it lives in, follows itself into another window, and stops
 * listening once destroyed.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'SharedCanvasVisibilityTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import SharedCanvas   from '../../../../src/app/SharedCanvas.mjs';

/**
 * A host without its worker and DOM seams: no renderer module to load, no canvas to transfer, no size to observe.
 * @class Neo.test.app.VisibilityHost
 * @extends Neo.app.SharedCanvas
 */
class VisibilityHost extends SharedCanvas {
    static config = {
        className         : 'Neo.test.app.VisibilityHost',
        monitorSize       : false,
        offscreen         : false,
        rendererClassName : 'Neo.test.app.VisibilityRenderer',
        rendererImportPath: null
    }
}

Neo.setupClass(VisibilityHost);

const renderer = {
    calls: [],
    clearGraph() {},
    pause() {this.calls.push('pause')},
    resume() {this.calls.push('resume')},
    setTheme() {}
};

/**
 * An app as far as the host uses one: it holds `visibilitychange` listeners and fires them.
 * @returns {Object}
 */
function createApp() {
    const listeners = [];

    return {
        listeners,
        fire(name, data) {
            listeners.filter(entry => entry.name === name).forEach(entry => entry.fn.call(entry.scope, data))
        },
        on(name, fn, scope) {
            listeners.push({fn, name, scope})
        },
        un(name, fn, scope) {
            const index = listeners.findIndex(entry => entry.name === name && entry.fn === fn && entry.scope === scope);

            index > -1 && listeners.splice(index, 1)
        }
    }
}

test.describe('Neo.app.SharedCanvas — a hidden window pauses the render loop, apart from the host\'s own pause', () => {
    let host, windowA, windowB;

    const setHidden = (app, hidden) => app.fire('visibilitychange', {hidden, visibilityState: hidden ? 'hidden' : 'visible'});

    test.beforeEach(() => {
        Neo.ns('Neo.test.app', true).VisibilityRenderer = renderer;
        renderer.calls.length = 0;

        windowA = createApp();
        windowB = createApp();
        Neo.apps['visibility-window-a'] = windowA;
        Neo.apps['visibility-window-b'] = windowB;

        host = Neo.create(VisibilityHost, {windowId: 'visibility-window-a'})
    });

    test.afterEach(() => {
        host.isDestroyed || host.destroy();
        delete Neo.apps['visibility-window-a'];
        delete Neo.apps['visibility-window-b']
    });

    test('a hidden window pauses the renderer, and a visible one resumes it', () => {
        host.isCanvasReady = true;

        setHidden(windowA, true);
        setHidden(windowA, false);

        expect(renderer.calls).toEqual(['pause', 'resume'])
    });

    test('a host paused for its own reason stays paused when its window comes back', () => {
        host.isCanvasReady = true;
        host.pause();

        setHidden(windowA, true);
        setHidden(windowA, false);

        expect(renderer.calls, 'no resume while the host holds its pause').toEqual(['pause', 'pause', 'pause']);

        host.resume();

        expect(renderer.calls.at(-1)).toBe('resume')
    });

    test('a canvas that becomes ready while its window is hidden starts paused', () => {
        setHidden(windowA, true);

        expect(renderer.calls, 'nothing reaches a canvas that is not ready').toEqual([]);

        host.isCanvasReady = true;

        expect(renderer.calls).toEqual(['pause'])
    });

    test('the host follows itself into another window, and a destroyed host no longer listens', () => {
        expect(windowA.listeners).toHaveLength(1);

        host.windowId = 'visibility-window-b';

        expect(windowA.listeners, 'the old window lets go').toHaveLength(0);
        expect(windowB.listeners).toHaveLength(1);

        host.destroy();

        expect(windowB.listeners).toHaveLength(0)
    })
});
