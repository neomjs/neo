import {setup} from '../../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainPointerSensorTest'
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
// surface before that dynamic import; EventTarget preserves real add/remove/dispatch semantics while
// the spec drives trusted-shaped synthetic events through it. Each test gets a FRESH document and
// window: attach() registers per-sensor listeners, and a stale surface would let one test's sensor
// answer another test's press.
const originalDocument = globalThis.document,
      originalWindow   = globalThis.window;

let bodyClasses, captureCalls, documentRef, hitNode, windowRef;

/**
 * @summary A document root that records the capture calls a sensor makes. `refuse` makes
 * `setPointerCapture()` throw as the platform does for a pointer it does not track.
 * @param {Object} [options]
 * @param {Boolean} [options.refuse=false]
 * @returns {Object}
 */
function captureRoot({refuse=false}={}) {
    const captured = new Set();

    return {
        hasPointerCapture    : id => captured.has(id),
        releasePointerCapture: id => {captureCalls.push(['release', id]); captured.delete(id)},
        setPointerCapture    : id => {
            captureCalls.push(['set', id]);

            if (refuse) {
                throw new Error('NotFoundError: No active pointer with the given id is found.')
            }

            captured.add(id)
        }
    }
}

function installGlobals() {
    bodyClasses  = new Set();
    captureCalls = [];
    documentRef  = new EventTarget();
    windowRef    = new EventTarget();

    // the element under the pointer, one ancestor deep, for the hit-test path
    hitNode = {id: 'hit', parentNode: {id: 'hit-parent', parentNode: null}};

    documentRef.body = {
        classList: {
            add     : cls => bodyClasses.add(cls),
            remove  : cls => bodyClasses.delete(cls),
            contains: cls => bodyClasses.has(cls)
        }
    };
    documentRef.documentElement  = captureRoot();
    documentRef.elementFromPoint = () => hitNode;

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
    globalThis.window   = windowRef
}

installGlobals();

const {default: Pointer} = await import('../../../../../../src/main/draggable/sensor/Pointer.mjs');

// A drag target the sensor's path-inclusion probe accepts; isConnected: false routes the sensor's
// custom-event dispatch to the document fallback (Base.trigger).
const dragNode = {
    classList  : {contains: cls => cls === 'neo-draggable'},
    isConnected: false
};

function createSensor(overrides={}) {
    const sensor = Object.create(Pointer.prototype);

    Object.assign(sensor, {
        currentElement    : null,
        delay             : 0,
        dragging          : false,
        dragTargetClasses : ['neo-draggable', 'neo-resizable'],
        hasCapture        : false,
        minDistance       : 5,
        point             : null,
        pointerDownTime   : 0,
        pointerDownTimeout: null,
        pointerId         : null,
        pointerType       : null,
        startEvent        : null,
        touchDelay        : 0,
        touchMinDistance  : 0
    }, overrides);

    // Neo.bindMethods equivalent for a construct-less instance: listener identity must be stable
    // across add/removeEventListener.
    ['onDistanceChange', 'onPointerCancel', 'onPointerDown', 'onPointerMove', 'onPointerUp', 'onTouchMove', 'suppressEvent'].forEach(method => {
        sensor[method] = sensor[method].bind(sensor)
    });

    return sensor
}

function pointerEvent(type, props) {
    const event = new Event(type, {bubbles: true, cancelable: true});

    Object.assign(event, {pointerId: 1, pointerType: 'mouse'}, props);

    return event
}

// page coordinates equal client ones (no scroll); the screen sits 100/200 px away from the viewport
function at(x, y) {
    return {clientX: x, clientY: y, pageX: x, pageY: y, screenX: x + 100, screenY: y + 200}
}

function pointerDown(props={}) {
    return pointerEvent('pointerdown', {button: 0, buttons: 1, ...at(10, 10), path: [dragNode], ...props})
}

function pointerMove(x, y, props={}) {
    return pointerEvent('pointermove', {button: -1, buttons: 1, ...at(x, y), ...props})
}

function pointerUp(x, y, props={}) {
    return pointerEvent('pointerup', {button: 0, buttons: 0, ...at(x, y), ...props})
}

