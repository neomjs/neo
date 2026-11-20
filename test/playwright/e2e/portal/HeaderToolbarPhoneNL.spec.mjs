import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Measures `.portal-header-toolbar` and its interactive buttons in viewport pixels.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readHeaderGeometry(page) {
    return page.evaluate(() => {
        const toolbar = document.querySelector('.portal-header-toolbar'),
              rect    = toolbar.getBoundingClientRect(),
              buttons = [...toolbar.querySelectorAll('a.neo-button, button.neo-button')].map(node => {
                  const box   = node.getBoundingClientRect(),
                        style = getComputedStyle(node);

                  return {
                      ariaLabel: node.getAttribute('aria-label'),
                      height   : Math.round(box.height),
                      left     : +box.left.toFixed(2),
                      right    : +box.right.toFixed(2),
                      text     : node.innerText.trim(),
                      top      : Math.round(box.top),
                      visible  : style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0,
                      width    : +box.width.toFixed(2)
                  }
              });

        return {
            buttons,
            clientWidth    : toolbar.clientWidth,
            height         : Math.round(rect.height),
            scrollWidth    : toolbar.scrollWidth,
            separateBarNode: document.querySelectorAll('.portal-header-toolbar .separate-bar').length
        }
    })
}

test.describe('Portal phone header: single 58px row with Theme, GitHub and Discord (Neural Link)', () => {
    for (const width of [360, 390, 640]) {
        test(`at ${width}px wide #/examples fits all 8 header targets (>=44px high) on one 58px row with zero horizontal scroll`, async ({neuralLink, page}) => {
            await page.setViewportSize({width, height: 844});
            await page.goto('/apps/portal/index.html#/examples');

            const app = await neuralLink.connectToApp('Portal');

            await expect(page.locator('.portal-header-toolbar .logo')).toBeVisible({timeout: 20000});

            const providers  = await app.findInstances({className: 'Portal.view.ViewportStateProvider'}, ['id']),
                  providerId = (Array.isArray(providers) ? providers[0] : providers).id;

            await app.modifyStateProvider(providerId, {blogPostCount: 59});

            const newsMatches = await app.queryComponent({reference: 'news-header-button'}, ['badgeText']),
                  newsBtn     = Array.isArray(newsMatches) ? newsMatches[0] : newsMatches;

            expect(newsBtn?.properties?.badgeText).toBe(59);

            await expect.poll(async () => {
                const matches = await app.queryComponent({reference: 'home-button'}, ['text']),
                      home    = Array.isArray(matches) ? matches[0] : matches;
                return home?.properties?.text === null
            }, {timeout: 10000}).toBe(true);

            await expect.poll(async () => {
                const g = await readHeaderGeometry(page);
                return g.buttons.length === 8 && g.buttons.every(b => b.visible && b.top === 5)
            }, {timeout: 10000}).toBe(true);

            const geometry = await readHeaderGeometry(page);

            expect(geometry.height).toBe(58);
            expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
            expect(geometry.separateBarNode).toBe(0);
            expect(geometry.buttons).toHaveLength(8);

            for (const btn of geometry.buttons) {
                expect(btn.visible).toBe(true);
                expect(btn.height).toBeGreaterThanOrEqual(44);
                expect(btn.top).toBe(5);
                expect(btn.left).toBeGreaterThanOrEqual(0);
                expect(btn.right).toBeLessThanOrEqual(width)
            }

            expect(geometry.buttons[0].text).toBe('');
            expect(geometry.buttons[0].ariaLabel).toBe('Neo.mjs Home');
            expect(geometry.buttons[5].ariaLabel).toBe('Switch Theme');
            expect(geometry.buttons[6].ariaLabel).toBe('GitHub');
            expect(geometry.buttons[7].ariaLabel).toBe('Join Discord')
        })
    }

    test('at 360px wide #/examples fits all 8 header targets under fallback sans-serif when Google Fonts is blocked', async ({neuralLink, page}) => {
        await page.route('**/*fonts.googleapis.com/**', route => route.abort());
        await page.setViewportSize({width: 360, height: 844});
        await page.goto('/apps/portal/index.html#/examples');

        const app = await neuralLink.connectToApp('Portal');

        await expect(page.locator('.portal-header-toolbar .logo')).toBeVisible({timeout: 20000});

        const providers  = await app.findInstances({className: 'Portal.view.ViewportStateProvider'}, ['id']),
              providerId = (Array.isArray(providers) ? providers[0] : providers).id;

        await app.modifyStateProvider(providerId, {blogPostCount: 59});

        await expect.poll(async () => {
            const matches = await app.queryComponent({reference: 'home-button'}, ['text']),
                  home    = Array.isArray(matches) ? matches[0] : matches;
            return home?.properties?.text === null
        }, {timeout: 10000}).toBe(true);

        await expect.poll(async () => {
            const g = await readHeaderGeometry(page);
            return g.buttons.length === 8 && g.buttons.every(b => b.visible && b.top === 5)
        }, {timeout: 10000}).toBe(true);

        const geometry = await readHeaderGeometry(page);

        expect(geometry.height).toBe(58);
        expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
        expect(geometry.buttons).toHaveLength(8);

        for (const btn of geometry.buttons) {
            expect(btn.height).toBeGreaterThanOrEqual(44);
            expect(btn.top).toBe(5);
            expect(btn.left).toBeGreaterThanOrEqual(0);
            expect(btn.right).toBeLessThanOrEqual(360)
        }
    });

    test('at 390x844 clicking the phone header theme button on #/examples flips the Portal theme and #/home has no floating separate-bar', async ({neuralLink, page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto('/apps/portal/index.html#/examples');

        const app = await neuralLink.connectToApp('Portal');

        const themeBtn = page.locator('.portal-header-toolbar button[aria-label="Switch Theme"]');
        await expect(themeBtn).toBeVisible({timeout: 20000});

        const beforeViewport = await app.queryComponent({className: 'Portal.view.Viewport'}, ['theme']);
        const initialTheme   = (Array.isArray(beforeViewport) ? beforeViewport[0] : beforeViewport)?.properties?.theme || 'neo-theme-neo-dark';
        const expectedTheme  = initialTheme === 'neo-theme-neo-light' ? 'neo-theme-neo-dark' : 'neo-theme-neo-light';

        await themeBtn.click();

        await expect.poll(async () => {
            const hit = await app.queryComponent({className: 'Portal.view.Viewport'}, ['theme']);
            return (Array.isArray(hit) ? hit[0] : hit)?.properties?.theme
        }, {timeout: 10000}).toBe(expectedTheme);

        await page.goto('/apps/portal/index.html#/home');
        await expect(page.locator('.portal-home-hero-content .get-started-button')).toBeVisible({timeout: 20000});

        const homeGeometry = await readHeaderGeometry(page);
        expect(homeGeometry.height).toBe(58);
        expect(homeGeometry.separateBarNode).toBe(0);
        expect(homeGeometry.buttons.every(b => b.visible && b.top === 5)).toBe(true)
    });

    test('at 1440x900 desktop header preserves the Neo.mjs wordmark', async ({neuralLink, page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/apps/portal/index.html#/examples');

        await neuralLink.connectToApp('Portal');
        const logo = page.locator('.portal-header-toolbar .logo');
        await expect(logo).toBeVisible({timeout: 20000});
        await expect(logo).toContainText('Neo.mjs')
    })
});
