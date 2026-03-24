import {setup} from '../../../setup.mjs';

const appName = 'ConnectionStreamTest';

setup({
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Stream         from '../../../../../src/data/connection/Stream.mjs';

/**
 * @summary Tests for Neo.data.connection.Stream
 */
test.describe.serial('Neo.data.connection.Stream', () => {
    let connection;

    test.beforeEach(() => {
        connection = Neo.create(Stream, {});
    });

    test('read() should perform a fetch and return a stream', async () => {
        const originalFetch = globalThis.fetch;
        
        globalThis.fetch = async (url) => {
            return {
                ok: true,
                status: 200,
                headers: {
                    get: (name) => name === 'content-length' ? '123' : null
                },
                body: new ReadableStream()
            };
        };

        const result = await connection.read({url: 'http://test.com/data.jsonl'});

        expect(result.stream).toBeDefined();
        expect(result.total).toBe(123);
        expect(result.response.ok).toBe(true);

        globalThis.fetch = originalFetch;
    });

    test('read() should throw on HTTP error', async () => {
         const originalFetch = globalThis.fetch;
         
         globalThis.fetch = async () => ({ ok: false, status: 404 });

         await expect(connection.read({url: 'http://test.com/404'})).rejects.toThrow('HTTP error! status: 404');

         globalThis.fetch = originalFetch;
    });

    test('abort() should abort the fetch request', async () => {
         const originalFetch = globalThis.fetch;
         let abortSignal;

         globalThis.fetch = async (url, options) => {
             abortSignal = options.signal;
             return new Promise((resolve, reject) => {
                 setTimeout(() => {
                     if (abortSignal.aborted) {
                         const err = new Error('AbortError');
                         err.name = 'AbortError';
                         reject(err);
                     } else {
                         resolve({ ok: true, body: new ReadableStream() });
                     }
                 }, 50);
             });
         };

         const promise = connection.read({url: 'http://test.com/data.jsonl'});
         connection.abort();
         
         const result = await promise;
         
         expect(result.aborted).toBe(true);

         globalThis.fetch = originalFetch;
    });
});