function record(...types) {
    const seen = Object.fromEntries(types.map(type => [type, []]));

    types.forEach(type => documentRef.addEventListener(type, event => seen[type].push(event.detail)));

    return seen
}

function expectIdle(sensor) {
    expect(bodyClasses.has('neo-drag-active')).toBe(false);
    expect(sensor.currentElement).toBe(null);
    expect(sensor.dragging).toBe(false);
    expect(sensor.hasCapture).toBe(false);
    expect(sensor.pointerId).toBe(null);
    expect(sensor.startEvent).toBe(null);
    // the exact predicate `Neo.main.addon.EventSimulator#driveDrag` reads before refusing a drive as busy
    expect(Boolean(sensor.currentElement || sensor.dragging)).toBe(false)
}

test.beforeEach(() => {
    installGlobals()
});

test.afterAll(() => {
    originalDocument === undefined ? delete globalThis.document : globalThis.document = originalDocument;
    originalWindow   === undefined ? delete globalThis.window   : globalThis.window   = originalWindow
});

/**
 * @summary The physical gesture bracket (`neo-drag-active`) and every terminal of the pointer.
 *
 * The class brackets the PHYSICAL gesture, not the logical drag: the sensor adds it at the press on
 * a drag target and endGesture() releases it on the pointer's terminal: `pointerup`,
 * `pointercancel`, the gesture's own move stream observing the primary button gone, or the same
 * pointer pressing again. The lost-release recovery fires on TRUSTED streams only: synthetic
 * dispatches carry `isTrusted` undefined in this harness (never forgeable), so the recovery tests
 * stub ONLY the `isTrustedEvent` seam and the shipped buttons logic stays under test.
 */
