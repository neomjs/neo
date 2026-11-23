import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'StoreResponseTotalTest'}});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Store           from '../../../../src/data/Store.mjs';
import FetchConnection from '../../../../src/data/connection/Fetch.mjs';
import ConnectionBase  from '../../../../src/data/connection/Base.mjs';

const rows = [{id: 1}, {id: 2}, {id: 3}];

/**
 * @summary A connection in the App worker whose read answers a fixed envelope, the way a normalizer or a custom
 * connection hands a pipeline its result.
 */
class EnvelopeConnection extends ConnectionBase {
    static config = {
        /**
         * @member {String} className='Test.Unit.Data.StoreResponseTotal.EnvelopeConnection'
         * @protected
         */
        className: 'Test.Unit.Data.StoreResponseTotal.EnvelopeConnection',
        /**
         * The envelope every read answers
         * @member {Object|null} envelope=null
         */
        envelope: null
    }

    /**
     * @summary Answers a copy of the envelope.
     * @returns {Promise<Object>}
     */
    async read() {
        return structuredClone(this.envelope)
    }
}

const Envelope = Neo.setupClass(EnvelopeConnection);

/**
 * @summary Pins where a remote Store finds the total of a load response, on each connection's response shape.
 *
 * The load runs the real `Store#load`, `Pipeline#read` and connection `read()`. Only the native `XMLHttpRequest` and
 * `fetch` are stubbed, and both answer with the same body: three rows of a larger dataset.
 */
test.describe('A remote Store reads the total a load response sends beside its rows', () => {
    let body, descriptors, stores;

    /**
     * @param {Object} [config]
     * @returns {Neo.data.Store}
     */
    const create = config => {
        const store = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'Integer'}]}, pageSize: 3, ...config});

        stores.push(store);

        return store
    };

    const fetchPipeline = () => ({pipeline: {connection: {module: FetchConnection, url: '/api/rows'}}});

    test.beforeEach(() => {
        body        = {data: rows, totalCount: 1000};
        descriptors = Object.fromEntries(['fetch', 'XMLHttpRequest'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
        stores      = [];

        /** @summary Answers every request with the current body once the connection has registered it. */
        globalThis.XMLHttpRequest = class AnsweringXhr {
            listeners = {}

            /** @summary Keeps the connection's listeners, so the stub can answer. */
            addEventListener(type, fn) {
                this.listeners[type] = fn
            }

            /** @summary The response carries no headers the connection reads. */
            getAllResponseHeaders() {
                return ''
            }

            /** @summary Opening has no network effect in this fixture. */
            open() {}

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Answers with the current body. */
            send() {
                queueMicrotask(() => {
                    Object.assign(this, {readyState: 4, response: JSON.stringify(body), status: 200});
                    this.listeners.load({currentTarget: this, target: this})
                })
            }
        };

        globalThis.fetch = async url => ({
            json      : async () => structuredClone(body),
            ok        : true,
            redirected: false,
            status    : 200,
            statusText: 'OK',
            type      : 'basic',
            url
        })
    });

    test.afterEach(() => {
        stores.forEach(store => store.destroy());

        Object.entries(descriptors).forEach(([key, descriptor]) => {
            descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]
        })
    });

    test('a Fetch connection reads totalCount from the body, where its rows are', async () => {
        const store = create(fetchPipeline());

        await store.load();

        expect(store.count).toBe(3);
        expect(store.totalCount).toBe(1000)
    });

    test('the url default, Xhr, reads the same body to the same total', async () => {
        const store = create({url: '/api/rows'});

        await store.load();

        expect(store.count).toBe(3);
        expect(store.totalCount).toBe(1000)
    });

    test('with another responseRoot, the rows and the total come from the same object', async () => {
        body = {records: rows, totalCount: 500};

        const store = create({...fetchPipeline(), responseRoot: 'records'});

        await store.load();

        expect(store.count).toBe(3);
        expect(store.totalCount).toBe(500)
    });

    test('a body that names no total leaves the loaded count as the total', async () => {
        body = rows;

        const store = create(fetchPipeline());

        await store.load();

        expect(store.count).toBe(3);
        expect(store.totalCount).toBe(3)
    });

    test('rows under a responseRoot inside data or json keep the envelope\'s total, and a body total wins over it', async () => {
        const load = async envelope => {
            const store = create({pipeline: {connection: {module: Envelope, envelope}}, responseRoot: 'records'});

            await store.load();

            return [store.count, store.totalCount]
        };

        expect(await load({data: {records: rows}, totalCount: 123})).toEqual([3, 123]);
        expect(await load({json: {records: rows}, totalCount: 123})).toEqual([3, 123]);
        expect(await load({data: {records: rows, totalCount: 9}, totalCount: 123})).toEqual([3, 9])
    });

    test('readResponse() reads each response shape a pipeline hands the store', () => {
        const store = create();

        // the Fetch connection's response: the parsed body under data
        expect(store.readResponse({ok: true, status: 200, data: {data: rows, totalCount: 1000}})).toEqual({items: rows, totalCount: 1000});
        // the Xhr connection's response: the parsed body under json
        expect(store.readResponse({status: 200, response: '…', json: {data: rows, totalCount: 1000}})).toEqual({items: rows, totalCount: 1000});
        // a normalizer's result: the rows under data, the total beside them
        expect(store.readResponse({data: rows, totalCount: 7})).toEqual({items: rows, totalCount: 7});
        // a bare array names no total
        expect(store.readResponse(rows)).toEqual({items: rows, totalCount: null});
        // no array at responseRoot: the body is handed back, as load() has always kept it
        expect(store.readResponse({ok: true, data: {rows, totalCount: 9}})).toEqual({items: {rows, totalCount: 9}, totalCount: 9})
    })
});
