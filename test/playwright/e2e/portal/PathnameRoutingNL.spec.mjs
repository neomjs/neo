import fs                                           from 'node:fs';
import os                                           from 'node:os';
import path                                         from 'node:path';
import {fileURLToPath}                              from 'node:url';
import {extractExampleFamilyDefinitions}            from '../../../../buildScripts/docs/seo/seoJson.mjs';
import {rewritePathnameConfig, rewritePathnameHtml} from '../../../../buildScripts/util/esmDistTransforms.mjs';
import {createFileServer, listen}                   from '../../../../buildScripts/util/fileServer.mjs';
import {expect, test}                               from '../../fixtures.mjs';
import {expectOpenPage}                             from '../utils/portalExamplesCatalog.mjs';

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
    for (const mode of ['pathname', 'hash']) {
        test(`restores an Examples share entry at a ${mode} mount without reapplying it on ordinary links (#22238)`, async ({page}) => {
            const server = createFileServer({root: REPO_ROOT, spaRoot: false, freshness: {onListening() {}, onRequest() {}}}),
                  port   = await listen(server, {port: 0, strict: true}),
                  origin = `http://localhost:${port}`,
                  target = new URL(mode === 'hash' ? '/apps/portal/index.html' : '/apps/portal/examples/grid', origin),
                  find   = page.locator('.portal-examples-sidebar:visible .portal-examples-find-field input');

            try {
                if (mode === 'hash') {
                    target.hash = '/examples/grid';
                    await page.route(url => url.pathname === '/apps/portal/neo-config.json', async route => {
                        const response = await route.fetch();
                        await route.fulfill({response, json: {...await response.json(), routerMode: 'hash'}})
                    })
                }

                target.searchParams.set('find', 'drag');
                target.searchParams.set('catalogMode', 'dist_esm');
                await page.setViewportSize({width: 1440, height: 900});
                await page.goto(target.href);
                await expect(find).toHaveValue('drag');
                await expect(page.locator('.portal-examples-search-results:visible').getByRole('heading', {level: 1})).toContainText('matching examples');
                await page.reload();
                await expect(find).toHaveValue('drag');

                await page.evaluate(() => Neo.Main.setRoute({value: '/examples/forms'}));
                await expectOpenPage(page, 'Forms & Fields');
                await expect(find).toHaveValue('');
                await page.evaluate(() => Neo.Main.setRoute({value: '/examples/grid'}));
                await expectOpenPage(page, 'Grid & Table');
                await expect(find).toHaveValue('');

                await page.reload();
                await expectOpenPage(page, 'Grid & Table');
                await expect(find).toHaveValue('');

                await page.goBack();
                await expectOpenPage(page, 'Forms & Fields');
                await page.goBack();
                await expect(page).toHaveURL(target.href);
                await expect(find).toHaveValue('drag');

                if (mode === 'hash') {
                    await page.evaluate(() => Neo.Main.setRoute({replace: true, value: '/examples/forms'}));
                    await expectOpenPage(page, 'Forms & Fields');
                    await page.evaluate(() => Neo.Main.setRoute({replace: true, value: '/examples/grid'}));
                    await expectOpenPage(page, 'Grid & Table');
                    await expect(find).toHaveValue('')
                }
            } finally {
                server.closeAllConnections();
                server.close()
            }
        })
    }

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

        // Verify Home stage links (AudienceDoors proof anchors + Grid FeatureSection links) emit clean root hrefs (never #/... or /apps/portal/...)
        const doorProofHrefs = await page.locator('.portal-door-proof a[href]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));
        expect(doorProofHrefs).toEqual([
            '../../examples/grid/bigData/index.html',
            '/news/pulls/15123',
            '/learn/benefits/Introduction'
        ]);

        const moreGridsLink = page.locator('.portal-home-parts-grid').getByRole('link', {name: 'More grids'});
        await expect(moreGridsLink).toHaveAttribute('href', '/examples/grid');
        expect(await moreGridsLink.evaluate(el => new URL(el.href).pathname)).toBe('/examples/grid');

        await moreGridsLink.click();
        await expect(page).toHaveURL(/\/examples\/grid$/);
        await expect.poll(() => isViewMounted(app, VIEWS.examples)).toBe(true);

        await logo.click();
        await expect(page).toHaveURL(/\/$/);
        await expect.poll(() => isViewMounted(app, VIEWS.home)).toBe(true);

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

    test('canonicalizes /apps/portal/ and /apps/portal/index.html#/examples/grid via 307 + hash upgrade, reloads depth-4 routes, and separates all 21 /examples/<group> routes from /examples/tree/', async ({page, neuralLink}) => {
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
        expect(aliasRedirect.status()).toBe(307);
        expect(aliasRedirect.headers()['location']).toBe('/?utm_source=test');

        // Legacy bookmark /apps/portal/index.html#/examples/grid -> 307 to /#/examples/grid -> upgradeHashRoute to /examples/grid
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
    });

    test('dist pathname shell with omitted routerBasePath keeps root hrefs under spaRoot and adopts <base href> on sub-path dist mounts (#22229)', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});

        const tmpRoot      = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-portal-dist-sparoot-')),
              distMountRel = 'dist/esm/apps/portal',
              distMountDir = path.join(tmpRoot, distMountRel),
              linkType     = process.platform === 'win32' ? 'junction' : 'dir';

        let rootServer, subServer;

        try {
            fs.mkdirSync(distMountDir, {recursive: true});

            for (const entry of fs.readdirSync(REPO_ROOT, {withFileTypes: true})) {
                if (entry.name === 'dist' || entry.name === '.git' || entry.name === 'test') continue;
                fs.symlinkSync(
                    path.join(REPO_ROOT, entry.name),
                    path.join(tmpRoot, entry.name),
                    entry.isDirectory() ? linkType : 'file'
                )
            }

            // Populate dist/ target assets alongside the emitted dist/esm tree
            for (const entry of fs.readdirSync(path.join(REPO_ROOT, 'dist'), {withFileTypes: true})) {
                if (entry.name === 'esm') continue;
                fs.symlinkSync(
                    path.join(REPO_ROOT, 'dist', entry.name),
                    path.join(tmpRoot, 'dist', entry.name),
                    entry.isDirectory() ? linkType : 'file'
                )
            }

            fs.symlinkSync(path.join(REPO_ROOT, 'src'),                  path.join(tmpRoot, 'dist/esm/src'),       linkType);
            fs.symlinkSync(path.join(REPO_ROOT, 'dist'),                 path.join(tmpRoot, 'dist/esm/dist'),      linkType);
            fs.symlinkSync(path.join(REPO_ROOT, 'dist/development/css'), path.join(tmpRoot, 'dist/esm/css'),       linkType);
            fs.symlinkSync(path.join(REPO_ROOT, 'resources'),            path.join(tmpRoot, 'dist/esm/resources'), linkType);

            for (const entry of fs.readdirSync(path.join(REPO_ROOT, 'apps/portal'), {withFileTypes: true})) {
                if (entry.name === 'index.html' || entry.name === 'neo-config.json') continue;
                fs.symlinkSync(
                    path.join(REPO_ROOT, 'apps/portal', entry.name),
                    path.join(distMountDir, entry.name),
                    entry.isDirectory() ? linkType : 'file'
                )
            }

            const rawConfig     = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'apps/portal/neo-config.json'), 'utf8')),
                  rawHtml       = fs.readFileSync(path.join(REPO_ROOT, 'apps/portal/index.html'), 'utf8'),
                  emittedConfig = rewritePathnameConfig({
                      ...rawConfig,
                      basePath        : '../../../../',
                      environment     : 'development',
                      mainPath        : './Main.mjs',
                      useServiceWorker: false,
                      useSharedWorkers: false,
                      workerBasePath  : '../../src/worker/'
                  }, distMountRel),
                  emittedHtml   = rewritePathnameHtml(rawHtml, emittedConfig, distMountRel);

            expect(Object.hasOwn(emittedConfig, 'routerBasePath')).toBe(false);
            fs.writeFileSync(path.join(distMountDir, 'neo-config.json'), JSON.stringify(emittedConfig, null, 2));
            fs.writeFileSync(path.join(distMountDir, 'index.html'), emittedHtml);

            // 1. Deployed root SPA mount (--spa-root dist/esm/apps/portal, matching neomjs.com): routerBasePath stays ''
            rootServer = createFileServer({root: tmpRoot, spaRoot: distMountRel, freshness: {onListening() {}, onRequest() {}}});
            const rootOrigin = `http://localhost:${await listen(rootServer, {port: 0, strict: true})}`;

            await page.goto(`${rootOrigin}/`);
            const rootMoreGrids = page.locator('.portal-home-parts-grid').getByRole('link', {name: 'More grids'});
            await expect(rootMoreGrids).toHaveAttribute('href', '/examples/grid');

            const rootState = await page.evaluate(() => ({
                baseURI       : document.baseURI,
                routerBasePath: Neo.config.routerBasePath
            }));
            expect(rootState.baseURI).toBe(`${rootOrigin}/${distMountRel}/`);
            expect(rootState.routerBasePath).toBe('');
            expect(await rootMoreGrids.evaluate(el => el.href)).toBe(`${rootOrigin}/examples/grid`);

            await page.evaluate(() => {
                const scroller = document.querySelector('.portal-home-maincontainer');
                if (scroller) scroller.style.scrollSnapType = 'none'
            });
            await rootMoreGrids.scrollIntoViewIfNeeded();
            await rootMoreGrids.click();
            await expect(page).toHaveURL(`${rootOrigin}/examples/grid`);
            await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table');

            // 2. Same emitted build mounted at /dist/esm/apps/portal/ (--no-spa-root): adopts <base href> as routerBasePath
            subServer = createFileServer({root: tmpRoot, spaRoot: false, freshness: {onListening() {}, onRequest() {}}});
            const subOrigin = `http://localhost:${await listen(subServer, {port: 0, strict: true})}`;

            await page.goto(`${subOrigin}/${distMountRel}/`);
            const subMoreGrids = page.locator('.portal-home-parts-grid').getByRole('link', {name: 'More grids'});
            await expect(subMoreGrids).toHaveAttribute('href', `/${distMountRel}/examples/grid`);
            expect(await page.evaluate(() => Neo.config.routerBasePath)).toBe(`/${distMountRel}`);

            await page.evaluate(() => {
                const scroller = document.querySelector('.portal-home-maincontainer');
                if (scroller) scroller.style.scrollSnapType = 'none'
            });
            await subMoreGrids.scrollIntoViewIfNeeded();
            await subMoreGrids.click();
            await expect(page).toHaveURL(`${subOrigin}/${distMountRel}/examples/grid`);
            await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table')
        } finally {
            rootServer?.closeAllConnections(); rootServer?.close();
            subServer?.closeAllConnections();  subServer?.close();
            fs.rmSync(tmpRoot, {recursive: true, force: true})
        }
    });

    test('emitted dist/esm/apps/portal build boots on both root spaRoot and sub-path mounts with matching routerBasePath and More grids navigation (#22229)', async ({page}) => {
        const distMountRel   = 'dist/esm/apps/portal',
              distConfigPath = path.join(REPO_ROOT, distMountRel, 'neo-config.json');

        test.skip(
            Boolean(process.env.NEO_TEST_SKIP_CI) || !fs.existsSync(distConfigPath),
            'Outside-CI check requiring local `npm run build-dist-esm` + `npm run build-themes -- -n -e esm -t all`'
        );

        await page.setViewportSize({width: 1440, height: 900});

        const emittedJson = JSON.parse(fs.readFileSync(distConfigPath, 'utf8'));
        expect(emittedJson.environment).toBe('dist/esm');
        expect(Object.hasOwn(emittedJson, 'routerBasePath')).toBe(false);

        let rootServer, subServer;

        try {
            rootServer = createFileServer({root: REPO_ROOT, spaRoot: distMountRel, freshness: {onListening() {}, onRequest() {}}});
            const rootOrigin = `http://localhost:${await listen(rootServer, {port: 0, strict: true})}`;

            await page.goto(`${rootOrigin}/`);
            const rootMoreGrids = page.locator('.portal-home-parts-grid').getByRole('link', {name: 'More grids'});
            await expect(rootMoreGrids).toHaveAttribute('href', '/examples/grid');

            const rootBoot = await page.evaluate(() => ({
                baseURI       : document.baseURI,
                environment   : Neo.config.environment,
                mainPath      : Neo.config.mainPath,
                routerBasePath: Neo.config.routerBasePath
            }));
            expect(rootBoot).toEqual({
                baseURI       : `${rootOrigin}/${distMountRel}/`,
                environment   : 'dist/esm',
                mainPath      : './Main.mjs',
                routerBasePath: ''
            });

            await page.evaluate(() => {
                const scroller = document.querySelector('.portal-home-maincontainer');
                if (scroller) scroller.style.scrollSnapType = 'none'
            });
            await rootMoreGrids.scrollIntoViewIfNeeded();
            await rootMoreGrids.click();
            await expect(page).toHaveURL(`${rootOrigin}/examples/grid`);
            await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table');

            subServer = createFileServer({root: REPO_ROOT, spaRoot: false, freshness: {onListening() {}, onRequest() {}}});
            const subOrigin = `http://localhost:${await listen(subServer, {port: 0, strict: true})}`;

            await page.goto(`${subOrigin}/${distMountRel}/`);
            const subMoreGrids = page.locator('.portal-home-parts-grid').getByRole('link', {name: 'More grids'});
            await expect(subMoreGrids).toHaveAttribute('href', `/${distMountRel}/examples/grid`);

            const subBoot = await page.evaluate(() => ({
                environment   : Neo.config.environment,
                routerBasePath: Neo.config.routerBasePath
            }));
            expect(subBoot).toEqual({
                environment   : 'dist/esm',
                routerBasePath: `/${distMountRel}`
            });

            await page.evaluate(() => {
                const scroller = document.querySelector('.portal-home-maincontainer');
                if (scroller) scroller.style.scrollSnapType = 'none'
            });
            await subMoreGrids.scrollIntoViewIfNeeded();
            await subMoreGrids.click();
            await expect(page).toHaveURL(`${subOrigin}/${distMountRel}/examples/grid`);
            await expect(page.locator('.portal-examples-group-page:visible .portal-examples-group-heading h1')).toHaveText('Grid & Table')
        } finally {
            rootServer?.closeAllConnections(); rootServer?.close();
            subServer?.closeAllConnections();  subServer?.close()
        }
    })
});
