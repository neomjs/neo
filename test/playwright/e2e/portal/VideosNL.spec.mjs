import {expect, test} from '../../fixtures.mjs';

const PAGE = '/apps/portal/index.html#/news/videos',
      LIST = '.portal-videos-list',
      ITEM = `${LIST} .neo-list-item`,
      // The hosts a YouTube player loads from. Lazy i.ytimg.com previews are allowed before a click.
      PLAYER_HOSTS = /^https:\/\/([\w-]+\.)*(youtube\.com|youtube-nocookie\.com|googlevideo\.com|google\.com)\//,
      PREVIEW_HOST = /^https:\/\/i\.ytimg\.com\//,
      THEMES       = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

/**
 * @param {Object} app The Neural Link app handle
 * @returns {Promise<Object>} The Videos list's `id` and `activeId`, as the App Worker holds them
 */
async function readList(app) {
    const matches = await app.queryComponent({className: 'Portal.view.news.videos.List'}, ['id', 'activeId']),
          list    = Array.isArray(matches) ? matches[0] : matches;

    return {id: list.id, activeId: list.properties.activeId}
}

/**
 * @summary Witnesses the Videos tab's facade contract in a real browser: no player host is contacted before a click,
 * a click embeds one youtube-nocookie player, a second click moves it, and the search filters by title.
 *
 * Both YouTube hosts are stubbed, so the run stays offline while every request is recorded.
 */
test.describe('Portal news Videos tab', () => {
    test('facades until a click, one player at a time, search by title', async ({page, neuralLink}) => {
        const requests = [];

        page.on('request', request => requests.push(request.url()));

        await page.route(PLAYER_HOSTS, route => route.fulfill({contentType: 'text/html', body: '<!doctype html><title>player</title>'}));
        await page.route(PREVIEW_HOST, route => route.fulfill({
            contentType: 'image/svg+xml',
            body       : '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360"><rect width="480" height="360" fill="#556"/></svg>'
        }));

        await page.setViewportSize({width: 1440, height: 1000});
        await page.goto(PAGE);

        const app      = await neuralLink.connectToApp('Portal'),
              items    = page.locator(ITEM),
              player   = page.locator(`${LIST} iframe`),
              play     = index => items.nth(index).getByRole('button', {name: /^Play /}),
              players  = () => requests.filter(url => PLAYER_HOSTS.test(url)),
              previews = () => new Set(requests.filter(url => PREVIEW_HOST.test(url))).size;

        await expect(items).toHaveCount(12);
        await expect(items.first().locator('.portal-videos-name')).toHaveText('Neo Stage: Sophie in Motion | Early 3D Engine Preview');
        await expect(items.first().locator('.portal-videos-meta')).toHaveText('Oct 31, 2026 · Stage');
        await expect(items.last().locator('.portal-videos-name')).toHaveText('neo.mjs in just 33s');
        await expect(page).toHaveTitle('Videos & Live Demos — Multi-Window Web Apps & Agent OS | Neo.mjs');

        let list = await readList(app);

        expect(list.id).toBe(await page.locator(LIST).getAttribute('id'));
        expect(list.activeId).toBeNull();

        // Before any click: facades only, and the previews load lazily, the visible ones first
        await expect.poll(previews, {message: 'the visible previews load'}).toBeGreaterThan(0);
        expect(previews(), 'the previews below the fold wait').toBeLessThan(12);
        expect(players(), 'no request to a player host before a click').toEqual([]);
        await expect(player).toHaveCount(0);

        await play(0).click();

        await expect(player).toHaveCount(1);
        await expect(player).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/lTqUFNJiA5w?autoplay=1');
        expect((await readList(app)).activeId).toBe(12);

        await play(1).click();

        await expect(player, 'opening a second film removes the first player').toHaveCount(1);
        await expect(player).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/gv558bQN9B4?autoplay=1');
        await expect(play(0)).toBeVisible();
        expect((await readList(app)).activeId).toBe(11);
        expect(players(), 'the player requests are the two nocookie embeds').toEqual([
            'https://www.youtube-nocookie.com/embed/lTqUFNJiA5w?autoplay=1',
            'https://www.youtube-nocookie.com/embed/gv558bQN9B4?autoplay=1'
        ]);

        await page.locator('.portal-videos-searchfield input').fill('grid');

        await expect(items).toHaveCount(2);
        await expect(page.locator(`${LIST} .neo-highlight-search`)).toHaveText(['Grid', 'Grid']);
        await expect(player, 'the search hid the playing film').toHaveCount(0);
        expect((await readList(app)).activeId).toBeNull();

        await page.locator('.portal-videos-searchfield input').fill('');

        await expect(items).toHaveCount(12);
        await expect(player, 'clearing the search does not restart the film').toHaveCount(0)
    });

    for (const theme of THEMES) {
        test(`${theme}: the cards take the theme's colours`, async ({page, neuralLink}, testInfo) => {
            await page.addInitScript(([key, value]) => localStorage.setItem(key, value), ['portalTheme', theme]);
            await page.setViewportSize({width: 1440, height: 1000});
            await page.goto(PAGE);
            await neuralLink.connectToApp('Portal');

            const card = page.locator(ITEM).first();

            await expect(card).toBeVisible();

            // A dark card carries light text and a light card dark text: the sums of the channels order the pair
            const [background, text] = await card.evaluate(node => {
                const style = getComputedStyle(node),
                      sum   = value => value.match(/\d+/g).slice(0, 3).reduce((total, channel) => total + Number(channel), 0);

                return [sum(style.backgroundColor), sum(style.color)]
            });

            if (theme === 'neo-theme-neo-dark') {
                expect(background, 'a dark card').toBeLessThan(text)
            } else {
                expect(background, 'a light card').toBeGreaterThan(text)
            }

            await page.screenshot({path: testInfo.outputPath(`videos-${theme}.png`)})
        })
    }
});
