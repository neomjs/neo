import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ConnectionXhrQueryParamsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Xhr            from '../../../../../src/data/connection/Xhr.mjs';

/**
 * @summary `Xhr#request` composes its params into URLs that already carry a query or a fragment.
 *
 * Only the native `XMLHttpRequest` is stubbed: it records the URL the real request passes to `open()`.
 */
test.describe('Xhr params join the URL they are given', () => {
    let descriptor, opened, xhr;

    test.beforeEach(() => {
        descriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
        opened     = [];

        /** @summary Records the URL of the native dispatch without opening a connection. */
        globalThis.XMLHttpRequest = class RecordingXhr {
            /** @summary Captures the URL the real connection passes to the browser. */
            open(method, url) {
                opened.push(url)
            }

            /** @summary The stub produces no native events. */
            addEventListener() {}

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Sending does not start a request in this fixture. */
            send() {}
        };

        xhr = Neo.create(Xhr, {requests: {}})
    });

    test.afterEach(() => {
        xhr.destroy();

        descriptor ? Object.defineProperty(globalThis, 'XMLHttpRequest', descriptor) : delete globalThis.XMLHttpRequest
    });

    /**
     * @param {String} url
     * @param {Object} params
     * @param {Object} [opts]
     * @returns {String} The URL the request opened
     */
    const open = (url, params, opts) => {
        xhr.request({params, url, ...opts});
        return opened.at(-1)
    };

    test('params join an existing query with &', () => {
        expect(open('https://nameless-tundra-27404.herokuapp.com/go/?fn=earthquakes', {page: 1, pageSize: 0}))
            .toBe('https://nameless-tundra-27404.herokuapp.com/go/?fn=earthquakes&page=1&pageSize=0')
    });

    test('an empty query or one that ends in & gets no second separator', () => {
        expect(open('https://example.test/data?', {page: 1})).toBe('https://example.test/data?page=1');
        expect(open('https://example.test/data?fn=x&', {page: 1})).toBe('https://example.test/data?fn=x&page=1')
    });

    test('a ? inside a query value stays part of that value, and the params still join with &', () => {
        expect(open('https://example.test/data?q=why?', {page: 1})).toBe('https://example.test/data?q=why?&page=1');
        expect(open('https://example.test/data?q=why?#top', {page: 1})).toBe('https://example.test/data?q=why?&page=1#top')
    });

    test('params go before a fragment, with and without an existing query', () => {
        expect(open('https://example.test/data#top', {page: 1})).toBe('https://example.test/data?page=1#top');
        expect(open('https://example.test/data?fn=x#top', {page: 1})).toBe('https://example.test/data?fn=x&page=1#top')
    });

    test('a URL without a query still gets ?, and empty params leave the URL as it is', () => {
        expect(open('https://example.test/data.json', {page: 1, pageSize: 25})).toBe('https://example.test/data.json?page=1&pageSize=25');
        expect(open('https://example.test/data.json?fn=x', {})).toBe('https://example.test/data.json?fn=x')
    });

    test('a relative URL stays relative', () => {
        expect(open('../../resources/data/quakes.json?fn=x', {page: 2}, {insideNeo: true}))
            .toBe('../../resources/data/quakes.json?fn=x&page=2')
    })
});
