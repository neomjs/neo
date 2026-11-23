import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'ConnectionXhrStatusTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Store          from '../../../../../src/data/Store.mjs';
import Xhr            from '../../../../../src/data/connection/Xhr.mjs';

const refusal = {error: 'unsupported sorter: name'},
      rows    = [{id: 1}, {id: 2}];

/**
 * @param {Promise} promise
 * @returns {Promise<Object>} `{resolved}` or `{rejected}`, so one matcher reads both the outcome and its value
 */
const settle = promise => promise.then(resolved => ({resolved}), rejected => ({rejected}));

/**
 * @summary Pins which answers an Xhr read accepts: a 2xx status, or status 0 with a body, which a `file://` read reports.
 *
 * Any other status rejects, as the Fetch connection does, with the response, its `status` and, when the body parses,
 * its `json`. The reads run the real `promiseJson()` and `promiseRequest()`, and a `url` store's real `Store#load`,
 * `Pipeline#read` and connection `read()`. Only the native `XMLHttpRequest` is stubbed.
 */
test.describe('An Xhr read accepts a 2xx answer and rejects an HTTP error status', () => {
    let answer, descriptor, stores, xhr;

    /**
     * @param {Object} [config]
     * @returns {Neo.data.Store}
     */
    const create = config => {
        const store = Neo.create(Store, {keyProperty: 'id', model: {fields: [{name: 'id', type: 'Integer'}]}, ...config});

        stores.push(store);

        return store
    };

    /**
     * @param {Number} status
     * @param {Object|String} [body=''] Sent JSON-encoded unless it is a string
     * @param {String} [event='load'] The native event that delivers the answer
     */
    const respond = (status, body='', event='load') => {
        answer = {event, response: typeof body === 'string' ? body : JSON.stringify(body), status}
    };

    test.beforeEach(() => {
        descriptor = Object.getOwnPropertyDescriptor(globalThis, 'XMLHttpRequest');
        stores     = [];

        respond(200, rows);

        /** @summary Answers each request with the current answer once the connection has registered its listeners. */
        globalThis.XMLHttpRequest = class AnsweringXhr {
            listeners = {}

            /** @summary Keeps the connection's listeners, so the stub can answer. */
            addEventListener(type, fn) {
                this.listeners[type] = fn
            }

            /** @summary The answer carries no headers the connection reads. */
            getAllResponseHeaders() {
                return ''
            }

            /** @summary Opening has no network effect in this fixture. */
            open() {}

            /** @summary Header setup has no network effect in this fixture. */
            setRequestHeader() {}

            /** @summary Delivers the current status and body through the current native event. */
            send() {
                const {event, ...fields} = answer;

                queueMicrotask(() => {
                    Object.assign(this, {readyState: 4, statusText: '', ...fields});
                    this.listeners[event]({currentTarget: this, target: this})
                })
            }
        };

        xhr = Neo.create(Xhr, {requests: {}})
    });

    test.afterEach(() => {
        stores.forEach(store => store.destroy());
        xhr.destroy();

        descriptor ? Object.defineProperty(globalThis, 'XMLHttpRequest', descriptor) : delete globalThis.XMLHttpRequest
    });

    for (const status of [400, 404, 500]) {
        test(`promiseJson() rejects a ${status} with its status and its parsed body`, async () => {
            respond(status, refusal);

            expect(await settle(xhr.promiseJson({url: '/api/rows'}))).toMatchObject({rejected: {json: refusal, status}})
        });

        test(`a url store's load() rejects a ${status} with its status and its parsed body, and stays unloaded`, async () => {
            respond(status, refusal);

            const store = create({url: '/api/rows'});

            expect(await settle(store.load())).toMatchObject({rejected: {json: refusal, status}});
            expect(store.isLoaded).toBe(false);
            expect(store.isLoading).toBe(false);
            expect(store.count).toBe(0)
        })
    }

    test('a refused body that is not JSON rejects with its status, not with a parse error', async () => {
        const page = '<h1>Internal Server Error</h1>';

        respond(500, page);

        const result = await settle(xhr.promiseJson({url: '/api/rows'}));

        expect(result).toMatchObject({rejected: {response: page, status: 500}});
        expect(result.rejected).not.toHaveProperty('json')
    });

    test('a 2xx answer resolves with its parsed body, as before', async () => {
        for (const status of [200, 201]) {
            respond(status, rows);

            expect(await settle(xhr.promiseJson({url: '/api/rows'}))).toMatchObject({resolved: {json: rows, status}})
        }
    });

    test('a url store loads the rows of a 200', async () => {
        const store = create({url: '/api/rows'});

        await store.load();

        expect(store.count).toBe(2);
        expect(store.isLoaded).toBe(true)
    });

    test('a load with status 0 and a body, which a file:// read reports, resolves', async () => {
        respond(0, rows);

        expect(await settle(xhr.promiseJson({url: 'file:///data/rows.json'}))).toMatchObject({resolved: {json: rows, status: 0}});

        const store = create({url: 'file:///data/rows.json'});

        await store.load();

        expect(store.count).toBe(2)
    });

    test('a load with status 0 and no body rejects with that status', async () => {
        respond(0);

        expect(await settle(xhr.promiseJson({url: 'file:///data/empty.json'}))).toMatchObject({rejected: {response: '', status: 0}})
    });

    test('a network failure rejects, as before', async () => {
        respond(0, '', 'error');

        expect(await settle(xhr.promiseJson({url: '/api/rows'}))).toMatchObject({rejected: {status: 0}})
    });

    test('promiseRequest() rejects an HTTP error status with its status and body, and resolves a 2xx', async () => {
        respond(404, 'Not Found');

        expect(await settle(xhr.promiseRequest({url: '/docs/missing.md'}))).toMatchObject({rejected: {response: 'Not Found', status: 404}});

        respond(200, '# Title');

        expect(await settle(xhr.promiseRequest({url: '/docs/title.md'}))).toMatchObject({resolved: {response: '# Title', status: 200}})
    })
});
