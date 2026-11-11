import {test, expect} from '@playwright/test';

test.describe('Neo boot on an insecure HTTP origin', () => {
    test('mounts the component test viewport without the secure-context-only UUID API', async ({browser, baseURL}) => {
        const context = await browser.newContext(),
              page    = await context.newPage(),
              errors  = [];

        page.on('pageerror', error => errors.push(error.message));

        // Keep the browser origin untrusted while proxying requests to the component server's localhost host.
        await context.route('http://insecure.test/**', async route => {
            const url = new URL(route.request().url());

            url.hostname = new URL(baseURL).hostname;

            const response = await route.fetch({url: url.href});
            await route.fulfill({response})
        });

        const url = new URL('/test/playwright/component/apps/empty-viewport/index.html', baseURL);
        url.hostname = 'insecure.test';

        try {
            await page.goto(url.href);

            const cryptoCapabilities = await page.evaluate(() => ({
                getRandomValues: typeof crypto.getRandomValues,
                isSecureContext : isSecureContext,
                randomUUID      : typeof crypto.randomUUID
            }));

            expect(cryptoCapabilities).toEqual({
                getRandomValues: 'function',
                isSecureContext : false,
                randomUUID      : 'undefined'
            });

            await expect(page.locator('#component-test-viewport')).toBeAttached();
            expect(errors).toEqual([])
        } finally {
            await context.close()
        }
    });
});
