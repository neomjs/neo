import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'MainIntersectionObserverTest'}, mockMain: false});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';

/**
 * @summary Creates a heading whose live position can change after the observer sampled it.
 * @param {String} recordId
 * @param {String} tagName
 * @param {Number} top
 * @param {Number} [height=30]
 * @returns {Object}
 */
function createHeading(recordId, tagName, top, height=30) {
    return {
        dataset: {recordId},
        id     : `heading-${recordId}`,
        tagName,
        top,
        getBoundingClientRect() {
            return new DOMRect(0, this.top, 260, height)
        }
    }
}

test('content sections follow live heading positions when observer entries arrive out of document order', async () => {
    const originalDocument  = globalThis.document,
          originalWindow    = globalThis.window,
          originalDomAccess = Neo.main.DomAccess,
          earlierHeading    = createHeading('4', 'H3', -240),
          routeHeading      = createHeading('6', 'H2', 58.5),
          hiddenHeading     = createHeading('7', 'H3', 59, 0),
          nextHeading       = createHeading('8', 'H2', 260),
          headings          = [earlierHeading, routeHeading, hiddenHeading, nextHeading],
          article           = {querySelectorAll: () => headings},
          documentRef       = new EventTarget(),
          messages          = [],
          addon             = {sendMessage: message => messages.push(message)},
          root              = {
              contains             : node => node === article,
              getBoundingClientRect: () => new DOMRect(0, 58, 800, 650)
          },
          observer          = {root, rootId: 'learn-content'};

    documentRef.getElementById = id => id === observer.rootId ? article : null;
    globalThis.document = documentRef;
    globalThis.window   = new EventTarget();
    delete Neo.main.DomAccess;

    try {
        const {default: IntersectionObserverAddon} = await import('../../../../../src/main/addon/IntersectionObserver.mjs'),
              {findActiveContentSection}           = IntersectionObserverAddon.prototype;

        findActiveContentSection.call(addon, [
            {target: routeHeading, isIntersecting: true},
            {target: earlierHeading, isIntersecting: false}
        ], observer);

        expect(messages.map(({data}) => data.recordId)).toEqual(['6']);

        for (const heading of headings) {
            heading.top -= 202
        }

        findActiveContentSection.call(addon, [{target: routeHeading, isIntersecting: false}], observer);

        expect(messages.map(({data}) => data.recordId)).toEqual(['6', '8'])
    } finally {
        originalDocument  === undefined ? delete globalThis.document : globalThis.document = originalDocument;
        originalWindow    === undefined ? delete globalThis.window : globalThis.window = originalWindow;
        originalDomAccess === undefined ? delete Neo.main.DomAccess : Neo.main.DomAccess = originalDomAccess
    }
});
