import fs                                from 'node:fs';
import path                              from 'node:path';
import {fileURLToPath}                   from 'node:url';
import {extractExampleFamilyDefinitions} from '../../../../buildScripts/docs/seo/seoJson.mjs';
import {createFileServer, listen}        from '../../../../buildScripts/util/fileServer.mjs';
import {expect, test}                    from '../../fixtures.mjs';

const REPO_ROOT     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..'),
      EXAMPLES_VIEW = new URL('../../../../apps/portal/view/examples/MainContainer.mjs', import.meta.url),
      GROUP_ROUTES  = extractExampleFamilyDefinitions(fs.readFileSync(EXAMPLES_VIEW, 'utf8')).map(group => group.route);

const VIEWS = {
    examples: 'Portal.view.examples.MainContainer',
    home    : 'Portal.view.home.MainContainer',
    learn   : 'Portal.view.learn.MainContainer'
};

/**
 * @summary Checks whether the named Portal section container is currently mounted in the App SharedWorker via Neural Link.
 * @param {Object} app
 * @param {String} className
 * @returns {Promise<Boolean>}
 */
async function isViewMounted(app, className) {
    const match = await app.queryComponent({className}, ['id', 'mounted']),
          view  = Array.isArray(match) ? match[0] : match;

    return Boolean(view && (view.properties?.mounted ?? view.mounted))
}

