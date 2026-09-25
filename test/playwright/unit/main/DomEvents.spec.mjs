import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'MainDomEventsTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

// The main-thread singletons construct at import and register listeners on document, window and the worker manager
const originalDocument = globalThis.document,
      originalWindow   = globalThis.window,
      documentRef      = new EventTarget();

documentRef.body            = new EventTarget();
documentRef.documentElement = {};
documentRef.getElementById  = () => null;
documentRef.querySelector   = () => null;

const windowRef = new EventTarget();

globalThis.document = documentRef;
globalThis.window   = windowRef;

Neo.worker.Manager.on ??= () => {};

// A worker runs many spec files in one process, and `setup.mjs` installs its remotes with `??=`, so whatever this
// file leaves under `Neo.main` is what every later spec gets — a real `DomAccess`, over a `document` restored below,
// throws in the next component that focuses. Captured here and put back in afterAll, with document and window.
const replacedRemotes = {
    DeltaUpdates: Neo.main.DeltaUpdates,
    DomAccess   : Neo.main.DomAccess,
    DomEvents   : Neo.main.DomEvents
};

delete Neo.main.DomAccess;

const {default: DomAccess}    = await import('../../../../src/main/DomAccess.mjs'),
      {default: DeltaUpdates} = await import('../../../../src/main/DeltaUpdates.mjs'),
      {default: DomEvents}    = await import('../../../../src/main/DomEvents.mjs'),
      {default: SharedCanvas} = await import('../../../../src/app/SharedCanvas.mjs'),
      {default: CanvasBase}   = await import('../../../../src/canvas/Base.mjs');

/**
 * A renderer that records which hook a report reached — the third realm of the wheel path.
 * @class Neo.test.main.WheelRenderer
 * @extends Neo.canvas.Base
 */
class WheelRenderer extends CanvasBase {
    static config = {
        className: 'Neo.test.main.WheelRenderer'
    }

    hooks = []

    onWheel(data) {
        this.hooks.push(['wheel', data])
    }
}

Neo.setupClass(WheelRenderer);

