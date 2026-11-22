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

/**
 * @summary A distinct main-thread owner per document window: its own font and page lifecycle listeners.
 * @class Test.Unit.Main.DomEvents.PerWindow
 * @extends Neo.main.DomEvents
 */
class WindowDomEvents extends DomEvents.constructor {
    static config = {
        className: 'Test.Unit.Main.DomEvents.PerWindow',
        singleton: false
    }
}

Neo.setupClass(WindowDomEvents);

test.describe('Neo.main.DomEvents', () => {
    // module-level stubs are per-worker state: the tests run in one worker, in order
    test.describe.configure({mode: 'serial'});

    test('native selects keep arrows while non-select selection, picker and grid defaults keep their existing handling', () => {
        const select = {tagName: 'SELECT'},
              cases  = [
                  {tagName: 'SELECT', key: 'ArrowDown', regions: ['neo-selection'], prevented: false},
                  {tagName: 'OPTION', key: 'ArrowDown', regions: ['neo-selection'], closest: () => select, prevented: false},
                  {tagName: 'DIV', key: 'ArrowDown', regions: ['neo-selection'], prevented: true},
                  {tagName: 'DIV', key: 'ArrowDown', regions: [], prevented: false},
                  {tagName: 'INPUT', key: 'ArrowDown', regions: ['neo-selection'], prevented: false},
                  {tagName: 'TEXTAREA', key: 'ArrowDown', regions: ['neo-selection'], prevented: false},
                  {tagName: 'INPUT', key: 'Tab', regions: ['neo-grid-editor'], prevented: true},
                  {tagName: 'TEXTAREA', key: 'Tab', regions: ['neo-table-editor'], prevented: true},
                  {tagName: 'INPUT', key: 'ArrowDown', altKey: true, regions: ['neo-pickerfield'], prevented: true},
                  {tagName: 'INPUT', key: 'PageDown', regions: ['neo-grid-editor'], prevented: true},
                  {tagName: 'DIV', key: ' ', regions: ['neo-menu-list'], prevented: true},
                  {tagName: 'BUTTON', key: ' ', regions: [], prevented: false}
              ];

        for (const {tagName, key, altKey, regions, closest, prevented} of cases) {
            let   defaultPrevented = false, forwards = 0;
            const event            = {target: {tagName, closest}, key, altKey, preventDefault: () => { defaultPrevented = true }},
                  owner = {
                      getKeyboardEventData: value => value,
                      sendMessageToApp    : () => forwards++,
                      testPathInclusion   : (value, classes) => classes.some(cls => regions.includes(cls))
                  };
            DomEvents.onKeyDown.call(owner, event);
            expect(defaultPrevented, `${tagName} ${key} in ${regions}`).toBe(prevented);
            expect(forwards).toBe(1)
        }
    });

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

    test('iframe focus is sampled after the task boundary, and a retired owner forwards nothing', async () => {
        const owner          = Neo.create(core.Base), sent = [], scheduled = [], cleared = [],
              originalSet    = globalThis.setTimeout, originalClear = globalThis.clearTimeout,
              previousActive = Object.getOwnPropertyDescriptor(documentRef, 'activeElement'),
              parent         = {}, iframe = {tagName: 'IFRAME', parentNode: parent};
        await owner.ready();
        owner.getEventData = data => data;
        owner.sendMessageToApp = data => sent.push(data);
        globalThis.setTimeout = (callback, delay) => {
            scheduled.push({callback, delay});
            return scheduled.length
        };
        globalThis.clearTimeout = id => cleared.push(id);

        try {
            documentRef.activeElement = {tagName: 'DIV'};
            DomEvents.onWindowBlur.call(owner);
            expect(sent).toEqual([]);
            expect(scheduled[0].delay).toBe(0);
            documentRef.activeElement = iframe;
            scheduled[0].callback();
            await Promise.resolve();
            expect(sent).toHaveLength(1);
            expect(sent[0].type).toBe('focusin');
            expect(sent[0].composedPath()).toEqual([iframe, parent]);

            DomEvents.onWindowBlur.call(owner);
            owner.destroy();
            expect(cleared).toEqual([2]);
            scheduled[1].callback();
            await Promise.resolve();
            expect(sent).toHaveLength(1)
        } finally {
            owner.destroy();
            globalThis.setTimeout = originalSet;
            globalThis.clearTimeout = originalClear;
            previousActive ? Object.defineProperty(documentRef, 'activeElement', previousActive) :
                delete documentRef.activeElement
        }
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

    test('font completion and failure announce only their document window, and destroy removes their listeners', () => {
        const manager = Neo.worker.Manager,
              sendWas = manager.sendMessage,
              idWas   = manager.windowId,
              sent    = [],
              removed = [],
              sets    = [new EventTarget(), new EventTarget()],
              owners  = [];

        manager.sendMessage = (destination, message) => sent.push({destination, ...message});
        sets[0].removeEventListener = (type, listener) => {
            removed.push(type);
            EventTarget.prototype.removeEventListener.call(sets[0], type, listener)
        };

        try {
            sets.forEach(fonts => {
                globalThis.document = Object.assign(new EventTarget(), {fonts});
                globalThis.window   = new EventTarget();
                owners.push(Neo.create(WindowDomEvents))
            });

            expect(sent, 'construction invents no completed font load').toEqual([]);

            const dispatch = (index, type) => {
                manager.windowId = `font-window-${index}`;
                sets[index].dispatchEvent(new Event(type))
            };

            dispatch(0, 'loadingdone');
            dispatch(1, 'loadingerror');
            dispatch(0, 'loadingerror');
            dispatch(0, 'loadingdone');

            expect(sent).toEqual([
                {destination: 'app', action: 'fontChange', data: {windowId: 'font-window-0'}},
                {destination: 'app', action: 'fontChange', data: {windowId: 'font-window-1'}},
                {destination: 'app', action: 'fontChange', data: {windowId: 'font-window-0'}},
                {destination: 'app', action: 'fontChange', data: {windowId: 'font-window-0'}}
            ]);

            owners[0].destroy();
            expect(removed).toEqual(['loadingdone', 'loadingerror']);
            dispatch(0, 'loadingdone');
            dispatch(0, 'loadingerror');
            expect(sent).toHaveLength(4);

            dispatch(1, 'loadingdone');
            expect(sent.at(-1).data).toEqual({windowId: 'font-window-1'})
        } finally {
            owners.forEach(owner => !owner.isDestroyed && owner.destroy());
            manager.sendMessage = sendWas;
            idWas === undefined ? delete manager.windowId : manager.windowId = idWas;
            globalThis.document = documentRef;
            globalThis.window   = windowRef
        }
    });

    test('font listeners construct before Manager registration and use its window when the event arrives', () => {
        const manager = Neo.worker.Manager,
              sendWas = manager.sendMessage,
              idWas   = manager.windowId,
              fonts   = new EventTarget(),
              sent    = [];
        let owner;

        try {
            globalThis.document = Object.assign(new EventTarget(), {fonts});
            globalThis.window   = new EventTarget();
            delete Neo.worker.Manager;
            owner = Neo.create(WindowDomEvents);

            Neo.worker.Manager = manager;
            manager.windowId   = 'font-window-registered-later';
            manager.sendMessage = (destination, message) => sent.push({destination, ...message});
            fonts.dispatchEvent(new Event('loadingdone'));

            expect(sent).toEqual([
                {destination: 'app', action: 'fontChange', data: {windowId: 'font-window-registered-later'}}
            ])
        } finally {
            Neo.worker.Manager = manager;
            owner?.destroy();
            manager.sendMessage = sendWas;
            idWas === undefined ? delete manager.windowId : manager.windowId = idWas;
            globalThis.document = documentRef;
            globalThis.window   = windowRef
        }
    });

    test('a missing FontFaceSet supplies no synthetic font notification', () => {
        const manager = Neo.worker.Manager,
              sendWas = manager.sendMessage,
              sent    = [];
        let owner;

        manager.sendMessage = (...args) => sent.push(args);

        try {
            owner = Neo.create(WindowDomEvents);
            owner.onFontChange();
            expect(sent).toEqual([])
        } finally {
            owner?.destroy();
            manager.sendMessage = sendWas
        }
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

    // A move waits for the next frame; a press is sent at once. A press that overtakes the move reaches the app as
    // press-then-move, and the canvas mouse state reads the whole jump as movement of a held button.
    test('every other mouse event sends a move still waiting for its frame first; moves alone still send once per frame', () => {
        const
            sent   = [],
            frames = [],
            rafWas = globalThis.requestAnimationFrame,
            cafWas = globalThis.cancelAnimationFrame,
            mouse  = (type, clientX, extra) => ({
                altKey : false, button: 0, buttons: 0, clientX, clientY: 70, composedPath: () => [node, documentRef.body],
                ctrlKey: false, metaKey: false, preventDefault: () => {}, shiftKey: false, stopPropagation: () => {}, type, ...extra
            }),
            // one move to 200 still waiting for its frame, then the other event
            overtake = (send, type) => {
                DomEvents.onMouseMove(mouse('mousemove', 200));
                send(mouse(type, 200, {buttons: type === 'mousedown' ? 1 : 0}))
            };

        globalThis.requestAnimationFrame = fn => frames.push(fn);
        globalThis.cancelAnimationFrame  = id => { frames[id - 1] = null };

        try {
            DomEvents.getEventData     = ({type}) => ({type});
            DomEvents.sendMessageToApp = data => sent.push(data.type);

            overtake(event => DomEvents.onMouseDown(event),   'mousedown');
            overtake(event => DomEvents.onMouseUp(event),     'mouseup');
            overtake(event => DomEvents.onClick(event),       'click');
            overtake(event => DomEvents.onDoubleClick(event), 'dblclick');
            overtake(event => DomEvents.onContextMenu(event), 'contextmenu');
            overtake(event => DomEvents.onMouseEnter(event),  'mouseenter');
            overtake(event => DomEvents.onMouseLeave(event),  'mouseleave');
            overtake(event => DomEvents.onWheel(wheelOn(node, {clientX: 200})), 'wheel');

            expect(sent).toEqual(['mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu', 'mouseenter', 'mouseleave', 'wheel'].flatMap(type => ['mousemove', type]));
            frames.forEach(frame => frame?.());
            expect(sent, 'a flushed move leaves nothing for its frame').toHaveLength(16);

            sent.length = 0;
            DomEvents.onMouseMove(mouse('mousemove', 10));
            DomEvents.onMouseMove(mouse('mousemove', 20));
            frames.at(-1)();

            expect(sent, 'two moves in one frame send once').toEqual(['mousemove']);
            expect(DomEvents.mouseMoveReqId).toBeNull()
        } finally {
            globalThis.requestAnimationFrame = rafWas;
            globalThis.cancelAnimationFrame  = cafWas
        }
    });

    // An app that answers a tap differently from a click needs the pointer of each event, not the device's
    test('a click reaches the app with the pointer type that produced it; a mouse event without one sends undefined', () => {
        const
            sent  = [],
            mouse = (type, extra) => ({
                altKey : false, button: 0, buttons: 0, clientX: 10, clientY: 20, composedPath: () => [node, documentRef.body],
                ctrlKey: false, metaKey: false, preventDefault: () => {}, shiftKey: false, stopPropagation: () => {}, type, ...extra
            });

        DomEvents.getEventData     = ({type}) => ({type});
        DomEvents.sendMessageToApp = data => sent.push(data);

        DomEvents.onClick(mouse('click', {pointerType: 'touch'}));
        DomEvents.onClick(mouse('click', {pointerType: 'mouse'}));
        DomEvents.onDoubleClick(mouse('dblclick'));

        expect(sent.map(({pointerType, type}) => [type, pointerType])).toEqual([['click', 'touch'], ['click', 'mouse'], ['dblclick', undefined]]);
        expect(sent[0]).toMatchObject({button: 0, clientX: 10, clientY: 20, type: 'click'})
    });

    // A wheel the main thread keeps never reaches the app, so there is no order to restore: the waiting move keeps
    // its frame, and the next move in that frame replaces it.
    test('a wheel the main thread keeps leaves a waiting move to its frame', () => {
        const
            sent          = [],
            frames        = [],
            rafWas        = globalThis.requestAnimationFrame,
            cafWas        = globalThis.cancelAnimationFrame,
            dateSelector  = {...node, classList: {contains: cls => cls === 'neo-dateselector'}},
            bufferedWheel = () => DomEvents.onWheel(wheelOn(dateSelector, {composedPath: () => [dateSelector, documentRef.body]})),
            move          = clientX => DomEvents.onMouseMove({
                altKey : false, button: 0, buttons: 0, clientX, clientY: 70, composedPath: () => [node, documentRef.body],
                ctrlKey: false, metaKey: false, preventDefault: () => {}, shiftKey: false, stopPropagation: () => {}, type: 'mousemove'
            }),
            runFrames     = () => frames.splice(0).forEach(frame => frame?.());

        globalThis.requestAnimationFrame = fn => frames.push(fn);
        globalThis.cancelAnimationFrame  = id => { frames[id - 1] = null };

        try {
            DomEvents.getEventData     = ({type}) => ({type});
            DomEvents.sendMessageToApp = data => sent.push(`${data.type} ${data.clientX}`);

            move(10);
            DomEvents.onWheel(wheelOn(documentRef.body));
            move(20);
            runFrames();

            expect(sent, 'a wheel without a target').toEqual(['mousemove 20']);

            sent.length = 0;
            bufferedWheel();
            move(30);
            bufferedWheel();
            move(40);
            runFrames();

            // the buffer is module state, so a repeated run may keep the first wheel as well
            expect(sent.filter(entry => entry.startsWith('mousemove')), 'a wheel inside its target\'s buffer').toEqual(['mousemove 40'])
        } finally {
            globalThis.requestAnimationFrame = rafWas;
            globalThis.cancelAnimationFrame  = cafWas
        }
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
            canvasId     : 'canvas-1',
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

    /**
     * Builds a SharedWorker window's owner over a fresh window, dispatches page lifecycle events on that window in
     * order, and returns what the owner broadcast to the workers.
     * @param {Event[]} events
     * @returns {Object[]}
     */
    function departure(events) {
        const manager = Neo.worker.Manager,
              was     = {appNames: manager.appNames, broadcast: manager.broadcast, windowId: manager.windowId},
              shared  = Neo.config.useSharedWorkers,
              sent    = [],
              win     = new EventTarget();

        let owner;

        Object.assign(manager, {appNames: ['Vessel'], broadcast: message => sent.push(message), windowId: 'V'});
        Neo.config.useSharedWorkers = true;

        try {
            globalThis.document = new EventTarget();
            globalThis.window   = win;
            owner               = Neo.create(WindowDomEvents);

            events.forEach(event => win.dispatchEvent(event));

            return sent
        } finally {
            owner?.destroy();
            Neo.config.useSharedWorkers = shared;
            Object.entries(was).forEach(([key, value]) => value === undefined ? delete manager[key] : manager[key] = value);
            globalThis.document = documentRef;
            globalThis.window   = windowRef
        }
    }

    const disconnect = {action: 'disconnect', appName: 'Vessel', windowId: 'V'},
          pagehide   = persisted => Object.assign(new Event('pagehide'), {persisted});

    // An automation's target close (CDP Target.closeTarget) fires these two and no beforeunload
    test('a close that skips beforeunload disconnects the window at its pagehide', () => {
        expect(departure([pagehide(false), new Event('unload')])).toEqual([disconnect])
    });

    test('a close that fires beforeunload and pagehide disconnects once', () => {
        expect(departure([new Event('beforeunload'), pagehide(false)])).toEqual([disconnect])
    });

    test('a page entering the back/forward cache stays connected', () => {
        expect(departure([pagehide(true)])).toEqual([])
    });

    test('domEventListener forwards plain copy, cut, and paste unless Neo.main.addon.Clipboard claims the event', () => {
        const
            manager     = Neo.worker.Manager,
            oldSend     = manager.sendMessage,
            oldAddon    = Neo.main.addon,
            sent        = [],
            target      = {attributes: [], classList: ['plain-node'], dataset: {}, getAttribute: () => null, id: 'plain-1', tagName: 'DIV'},
            makeEvent   = type => ({
                cancelable      : true,
                composedPath    : () => [target],
                defaultPrevented: false,
                preventDefault() { this.defaultPrevented = true },
                target,
                timeStamp       : 10,
                type
            });

        manager.sendMessage = (dest, msg) => sent.push({dest, msg});

        try {
            delete Neo.main.addon;

            for (const type of ['copy', 'cut', 'paste']) {
                const evt = makeEvent(type);
                DomEvents.domEventListener(evt);
                expect(evt.defaultPrevented).toBe(true)
            }

            expect(sent.map(entry => entry.msg.eventName)).toEqual(['copy', 'cut', 'paste']);

            Neo.main.addon = {
                Clipboard: {
                    claimsEvent: evt => evt.target === target
                }
            };

            const claimedCopy = makeEvent('copy');
            DomEvents.domEventListener(claimedCopy);
            expect(claimedCopy.defaultPrevented).toBe(false);
            expect(sent.length).toBe(3);

            const otherTarget = {...target, id: 'plain-2'};
            const unclaimedPaste = {...makeEvent('paste'), composedPath: () => [otherTarget], target: otherTarget};
            DomEvents.domEventListener(unclaimedPaste);
            expect(unclaimedPaste.defaultPrevented).toBe(true);
            expect(sent.length).toBe(4);
            expect(sent[3].msg.eventName).toBe('paste')
        } finally {
            manager.sendMessage = oldSend;
            oldAddon === undefined ? delete Neo.main.addon : (Neo.main.addon = oldAddon)
        }
    });

    /**
     * @summary Runs `fn` with a fresh owner over a stub location, History API and window, in one router mode.
     * The stub history moves the stub location the way a browser does.
     * @param {Object} options
     * @param {String} [options.base='']
     * @param {String} options.mode
     * @param {String} options.url
     * @param {Function} fn
     */
    function withRouter({base='', mode, url}, fn) {
        const manager  = Neo.worker.Manager,
              config   = {routerBasePath: Neo.config.routerBasePath, routerMode: Neo.config.routerMode},
              globals  = {history: globalThis.history, location: globalThis.location},
              send     = manager.sendMessage,
              location = {pathname: '/', search: ''},
              calls    = [],
              sent     = [],
              go       = href => {
                  const next = new URL(href, `https://neomjs.com${location.pathname}${location.search}`);
                  Object.assign(location, {hash: next.hash, pathname: next.pathname, search: next.search})
              };

        let owner;

        go(url);
        Object.assign(Neo.config, {routerBasePath: base, routerMode: mode});
        globalThis.location = location;
        globalThis.history  = {
            state       : null,
            pushState   : (state, title, href) => {calls.push(['push', href]); go(href)},
            replaceState: (state, title, href) => {calls.push(['replace', href]); go(href)}
        };
        globalThis.window   = new EventTarget();
        manager.sendMessage = (dest, msg) => sent.push(msg.data.hashString);

        try {
            owner = Neo.create(WindowDomEvents);
            fn({calls, go, location, owner, sent, window: globalThis.window})
        } finally {
            owner?.destroy();
            Object.assign(Neo.config, config);
            Object.entries(globals).forEach(([key, value]) => {
                value === undefined ? delete globalThis[key] : globalThis[key] = value
            });
            manager.sendMessage = send
        }
    }

    test('the router defaults to hash mode without a base path', () => {
        expect(Neo.config.routerMode).toBe('hash');
        expect(Neo.config.routerBasePath).toBe('')
    });

    test('hash mode keeps the route in location.hash and forwards every hash change, as before', () => {
        withRouter({mode: 'hash', url: '/#/learn/Intro'}, ({calls, location, owner, sent, window}) => {
            expect(owner.getRouteConfig(7)).toMatchObject({hashString: '/learn/Intro', windowId: 7});

            owner.onHashChange();
            owner.onHashChange();
            expect(sent).toEqual(['/learn/Intro', '/learn/Intro']);

            owner.setRoute('/news/blog');
            expect(location.hash).toBe('/news/blog');

            window.dispatchEvent(new Event('popstate'));
            expect(sent).toHaveLength(2);
            expect(calls).toEqual([])
        })
    });

    test('pathname mode reads the path after routerBasePath, never its search; the base path alone is no route', () => {
        withRouter({base: '/docs', mode: 'pathname', url: '/docs/learn/Intro?deck=training'}, ({go, owner}) => {
            expect(owner.getRoute(), 'the page search stays out of the route, as in hash mode').toBe('/learn/Intro');
            expect(owner.getRouteConfig(1)).toMatchObject({hashString: '/learn/Intro', windowId: 1});

            for (const href of ['/docs', '/docs/', '/docs?theme=dark']) {
                go(href);
                expect(owner.getRoute(), href).toBe('')
            }

            expect(owner.getRouteConfig(1)).toBeNull();

            go('/docsearch/Intro');
            expect(owner.getRoute(), 'a sibling of the base path is not under it').toBe('/docsearch/Intro')
        })
    });

    test('pathname mode pushes a changed route under the base path once, whether it is written bare or canonical', () => {
        withRouter({base: '/docs', mode: 'pathname', url: '/docs/learn/Intro'}, ({calls, owner, sent}) => {
            owner.setRoute('/news/blog');
            owner.setRoute('news/blog');
            owner.setRoute('home');
            owner.setRoute('/home');
            owner.setRoute('');
            owner.setRoute('/');

            expect(calls).toEqual([['push', '/docs/news/blog'], ['push', '/docs/home'], ['push', '/docs/']]);
            expect(sent).toEqual(['/news/blog', '/home', ''])
        })
    });

    test('pathname mode moves a #/… link into the path as a whole route, and an in-page anchor changes nothing', () => {
        withRouter({mode: 'pathname', url: '/learn/Intro?deck=training'}, ({calls, go, location, owner, sent}) => {
            go('#section');
            owner.onHashChange();
            expect(calls).toEqual([]);
            expect(sent).toEqual([]);

            go('#/news/blog');
            owner.onHashChange();
            expect(calls).toEqual([['replace', '/news/blog']]);
            expect(location.hash).toBe('');
            expect(sent).toEqual(['/news/blog'])
        })
    });

    test('pathname mode boots a #/… bookmark into its path, the page search kept in the URL and out of the route; Back or Forward sends only a changed route', () => {
        withRouter({mode: 'pathname', url: '/?utm_source=news#/learn/Intro'}, ({calls, go, owner, sent, window}) => {
            expect(calls).toEqual([['replace', '/learn/Intro?utm_source=news']]);
            expect(owner.getRouteConfig(1)).toMatchObject({hashString: '/learn/Intro', windowId: 1});

            window.dispatchEvent(new Event('popstate'));
            expect(sent, 'the boot route is not new').toEqual([]);

            go('/news/blog');
            window.dispatchEvent(new Event('popstate'));
            expect(sent).toEqual(['/news/blog'])
        })
    });

    test('pathname mode composes a #/… bookmark with its own query and anchor as path, query, then fragment', () => {
        withRouter({mode: 'pathname', url: '/?utm_source=news#/learn/benefits/Introduction#the-problem'}, ({calls, go, location, owner}) => {
            expect(calls).toEqual([['replace', '/learn/benefits/Introduction?utm_source=news#the-problem']]);
            expect(location.search).toBe('?utm_source=news');
            expect(location.hash).toBe('#the-problem');
            expect(owner.getRoute()).toBe('/learn/benefits/Introduction');

            // a link names a whole route: its own query and anchor, not the page's search
            go('#/news/blog?page=2#top');
            owner.onHashChange();
            expect(calls[1]).toEqual(['replace', '/news/blog?page=2#top']);
            expect(owner.getRoute()).toBe('/news/blog')
        })
    });

    test('setRoute with replace=true updates hash or pathname in place, preserves search, and strips an empty hash', () => {
        withRouter({mode: 'hash', url: '/examples/button/base/index.html?theme=neo-theme-neo-dark'}, ({calls, location, owner, sent}) => {
            owner.setRoute('badgePosition=bottom-left&width=220', true);
            owner.setRoute('badgePosition=bottom-left&width=220', true);
            owner.setRoute('', true);

            expect(calls).toEqual([
                ['replace', '/examples/button/base/index.html?theme=neo-theme-neo-dark#badgePosition=bottom-left&width=220'],
                ['replace', '/examples/button/base/index.html?theme=neo-theme-neo-dark']
            ]);
            expect(location.search).toBe('?theme=neo-theme-neo-dark');
            expect(location.hash).toBe('');
            expect(sent).toEqual(['badgePosition=bottom-left&width=220', ''])
        });

        withRouter({base: '/docs', mode: 'pathname', url: '/docs/learn/Intro'}, ({calls, owner, sent}) => {
            const states      = [];
            const origPush    = globalThis.history.pushState;
            const origReplace = globalThis.history.replaceState;
            globalThis.history.state        = {scrollY: 120};
            globalThis.history.pushState    = (state, title, href) => {states.push(['push', state]); origPush(state, title, href)};
            globalThis.history.replaceState = (state, title, href) => {states.push(['replace', state]); origReplace(state, title, href)};

            owner.setRoute('/news/blog', true);
            owner.setRoute('/examples', false);
            owner.setRoute('/home');

            expect(calls).toEqual([['replace', '/docs/news/blog'], ['push', '/docs/examples'], ['push', '/docs/home']]);
            expect(states).toEqual([['replace', {scrollY: 120}], ['push', null], ['push', null]]);
            expect(sent).toEqual(['/news/blog', '/examples', '/home'])
        })
    });

    test('parseHash preserves anchors, arrays, and typed values while skipping neighboring malformed URI entries across boot and live routes', () => {
        expect(DomEvents.parseHash('section&categories[]=test1&categories[]=test2&width=180&active=true&disabled=false')).toEqual({
            active    : true,
            categories: ['test1', 'test2'],
            disabled  : false,
            section   : '',
            width     : 180
        });

        withRouter({mode: 'hash', url: '/examples/list/base/index.html#bad=%E0%A4%A&width=180'}, ({go, owner}) => {
            const payloads = [];
            Neo.worker.Manager.sendMessage = (dest, msg) => payloads.push(msg.data);

            expect(owner.getRouteConfig(9)).toEqual({
                hash      : {width: 180},
                hashString: 'bad=%E0%A4%A&width=180',
                windowId  : 9
            });

            go('#%E0%A4%A=broken&categories[]=alpha&categories[]=beta&width=205&draggable=false');
            owner.onHashChange();

            expect(payloads).toHaveLength(1);
            expect(payloads[0]).toMatchObject({
                hash      : {categories: ['alpha', 'beta'], draggable: false, width: 205},
                hashString: '%E0%A4%A=broken&categories[]=alpha&categories[]=beta&width=205&draggable=false'
            })
        })
    });
});
