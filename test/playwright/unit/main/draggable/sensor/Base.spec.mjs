import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainDraggableSensorBaseTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import SensorBase     from '../../../../../../src/main/draggable/sensor/Base.mjs';

/**
 * @summary The sensor dispatch-target discrimination witnesses.
 *
 * `trigger()` is the single seam every sensor event (drag:start / drag:move / drag:end) rides to
 * the document-level drag owner. A gesture's own side effects can remove or replace the SOURCE
 * node mid-drag (sort visuals lift the item, an overflow plugin re-collapses the toolbar, a live
 * re-render swaps nodes) — and an event dispatched on a detached node bubbles nowhere, silently
 * starving the move stream AND the release. These witnesses discriminate WHICH dispatch branch
 * executes: connected source → the element carries the event (bubbling reaches document);
 * detached source → the document carries it directly. End-to-end green alone cannot prove the
 * branch — this spec can.
 */
test.describe('Neo.main.draggable.sensor.Base', () => {
    /**
     * One capture-phase document listener per test, detached afterwards.
     * @param {String} type
     * @returns {Object} {received, dispose}
     */
    const listenOnDocument = type => {
        const received = [];
        const handler  = event => received.push({detail: event.detail, target: event.target});

        document.addEventListener(type, handler, true);

        return {received, dispose: () => document.removeEventListener(type, handler, true)}
    };

    test('connected source: the element carries the dispatch — bubbling reaches the document owner', () => {
        const sensor  = Neo.create(SensorBase, {}),
              element = document.createElement('div'),
              probe   = listenOnDocument('drag:move'),
              payload = {clientX: 40, clientY: 50, type: 'drag:move'};

        document.body.appendChild(element);
        expect(element.isConnected).toBe(true);

        const returned = sensor.trigger(element, payload);

        expect(returned).toBe(payload);
        expect(sensor.lastEvent).toBe(payload);
        expect(probe.received).toHaveLength(1);
        expect(probe.received[0].detail).toBe(payload);
        // the CONNECTED branch dispatched on the element itself — document saw it via bubbling
        expect(probe.received[0].target).toBe(element);

        probe.dispose();
        element.remove();
        sensor.destroy()
    });

    test('detached source: the document carries the dispatch — the move stream survives node loss', () => {
        const sensor  = Neo.create(SensorBase, {}),
              element = document.createElement('div'),
              probe   = listenOnDocument('drag:end'),
              payload = {clientX: 400, clientY: 300, type: 'drag:end'};

        // never appended — the exact shape of a source node a mid-drag re-render removed
        expect(element.isConnected).toBe(false);

        const returned = sensor.trigger(element, payload);

        expect(returned).toBe(payload);
        expect(sensor.lastEvent).toBe(payload);
        expect(probe.received, 'a detached dispatch target must not swallow the event').toHaveLength(1);
        expect(probe.received[0].detail).toBe(payload);
        // the DETACHED branch dispatched on document directly — consumers read detail, never the target
        expect(probe.received[0].target).toBe(document);

        probe.dispose();
        sensor.destroy()
    });

    test('mid-gesture removal: the same element flips branches without losing an event', () => {
        const sensor  = Neo.create(SensorBase, {}),
              element = document.createElement('div'),
              probe   = listenOnDocument('drag:move');

        document.body.appendChild(element);
        sensor.trigger(element, {step: 1, type: 'drag:move'});

        element.remove(); // the overflow-re-collapse moment
        sensor.trigger(element, {step: 2, type: 'drag:move'});

        expect(probe.received.map(entry => entry.detail.step), 'both frames delivered across the branch flip').toEqual([1, 2]);
        expect(probe.received[0].target).toBe(element);
        expect(probe.received[1].target).toBe(document);

        probe.dispose();
        sensor.destroy()
    })
});