test.describe('Neo.main.DomEvents', () => {
    // module-level stubs are per-worker state: the tests run in one worker, in order
    test.describe.configure({mode: 'serial'});

    let originalGetElement, originalGetEventData, originalSend;

    test.beforeAll(() => {
        originalGetElement   = DomAccess.getElement;
        originalGetEventData = DomEvents.getEventData;
        originalSend         = DomEvents.sendMessageToApp
    });

    // The same objects the module-level install created: the singletons registered their listeners on them.
    test.beforeEach(() => {
        globalThis.document = documentRef;
        globalThis.window   = windowRef
    });

    test.afterAll(() => {
        DomAccess.getElement       = originalGetElement;
        DomEvents.getEventData     = originalGetEventData;
        DomEvents.sendMessageToApp = originalSend;

        globalThis.document = originalDocument;
        globalThis.window   = originalWindow;

        Object.entries(replacedRemotes).forEach(([key, value]) => {
            value === undefined ? delete Neo.main[key] : Neo.main[key] = value
        })
    });

    // A worker imports many spec files; a neighbour that captured `globalThis.document` before this file installed
    // its stub restores that undefined in its own teardown, mid-file. The stub is re-installed per test, so this
    // deletion — the same act — must not reach the next test.
    test('a neighbour\'s teardown deleting the globals between two tests strips nothing from the next one', () => {
        delete globalThis.document;
        delete globalThis.window;

        expect(globalThis.document).toBeUndefined()
    });

    test('a focusout fired inside removeNode names the removed node, and one fired elsewhere does not', () => {
        const sent    = [],
              removed = {
                  id    : 'removed-menu',
                  // A browser that blurs a removed node fires focusout synchronously inside remove()
                  remove: () => DomEvents.onFocusOut({target: removed, type: 'focusout'})
              };

        DomAccess.getElement       = id => id === removed.id ? removed : null;
        DomEvents.getEventData     = ({target, type}) => ({target: {id: target.id}, type});
        DomEvents.sendMessageToApp = data => sent.push(data);

        DeltaUpdates.removeNode({id: removed.id});
        DomEvents.onFocusOut({target: {id: 'focus-moved-away'}, type: 'focusout'});

        expect(sent.map(data => [data.target.id, data.removedNodeId])).toEqual([
            ['removed-menu',     'removed-menu'],
            ['focus-moved-away', undefined]
        ])
    });

    // A canvas node: no class from the global wheel target list
    const node    = {classList: {contains: () => false}, clientHeight: 300, clientWidth: 400, scrollLeft: 0, scrollTop: 0},
          calls   = [],
          wheelOn = (currentTarget, extra) => ({
              altKey         : false,
              button         : 0,
              buttons        : 0,
              clientX        : 130,
              clientY        : 70,
              composedPath   : () => [node, documentRef.body],
              ctrlKey        : true,
              currentTarget,
              deltaMode      : 0,
              deltaX         : 0,
              deltaY         : 120,
              deltaZ         : 0,
              metaKey        : false,
              preventDefault : () => calls.push('preventDefault'),
              shiftKey       : false,
              stopPropagation: () => calls.push('stopPropagation'),
              type           : 'wheel',
              ...extra
          });

    test('a wheel event reaches the app for a node a component listens on locally, and not for the body', () => {
        const sent = [];

        calls.length               = 0;
        DomEvents.getEventData     = ({type}) => ({type});
        DomEvents.sendMessageToApp = data => sent.push(data);

        DomEvents.onWheel(wheelOn(node));
        DomEvents.onWheel(wheelOn(documentRef.body));

        expect(sent).toEqual([{
            type     : 'wheel', clientHeight: 300, clientWidth: 400, clientX: 130, clientY: 70, scrollLeft: 0, scrollTop: 0,
            deltaMode: 0, deltaX: 0, deltaY: 120, deltaZ: 0,
            altKey   : false, button: 0, buttons: 0, ctrlKey: true, metaKey: false, shiftKey: false
        }]);
        expect(calls, 'the local listener keeps the wheel for itself').toEqual(['preventDefault', 'stopPropagation'])
    });

    test('the serialized wheel payload keeps a held button through the canvas host into its renderer', () => {
        const sent    = [],
              reports = [],
              host    = Object.create(SharedCanvas.prototype);

        DomEvents.getEventData     = ({type}) => ({type});
        DomEvents.sendMessageToApp = data => sent.push(data);

        // Main: the exact serializer, a wheel tick while the middle button is held
        DomEvents.onWheel(wheelOn(node, {button: 1, buttons: 4}));

        expect(sent[0]).toMatchObject({button: 1, buttons: 4, clientX: 130, clientY: 70, deltaY: 120});

        // App worker: the host forwards the payload the wire delivered (own data properties shadow the config accessors)
        for (const [key, value] of Object.entries({
            canvasRect   : {left: 100, top: 50},
            isCanvasReady: true,
            renderer     : {updateMouseState: report => reports.push(report)},
            windowId     : 'window-1'
        })) {
            Object.defineProperty(host, key, {value, writable: true})
        }

        host.onWheel(sent[0]);

        expect(reports[0]).toMatchObject({windowId: 'window-1', x: 30, y: 20, button: 1, buttons: 4, ctrlKey: true, wheel: {deltaMode: 0, deltaX: 0, deltaY: 120, deltaZ: 0}});

        // Canvas worker: the renderer stores the buttons and hands the report to the hook
        const renderer = Neo.create(WheelRenderer);

        renderer.updateMouseState(reports[0]);

        expect(renderer.hooks).toEqual([['wheel', reports[0]]]);
        expect(renderer.mouse).toMatchObject({x: 30, y: 20, buttons: 4, ctrlKey: true});

        renderer.destroy()
    });
});