test.describe('Portal pathname routing (un-mocked spaRoot + SharedWorker, Neural Link)', () => {
    test('boots at / with useSharedWorkers: true, routes /learn, ?query editRoute, #section fragments, Cmd/Ctrl+Click, and Logo Home without reload', async ({page, neuralLink}) => {
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

        const bootConfig = await page.evaluate(() => ({
            baseURI         : document.baseURI,
            routerBasePath  : Neo.config.routerBasePath || '',
            routerMode      : Neo.config.routerMode,
            useSharedWorkers: Neo.config.useSharedWorkers
        }));
        expect(bootConfig.routerMode).toBe('pathname');
        expect(bootConfig.routerBasePath).toBe('');
        expect(bootConfig.useSharedWorkers).toBe(true);
        expect(bootConfig.baseURI).toMatch(/\/apps\/portal\/$/);

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

        // Navigate to a depth-4 Learn guide with relative .md links and #section fragments
        await page.evaluate(() => Neo.Main.setRoute({value: '/learn/guides/uibuildingblocks/DockLayouts'}));
        const content = page.locator('.neo-app-content-component');
        await expect(content.locator('h1')).toContainText('Dock Layouts:');

        const sectionLink = content.locator('a[href="/learn/guides/uibuildingblocks/DockLayoutsAdoption#decision-3--policies-live-in-the-model-not-in-your-ui"]').first();
        await expect(sectionLink).toHaveCount(1);
        await sectionLink.click();
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption#decision-3--policies-live-in-the-model-not-in-your-ui$/);
        await expect(content.locator('h1')).toContainText('Adopting in Your App');

        // Exercise ?query mutation and last-key removal via Neo.Main.editRoute while preserving #fragment
        await page.evaluate(() => Neo.Main.editRoute({deck: 'learnneo'}));
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption\?deck=learnneo#decision-3--policies-live-in-the-model-not-in-your-ui$/);
        await page.evaluate(() => Neo.Main.editRoute({deck: null}));
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption#decision-3--policies-live-in-the-model-not-in-your-ui$/);

        // Canonical same-origin full URL inside content routes without reload
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

        // Modified new-tab click (ControlOrMeta+Click) opens /services in a second SharedWorker window without hijacking the first
        const [popup] = await Promise.all([
            page.context().waitForEvent('page'),
            header.getByRole('link', {name: 'Connect', exact: true}).click({modifiers: ['ControlOrMeta']})
        ]);
        await expect(popup).toHaveURL(/\/services$/);
        await expect(popup.locator('.portal-services-component').getByRole('heading', {level: 1})).toHaveText('Connect');
        await popup.close();
        await expect(page).toHaveURL(/\/examples\/grid$/);
        expect(await isViewMounted(app, VIEWS.examples)).toBe(true);

        // Browser Back returns to the Learn guide in the same document, with identical Main & Addon instances
        await page.goBack();
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayoutsAdoption#decision-3--policies-live-in-the-model-not-in-your-ui$/);
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
    });

    test('canonicalizes /apps/portal/ and /apps/portal/index.html#/examples/grid via 301 + hash upgrade, reloads depth-4 routes, and separates all 21 /examples/<group> routes from /examples/tree/', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});

        // HTTP-level check across all 21 group routes vs standalone /examples/tree/ directory listing
        expect(GROUP_ROUTES).toHaveLength(21);
        for (const groupRoute of GROUP_ROUTES) {
            const response = await page.request.get(groupRoute, {maxRedirects: 0});
            expect(response.status(), groupRoute).toBe(200);
            expect(await response.text(), groupRoute).toContain('<base href="/apps/portal/">')
        }

        const standaloneDir = await page.request.get('/examples/tree/', {maxRedirects: 0});
        expect(standaloneDir.status()).toBe(200);
        expect(await standaloneDir.text()).not.toContain('<base href="/apps/portal/">');

        const standaloneDemoRedirect = await page.request.get('/examples/dialog?theme=dark', {maxRedirects: 0});
        expect(standaloneDemoRedirect.status()).toBe(301);
        expect(standaloneDemoRedirect.headers()['location']).toBe('/examples/dialog/?theme=dark');

        const aliasRedirect = await page.request.get('/apps/portal/?utm_source=test', {maxRedirects: 0});
        expect(aliasRedirect.status()).toBe(301);
        expect(aliasRedirect.headers()['location']).toBe('/?utm_source=test');

        // Legacy bookmark /apps/portal/index.html#/examples/grid -> 301 to /#/examples/grid -> upgradeHashRoute to /examples/grid
        await page.goto('/apps/portal/index.html#/examples/grid');
        const app = await neuralLink.connectToApp('Portal');
        await expect(page).toHaveURL(/\/examples\/grid$/);
        await expect.poll(() => isViewMounted(app, VIEWS.examples)).toBe(true);
        await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table');

        // Depth-4 cold load and hard reload at /learn/guides/uibuildingblocks/DockLayouts
        await page.goto('/learn/guides/uibuildingblocks/DockLayouts');
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayouts$/);
        await expect(page.locator('.neo-app-content-component h1')).toContainText('Dock Layouts: One Application, Many Windows');

        await page.reload();
        await expect(page).toHaveURL(/\/learn\/guides\/uibuildingblocks\/DockLayouts$/);
        await expect(page.locator('.neo-app-content-component h1')).toContainText('Dock Layouts: One Application, Many Windows')
    });

    test('adopts /apps/portal as routerBasePath when mounted below root with spaRoot disabled (--no-spa-root)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});

        const server = createFileServer({root: REPO_ROOT, spaRoot: false, freshness: {onListening() {}, onRequest() {}}}),
              port   = await listen(server, {port: 0, strict: true}),
              origin = `http://localhost:${port}`;

        try {
            const rootListing = await page.request.get(`${origin}/`, {maxRedirects: 0});
            expect(rootListing.status()).toBe(200);
            expect(await rootListing.text()).toContain('<h1>/</h1>');

            // Bookmark upgrade under --no-spa-root keeps /apps/portal prefix so reload hits Portal, not static /learn/
            await page.goto(`${origin}/apps/portal/index.html#/learn`);
            await expect(page).toHaveURL(`${origin}/apps/portal/learn`);
            await expect(page.locator('.neo-app-content-component h1')).toHaveText('What Is Neo.mjs?');

            const subPathConfig = await page.evaluate(() => ({
                learnHref     : document.querySelector('.portal-header-toolbar a[href$="/learn"]')?.getAttribute('href'),
                routerBasePath: Neo.config.routerBasePath,
                routerMode    : Neo.config.routerMode
            }));
            expect(subPathConfig).toEqual({
                learnHref     : '/apps/portal/learn',
                routerBasePath: '/apps/portal',
                routerMode    : 'pathname'
            });

            await page.reload();
            await expect(page).toHaveURL(`${origin}/apps/portal/learn`);
            await expect(page.locator('.neo-app-content-component h1')).toHaveText('What Is Neo.mjs?');

            // Cold deep navigation at /apps/portal/examples/grid resolves '/examples/grid' for the Examples controller
            await page.goto(`${origin}/apps/portal/examples/grid`);
            await expect(page).toHaveURL(`${origin}/apps/portal/examples/grid`);
            await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table')
        } finally {
            server.closeAllConnections();
            server.close()
        }
    })
});
