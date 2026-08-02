import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainMouseSensorTest'
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

// The sensor module imports the eager DomEvents main-thread singleton. Install a native listener
// surface before that dynamic import; EventTarget preserves real add/remove/dispatch semantics
// while the spec drives trusted-shaped synthetic events through it. Each test gets a FRESH
// document: attach() registers per-sensor listeners, and a stale surface would let one test's
// sensor answer another test's mousedown.
const originalDocument = globalThis.document,
      originalWindow   = globalThis.window;

let bodyClasses, documentRef;

function installDocument() {
    bodyClasses = new Set();
    documentRef = new EventTarget();

    documentRef.body = {
        classList: {
            add     : cls => bodyClasses.add(cls),
            remove  : cls => bodyClasses.delete(cls),
            contains: cls => bodyClasses.has(cls)
        }
    };
    documentRef.documentElement  = {};
    documentRef.elementFromPoint = () => null;

    // sensor.Base.trigger() uses the legacy createEvent/initEvent pair: return a real Event
    // (dispatchEvent demands one) whose read-only `type` is shadowed by an own getter.
    documentRef.createEvent = () => {
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
globalThis.window = new EventTarget();

const {default: Mouse} = await import('../../../../../../src/main/draggable/sensor/Mouse.mjs');

// A drag target the sensor's path-inclusion probe accepts; isConnected: false routes the
// sensor's custom-event dispatch to the document fallback (Base.trigger).
const dragNode = {
    classList  : {contains: cls => cls === 'neo-draggable'},
    isConnected: false
};

function createSensor(overrides={}) {
    const sensor = Object.create(Mouse.prototype);

    Object.assign(sensor, {
        currentElement   : null,
        delay            : 0,
        dragging         : false,
        dragTargetClasses: ['neo-draggable', 'neo-resizable'],
        minDistance      : 5,
        mouseDownTime    : 0,
        mouseDownTimeout : null,
        pageX            : null,
        pageY            : null,
        startEvent       : null
    }, overrides);

    // Neo.bindMethods equivalent for a construct-less instance: listener identity must be
    // stable across add/removeEventListener.
    ['onDistanceChange', 'onMouseDown', 'onMouseMove', 'onMouseUp'].forEach(method => {
        sensor[method] = sensor[method].bind(sensor)
    });

    return sensor
}

function mouseEvent(type, props) {
    const event = new Event(type, {bubbles: true});

    Object.assign(event, props);

    return event
}

function mouseDown() {
    return mouseEvent('mousedown', {
        button : 0,
        clientX: 10,
        clientY: 10,
        pageX  : 10,
        pageY  : 10,
        path   : [dragNode]
    })
}

/**
 * @summary Terminal contract of the gesture-scoped selection guard (`neo-drag-active`).
 *
 * The class brackets the PHYSICAL gesture, not the logical drag: the sensor adds it at
 * mousedown on a drag target and endGesture() releases it — on an ordinary mouseup, or when
 * the gesture's own move stream observes the primary button gone (a release that happened
 * off-document never reaches onMouseUp, so the move stream is the independent terminal
 * witness). The delay-timeout's coords-only re-entry carries no `buttons` and must never
 * trigger the recovery.
 */
test.describe('Neo.main.draggable.sensor.Mouse — selection-guard terminal contract', () => {
    test.beforeEach(() => {
        installDocument()
    });

    test.afterAll(() => {
        originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
    });

    test('ordinary bracket: mousedown adds the guard, mouseup releases it', () => {
        const sensor = createSensor();

        Mouse.prototype.attach.call(sensor);

        documentRef.dispatchEvent(mouseDown());
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        documentRef.dispatchEvent(mouseEvent('mouseup', {button: 0, clientX: 10, clientY: 10, pageX: 10, pageY: 10}));
        expect(bodyClasses.has('neo-drag-active')).toBe(false);

        sensor.detach()
    });

    test('pre-threshold lost release: a move reporting the primary button gone retires the guard', () => {
        const sensor = createSensor();

        Mouse.prototype.attach.call(sensor);

        documentRef.dispatchEvent(mouseDown());
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        // The release happened off-document: no mouseup ever arrives, and the next observed
        // move reports buttons=0. The sensor must treat it as the release never received.
        documentRef.dispatchEvent(mouseEvent('mousemove', {buttons: 0, clientX: 30, clientY: 30, pageX: 30, pageY: 30}));

        expect(bodyClasses.has('neo-drag-active')).toBe(false);
        expect(sensor.dragging).toBe(false);

        sensor.detach()
    });

    test('mid-drag lost release emits exactly one drag:end, retires the guard, and ignores a later mouseup', () => {
        const ends   = [],
              sensor = createSensor();

        Mouse.prototype.attach.call(sensor);
        documentRef.addEventListener('drag:end', event => ends.push(event.detail));

        documentRef.dispatchEvent(mouseDown());
        documentRef.dispatchEvent(mouseEvent('mousemove', {buttons: 1, clientX: 60, clientY: 60, pageX: 60, pageY: 60}));

        expect(sensor.dragging).toBe(true);
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        documentRef.dispatchEvent(mouseEvent('mousemove', {buttons: 0, clientX: 80, clientY: 80, pageX: 80, pageY: 80}));

        expect(bodyClasses.has('neo-drag-active')).toBe(false);
        expect(sensor.dragging).toBe(false);
        expect(sensor.currentElement).toBe(null);
        expect(ends.length).toBe(1);
        expect(ends[0].type).toBe('drag:end');

        // endGesture detached every gesture listener: a trailing mouseup must not double-terminate.
        documentRef.dispatchEvent(mouseEvent('mouseup', {button: 0, clientX: 80, clientY: 80, pageX: 80, pageY: 80}));
        expect(ends.length).toBe(1);

        sensor.detach()
    });

    test('the delay-timeout re-entry (coords only, no buttons) never triggers the lost-release recovery', () => {
        const sensor = createSensor();

        Mouse.prototype.attach.call(sensor);

        documentRef.dispatchEvent(mouseDown());
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        // The exact shape the mouseDownTimeout callback passes: pageX/pageY and nothing else.
        sensor.onDistanceChange({pageX: 12, pageY: 12});

        expect(bodyClasses.has('neo-drag-active')).toBe(true);
        expect(sensor.dragging).toBe(false);

        clearTimeout(sensor.mouseDownTimeout);
        sensor.detach()
    })
});
