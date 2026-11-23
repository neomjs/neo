import {expect, test} from '../../fixtures.mjs';

const PORTAL      = '/apps/portal/index.html',
      DARK        = 'neo-theme-neo-dark', LIGHT = 'neo-theme-neo-light',
      BASE        = 'board-swimlanes-14.jpg', LIGHT_IMAGE = 'board-swimlanes-14-light.jpg',
      PAGE        = '.portal-examples-group-page:visible',
      card        = page => page.locator(`${PAGE} .neo-list-item`).filter({has: page.locator('[data-record-id="board-swimlanes"]')}),
      image       = card => card.locator('.preview-image'),
      url         = locator => locator.evaluate(node => getComputedStyle(node).backgroundImage),
      switchTheme = page => page.getByRole('button', {name:'Switch Theme'}).click();

/** @summary Records actual cover requests and supplies an offline image for each URL. */
async function interceptPair(page, stem='board-swimlanes-14') {
    const requests = [];
    await page.route(`**/${stem}*.jpg`, async route => {
        const file = new URL(route.request().url()).pathname.split('/').pop();
        requests.push(file);
        await route.fulfill({contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>'})
    });
    return requests
}

test.describe('Portal example cover themes', () => {
    test('a visible group card follows both switches without replacement or losing selection', async ({page}) => {
        await page.setViewportSize({width:1440, height:900});
        await page.addInitScript(() => localStorage.setItem('portalTheme', 'neo-theme-neo-dark'));
        const requests = await interceptPair(page), hero = await interceptPair(page, 'board-basic-14'),
              loaded   = page.waitForResponse(response => response.url().endsWith(BASE));
        await page.goto(`${PORTAL}#/examples/board`);
        const item = card(page), cover = image(item);
        await expect(item).toBeVisible();
        await expect.poll(() => url(cover)).toContain(BASE);
        await expect.poll(() => requests).toContain(BASE);
        await (await loaded).finished();
        expect(requests).not.toContain(LIGHT_IMAGE);
        await item.locator('.preview-image-wrap').click({position:{x:24,y:24}});
        await expect(item).toHaveClass(/neo-selected/);
        await item.evaluate(node => {node.dataset.coverIdentityProbe = 'retained'});
        const scroll = await page.locator(PAGE).evaluate(node => node.scrollTop);
        await switchTheme(page);
        await expect.poll(() => url(cover)).toContain(LIGHT_IMAGE);
        await expect.poll(() => hero).toContain('board-basic-14.jpg');
        await expect.poll(() => hero).toContain('board-basic-14-light.jpg');
        await expect(item).toHaveAttribute('data-cover-identity-probe','retained');
        await expect(item).toHaveClass(/neo-selected/);
        expect(await page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(scroll);
        await switchTheme(page);
        await expect.poll(() => url(cover)).toContain(BASE);
        await expect(item).toHaveAttribute('data-cover-identity-probe','retained');
        await expect(item).toHaveClass(/neo-selected/)
    });

    test('a legacy catalog record keeps its base image across a theme change', async ({page, context}) => {
        await page.setViewportSize({width:1440, height:900});
        await page.addInitScript(() => localStorage.setItem('portalTheme', 'neo-theme-neo-dark'));
        // The dedicated App worker's request can be fulfilled with an older catalog in this browser context.
        await context.route('**/apps/portal/neo-config.json*', async route => {
            const response = await route.fetch();
            await route.fulfill({response, json: {...await response.json(), useSharedWorkers: false}})
        });
        // Old catalog data carries the image path without a light-cover marker.
        await context.route('**/resources/data/examples/board.json*', async route => {
            const response = await route.fetch(), rows = await response.json();
            const board    = rows.find(row => row.id === 'board-basic');
            delete board.hasLightCover;
            await route.fulfill({response, json: rows})
        });
        const requests = await interceptPair(page, 'board-basic-14');
        await page.goto(`${PORTAL}#/examples/board`);
        const item  = page.locator(`${PAGE} .neo-list-item`).filter({has: page.locator('[data-record-id="board-basic"]')}),
              cover = image(item);
        await expect(item).toBeVisible();
        await expect(item).not.toHaveClass(/portal-example-paired-cover/);
        await expect.poll(() => url(cover)).toContain('board-basic-14.jpg');
        await switchTheme(page);
        await expect(page.locator(`.neo-viewport.${LIGHT}`)).toBeVisible();
        await expect.poll(() => url(cover)).toContain('board-basic-14.jpg');
        expect(requests).toContain('board-basic-14.jpg');
        expect(requests).not.toContain('board-basic-14-light.jpg')
    });

    test('restored light uses only its active cover; search switches both a paired tile and a full example', async ({page}) => {
        await page.setViewportSize({width:1440, height:900});
        await page.addInitScript(() => localStorage.setItem('portalTheme', 'neo-theme-neo-light'));
        const requests = await interceptPair(page), tileRequests = await interceptPair(page, 'form-field-date-14'),
              loaded   = page.waitForResponse(response => response.url().endsWith(LIGHT_IMAGE));
        await page.goto(`${PORTAL}#/examples/board`);
        await expect(page.locator(`.neo-viewport.${LIGHT}`)).toBeVisible();
        await expect.poll(() => url(image(card(page)))).toContain(LIGHT_IMAGE);
        await expect.poll(() => requests).toContain(LIGHT_IMAGE);
        await (await loaded).finished();
        expect(requests).not.toContain(BASE);

        const find    = page.locator('.portal-examples-sidebar:visible .portal-examples-find-field input'),
              results = page.locator('.portal-examples-search-results:visible');
        await find.fill('date field');
        const tile = results.locator('.portal-examples-tiles .neo-list-item').filter({has: page.locator('[data-record-id="date-field"]')});
        await tile.scrollIntoViewIfNeeded();
        await expect(tile).toBeVisible();
        await expect.poll(() => url(tile.locator('.preview-image'))).toContain('form-field-date-14-light.jpg');
        await expect.poll(() => tileRequests).toContain('form-field-date-14-light.jpg');
        expect(tileRequests).not.toContain('form-field-date-14.jpg');
        await switchTheme(page);
        await expect(page.locator(`.neo-viewport.${DARK}`)).toBeVisible();
        await expect.poll(() => url(tile.locator('.preview-image'))).toContain('form-field-date-14.jpg');
        await expect.poll(() => tileRequests).toContain('form-field-date-14.jpg');

        await find.fill('board by team');
        const searchCard = results.locator('.portal-examples-search-cards .neo-list-item')
            .filter({has: page.locator('[data-record-id="board-swimlanes"]')});
        await expect(searchCard).toBeVisible();
        await expect.poll(() => url(image(searchCard))).toContain(BASE);
        await switchTheme(page);
        await expect.poll(() => url(image(searchCard))).toContain(LIGHT_IMAGE)
    });

    test('a restored classic light preference selects the light cover', async ({page}) => {
        await page.addInitScript(() => localStorage.setItem('portalTheme', 'neo-theme-light'));
        const requests = await interceptPair(page);
        await page.goto(`${PORTAL}#/examples/board`);
        await expect(page.locator('.neo-viewport.neo-theme-light')).toBeVisible();
        await expect.poll(() => url(image(card(page)))).toContain(LIGHT_IMAGE);
        await expect.poll(() => requests).toContain(LIGHT_IMAGE);
        expect(requests).not.toContain(BASE)
    });

    test('a cover first admitted below the fold uses the theme selected since navigation', async ({page}) => {
        await page.setViewportSize({width: 1000, height: 600});
        await page.addInitScript(() => localStorage.setItem('portalTheme', 'neo-theme-neo-dark'));
        const requests = await interceptPair(page, 'grid-tree-14');
        await page.goto(`${PORTAL}#/examples/grid`);
        const cover = page.locator(`${PAGE} [data-record-id="grid-tree"] .preview-image`);
        await expect(cover).toBeAttached();
        await expect(cover).toHaveCSS('background-image', 'none');
        await switchTheme(page);
        await expect(page.locator(`.neo-viewport.${LIGHT}`)).toBeVisible();
        await cover.scrollIntoViewIfNeeded();
        await expect.poll(() => url(cover)).toContain('grid-tree-14-light.jpg');
        await expect.poll(() => requests).toContain('grid-tree-14-light.jpg');
        expect(requests).not.toContain('grid-tree-14.jpg');
        const top = (await cover.boundingBox()).y;
        await switchTheme(page);
        await expect.poll(() => url(cover)).toContain('grid-tree-14.jpg');
        expect(Math.abs((await cover.boundingBox()).y - top)).toBeLessThan(1)
    })
});
