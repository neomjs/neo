import {test, expect} from '@playwright/test';

/** @summary Proves cache ownership and clear forwarding with real App/Data workers and counted HTTP reads. */
test.describe('Pipeline cache across worker realms', () => {
    let sequence = 0;

    /**
     * @summary Executes one fixture module in the App worker through its existing module API.
     * @param {Object} page
     * @param {Object} query
     * @returns {Promise<void>}
     */
    async function drive(page, query) {
        const params = new URLSearchParams({...query, n: String(++sequence)}),
              path   = `../../test/playwright/component/apps/pipeline-cache/driver.mjs?${params}`,
              result = await page.evaluate(path => Neo.worker.App.loadModule({path}), path);
        expect(result.success, JSON.stringify(result)).toBe(true)
    }

    test.afterEach(async ({page}) => {await drive(page, {action: 'destroy'})});

    for (const realm of ['app', 'data']) for (const cache of [false, true]) {
        test(`${realm}: cache ${cache} preserves reads and explicit refresh`, async ({page, context, baseURL}) => {
            let reads = 0;
            await context.route('**/pipeline-cache-read', route => route.fulfill({
                status: 200, contentType: 'application/json', headers: {'Cache-Control': 'no-store'},
                body  : JSON.stringify({id: ++reads})
            }));
            await page.goto('test/playwright/component/apps/pipeline-cache/index.html');
            await page.waitForSelector('#pipeline-cache-viewport', {state: 'attached'});
            await drive(page, {realm, cache: String(cache), url: `${baseURL}/pipeline-cache-read`});
            const receipt = await page.evaluate(() => Neo.worker.App.getConfigs({id: 'pipeline-cache-viewport', keys: 'cacheReceipt'}));

            expect(receipt.firstId).toBe(1);
            expect(receipt.secondId).toBe(cache ? 1 : 2);
            expect(receipt.thirdId).toBe(cache ? 2 : 3);
            expect(reads).toBe(cache ? 2 : 3);
            expect(receipt.localEntries).toBe(cache && realm === 'app' ? 1 : 0);
            expect(receipt.cleared).toBe(cache ? 1 : 0);
            if (realm === 'data') expect(receipt.remoteId).toBeTruthy()
        })
    }
});
