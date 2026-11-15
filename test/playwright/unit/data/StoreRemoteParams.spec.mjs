import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreRemoteParamsTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Store           from '../../../../src/data/Store.mjs';
import FetchConnection from '../../../../src/data/connection/Fetch.mjs';

/**
 * @summary A fresh Pipeline config on the Fetch connection, one per store.
 * @returns {Object}
 */
const fetchPipeline = () => ({pipeline: {connection: {module: FetchConnection, url: '/api/rows'}}});

/**
 * @summary Pins what a remote Store's `load()` puts on the wire, read back the way a server reads its query.
 *
 * The load runs the real `Store#load`, `Pipeline#read` and connection `read()`. Only the native `XMLHttpRequest` and
 * `fetch` are stubbed: each records the URL it is asked for and answers with an empty page.
 */
test.describe('A remote Store sends its load params in a form the server can decode', () => {
    let descriptors, requested, stores;

    test.beforeEach(() => {
        descriptors = Object.fromEntries(['fetch', 'XMLHttpRequest']
            .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        requested   = [];
        stores      = [];

        /** @summary Records the URL of the native Xhr dispatch and answers it with an empty page. */
        globalThis.XMLHttpRequest = class RecordingXhr {
            listeners = {}

            /** @summary Keeps the connection's listeners, so the stub can answer. */
            addEventListener(type, fn) {
                this.listeners[type] = fn
            }

            /** @summary The response carries no headers the connection reads. */
            getAllResponseHeaders() {
                return ''
            }

            /** @summary Captures the URL the real connection passes to the browser. */
            open(method, url) {
                requested.push({transport: 'xhr', url})
            }

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Answers with an empty page once the connection has registered the request. */
            send() {
                queueMicrotask(() => {
                    Object.assign(this, {readyState: 4, response: '{"data":[],"totalCount":0}', status: 200});
                    this.listeners.load({currentTarget: this, target: this})
                })
            }
        };

        globalThis.fetch = async url => {
            requested.push({transport: 'fetch', url});

            return {
                json      : async () => ({data: [], totalCount: 0}),
                ok        : true,
                redirected: false,
                status    : 200,
                statusText: 'OK',
                type      : 'basic',
                url
            }
        }
    });

    test.afterEach(() => {
        stores.forEach(store => store.destroy());

        for (const [key, descriptor] of Object.entries(descriptors)) {
            descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
        }
    });

    /**
     * @summary Creates an owned store which leaves filtering, sorting and paging to its backend.
     * @param {Object} config
     * @returns {Neo.data.Store}
     */
    function create(config) {
        const store = Neo.create(Store, {
            autoLoad    : false,
            filters     : [{operator: 'like', property: 'name', value: 'a'}],
            pageSize    : 50,
            remoteFilter: true,
            remoteSort  : true,
            sorters     : [{direction: 'DESC', property: 'score'}],
            ...config
        });

        stores.push(store);
        return store
    }

    /**
     * @summary Reads a requested URL the way a server reads it.
     * @param {Number} index
     * @returns {URL}
     */
    const received = index => new URL(requested[index].url, 'http://localhost/');

    /**
     * @summary Parses a JSON query value, or returns the raw value when it is not JSON.
     * @param {String|null} value
     * @returns {*}
     */
    const decode = value => {
        try {
            return JSON.parse(value)
        } catch {
            return value
        }
    };

    test('the url default pipeline sends sorters and filters that JSON.parse turns back into the exported ones', async () => {
        const store = create({url: '/api/rows'});

        await store.load();

        const {searchParams} = received(0);

        expect(requested.map(request => request.transport)).toEqual(['xhr']);
        expect(store.exportSorters(), 'the store has a sorter to send').toEqual([{direction: 'DESC', property: 'score'}]);
        expect(store.exportFilters(), 'the store has a filter to send').toEqual([{operator: 'like', property: 'name', value: 'a'}]);
        expect(decode(searchParams.get('sorters'))).toEqual(store.exportSorters());
        expect(decode(searchParams.get('filters'))).toEqual(store.exportFilters())
    });

    test('a Fetch connection sends page, pageSize, sorters and filters in its query', async () => {
        const store = create(fetchPipeline());

        await store.load();

        const {pathname, searchParams} = received(0);

        expect(requested.map(request => request.transport)).toEqual(['fetch']);
        expect(pathname).toBe('/api/rows');
        expect(searchParams.get('page')).toBe('1');
        expect(searchParams.get('pageSize')).toBe('50');
        expect(decode(searchParams.get('sorters'))).toEqual(store.exportSorters());
        expect(decode(searchParams.get('filters'))).toEqual(store.exportFilters())
    });

    for (const [name, config, nextPath] of [
        ['the url default pipeline',     () => ({url: '/api/rows'}), '/api/rows'],
        ['a Fetch connection',           fetchPipeline,              '/api/rows'],
        ['a store without a connection', () => ({}),                 '/api/other']
    ]) {
        test(`load({url}) on ${name} requests that URL, with no url query param`, async () => {
            const store = create(config());

            await store.load({url: '/api/other'});
            await store.load();

            const once = received(0), next = received(1);

            expect(once.pathname).toBe('/api/other');
            expect(once.searchParams.has('url'), 'the url is the request URL, not a query param').toBe(false);
            expect(once.searchParams.get('pageSize'), 'the other params still compose').toBe('50');
            expect(next.pathname, 'the override holds for one load').toBe(nextPath);
            expect(next.searchParams.has('url')).toBe(false)
        })
    }
});
