import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies the Portal application in opt-in `'pathname'` routing mode under a root-anchored `<base href>`,
 * matching the `https://neomjs.com` deployment topology:
 * 1. Cold boot at `'/'` stays at `'/'` (`onHomeRoute`) without pushing `'/home'`.
 * 2. Header navigation and clicking the `Neo.mjs` logo (`route: '/'`) from `'/learn'` return to Home via the History
 *    API without reloading `Neo.Main` or main-thread addons.
 * 3. Rewritten Markdown links and canonical same-origin links navigate client-side, while modified new-tab clicks and
 *    `routerIgnorePaths` targets keep native browser semantics.
 */
async function servePortalPathnameMode(page) {
    await page.route('**/apps/portal/neo-config.json*', async route => {
        const response = await route.fetch({maxRetries: 2}),
              config   = await response.json();

        await route.fulfill({response, json: {
            ...config,
            allowAiClientInTests        : true,
            routerBasePath              : '',
            routerMode                  : 'pathname',
            useAiClient                 : false,
            useCanvasWorkerStartingPoint: false,
            useServiceWorker            : false,
            useSharedWorkers            : false
        }})
    });

    await page.route(url => {
        const {pathname} = url;

        if (/\.[a-z0-9]+$/i.test(pathname)) {
            return false
        }

        return (
            pathname === '/' ||
            pathname === '/learn' || pathname.startsWith('/learn/') ||
            pathname === '/news' || pathname.startsWith('/news/') ||
            pathname === '/examples' || /^\/examples\/[^/]+$/.test(pathname) ||
            pathname === '/services' ||
            pathname === '/docs'
        )
    }, async route => {
        const response = await route.fetch({
                  maxRetries: 2,
                  url       : new URL('/apps/portal/index.html', route.request().url()).href
              }),
              html = (await response.text()).replace('<head>', '<head>\n    <base href="/apps/portal/">');

        await route.fulfill({response, body: html})
    })
}

const VIEWS = {
    examples: 'Portal.view.examples.MainContainer',
    home    : 'Portal.view.home.MainContainer',
    learn   : 'Portal.view.learn.MainContainer'
};

/**
 * @summary Checks whether the named Portal section container is currently mounted in the App Worker via Neural Link.
 * @param {Object} app
 * @param {String} className
 * @returns {Promise<Boolean>}
 */
async function isViewMounted(app, className) {
    const match = await app.queryComponent({className}, ['id', 'mounted']),
          view  = Array.isArray(match) ? match[0] : match;

    return Boolean(view && (view.properties?.mounted ?? view.mounted))
}

test.describe('Portal pathname routing (Neural Link)', () => {
    test('cold-boots at /, returns to Home on Logo click from /learn, routes Markdown links without reload, and preserves addon singletons', async ({page, neuralLink}) => {
        await servePortalPathnameMode(page);
        await page.setViewportSize({width: 1440, height: 900});

        await page.goto('/');
        const app    = await neuralLink.connectToApp('Portal'),
              header = page.locator('.portal-header-toolbar'),
              logo   = header.getByRole('link', {name: 'Neo.mjs Home'});

        await expect.poll(() => isViewMounted(app, VIEWS.home)).toBe(true);
        await expect(page).toHaveURL(/\/$/);
        await expect(page).toHaveTitle('Neo.mjs - An Agent Institution');
        await expect(logo).toHaveAttribute('href', '/');
        await expect(logo).toHaveAttribute('aria-current', 'page');

        const headerHrefs = await header.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        expect(headerHrefs.slice(0, 5)).toEqual(['/', '/learn', '/news', '/examples', '/services']);

        // Snapshot main-thread Neo.Main and every registered Neo.main.addon singleton before navigation
        const addonCount = await page.evaluate(() => {
            globalThis.__sameDocument = true;
            globalThis.__bootMain     = Neo.Main;
            globalThis.__bootAddons   = {...Neo.main.addon};
            return Object.keys(globalThis.__bootAddons).length
        });
        expect(addonCount).toBeGreaterThan(0);

        // Navigate / -> /learn via header link, then click the Neo.mjs Logo back to /
        await header.getByRole('link', {name: 'Learn', exact: true}).click();
        await expect(page).toHaveURL(/\/learn$/);
        await expect.poll(() => isViewMounted(app, VIEWS.learn)).toBe(true);
        expect(await isViewMounted(app, VIEWS.home)).toBe(false);
        await expect(logo).not.toHaveAttribute('aria-current', 'page');

        await logo.click();
        await expect(page).toHaveURL(/\/$/);
        await expect.poll(() => isViewMounted(app, VIEWS.home)).toBe(true);
        await expect(logo).toHaveAttribute('aria-current', 'page');
        await expect(page).toHaveTitle('Neo.mjs - An Agent Institution');

        // Navigate to a Learn guide with relative .md links and verify clean pathname rewrite + click
        await page.evaluate(() => Neo.Main.setRoute({value: '/learn/guides/uibuildingblocks/DockLayouts'}));
        const content = page.locator('.neo-app-content-component');
        await expect(content.locator('h1')).toContainText('Dock Layouts:');

        const adoptionLink = content.locator('a[href="/learn/guides/uibuildingblocks/DockLayoutsAdoption"]').first();
        await expect(adoptionLink).toHaveCount(1);
        await adoptionLink.click();
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption$/);
        await expect(content.locator('h1')).toContainText('Adopting in Your App');

        // Canonical same-origin full URL inside content (as in release notes / blog posts) routes without reload
        await page.evaluate(() => {
            const article = document.querySelector('.neo-app-content-component'),
                  link    = document.createElement('a');

            link.id          = 'canonical-examples-link';
            link.href        = new URL('/examples/grid', location.origin).href;
            link.textContent = 'Grid Examples';
            article.prepend(link)
        });

        await page.locator('#canonical-examples-link').click();
        await expect(page).toHaveURL(/\/examples\/grid$/);
        await expect.poll(() => isViewMounted(app, VIEWS.examples)).toBe(true);

        // Modified new-tab click (ControlOrMeta+Click) opens /services in a new tab without hijacking the current tab
        const [popup] = await Promise.all([
            page.context().waitForEvent('page'),
            header.getByRole('link', {name: 'Connect', exact: true}).click({modifiers: ['ControlOrMeta']})
        ]);
        await expect(popup).toHaveURL(/\/services$/);
        await popup.close();
        await expect(page).toHaveURL(/\/examples\/grid$/);
        expect(await isViewMounted(app, VIEWS.examples)).toBe(true);

        // Browser Back returns to the Learn guide in the same document, with identical Main & Addon instances
        await page.goBack();
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption$/);
        await expect.poll(() => isViewMounted(app, VIEWS.learn)).toBe(true);

        const permanence = await page.evaluate(() => {
            const bootKeys = Object.keys(globalThis.__bootAddons);
            return {
                addonCount   : bootKeys.length,
                identicalMain: Neo.Main === globalThis.__bootMain,
                mismatches   : bootKeys.filter(key => Neo.main.addon[key] !== globalThis.__bootAddons[key]),
                sameDocument : globalThis.__sameDocument === true
            }
        });

        expect(permanence).toEqual({
            addonCount,
            identicalMain: true,
            mismatches   : [],
            sameDocument : true
        })
    })
});