test.describe('Neo.main.draggable.sensor.Pointer — gesture bracket and terminals', () => {
    test('ordinary bracket: pointerdown adds the guard, pointerup releases it', () => {
        const sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        expect(bodyClasses.has('neo-drag-active')).toBe(true);
        expect(sensor.currentElement).toBe(dragNode);

        documentRef.dispatchEvent(pointerUp(10, 10));
        expectIdle(sensor);

        sensor.detach()
    });

    test('a release before the threshold leaves no pressed element behind: the sensor reads idle for the next gesture', () => {
        const seen   = record('drag:start', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        expect(sensor.startEvent).not.toBe(null);

        // an ordinary click on a drag target: the release lands inside the threshold and no
        // drag:start was ever emitted, so the bracket ends and with it the pressed element
        documentRef.dispatchEvent(pointerUp(10, 10));

        expectIdle(sensor);
        expect(sensor.point).toBe(null);
        expect(sensor.pointerDownTime).toBe(0);
        expect(seen['drag:start']).toHaveLength(0);
        expect(seen['drag:end']).toHaveLength(0);

        sensor.detach()
    });

    test('pre-threshold lost release: a move reporting the primary button gone retires the guard', () => {
        const sensor = createSensor();

        // Stub ONLY the trust bit, so the shipped buttons logic of isLostReleaseSignal stays under
        // test: a dead predicate turns this test red.
        sensor.isTrustedEvent = () => true;
        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        documentRef.dispatchEvent(pointerMove(30, 30, {buttons: 0}));

        expectIdle(sensor);

        sensor.detach()
    });

    test('mid-drag lost release emits exactly one drag:end, retires the guard, and ignores a later pointerup', () => {
        const seen   = record('drag:end'),
              sensor = createSensor();

        sensor.isTrustedEvent = () => true;
        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(60, 60));

        expect(sensor.dragging).toBe(true);
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        documentRef.dispatchEvent(pointerMove(80, 80, {buttons: 0}));

        expectIdle(sensor);
        expect(seen['drag:end']).toHaveLength(1);
        expect(seen['drag:end'][0]).toMatchObject({clientX: 80, clientY: 80, type: 'drag:end'});

        // endGesture detached every gesture listener: a trailing pointerup must not double-terminate
        documentRef.dispatchEvent(pointerUp(80, 80));
        expect(seen['drag:end']).toHaveLength(1);

        sensor.detach()
    });

    test('the delay-timeout re-entry (coords only, no buttons) never triggers the lost-release recovery', () => {
        const sensor = createSensor();

        sensor.isTrustedEvent = () => true;
        sensor.attach();

        documentRef.dispatchEvent(pointerDown());

        // The exact shape the pointerDownTimeout callback passes: coords and the pointer, no buttons.
        sensor.onDistanceChange({clientX: 12, clientY: 12, pageX: 12, pageY: 12, pointerId: 1});

        expect(bodyClasses.has('neo-drag-active')).toBe(true);
        expect(sensor.currentElement).toBe(dragNode);
        expect(sensor.dragging).toBe(false);

        clearTimeout(sensor.pointerDownTimeout);
        sensor.detach()
    });

    test('trust boundary: an untrusted (JS-constructed) buttons=0 move never triggers the recovery', () => {
        const sensor = createSensor();

        // The REAL predicate, no stub: synthetic streams may construct events without the buttons
        // bitmask, and isTrusted is undefined in this harness. Reading that as a lost release would
        // wedge every synthetic drag on its first move.
        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(30, 30, {buttons: 0}));

        expect(bodyClasses.has('neo-drag-active')).toBe(true);
        expect(sensor.currentElement).toBe(dragNode);
        expect(sensor.dragging, 'the distance path stays open: the move armed the drag').toBe(true);

        documentRef.dispatchEvent(pointerUp(30, 30));
        sensor.detach()
    });

    test('pointercancel before the threshold ends the claim without a drag:end', () => {
        const seen   = record('drag:start', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerEvent('pointercancel', {...at(0, 0)}));

        expectIdle(sensor);
        expect(seen['drag:start']).toHaveLength(0);
        expect(seen['drag:end']).toHaveLength(0);

        sensor.detach()
    });

    test('pointercancel ends an engaged drag with exactly one drag:end at the last known point', () => {
        const seen   = record('drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));
        documentRef.dispatchEvent(pointerMove(70, 50));
        expect(sensor.dragging).toBe(true);

        // the platform's cancel carries no usable position
        documentRef.dispatchEvent(pointerEvent('pointercancel', {...at(0, 0)}));

        expectIdle(sensor);
        expect(seen['drag:end']).toHaveLength(1);
        expect(seen['drag:end'][0]).toMatchObject({clientX: 70, clientY: 50, type: 'drag:end'});

        documentRef.dispatchEvent(pointerUp(70, 50));
        expect(seen['drag:end'], 'the cancel is the terminal; a later release cannot end it twice').toHaveLength(1);

        sensor.detach()
    });

    test('only the gesture\'s own pointer moves or ends it, and another pointer\'s press is no new claim', () => {
        const seen   = record('drag:move', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));
        expect(sensor.dragging).toBe(true);

        documentRef.dispatchEvent(pointerMove(90, 90, {pointerId: 7}));
        documentRef.dispatchEvent(pointerDown({pointerId: 7, ...at(90, 90)}));
        documentRef.dispatchEvent(pointerUp(90, 90, {pointerId: 7}));
        documentRef.dispatchEvent(pointerEvent('pointercancel', {pointerId: 7}));

        expect(seen['drag:move']).toHaveLength(0);
        expect(seen['drag:end']).toHaveLength(0);
        expect(sensor.dragging).toBe(true);
        expect(sensor.pointerId).toBe(1);

        documentRef.dispatchEvent(pointerMove(50, 50));
        documentRef.dispatchEvent(pointerUp(50, 50));

        expect(seen['drag:move']).toHaveLength(1);
        expect(seen['drag:end']).toHaveLength(1);
        expectIdle(sensor);

        sensor.detach()
    });

    test('the same pointer pressing again proves its release was lost: the stale drag ends once, the press is claimed', () => {
        const seen   = record('drag:start', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));
        expect(sensor.dragging).toBe(true);

        const press = pointerDown({...at(200, 200)});

        documentRef.dispatchEvent(press);

        expect(seen['drag:end']).toHaveLength(1);
        expect(seen['drag:end'][0]).toMatchObject({clientX: 40, clientY: 40});
        expect(sensor.currentElement).toBe(dragNode);
        expect(sensor.startEvent).toBe(press);
        expect(sensor.dragging).toBe(false);
        expect(bodyClasses.has('neo-drag-active')).toBe(true);

        documentRef.dispatchEvent(pointerUp(200, 200));
        expectIdle(sensor);
        expect(seen['drag:end'], 'the new press never armed, so it ends without a drag:end').toHaveLength(1);

        sensor.detach()
    });

    test('a secondary button, ctrl or meta press claims nothing', () => {
        const sensor = createSensor();

        sensor.attach();

        [{button: 2}, {ctrlKey: true}, {metaKey: true}].forEach(props => {
            documentRef.dispatchEvent(pointerDown(props));
            expectIdle(sensor)
        });

        sensor.detach()
    });

    test('a claimed gesture cancels native dragstart until its terminal, and contextmenu while engaged', () => {
        const sensor = createSensor(),
              native = type => {
                  const event = new Event(type, {bubbles: true, cancelable: true});

                  documentRef.dispatchEvent(event);

                  return event.defaultPrevented
              };

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        expect(native('dragstart')).toBe(true);
        expect(native('contextmenu'), 'not engaged yet').toBe(false);

        documentRef.dispatchEvent(pointerMove(40, 40));
        expect(native('contextmenu')).toBe(true);

        documentRef.dispatchEvent(pointerUp(40, 40));
        expect(native('dragstart')).toBe(false);
        expect(native('contextmenu')).toBe(false);

        sensor.detach()
    })
});

