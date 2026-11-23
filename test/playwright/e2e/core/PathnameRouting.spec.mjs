import {expect, test} from '../../fixtures.mjs';

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

/**
 * @summary Serves the route app in pathname mode: its config opts in, and each route path answers with the shell.
 * @param {Object} page
 */
async function servePathnameMode(page) {
    await page.route('**/apps/route/neo-config.json*', async route => {
        const response = await route.fetch({maxRetries: 2});

        await route.fulfill({response, json: {
            ...await response.json(),
            routerBasePath  : '/apps/route',
            routerMode      : 'pathname',
            useServiceWorker: false,
            useSharedWorkers: false
        }})
    });

    await page.route(/\/apps\/route\/(home|section1|section2)(\?[^#]*)?$/, async route => {
        const response = await route.fetch({url: new URL('/apps/route/index.html', route.request().url()).href, maxRetries: 2}),
              html     = (await response.text()).replace('<head>', '<head>\n    <base href="/apps/route/">');

        await route.fulfill({response, body: html})
    })
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
    await servePathnameMode(page);

    await page.goto('/apps/route/section1');
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
    await servePathnameMode(page);

    await page.goto('/apps/route/index.html#/section2');
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2$/);

    // The app's buttons redirect to #/… URLs
    await page.getByRole('button', {name: 'Section 1'}).click();
    await expect.poll(() => shownCard(page)).toBe(card.section1);
    await expect(page).toHaveURL(/\/apps\/route\/section1$/)
});

test('pathname mode keeps the page search out of the route, keeps a bookmark anchor last, and pushes one entry per route', async ({page}) => {
    await servePathnameMode(page);

    // a campaign link lands on its route, and its search stays in the URL
    await page.goto('/apps/route/section1?utm_source=news');
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
    await page.goto('/apps/route/index.html?utm_source=news#/section2#top');
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/section2\?utm_source=news#top$/)
});

test('hash mode stays the default: a #/… route boots, and a button moves the hash', async ({page}) => {
    await page.goto('/apps/route/index.html#/section1');
    await expect.poll(() => shownCard(page)).toBe(card.section1);

    await page.getByRole('button', {name: 'Section 2'}).click();
    await expect.poll(() => shownCard(page)).toBe(card.section2);
    await expect(page).toHaveURL(/\/apps\/route\/index\.html#\/section2$/)
});
