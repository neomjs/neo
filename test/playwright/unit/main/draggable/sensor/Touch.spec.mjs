import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainTouchSensorTest'
    },
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

// The same native listener surface the Mouse sensor spec installs: EventTarget keeps real
// add/remove/dispatch semantics, and the sensor's module-level `window.addEventListener` needs a
// window before the dynamic import. Each test gets a fresh document.
const originalDocument = globalThis.document,
      originalWindow   = globalThis.window;

let documentRef;

function installDocument() {
    documentRef = new EventTarget();

    documentRef.body             = {classList: {add() {}, remove() {}, contains: () => false}};
    documentRef.documentElement  = {};
    documentRef.elementFromPoint = () => null;
    documentRef.createEvent      = () => {
        let   type  = 'placeholder';
        const event = new Event(type);

        Object.defineProperty(event, 'type', {configurable: true, get: () => type});
        event.initEvent = newType => { type = newType };

        return event
    };

    globalThis.document = documentRef;

    return documentRef
}

installDocument();
globalThis.window = Object.assign(new EventTarget(), {scrollX: 0, scrollY: 0});

const {default: Touch} = await import('../../../../../../src/main/draggable/sensor/Touch.mjs');

// A drag target the sensor's path-inclusion probe accepts; isConnected: false routes the
// sensor's custom-event dispatch to the document fallback (Base.trigger).
const dragNode = {
    classList  : {contains: cls => cls === 'neo-draggable'},
    isConnected: false
};

function createSensor(overrides={}) {
    const sensor = Object.create(Touch.prototype);

    Object.assign(sensor, {
        currentElement   : null,
        delay            : 0,
        dragging         : false,
        dragTargetClasses: ['neo-draggable', 'neo-resizable'],
        minDistance      : 0,
        pageX            : null,
        pageY            : null,
        startEvent       : null,
        tapTimeout       : null,
        touchStartTime   : 0
    }, overrides);

    ['onDistanceChange', 'onTouchEnd', 'onTouchMove', 'onTouchStart', 'startDrag'].forEach(method => {
        sensor[method] = sensor[method].bind(sensor)
    });

    return sensor
}

function touchEvent(type, point) {
    const event = new Event(type, {bubbles: true});

    Object.assign(event, {changedTouches: [point], path: [dragNode], touches: type === 'touchend' ? [] : [point]});

    return event
}

/**
 * @summary The Touch sensor's release contract mirrors the Mouse sensor's: the pressed element is
 * bracket state — set on touchstart over a drag target, cleared on every touchend — whether or
 * not the touch ever crossed the delay + distance threshold into a drag.
 */
test.describe('Neo.main.draggable.sensor.Touch — release contract', () => {
    test.beforeEach(() => {
        installDocument()
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test('a tap that never became a drag leaves no pressed element behind', () => {
        const sensor = createSensor();

        Touch.prototype.attach.call(sensor);

        documentRef.dispatchEvent(touchEvent('touchstart', {pageX: 10, pageY: 10}));
        expect(sensor.currentElement).toBe(dragNode);
        expect(sensor.startEvent).not.toBe(null);

        documentRef.dispatchEvent(touchEvent('touchend', {pageX: 10, pageY: 10}));

        expect(sensor.currentElement).toBe(null);
        expect(sensor.startEvent).toBe(null);
        expect(sensor.dragging).toBe(false);

        sensor.detach()
    });

    test('a drag still ends with exactly one drag:end and the same idle state', () => {
        const ends   = [],
              sensor = createSensor();

        Touch.prototype.attach.call(sensor);
        documentRef.addEventListener('drag:end', event => ends.push(event.detail));

        documentRef.dispatchEvent(touchEvent('touchstart', {pageX: 10, pageY: 10}));
        // delay 0 and minDistance 0: the first move crosses the threshold and opens the drag
        documentRef.dispatchEvent(touchEvent('touchmove', {pageX: 40, pageY: 40}));
        expect(sensor.dragging).toBe(true);

        documentRef.dispatchEvent(touchEvent('touchend', {pageX: 40, pageY: 40}));

        expect(ends).toHaveLength(1);
        expect(ends[0].type).toBe('drag:end');
        expect(sensor.currentElement).toBe(null);
        expect(sensor.startEvent).toBe(null);
        expect(sensor.dragging).toBe(false);

        sensor.detach()
    })
});