/**
 * @summary Pointer capture: taken at the post-threshold drag start on the document root, never at
 * the press, released at every terminal, and best effort for a pointer the platform does not track.
 */
test.describe('Neo.main.draggable.sensor.Pointer — pointer capture', () => {
    test('capture is taken at drag start, never at the press, and released at the terminal', () => {
        const seen   = record('drag:start', 'drag:move', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        const press = pointerDown();

        documentRef.dispatchEvent(press);
        expect(captureCalls, 'a press that may still be a click must stay uncaptured').toEqual([]);

        documentRef.dispatchEvent(pointerMove(40, 40));
        expect(captureCalls).toEqual([['set', 1]]);
        expect(sensor.hasCapture).toBe(true);

        // drag:start is the press, exactly as before capture existed
        expect(seen['drag:start']).toHaveLength(1);
        expect(seen['drag:start'][0]).toMatchObject({
            clientX: 10, clientY: 10, element: dragNode, originalEvent: press, path: [dragNode], type: 'drag:start'
        });
        expect(seen['drag:start'][0].eventPath).toBeUndefined();

        const move = pointerMove(60, 45);

        documentRef.dispatchEvent(move);

        expect(seen['drag:move']).toHaveLength(1);
        expect(seen['drag:move'][0]).toMatchObject({
            clientX      : 60,
            clientY      : 45,
            element      : dragNode,
            originalEvent: move,
            target       : hitNode,
            type         : 'drag:move'
        });
        // the captured event names the root; the detail names what is under the pointer
        expect(seen['drag:move'][0].eventPath).toEqual([hitNode, hitNode.parentNode, windowRef]);

        documentRef.dispatchEvent(pointerUp(60, 45));

        expect(seen['drag:end']).toHaveLength(1);
        expect(seen['drag:end'][0].eventPath).toEqual([hitNode, hitNode.parentNode, windowRef]);
        expect(captureCalls).toEqual([['set', 1], ['release', 1]]);
        expectIdle(sensor);

        sensor.detach()
    });

    test('pointercancel releases the capture as well', () => {
        const sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));
        documentRef.dispatchEvent(pointerEvent('pointercancel', {}));

        expect(captureCalls).toEqual([['set', 1], ['release', 1]]);
        expectIdle(sensor);

        sensor.detach()
    });

    test('a refused capture is a no-op: the drag streams through the document and states no eventPath', () => {
        const seen   = record('drag:move', 'drag:end'),
              sensor = createSensor();

        documentRef.documentElement = captureRoot({refuse: true});
        sensor.attach();

        documentRef.dispatchEvent(pointerDown({pointerId: 2_147_483_647}));
        documentRef.dispatchEvent(pointerMove(40, 40, {pointerId: 2_147_483_647}));

        expect(sensor.dragging).toBe(true);
        expect(sensor.hasCapture).toBe(false);

        documentRef.dispatchEvent(pointerMove(50, 50, {pointerId: 2_147_483_647}));
        documentRef.dispatchEvent(pointerUp(50, 50, {pointerId: 2_147_483_647}));

        expect(seen['drag:move']).toHaveLength(1);
        expect(seen['drag:move'][0].eventPath).toBeUndefined();
        expect(seen['drag:end']).toHaveLength(1);
        expect(captureCalls, 'nothing to release: the refused capture was never held').toEqual([['set', 2_147_483_647]]);
        expectIdle(sensor);

        sensor.detach()
    });

    test('a captured point outside every element states no eventPath', () => {
        const seen   = record('drag:move'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));

        documentRef.elementFromPoint = () => null;
        documentRef.dispatchEvent(pointerMove(-20, 40));

        expect(seen['drag:move'][0]).toMatchObject({clientX: -20, target: null});
        expect(seen['drag:move'][0].eventPath).toBeUndefined();

        documentRef.dispatchEvent(pointerUp(-20, 40));
        sensor.detach()
    })
});

