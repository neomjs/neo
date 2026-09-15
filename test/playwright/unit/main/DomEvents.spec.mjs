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
        globalThis.window   = originalWindow
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
});
