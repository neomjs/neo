import {expect, test}             from '../../fixtures.mjs';
import fs                         from 'node:fs';
import os                         from 'node:os';
import path                       from 'node:path';
import {createFileServer, listen} from '../../../../buildScripts/util/fileServer.mjs';

/**
 * Opt-in pathname routing (`Neo.config.routerMode: 'pathname'`) on the route demo app, served the way a host has to
 * serve it: every route path answers with the app shell, anchored at the app folder by `<base>`. Hash mode stays the
 * default, checked on the same app. The card layout keeps only the active card in the DOM, so the card the App
 * worker shows names the route it handled.
 */
const card = {
    home    : 'Route.view.center.CardHome',
    section1: 'Route.view.center.CardSection1',
    section2: 'Route.view.center.CardSection2'
};

let root, server, origin, sourceConfig, sourceHtml;

// Give this spec a real opt-in app on disk without changing the route example's default hash mode.
// The shared engine/assets are linked read-only by use; only the copied app's config and static shell differ.
test.beforeAll(async () => {
    const repo = path.resolve(import.meta.dirname, '../../../..');
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-pathname-e2e-'));
    fs.mkdirSync(path.join(root, 'apps'), {recursive: true});
    fs.cpSync(path.join(repo, 'apps/route'), path.join(root, 'apps/route'), {recursive: true});
    for (const folder of ['src', 'dist', 'node_modules', 'resources']) {
        fs.symlinkSync(path.join(repo, folder), path.join(root, folder), process.platform === 'win32' ? 'junction' : 'dir')
    }
    sourceConfig = JSON.parse(fs.readFileSync(path.join(root, 'apps/route/neo-config.json'), 'utf8'));
    sourceHtml = fs.readFileSync(path.join(root, 'apps/route/index.html'), 'utf8');
    server = createFileServer({root, freshness: {onListening() {}, onRequest() {}}});
    origin = `http://localhost:${await listen(server, {port: 0, strict: true})}`
});

test.afterAll(() => {
    server?.closeAllConnections(); server?.close();
    if (root) fs.rmSync(root, {recursive: true, force: true})
});

/** @summary Writes the opt-in config the live file server discovers; no HTTP responses are mocked. */
function servePathnameMode() {
    fs.writeFileSync(path.join(root, 'apps/route/index.html'), sourceHtml.replace('<head>', '<head>\n    <base href="/apps/route/">'));
    fs.writeFileSync(path.join(root, 'apps/route/neo-config.json'), JSON.stringify({...sourceConfig,
        routerBasePath: '/apps/route', routerMode: 'pathname', useServiceWorker: false, useSharedWorkers: false}))
}

/**
 * @summary The class name of the card the App worker shows, or null while no single card is in the DOM.
 * @param {Object} page
 * @returns {Promise<String|null>}
 */
async function shownCard(page) {
    const cards = page.locator('.route_card_simple_page');

    if (await cards.count() !== 1) {
        return null
    }

    return page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'className'}), await cards.getAttribute('id'))
}

test('pathname mode boots a deep route and moves with the History API in one document; Back returns', async ({page}) => {
    servePathnameMode();

    const response = await page.goto(origin + '/apps/route/section1');
    expect(response.status(), 'the real server answers a deep pathname with the app shell').toBe(200);
    await expect.poll(() => shownCard(page)).toBe(card.section1);

    // A reload would drop it
    await page.evaluate(() => { globalThis.sameDocument = true });

    await page.evaluate(() => Neo.Main.setRoute({value: '/section2'}));
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2$/);

    await page.evaluate(() => Neo.Main.setRoute({value: '/home'}));
    await expect.poll(() => shownCard(page)).toBe(card.home);

    await page.goBack();
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2$/);

    await page.goBack();
    await expect.poll(() => shownCard(page)).toBe(card.section1);

    expect(await page.evaluate(() => globalThis.sameDocument)).toBe(true);
    expect(page.url()).not.toContain('#')
});

test('pathname mode turns a #/… bookmark and a #/… redirect into paths', async ({page}) => {
    servePathnameMode();

    await page.goto(origin + '/apps/route/index.html#/section2');
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2$/);

    // The app's buttons redirect to #/… URLs
    await page.getByRole('button', {name: 'Section 1'}).click();
    await expect.poll(() => shownCard(page)).toBe(card.section1);
    await expect(page).toHaveURL(/\/apps\/route\/section1$/)
});

test('pathname mode keeps the page search out of the route, keeps a bookmark anchor last, and pushes one entry per route', async ({page}) => {
    servePathnameMode();

    // a campaign link lands on its route, and its search stays in the URL
    await page.goto(origin + '/apps/route/section1?utm_source=news');
    await expect.poll(() => shownCard(page)).toBe(card.section1);
    await expect(page).toHaveURL(/\/apps\/route\/section1\?utm_source=news$/);

    // the bare and the canonical form of one route add one history entry
    await page.evaluate(() => Neo.Main.setRoute({value: 'section2'}));
    await page.evaluate(() => Neo.Main.setRoute({value: '/section2'}));
    await expect.poll(() => shownCard(page)).toBe(card.section2);

    await page.goBack();
    await expect.poll(() => shownCard(page)).toBe(card.section1);
    await expect(page).toHaveURL(/\/apps\/route\/section1\?utm_source=news$/);

    // a bookmark with a page search and its own anchor: path, search, then fragment
    await page.goto(origin + '/apps/route/index.html?utm_source=news#/section2#top');
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2\?utm_source=news#top$/)
});

test('hash mode stays the default: a #/… route boots, and a button moves the hash', async ({page}) => {
    fs.writeFileSync(path.join(root, 'apps/route/index.html'), sourceHtml);
    fs.writeFileSync(path.join(root, 'apps/route/neo-config.json'), JSON.stringify({...sourceConfig, useServiceWorker: false, useSharedWorkers: false}));
    await page.goto(origin + '/apps/route/index.html#/section1');
    await expect.poll(() => shownCard(page)).toBe(card.section1);

    await page.getByRole('button', {name: 'Section 2'}).click();
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/index\.html#\/section2$/)
});