/**
 * @summary The drag stream's coordinates are what the retired sensors reported: mouse and pen read
 * their compatibility mouse event, which Chromium floors from the pointer's fractional position (a
 * dock edge test can hinge on that pixel); touch keeps its touch point's precision.
 */
test.describe('Neo.main.draggable.sensor.Pointer — reported coordinates', () => {
    const drive = pointerType => {
        const seen   = record('drag:start', 'drag:move', 'drag:end'),
              sensor = createSensor();

        sensor.attach();

        documentRef.dispatchEvent(pointerDown({pointerType, ...at(10.6, 10.4)}));
        documentRef.dispatchEvent(pointerMove(30.5, 10.4, {pointerType}));
        documentRef.dispatchEvent(pointerMove(-10.6, 45.07, {pointerType}));
        documentRef.dispatchEvent(pointerUp(70.93, 50.5, {pointerType}));

        sensor.detach();

        return ['drag:start', 'drag:move', 'drag:end'].map(type => {
            const {clientX, clientY, screenX, screenY} = seen[type][0];

            return [clientX, clientY, screenX, screenY]
        })
    };

    for (const pointerType of ['mouse', 'pen']) {
        test(`${pointerType}: whole pixels, floored like the compatibility mouse event`, () => {
            expect(drive(pointerType)).toEqual([
                [10,  10, 110, 210],
                [-11, 45, 89,  245],
                [70,  50, 170, 250]
            ])
        })
    }

    test('touch: the touch point\'s own precision', () => {
        expect(drive('touch')).toEqual([
            [10.6,  10.4,  110.6, 210.4],
            [-10.6, 45.07, 89.4,  245.07],
            [70.93, 50.5,  170.93, 250.5]
        ])
    })
});

/**
 * @summary Touch keeps the retired Touch sensor's semantics: a long press arms the drag, a release
 * before it is a tap, and an engaged touch drag never pans the page.
 */
