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

globalThis.document = documentRef;
globalThis.window   = new EventTarget();

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
      {default: DomEvents}    = await import('../../../../src/main/DomEvents.mjs');

test.describe('Neo.main.DomEvents', () => {
    let originalGetElement, originalGetEventData, originalSend;

    test.beforeAll(() => {
        originalGetElement   = DomAccess.getElement;
        originalGetEventData = DomEvents.getEventData;
        originalSend         = DomEvents.sendMessageToApp
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

    test('a wheel event reaches the app for a node a component listens on locally, and not for the body', () => {
        const sent  = [],
              calls = [],
              // A canvas node: no class from the global wheel target list
              node    = {classList: {contains: () => false}, clientHeight: 300, clientWidth: 400, scrollLeft: 0, scrollTop: 0},
              wheelOn = currentTarget => ({
                  altKey         : false,
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
                  type           : 'wheel'
              });

        DomEvents.getEventData     = ({type}) => ({type});
        DomEvents.sendMessageToApp = data => sent.push(data);

        DomEvents.onWheel(wheelOn(node));
        DomEvents.onWheel(wheelOn(documentRef.body));

        expect(sent).toEqual([{
            type     : 'wheel', clientHeight: 300, clientWidth: 400, scrollLeft: 0, scrollTop: 0,
            deltaMode: 0, deltaX: 0, deltaY: 120, deltaZ: 0,
            altKey   : false, ctrlKey: true, metaKey: false, shiftKey: false
        }]);
        expect(calls, 'the local listener keeps the wheel for itself').toEqual(['preventDefault', 'stopPropagation'])
    });
});
