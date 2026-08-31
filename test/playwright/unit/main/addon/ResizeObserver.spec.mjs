import {setup} from '../../../setup.mjs';

setup({
    appConfig: {
        name: 'MainResizeObserverTest'
    },
    mockLocalStorage: false,
    mockMain        : false,
    neoConfig       : {
        unitTestMode: true
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

// The addon imports the eager DomAccess/DomEvents main-thread singletons and constructs a
// native ResizeObserver. Install every main-thread surface BEFORE the dynamic import; the
// specs then drive entries, frames, timers and visibility flips by hand.
const nodeMap = new Map();

const originalDocument         = globalThis.document,
      originalWindow           = globalThis.window,
      originalGetComputedStyle = globalThis.getComputedStyle,
      originalResizeObserver   = globalThis.ResizeObserver,
      originalRaf              = globalThis.requestAnimationFrame,
      originalCaf              = globalThis.cancelAnimationFrame;

let hiddenState = false,
    roCallback  = null,
    rafQueue    = new Map(),
    rafSequence = 0,
    sentMessages;

const documentRef = new EventTarget();

documentRef.body           = {};
documentRef.getElementById = id => nodeMap.get(id) ?? null;

Object.defineProperty(documentRef, 'hidden', {
    configurable: true,
    get         : () => hiddenState
});

// NAMED so `beforeEach` can re-install them. They are assigned here as well because the addon
// module is imported at this file's top level and must find a DOM already in place; the hook then
// guarantees they are still there for every test, including a second worker slice that skips this
// module's already-cached top level.
const getComputedStyleStub = node => ({
    getPropertyValue: prop => String(node.styleValues?.[prop] ?? '0')
});

const ResizeObserverStub = class {
    constructor(callback) { roCallback = callback }
    observe() {}
    unobserve() {}
    disconnect() {}
};

const requestAnimationFrameStub = callback => {
    rafSequence++;
    rafQueue.set(rafSequence, callback);
    return rafSequence
};

const cancelAnimationFrameStub = id => {
    rafQueue.delete(id)
};

globalThis.document              = documentRef;
globalThis.window                = new EventTarget();
globalThis.getComputedStyle      = getComputedStyleStub;
globalThis.ResizeObserver        = ResizeObserverStub;
globalThis.requestAnimationFrame = requestAnimationFrameStub;
globalThis.cancelAnimationFrame  = cancelAnimationFrameStub;

// Flushes the pending rAF queue, simulating one serviced frame.
function serviceFrame() {
    const callbacks = [...rafQueue.values()];
    rafQueue.clear();
    callbacks.forEach(callback => callback(performance.now()))
}

function setHidden(value) {
    hiddenState = value;
    documentRef.dispatchEvent(new Event('visibilitychange'))
}

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Other main-thread singletons in the import graph forward visibility flips over the same
// worker bridge; the contract under test is the resize stream alone.
const resizeMessages = () => sentMessages.filter(entry => entry.message.eventName === 'resize');

// Node shape covering the read-set of DomEvents.getTargetData() plus the addon's own
// offset metric and computed-style reads.
function makeNode(id, width, height, styleValues={}) {
    const node = {
        id,
        childElementCount: 0,
        classList        : [],
        clientLeft       : 0,
        clientTop        : 0,
        dataset          : {},
        draggable        : false,
        getAttribute     : () => null,
        isConnected      : true,
        nodeName         : 'DIV',
        offsetHeight     : height,
        offsetWidth      : width,
        parentNode       : null,
        styleValues,
        style            : {},
        tagName          : 'DIV',

        getBoundingClientRect() {
            return {
                bottom: node.offsetHeight, height: node.offsetHeight, left: 0, right: node.offsetWidth,
                top   : 0, width: node.offsetWidth, x: 0, y: 0
            }
        }
    };

    Object.defineProperties(node, {
        clientHeight: {get: () => node.offsetHeight},
        clientWidth : {get: () => node.offsetWidth}
    });

    nodeMap.set(id, node);

    return node
}

// A native-shaped ResizeObserverEntry for the fake observer to deliver.
function makeEntry(node) {
    const blockSize = node.offsetHeight, inlineSize = node.offsetWidth;

    return {
        target                   : node,
        borderBoxSize            : [{blockSize, inlineSize}],
        contentBoxSize           : [{blockSize, inlineSize}],
        devicePixelContentBoxSize: [{blockSize, inlineSize}],

        contentRect: {
            bottom: blockSize, height: blockSize, left: 0, right: inlineSize,
            top   : 0, width: inlineSize, x: 0, y: 0
        }
    }
}

// The unit harness pre-installs worker-facing stubs on Neo.main.addon.ResizeObserver and
// Neo.main.DomAccess; importing the real main-thread modules collides with both. Swap the
// stubs out for this file and back in afterAll — with worker-process reuse, later spec
// files (the grid suite reads the mock's fixed 1000x1000 rects) must find what they expect.
const stubAddonNamespace     = Neo.main.addon.ResizeObserver,
      stubDomAccessNamespace = Neo.main.DomAccess;

delete Neo.main.addon.ResizeObserver;
delete Neo.main.DomAccess;

const {default: AddonClass} = await import('../../../../../src/main/addon/ResizeObserver.mjs');

/**
 * @summary Starvation contract of the resize carrier.
 *
 * The native observer delivers at rendering opportunities and the dispatch dam was
 * rAF-locked — in a document that never paints (hidden pane, occluded window), geometry
 * deliveries starved forever while worker timers and postMessage kept flowing, freezing
 * every geometry-dependent consumer at its last known box. These specs pin the two guards:
 * the dispatch race (rAF vs timer — first one opens the dam, no duplicates) and the hidden
 * poll (synthetic entries for boxes the native observer cannot report, through the same
 * dispatch pipeline).
 */
test.describe('Neo.main.addon.ResizeObserver — rendering-starvation contract', () => {
    let addon;

    test.beforeEach(() => {
        // RE-INSTALL the DOM globals, do not assume module scope still owns them.
        //
        // They are installed once at import time, but torn down by `afterAll` — two different
        // lifecycles. Under `fullyParallel` a worker can receive a SECOND slice of this same file:
        // the module is already in the import cache so its top level never re-runs, while the
        // previous slice's `afterAll` has already deleted the globals. The second slice then dies in
        // this hook with `ReferenceError: ResizeObserver is not defined`, thrown from
        // `src/main/addon/ResizeObserver.mjs` — a production stack trace for a harness defect.
        //
        // It passed in isolation and failed in every full run, which is precisely why it read as
        // flake. Re-installing here makes the globals a per-test precondition owned by the same
        // lifecycle that tears them down, and leaves the import-time ordering above untouched —
        // that ordering is load-bearing, since the addon module must be imported only after the
        // harness stubs are removed.
        globalThis.document              = documentRef;
        globalThis.window              ??= new EventTarget();
        globalThis.getComputedStyle      = getComputedStyleStub;
        globalThis.ResizeObserver        = ResizeObserverStub;
        globalThis.requestAnimationFrame = requestAnimationFrameStub;
        globalThis.cancelAnimationFrame  = cancelAnimationFrameStub;

        nodeMap.clear();
        rafQueue.clear();
        hiddenState  = false;
        sentMessages = [];

        Neo.worker.Manager ??= {};
        Neo.worker.Manager.sendMessage = (destination, message) => {
            sentMessages.push({destination, message})
        };

        addon = Neo.create(AddonClass, {
            hiddenPollInterval: 60,
            starvedFlushDelay : 40,
            windowId          : 1
        })
    });

    test.afterEach(() => {
        addon.destroy()
    });

    test.afterAll(() => {
        Neo.main.addon.ResizeObserver = stubAddonNamespace;
        Neo.main.DomAccess            = stubDomAccessNamespace;

        const restore = (key, value) => {
            value === undefined ? delete globalThis[key] : globalThis[key] = value
        };

        restore('document',              originalDocument);
        restore('window',                originalWindow);
        restore('getComputedStyle',      originalGetComputedStyle);
        restore('ResizeObserver',        originalResizeObserver);
        restore('requestAnimationFrame', originalRaf);
        restore('cancelAnimationFrame',  originalCaf)
    });

    test('starved dam: a native entry dispatches via the timer arm when no frame ever comes', async () => {
        const node = makeNode('target-1', 300, 200);

        await addon.register({componentId: 'component-1', id: 'target-1'});

        roCallback([makeEntry(node)]);
        expect(resizeMessages().length).toBe(0); // dam armed, nothing flushed yet

        await wait(120); // > starvedFlushDelay, rAF queue deliberately never serviced

        expect(resizeMessages().length).toBe(1);

        const {data} = resizeMessages()[0].message;

        expect(resizeMessages()[0].message.eventName).toBe('resize');
        expect(data.id).toBe('target-1');
        expect(data.componentIds).toEqual(['component-1']);
        expect(data.borderBoxSize).toEqual({blockSize: 200, inlineSize: 300});

        // A frame serviced AFTER the timer flush must not double-dispatch
        serviceFrame();
        await wait(60);
        expect(resizeMessages().length).toBe(1)
    });

    test('rendering dam: rAF wins the race and the timer arm never double-dispatches', async () => {
        const node = makeNode('target-1', 300, 200);

        await addon.register({componentId: 'component-1', id: 'target-1'});

        roCallback([makeEntry(node)]);
        serviceFrame(); // the vsync path, exactly as before the starvation guards

        expect(resizeMessages().length).toBe(1);

        await wait(120); // outlive starvedFlushDelay: the cancelled timer must stay silent
        expect(resizeMessages().length).toBe(1)
    });

    test('hidden boot: a target registered in a hidden document gets its first box from the poll', async () => {
        setHidden(true);

        const node = makeNode('target-1', 388, 550);

        await addon.register({componentId: 'component-1', id: 'target-1'});

        // No native entry ever fires (observe() scheduled a rendering step that will not come)
        await wait(200); // > hiddenPollInterval + starvedFlushDelay

        expect(resizeMessages().length).toBe(1);
        expect(resizeMessages()[0].message.data.borderBoxSize).toEqual({blockSize: 550, inlineSize: 388})
    });

    test('hidden poll: silent while the box holds, delivers when it moves, tracks the new baseline', async () => {
        setHidden(true);

        const node = makeNode('target-1', 388, 550);

        await addon.register({componentId: 'component-1', id: 'target-1'});
        await wait(200);
        expect(resizeMessages().length).toBe(1); // first box delivered

        await wait(150); // unchanged box: no re-delivery
        expect(resizeMessages().length).toBe(1);

        node.offsetWidth = 226; // the dock-resize class: layout moved, no frame will report it
        await wait(200);
        expect(resizeMessages().length).toBe(2);
        expect(resizeMessages()[1].message.data.borderBoxSize).toEqual({blockSize: 550, inlineSize: 226});

        await wait(150); // new baseline holds: silent again
        expect(resizeMessages().length).toBe(2)
    });

    test('synthetic payload: content box and contentRect subtract padding and border from layout truth', async () => {
        setHidden(true);

        makeNode('target-1', 300, 200, {
            'border-left-width': '2', 'border-right-width': '2', 'border-top-width': '2', 'border-bottom-width': '2',
            'padding-left'     : '10', 'padding-right': '10', 'padding-top': '5', 'padding-bottom': '5'
        });

        await addon.register({componentId: 'component-1', id: 'target-1'});
        await wait(200);

        const {data} = resizeMessages()[0].message;

        expect(data.borderBoxSize).toEqual({blockSize: 200, inlineSize: 300});
        expect(data.contentBoxSize).toEqual({blockSize: 200 - 10 - 4, inlineSize: 300 - 20 - 4});
        expect(data.contentRect).toEqual({
            bottom: 5 + 186, height: 186, left: 10, right: 10 + 276, top: 5, width: 276, x: 10, y: 5
        })
    });

    test('visibility flip: revealing the document retires the poll; re-hiding restarts it', async () => {
        setHidden(true);

        const node = makeNode('target-1', 388, 550);

        await addon.register({componentId: 'component-1', id: 'target-1'});
        await wait(200);
        expect(resizeMessages().length).toBe(1);

        setHidden(false);
        node.offsetWidth = 226;
        await wait(200); // poll retired: the native observer owns the visible document
        expect(resizeMessages().length).toBe(1);

        setHidden(true);
        await wait(200); // poll re-armed: the moved box is now its business
        expect(resizeMessages().length).toBe(2);
        expect(resizeMessages()[1].message.data.borderBoxSize).toEqual({blockSize: 550, inlineSize: 226})
    });

    test('unregister: drops the baseline and stops the poll with the last target', async () => {
        setHidden(true);

        makeNode('target-1', 388, 550);

        await addon.register({componentId: 'component-1', id: 'target-1'});
        await wait(200);
        expect(resizeMessages().length).toBe(1);

        addon.unregister({componentId: 'component-1', id: 'target-1'});
        await wait(150); // zero targets: interval gone, nothing polls
        expect(resizeMessages().length).toBe(1);

        // A fresh registration of the same id must re-deliver even at the unchanged size:
        // the baseline was dropped with the registration, not remembered across lifecycles.
        await addon.register({componentId: 'component-2', id: 'target-1'});
        await wait(200);
        expect(resizeMessages().length).toBe(2);
        expect(resizeMessages()[1].message.data.componentIds).toEqual(['component-2'])
    });

    test('unregister: an unnamed caller removes nothing, and the target stays observed', async () => {
        setHidden(true);

        makeNode('target-1', 388, 550);

        // Production shape of a component whose teardown is unnamed: `manager.DomEvent` contributes
        // the real holder, the component's own register contributes an anonymous one.
        await addon.register({componentId: 'component-1', id: 'target-1'});
        await addon.register({id: 'target-1'});
        await wait(200);
        expect(resizeMessages().length).toBe(1);

        // The teardown every caller outside `list.Buffered` used to make. It names no holder, so the
        // filter drops only the `undefined` and `component-1` survives — the list never empties, the
        // native target is never unobserved, and the poll stays armed for a destroyed component.
        addon.unregister({id: 'target-1'});

        nodeMap.get('target-1').offsetHeight = 600;
        await wait(200);

        expect(resizeMessages().length).toBe(2);
        expect(resizeMessages()[1].message.data.componentIds).toEqual(['component-1']);

        // Naming the holder is the whole difference: the same call with `componentId` releases it.
        addon.unregister({componentId: 'component-1', id: 'target-1'});

        nodeMap.get('target-1').offsetHeight = 700;
        await wait(200);

        expect(resizeMessages().length).toBe(2)
    });
});