test.describe('Neo.main.draggable.sensor.Pointer — touch', () => {
    test('a tap that never became a drag leaves no pressed element behind', () => {
        const seen   = record('drag:start'),
              sensor = createSensor({touchDelay: 200});

        sensor.attach();

        documentRef.dispatchEvent(pointerDown({pointerType: 'touch'}));
        expect(sensor.currentElement).toBe(dragNode);

        documentRef.dispatchEvent(pointerMove(12, 12, {pointerType: 'touch'}));
        documentRef.dispatchEvent(pointerUp(12, 12, {pointerType: 'touch'}));

        expectIdle(sensor);
        expect(seen['drag:start']).toHaveLength(0);

        sensor.detach()
    });

    test('holding still past touchDelay arms the drag; the mouse distance threshold does not apply', async () => {
        const seen   = record('drag:start', 'drag:end'),
              sensor = createSensor({delay: 0, minDistance: 50, touchDelay: 10, touchMinDistance: 0});

        sensor.attach();

        documentRef.dispatchEvent(pointerDown({pointerType: 'touch'}));
        await new Promise(resolve => setTimeout(resolve, 40));

        expect(seen['drag:start']).toHaveLength(1);
        expect(sensor.dragging).toBe(true);

        documentRef.dispatchEvent(pointerUp(10, 10, {pointerType: 'touch'}));

        expect(seen['drag:end']).toHaveLength(1);
        expectIdle(sensor);

        sensor.detach()
    });

    test('on a touch device, the scroll lock cancels touchmove only while a touch drag is engaged', () => {
        const hasTouchEvents = Neo.config.hasTouchEvents,
              sensor         = createSensor(),
              touchMove      = () => {
                  const event = new Event('touchmove', {cancelable: true});

                  windowRef.dispatchEvent(event);

                  return event.defaultPrevented
              },
              engageTouch    = () => {
                  documentRef.dispatchEvent(pointerDown({pointerType: 'touch'}));
                  documentRef.dispatchEvent(pointerMove(30, 30, {pointerType: 'touch'}));
                  expect(sensor.dragging).toBe(true)
              };

        try {
            Neo.config.hasTouchEvents = true;
            sensor.attach();

            documentRef.dispatchEvent(pointerDown({pointerType: 'touch'}));
            expect(touchMove(), 'before the threshold a touch may still scroll').toBe(false);

            documentRef.dispatchEvent(pointerMove(30, 30, {pointerType: 'touch'}));
            expect(sensor.dragging).toBe(true);
            expect(touchMove()).toBe(true);

            documentRef.dispatchEvent(pointerUp(30, 30, {pointerType: 'touch'}));
            expect(touchMove()).toBe(false);

            // a mouse drag never touches the page's scrolling
            documentRef.dispatchEvent(pointerDown());
            documentRef.dispatchEvent(pointerMove(40, 40));
            expect(sensor.dragging).toBe(true);
            expect(touchMove()).toBe(false);
            documentRef.dispatchEvent(pointerUp(40, 40));

            engageTouch();
            sensor.detach();
            expect(touchMove(), 'detach removes the lock with the press listener').toBe(false);
            documentRef.dispatchEvent(pointerUp(30, 30, {pointerType: 'touch'}));

            // a device without touch events installs no blocking touchmove listener at all
            Neo.config.hasTouchEvents = false;
            sensor.attach();
            engageTouch();
            expect(touchMove()).toBe(false);
            documentRef.dispatchEvent(pointerUp(30, 30, {pointerType: 'touch'}));
            sensor.detach()
        } finally {
            Neo.config.hasTouchEvents = hasTouchEvents
        }
    });

    test('a touch gesture also stops dragstart and contextmenu propagating; a mouse gesture only cancels them', () => {
        const sensor = createSensor(),
              // a listener added after the sensor's own on the same phase reads the flags it left
              native = (type, capture) => {
                  let stopped = null;

                  const event    = new Event(type, {bubbles: true, cancelable: true}),
                        listener = () => {stopped = event.cancelBubble};

                  documentRef.addEventListener(type, listener, {capture});
                  documentRef.dispatchEvent(event);
                  documentRef.removeEventListener(type, listener, {capture});

                  return {prevented: event.defaultPrevented, stopped}
              };

        sensor.attach();

        documentRef.dispatchEvent(pointerDown());
        documentRef.dispatchEvent(pointerMove(40, 40));
        expect(native('dragstart',   false)).toEqual({prevented: true, stopped: false});
        expect(native('contextmenu', true)) .toEqual({prevented: true, stopped: false});
        documentRef.dispatchEvent(pointerUp(40, 40));

        documentRef.dispatchEvent(pointerDown({pointerType: 'touch'}));
        documentRef.dispatchEvent(pointerMove(40, 40, {pointerType: 'touch'}));
        expect(native('dragstart',   false)).toEqual({prevented: true, stopped: true});
        expect(native('contextmenu', true)) .toEqual({prevented: true, stopped: true});
        documentRef.dispatchEvent(pointerUp(40, 40, {pointerType: 'touch'}));

        sensor.detach()
    })
});
