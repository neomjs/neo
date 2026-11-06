import {createServer} from 'node:http';
import {test, expect} from '@playwright/test';

/** @summary Verifies Pipeline request headers at a real HTTP endpoint from both executing worker realms. */
test.describe('Pipeline Fetch headers across worker realms', () => {
    let requests, sequence = 0, server, url;

    /**
     * @summary Runs the header fixture or the existing Pipeline teardown inside the App worker.
     * @param {import('@playwright/test').Page} page
     * @param {Object} query
     * @returns {Promise<void>}
     */
    async function drive(page, query) {
        const params = new URLSearchParams({...query, n: String(++sequence)}),
              file   = query.action === 'destroy' ? 'driver.mjs' : 'fetchHeaders.mjs',
              path   = `../../test/playwright/component/apps/pipeline-cache/${file}?${params}`,
              result = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);

        expect(result.success, JSON.stringify(result)).toBe(true)
    }

    test.beforeEach(async ({page}) => {
        requests = [];
        server = createServer((request, response) => {
            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            response.setHeader('Access-Control-Allow-Headers', 'authorization, x-neo-probe');
            response.setHeader('Access-Control-Allow-Private-Network', 'true');
            response.setHeader('Cache-Control', 'no-store');

            if (request.method === 'OPTIONS') {
                response.writeHead(204);
                response.end();
                return
            }

            const receipt = {
                authorization: request.headers.authorization ?? null,
                method       : request.method,
                path         : request.url,
                probe        : request.headers['x-neo-probe'] ?? null
            };
            requests.push(receipt);
            response.writeHead(200, {'Content-Type': 'application/json'});
            response.end(JSON.stringify(receipt))
        });

        await new Promise((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', () => {
                server.off('error', reject);
                resolve()
            })
        });
        url = `http://127.0.0.1:${server.address().port}/headers`;

        await page.goto('test/playwright/component/apps/pipeline-cache/index.html');
        await page.waitForSelector('#pipeline-cache-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        try {
            await drive(page, {action: 'destroy'})
        } finally {
            await new Promise((resolve, reject) => {
                server.close(error => error ? reject(error) : resolve());
                server.closeAllConnections()
            })
        }
    });

    for (const realm of ['app', 'data']) {
        test(`${realm}: supplied headers reach HTTP and do not leak into the next read`, async ({page}) => {
            await drive(page, {realm, url});
            const receipt = await page.evaluate(() => Neo.worker.App.getConfigs({
                id: 'pipeline-cache-viewport', keys: 'fetchHeadersReceipt'
            }));
            const headers = {authorization: 'Bearer pipeline-header-probe', 'x-neo-probe': realm};

            expect(requests).toEqual([
                {authorization: headers.authorization, method: 'GET', path: '/headers', probe: realm},
                {authorization: null, method: 'GET', path: '/headers', probe: null}
            ]);
            expect(receipt.first.data).toEqual(requests[0]);
            expect(receipt.control.data).toEqual(requests[1]);
            expect(receipt.first.requestHeaders).toEqual(headers);
            expect(receipt.control.requestHeaders).toBeNull();
            expect(receipt.headersAfter).toEqual(headers);
            for (const response of [receipt.first, receipt.control]) {
                expect(response).toMatchObject({ok: true, status: 200, requestUrl: url, url})
            }
            expect(receipt.realm).toBe(realm);
            if (realm === 'data') expect(receipt.remoteId).toBeTruthy()
        })
    }
});
