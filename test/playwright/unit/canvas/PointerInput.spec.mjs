/**
 * @file test/playwright/unit/canvas/PointerInput.spec.mjs
 * @summary Pins the pointer contract between a canvas host and its worker renderer: `Neo.app.SharedCanvas`
 * forwards down, up, wheel and the held buttons beside move, click and leave through one payload, and
 * `Neo.canvas.Base#updateMouseState` turns every report into `mouse` state (position, movement, buttons,
 * modifiers) and the matching hook.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasPointerInputTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import CanvasBase     from '../../../../src/canvas/Base.mjs';
import SharedCanvas   from '../../../../src/app/SharedCanvas.mjs';

/**
 * A renderer that records which hook each report reached.
 * @class Neo.test.canvas.PointerRenderer
 * @extends Neo.canvas.Base
 */
class PointerRenderer extends CanvasBase {
    static config = {
        className: 'Neo.test.canvas.PointerRenderer'
    }

    hooks = []

    onMouseClick(data) {
        this.hooks.push(['click', data])
    }

    onMouseDown(data) {
        this.hooks.push(['down', data])
    }

    onMouseUp(data) {
        this.hooks.push(['up', data])
    }

    onWheel(data) {
        this.hooks.push(['wheel', data])
    }
}

Neo.setupClass(PointerRenderer);

const idle = {x: -1000, y: -1000, dx: 0, dy: 0, buttons: 0, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false};

test.describe('Neo.canvas.Base — pointer reports become mouse state and hooks', () => {
    let renderer;

    test.beforeEach(() => {
        renderer = Neo.create(PointerRenderer)
    });

    test.afterEach(() => {
        renderer.destroy()
    });

    test('starts idle, and a leave returns to idle from any state', () => {
        expect(renderer.mouse).toEqual(idle);

        renderer.updateMouseState({x: 10, y: 20, buttons: 1, shiftKey: true, down: true, button: 0});
        renderer.updateMouseState({x: 14, y: 26, buttons: 1});

        expect(renderer.mouse).toEqual({...idle, x: 14, y: 26, dx: 4, dy: 6, buttons: 1, shiftKey: true});

        renderer.updateMouseState({leave: true});

        expect(renderer.mouse).toEqual(idle);
        expect(renderer.hooks.map(([name]) => name), 'a leave reaches no hook').toEqual(['down'])
    });

    test('the first report after a leave moves by nothing', () => {
        renderer.updateMouseState({x: 100, y: 50});

        expect(renderer.mouse).toEqual({...idle, x: 100, y: 50});

        renderer.updateMouseState({x: 90, y: 55});

        expect(renderer.mouse).toEqual({...idle, x: 90, y: 55, dx: -10, dy: 5})
    });

    test('down, up, wheel and click reach their hooks with the payload', () => {
        const wheel = {deltaX: 0, deltaY: -120, deltaZ: 0, deltaMode: 0};

        renderer.updateMouseState({x: 1, y: 2, buttons: 1, button: 0, down: true});
        renderer.updateMouseState({x: 1, y: 2, buttons: 0, button: 0, up: true});
        renderer.updateMouseState({x: 1, y: 2, wheel, ctrlKey: true});
        renderer.updateMouseState({x: 1, y: 2, click: true});

        expect(renderer.hooks.map(([name]) => name)).toEqual(['down', 'up', 'wheel', 'click']);
        expect(renderer.hooks[2][1].wheel).toBe(wheel);
        expect(renderer.mouse).toEqual({...idle, x: 1, y: 2, ctrlKey: true})
    });

    test('clearGraph resets the pointer with the rest of the state', () => {
        renderer.updateMouseState({x: 7, y: 8, buttons: 2, altKey: true});
        renderer.clearGraph();

        expect(renderer.mouse).toEqual(idle)
    });
});

test.describe('Neo.app.SharedCanvas — the forwarders', () => {
    /**
     * The forwarders read four things from the host; a bare prototype instance carries exactly those, so no worker,
     * renderer module or DOM is needed.
     * @returns {{host: Object, reports: Object[]}}
     */
    const createHost = () => {
        const reports = [],
              host    = Object.create(SharedCanvas.prototype);

        // Own data properties shadow the prototype's config accessors, which need a constructed instance.
        for (const [key, value] of Object.entries({
            canvasRect   : {left: 100, top: 50},
            isCanvasReady: true,
            renderer     : {updateMouseState: report => reports.push(report)},
            windowId     : 'window-1'
        })) {
            Object.defineProperty(host, key, {value, writable: true})
        }

        return {host, reports}
    };

    const modifiers = {altKey: false, ctrlKey: true, metaKey: false, shiftKey: false};

    test('down, up and move carry canvas-relative coordinates, buttons and modifiers', () => {
        const {host, reports} = createHost();

        host.onMouseDown({clientX: 130, clientY: 70, button: 0, buttons: 1, ...modifiers});
        host.onMouseMove({clientX: 140, clientY: 75, buttons: 1, ...modifiers});
        host.onMouseUp({clientX: 140, clientY: 75, button: 0, buttons: 0, ...modifiers});

        expect(reports).toEqual([
            {windowId: 'window-1', x: 30, y: 20, button: 0, buttons: 1, down: true, ...modifiers},
            {windowId: 'window-1', x: 40, y: 25, buttons: 1, ...modifiers},
            {windowId: 'window-1', x: 40, y: 25, button: 0, buttons: 0, up: true, ...modifiers}
        ])
    });

    test('wheel carries the deltas beside the position', () => {
        const {host, reports} = createHost();

        host.onWheel({clientX: 130, clientY: 70, deltaX: 0, deltaY: 120, deltaZ: 0, deltaMode: 0, buttons: 0, ...modifiers});

        expect(reports).toEqual([{
            windowId: 'window-1', x: 30, y: 20, buttons: 0, wheel: {deltaX: 0, deltaY: 120, deltaZ: 0, deltaMode: 0}, ...modifiers
        }])
    });

    test('click and leave keep their shape', () => {
        const {host, reports} = createHost();

        host.onClick({clientX: 130, clientY: 70, button: 0, buttons: 0, ...modifiers});
        host.onMouseLeave({});

        expect(reports[0]).toMatchObject({windowId: 'window-1', x: 30, y: 20, click: true});
        expect(reports[1]).toEqual({leave: true, windowId: 'window-1'})
    });

    test('a report without a pointer position carries none, so the worker keeps its last one', () => {
        const {host, reports} = createHost();

        host.onWheel({deltaX: 0, deltaY: 120, deltaZ: 0, deltaMode: 0});

        expect(reports).toEqual([{windowId: 'window-1', wheel: {deltaX: 0, deltaY: 120, deltaZ: 0, deltaMode: 0}}]);

        const renderer = Neo.create(PointerRenderer);

        renderer.updateMouseState({x: 5, y: 6});
        renderer.updateMouseState(reports[0]);

        expect(renderer.mouse).toEqual({...idle, x: 5, y: 6});
        renderer.destroy()
    });

    test('nothing is forwarded before the canvas is ready or measured', () => {
        const {host, reports} = createHost();

        host.isCanvasReady = false;
        host.onWheel({clientX: 130, clientY: 70, deltaY: 1});
        host.onMouseDown({clientX: 130, clientY: 70, buttons: 1});

        host.isCanvasReady = true;
        host.canvasRect    = null;
        host.onWheel({clientX: 130, clientY: 70, deltaY: 1});

        expect(reports).toEqual([])
    });
});
