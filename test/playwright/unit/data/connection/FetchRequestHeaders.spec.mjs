import {setup} from '../../../setup.mjs';

setup({appConfig: {name: 'FetchRequestHeadersTest'}});

import {test, expect} from '@playwright/test';
import {createServer} from 'node:http';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Fetch          from '../../../../../src/data/connection/Fetch.mjs';

/** @summary Observes Fetch headers at HTTP instead of trusting echoed request metadata. */
test.describe('Fetch request headers', () => {
    let connections, requests, server, url;

    test.beforeAll(async () => {
        server = createServer(async (request, response) => {
            const chunks = [];
            for await (const chunk of request) chunks.push(chunk);
            const receipt = {
                authorization: request.headers.authorization ?? null,
                body         : Buffer.concat(chunks).toString(),
                method       : request.method,
                shared       : request.headers['x-shared'] ?? null
            };
            requests.push(receipt);
            response.writeHead(request.url.endsWith('/denied') ? 401 : 200, {'Content-Type': 'application/json'});
            response.end(JSON.stringify(receipt))
        });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        url = `http://127.0.0.1:${server.address().port}/echo`
    });

    test.beforeEach(() => {connections = []; requests = []});
    test.afterEach(() => connections.forEach(connection => connection.destroy()));
    test.afterAll(async () => {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve))
    });

    /**
     * @summary Creates an owned, initialized connection for each request control.
     * @returns {Promise<Neo.data.connection.Fetch>}
     */
    async function create() {
        const connection = Neo.create(Fetch);
        connections.push(connection);
        await connection.ready();
        return connection
    }

    for (const form of ['string', 'object']) {
        test(`${form} URL sends the supplied headers without rewriting their metadata`, async () => {
            const connection = await create(), headers = {Authorization: 'Bearer request'},
                  config     = {headers}, response = form === 'string'
                      ? await connection.get(url, config)
                      : await connection.get({url, ...config});

            expect(requests).toHaveLength(1);
            expect(requests[0].authorization).toBe('Bearer request');
            expect(response.data.authorization).toBe('Bearer request');
            expect(response.request.headers).toBe(headers);
            expect(response.request.url).toBe(url);
            expect(headers).toEqual({Authorization: 'Bearer request'})
        })
    }

    test('request tuples override default names case-insensitively and retain other defaults', async () => {
        const connection = await create(), defaults = {Authorization: 'Bearer default', 'X-Shared': 'default'},
              headers    = [['authorization', 'Bearer request']];
        connection.defaultHeaders = defaults;

        const response = await connection.get(url, {headers});

        expect(response.data).toMatchObject({authorization: 'Bearer request', shared: 'default'});
        expect(defaults).toEqual({Authorization: 'Bearer default', 'X-Shared': 'default'});
        expect(headers).toEqual([['authorization', 'Bearer request']])
    });

    test('native Headers inputs reach HTTP and remain unchanged', async () => {
        const connection = await create(), headers = new Headers({Authorization: 'Bearer native'});
        const response   = await connection.get(url, {headers});

        expect(response.data.authorization).toBe('Bearer native');
        expect([...headers]).toEqual([['authorization', 'Bearer native']]);
        expect(response.request.headers).toBe(headers)
    });

    test('omitted headers preserve method, body, response decoding and original URL metadata', async () => {
        const connection = await create(), response = await connection.post(url, {}, 'request body');

        expect(response.ok).toBe(true);
        expect(response.status).toBe(200);
        expect(response.data).toEqual({authorization: null, body: 'request body', method: 'POST', shared: null});
        expect(response.request.url).toBe(url)
    });

    test('a rejected response retains the native status and decoded body', async () => {
        const connection = await create();

        await expect(connection.get(`${url}/denied`, {headers: {Authorization: 'Bearer denied'}}))
            .rejects.toMatchObject({ok: false, status: 401, data: {authorization: 'Bearer denied'}});
        expect(requests).toHaveLength(1)
    });

    test('invalid header names reject the returned promise before HTTP dispatch', async () => {
        const connection = await create();

        await expect(connection.get(url, {headers: {'invalid name': 'value'}})).rejects.toThrow();
        expect(requests).toHaveLength(0)
    })
});
