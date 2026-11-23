import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ConnectionReadParamsTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Fetch          from '../../../../../src/data/connection/Fetch.mjs';
import Xhr            from '../../../../../src/data/connection/Xhr.mjs';

const transports = {
    Fetch: url => Neo.create(Fetch, {url}),
    Xhr  : url => Neo.create(Xhr, {requests: {}, url})
};

/**
 * @summary Pins what `Xhr#read` and `Fetch#read` send for their read params, read back the way a server reads them.
 *
 * Only the native `XMLHttpRequest` and `fetch` are stubbed: each records the URL and the headers the real connection
 * hands it, and answers with an empty body.
 */
test.describe('Xhr and Fetch reads send their params in a form the server can decode', () => {
    let connections, descriptors, requested;

    test.beforeEach(() => {
        connections = [];
        descriptors = Object.fromEntries(['fetch', 'XMLHttpRequest']
            .map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        requested   = [];

        /** @summary Records the native Xhr dispatch and answers it with an empty body. */
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
                requested.push({headers: {}, url})
            }

            /** @summary Captures each request header as native Xhr combines them: a second value for a name, in any case, is appended. */
            setRequestHeader(name, value) {
                const headers = requested.at(-1).headers,
                      key     = name.toLowerCase();

                headers[key] = key in headers ? `${headers[key]}, ${value}` : value
            }

            /** @summary Answers with an empty body once the connection has registered the request. */
            send() {
                queueMicrotask(() => {
                    Object.assign(this, {readyState: 4, response: '{}', status: 200});
                    this.listeners.load({currentTarget: this, target: this})
                })
            }
        };

        globalThis.fetch = async (url, options) => {
            requested.push({headers: Object.fromEntries(options.headers), url});

            return {json: async () => ({}), ok: true, redirected: false, status: 200, statusText: 'OK', type: 'basic', url}
        }
    });

    test.afterEach(() => {
        connections.forEach(connection => connection.destroy());

        for (const [key, descriptor] of Object.entries(descriptors)) {
            descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
        }
    });

    /**
     * @summary Reads through an owned connection and returns the request its native boundary received.
     * @param {String} transport A key of `transports`
     * @param {Object} params
     * @param {String} [url='/data'] The connection's URL
     * @param {Object|null} [defaultHeaders=null] The connection's `defaultHeaders`
     * @returns {Promise<Object>} The recorded `{headers, url}`
     */
    async function read(transport, params, url='/data', defaultHeaders=null) {
        const connection = transports[transport](url);

        connections.push(connection);
        defaultHeaders && (connection.defaultHeaders = defaultHeaders);
        await connection.read(params);

        expect(requested, 'one read dispatches one request').toHaveLength(1);
        return requested[0]
    }

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

    for (const transport of Object.keys(transports)) {
        test(`${transport}: arrays and plain objects arrive as JSON that parses back to the params`, async () => {
            const params         = {ids: [3, 1, 2], range: {from: 1, to: 9}, sorters: [{direction: 'ASC', property: 'name'}]},
                  {searchParams} = new URL((await read(transport, {...params})).url, 'http://localhost/');

            for (const [key, value] of Object.entries(params)) {
                expect(decode(searchParams.get(key)), key).toEqual(value)
            }
        });

        test(`${transport}: strings, numbers and booleans arrive as they are, null and undefined are left out`, async () => {
            const {url} = await read(transport, {active: false, missing: null, name: 'a b&c', page: 2, skipped: undefined});

            expect([...new URL(url, 'http://localhost/').searchParams])
                .toEqual([['active', 'false'], ['name', 'a b&c'], ['page', '2']])
        });

        test(`${transport}: the params join a URL that already has a query and a fragment`, async () => {
            expect((await read(transport, {page: 1}, '/data?fn=x#top')).url).toBe('/data?fn=x&page=1#top')
        });

        test(`${transport}: a headers param is sent as request headers, never in the query`, async () => {
            const {headers, url} = await read(transport, {headers: {'X-Probe': 'read'}, page: 1});

            expect(url).toBe('/data?page=1');
            expect(headers['x-probe']).toBe('read')
        });

        test(`${transport}: a read's headers replace default headers of the same name, in any case`, async () => {
            const {headers} = await read(transport, {headers: {authorization: 'Bearer NEW', 'x-probe': 'new'}}, '/data', {
                Authorization: 'Bearer OLD',
                'X-Kept'     : 'kept',
                'X-Probe'    : 'old'
            });

            expect(headers).toEqual({authorization: 'Bearer NEW', 'x-kept': 'kept', 'x-probe': 'new'})
        })
    }

    test('Xhr: a direct request composes a URLSearchParams, [key, value] pairs or a query string in order, repeated keys kept', async () => {
        const connection = transports.Xhr('/data');

        connections.push(connection);

        for (const params of [new URLSearchParams([['tag', 'one'], ['tag', 'two']]), [['tag', 'one'], ['tag', 'two']], 'tag=one&tag=two', {tag: 'plain'}]) {
            await connection.promiseJson({params, url: '/data'})
        }

        expect(requested.map(request => request.url)).toEqual(['/data?tag=one&tag=two', '/data?tag=one&tag=two', '/data?tag=one&tag=two', '/data?tag=plain'])
    })
});
