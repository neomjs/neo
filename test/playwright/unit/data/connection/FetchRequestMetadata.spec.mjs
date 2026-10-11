import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'FetchRequestMetadataTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Fetch          from '../../../../../src/data/connection/Fetch.mjs';

const REQUEST_URL = 'https://workspace.example.test/apps/demo/resources/data/users.jsonl';

/**
 * @summary Pins the request metadata both URL forms of `Fetch.request` hand back.
 *
 * The response exposes the supplied request config as `response.request`, so that object is what a
 * caller reads a dispatched request's URL and headers from. The two input forms have to agree on
 * its shape: the string form's url slot holds the original string, exactly as the object form's
 * does, and it keeps holding it when the scoped resolver rewrites what gets dispatched.
 *
 * Only the native `fetch` boundary is stubbed. The connection, its URL handling and the returned
 * response assembly are the real ones.
 */
test.describe('Fetch request metadata carries the original URL in both URL forms', () => {
    let calls, priorFetch;

    test.beforeEach(() => {
        calls      = [];
        priorFetch = globalThis.fetch;

        globalThis.fetch = async (url, options) => {
            calls.push({options, url});

            return {
                json      : async () => ({ok: true}),
                ok        : true,
                redirected: false,
                status    : 200,
                statusText: 'OK',
                type      : 'basic',
                url
            }
        };
    });

    test.afterEach(() => {
        globalThis.fetch = priorFetch;
    });

    test('the string form keeps the original URL string in its request metadata', async () => {
        const connection = Neo.create(Fetch),
              response   = await connection.request(REQUEST_URL, {}, 'get');

        expect(response.request.url, 'the request metadata names the dispatched URL').toBe(REQUEST_URL);

        // Serialization is the observable this arm pins: a config holding itself in its own url
        // slot reads fine but cannot be stringified, so the metadata reaches a caller as an
        // opaque TypeError instead of the request it describes.
        expect(() => JSON.stringify(response.request), 'the metadata serializes').not.toThrow();

        connection.destroy();
    });

    test('the object form and the string form hand back the same metadata values', async () => {
        const connection = Neo.create(Fetch);

        const objectResponse = await connection.request({url: REQUEST_URL, responseType: 'json'}, {}, 'get'),
              stringResponse = await connection.request(REQUEST_URL, {responseType: 'json'}, 'get');

        expect(objectResponse.request.url).toBe(REQUEST_URL);
        expect(stringResponse.request.url).toBe(REQUEST_URL);

        // Deep equality, not the serialized text: key insertion order differs between the forms
        // and carries no meaning. What has to match is the metadata a caller reads back.
        expect(stringResponse.request, 'both forms expose the same metadata values').toEqual({
            ...objectResponse.request
        });

        connection.destroy();
    });

    test('unrelated supplied config fields survive both forms', async () => {
        const connection = Neo.create(Fetch);

        const objectResponse = await connection.request({url: REQUEST_URL, cache: 'no-store', responseType: 'json'}, {}, 'get'),
              stringResponse = await connection.request(REQUEST_URL, {cache: 'no-store', responseType: 'json'}, 'get');

        expect(objectResponse.request.cache, 'the object form keeps its unrelated fields').toBe('no-store');
        expect(stringResponse.request.cache, 'the string form keeps them too').toBe('no-store');

        connection.destroy();
    });

    test('the native boundary receives the URL and the requested method', async () => {
        const connection = Neo.create(Fetch),
              response   = await connection.request(REQUEST_URL, {}, 'delete');

        expect(calls).toHaveLength(1);
        expect(calls[0].url, 'the native dispatch still receives the URL').toBe(REQUEST_URL);
        expect(calls[0].options.method, 'the method rides through unchanged').toBe('delete');

        expect(response.status, 'the response fields are the native ones').toBe(200);
        expect(response.data, 'the body is read through the requested responseType').toEqual({ok: true});

        connection.destroy();
    });

    test('a workspace-relative dispatch resolves the URL but keeps the original in the metadata', async () => {
        const connection              = Neo.create(Fetch),
              priorUrlDescriptor      = Object.getOwnPropertyDescriptor(Neo.config, 'url'),
              priorLocationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location'),
              relative                = '../../apps/demo/resources/data/users.jsonl';

        globalThis.location = new URL(
            'https://workspace.example.test/devindex/node_modules/neo.mjs/src/worker/App.mjs'
        );
        Neo.config.url = {
            base  : 'https://workspace.example.test/devindex/apps/demo/index.html',
            href  : 'https://workspace.example.test/devindex/apps/demo/index.html',
            search: ''
        };

        try {
            const response = await connection.request(relative, {}, 'get');

            expect(calls[0].url, 'the dispatch goes through the scoped resolver').toBe(
                'https://workspace.example.test/devindex/apps/demo/resources/data/users.jsonl'
            );
            expect(response.request.url, 'the metadata keeps the original relative URL').toBe(relative);
        } finally {
            priorUrlDescriptor ?
                Object.defineProperty(Neo.config, 'url', priorUrlDescriptor) :
                delete Neo.config.url;

            priorLocationDescriptor ?
                Object.defineProperty(globalThis, 'location', priorLocationDescriptor) :
                delete globalThis.location;

            connection.destroy();
        }
    });
});
