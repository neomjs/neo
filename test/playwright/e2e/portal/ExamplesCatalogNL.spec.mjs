import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const PORTAL    = '/apps/portal/index.html',
      SIDEBAR   = '.portal-examples-sidebar:visible nav.portal-examples-group-index-list',
      MOBILE_IX = '.portal-examples-overview:visible nav.portal-examples-group-index-overview',
      CRUMB     = '.portal-examples-main-container > .portal-examples-group-crumb:visible',
      SHEET     = '.portal-examples-main-container .portal-examples-group-index-sheet',
      PAGE      = '.portal-examples-group-page:visible',
      CARDS     = `${PAGE} .portal-examples-list:not(.portal-examples-tiles)`,
      TILES     = `${PAGE} .portal-examples-tiles`,
      FEATURED  = '.portal-examples-overview:visible .portal-examples-overview-cards',
      GROUPS    = [
          'Apps', 'Grid & Table', 'Trees', 'Lists & Galleries', 'Charts, Canvas & Maps',
          'Calendar', 'Scheduler', 'Gantt', 'Task Board',
          'Dashboard & Docking', 'Tabs', 'Containers & Layouts', 'Dialogs & Overlays',
          'Forms & Fields', 'Buttons, Menus & Toolbars', 'More components',
          'Multi-Window', 'Workers & Platform', 'State & Data', 'Functional Components', 'Drag & Drop'
      ];

/**
 * @summary Reads the mounted examples list of the open group page from this page's App Worker.
 * @param {Object} app The bound Neural Link app.
 * @param {String} family The open page's group
 * @returns {Promise<Object>} The list's identity and Store.
 */
async function readList(app, family) {
    const pages = await app.queryComponent({className: 'Portal.view.examples.GroupPage'}, ['id', 'family']),
          page  = pages.find(match => match.properties.family === family),
          lists = await app.queryComponent({className: 'Portal.view.examples.List'}, ['id', 'parentId', 'catalogMode', 'store']);

    return lists.find(match => match.properties.parentId === page.id)
}

/**
 * @summary Waits until the named group's page is the only page that shows. The card switch updates the page it hides
 * and the page it shows one by one, so for a moment either both show or still the old one.
 * @param {Object} page The test page.
 * @param {String} name Group title.
 * @returns {Promise<void>}
 */
async function expectOpenPage(page, name) {
    await expect(page.locator(PAGE).filter({has: page.getByRole('heading', {level: 1, name, exact: true})})).toBeVisible();
    await expect(page.locator(PAGE)).toHaveCount(1)
}

/**
 * @summary Returns to the overview through the header's Examples link, and waits until no group page shows.
 * @param {Object} page The test page.
 * @returns {Promise<void>}
 */
async function openOverview(page) {
    await page.locator('.portal-header-toolbar').getByRole('link', {name: 'Examples', exact: true}).click();
    await expect(page.locator(FEATURED)).toBeVisible();
    await expect(page.locator(PAGE)).toHaveCount(0)
}

/**
 * @summary Opens a group using the visible desktop left-rail index or the phone overview index.
 * @param {Object} page The test page.
 * @param {String} name Group title.
 * @returns {Promise<void>}
 */
async function openGroup(page, name) {
    const isPhone = (page.viewportSize()?.width ?? 1280) <= 640;

    if (!isPhone) {
        await expect(page.locator(SIDEBAR)).toBeVisible();
        await page.locator(SIDEBAR).getByRole('link', {name: new RegExp(`^${name}, `)}).click()
    } else {
        if (!await page.locator(MOBILE_IX).isVisible()) {
            await openOverview(page)
        }

        await expect(page.locator(MOBILE_IX)).toBeVisible();
        await page.locator(MOBILE_IX).getByRole('link', {name: new RegExp(`^${name}, `)}).click()
    }

    await expectOpenPage(page, name)
}

/**
 * @summary Selects a build through the open card's build control.
 * @param {Object} page The test page.
 * @param {String} label The build's menu label.
 * @returns {Promise<void>}
 */
async function selectBuild(page, label) {
    await page.getByRole('button', {name: /^Running /}).locator('visible=true').click();
    await page.locator('.neo-menu-list:visible .neo-list-item').filter({hasText: label}).click();
    await expect(page.locator('.neo-menu-list:visible')).toHaveCount(0)
}

/**
 * @summary Reads the open group page's desktop control: the hoisted crumb, hoisted sidebar index and stage cards.
 * @param {Object} page The test page.
 * @returns {Promise<Object>}
 */
async function readDesktopPage(page) {
    return page.locator('.portal-examples-main-container').evaluate(shell => {
        const index  = shell.querySelector('.portal-examples-sidebar .portal-examples-group-index-list'),
              crumb  = shell.querySelector('.portal-examples-group-crumb'),
              pageEl = [...shell.querySelectorAll('.portal-examples-group-page')].find(node => node.offsetHeight > 0),
              list   = pageEl.querySelector('.portal-examples-list'),
              // the heading's and the build control's own boxes: a clipping header row can collapse below them
              heading = Math.max(...['.portal-examples-group-heading', '.portal-examples-build-control']
                  .map(selector => pageEl.querySelector(selector).getBoundingClientRect().bottom));

        return {
            cardsBelow : list.getBoundingClientRect().top >= heading - 1,
            columns    : getComputedStyle(list).gridTemplateColumns.split(' ').length,
            crumb      : getComputedStyle(crumb).display !== 'none',
            index      : Boolean(index?.offsetHeight),
            indexBottom: index ? index.getBoundingClientRect().bottom : null,
            narrowest  : Math.min(...[...list.querySelectorAll('.neo-list-item')].map(card => card.getBoundingClientRect().width)),
            overflowX  : pageEl.scrollWidth > pageEl.clientWidth + 1
        }
    })
}

/**
 * @summary Checks the resting card: a 16:9 cover that fills it, with title, open cue and proof line on a docked scrim.
 * @param {Object} list The mounted list locator.
 * @param {Number} width Viewport width.
 * @returns {Promise<Object[]>} Measured cards for the retained evidence.
 */
async function expectCardLayout(list, width) {
    // a hovered or a focused card opens its action line: measure the resting one, once its line has closed
    await list.page().mouse.move(0, 0);
    await list.page().evaluate(() => document.activeElement?.blur());
    await expect.poll(() => list.locator('.portal-example-more').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height < 1))).toBe(true);

    const gridInfo = await list.evaluate(node => ({
        columns : getComputedStyle(node).gridTemplateColumns.split(' ').length,
        leadCard: node.classList.contains('portal-examples-list-lead')
    }));

    const cards = await list.locator('.neo-list-item').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).map(node => {
        const card    = node.getBoundingClientRect(),
              caption = node.querySelector('.neo-item-bottom-position'),
              copy    = caption.getBoundingClientRect(),
              image   = node.querySelector('.preview-image').getBoundingClientRect(),
              more    = node.querySelector('.portal-example-more'),
              shown   = [
                  node.querySelector('.portal-example-group-badge'),
                  node.querySelector('.neo-title'),
                  node.querySelector('.portal-example-open-cue'),
                  node.querySelector('.portal-example-feature')
              ].filter(el => el && el.offsetWidth > 0),
              texts   = [...caption.querySelectorAll('*')];

        return {
            title     : node.querySelector('.neo-title').textContent,
            top       : card.top,
            bottom    : card.bottom,
            height    : card.height,
            ratio     : card.width / card.height,
            clearCover: (copy.top - card.top) / card.height,
            coverFills: ['left', 'right', 'top', 'bottom'].every(side => Math.abs(image[side] - card[side]) < 1),
            docked    : Math.abs(copy.left - card.left) < 1 && Math.abs(copy.right - card.right) < 1 && Math.abs(copy.bottom - card.bottom) < 1,
            fits      : copy.top >= card.top && caption.scrollHeight <= caption.clientHeight + 1 && caption.scrollWidth <= caption.clientWidth + 1,
            textFits  : shown.every(text => {
                const rect = text.getBoundingClientRect();
                return rect.left >= copy.left && rect.right <= copy.right + 1 && rect.top >= copy.top - 1 && rect.bottom <= copy.bottom + 1
            }),
            // a group card has no action line to keep closed
            closed      : !more || more.getBoundingClientRect().height < 1,
            opaque      : [node, caption, ...texts].every(text => getComputedStyle(text).opacity === '1'),
            noInlineSize: !node.style.height && !node.querySelector('.content').style.aspectRatio
        }
    }));

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.coverFills && Math.abs(card.ratio - 16 / 9) < 0.02), 'the cover fills a 16:9 card').toBe(true);
    // the cards that miss a check, by name, so a red run says which check failed where
    expect(cards.filter(card => !(card.docked && card.fits && card.textFits && card.closed && card.opaque && card.noInlineSize)),
        'title, cue and proof line fit a full-width, bottom-docked scrim; the action stays closed; no text is dimmed by opacity; no card is sized by hand').toEqual([]);
    expect(cards.every(card => card.clearCover >= (width <= 600 ? 0.3 : 0.45)),
        'the resting caption leaves the upper part of the cover clear: 45 % of the card, 30 % at phone widths').toBe(true);

    if (gridInfo.leadCard && gridInfo.columns === 3 && cards.length >= 3) {
        expect(Math.abs(cards[0].top - cards[1].top)).toBeLessThan(1);
        expect(Math.abs(cards[0].bottom - cards[2].bottom)).toBeLessThan(1);
        expect(cards[0].height).toBeGreaterThan(cards[1].height * 1.9)
    }

    const rows = new Map();
    cards.forEach(card => {
        const bottom = Math.round(card.bottom);
        rows.has(bottom) || rows.set(bottom, []);
        rows.get(bottom).push(card.bottom)
    });
    expect([...rows.values()].every(bottoms => Math.max(...bottoms) - Math.min(...bottoms) < 1),
        'cards sharing a row bottom have aligned bottoms').toBe(true);
    return cards
}

/**
 * @summary Measures the caption's text colors against the actual composited paint of scrim and cover behind them.
 * The first sampled row is where the title starts, the place the scrim has to hold against a white cover.
 * @param {Object} caption Caption locator.
 * @param {Object} testInfo Playwright evidence writer.
 * @param {String} name Attachment name.
 * @returns {Promise<void>}
 */
async function expectCaptionContrast(caption, testInfo, name) {
    await caption.page().mouse.move(0, 0);

    const screenshot = await caption.screenshot(),
          decoded    = decodePng(screenshot),
          titleTop   = await caption.evaluate(node => parseFloat(getComputedStyle(node).paddingTop)),
          // a mixed color computes to `color(srgb r g b)` with channels from 0 to 1
          colors     = await caption.locator('.portal-example-group-badge, a, .neo-title span, .portal-example-open-cue, .portal-example-feature, p, .neo-inner-details').evaluateAll(nodes =>
              nodes.map(node => {
                  const color = getComputedStyle(node).color, values = color.match(/[\d.]+/g).map(Number);
                  return color.startsWith('color(') ? [...values.slice(0, 3).map(value => value * 255), ...values.slice(3)] : values
              }));
    const luminance = color => color.slice(0, 3).map(value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    // the pixel row above the title and one inside the bottom padding: both free of glyphs
    const rows      = [Math.max(0, Math.floor(titleTop) - 1), decoded.height - 8];
    const contrasts = rows.flatMap(row => [0.12, 0.5, 0.88].flatMap(fraction => {
        const offset     = (row * decoded.width + Math.floor(decoded.width * fraction)) * decoded.channels,
              background = luminance([...decoded.pixels.subarray(offset, offset + 3)]);
        return colors.map(color => {
            expect(color[3] ?? 1, 'text color has no alpha reduction').toBe(1);
            const foreground = luminance(color);
            return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
        })
    }));
    expect(Math.min(...contrasts), 'ordinary caption text contrasts with the rendered surface').toBeGreaterThanOrEqual(4.5);
    await testInfo.attach(name, {body: screenshot, contentType: 'image/png'})
}

/**
 * @summary The overview, its banded index, the group pages and the phone's sheet over the canonical catalog.
 */
test.describe('Portal examples section', () => {
    for (const viewport of [{width: 1440, height: 900}, {width: 1366, height: 768}, {width: 1280, height: 720}, {width: 390, height: 844}, {width: 390, height: 664}]) {
        test(`${viewport.width}×${viewport.height}: the overview names every published group in reach, without a menu`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples`);
            await neuralLink.connectToApp('Portal');

            const isPhone  = viewport.width <= 640,
                  navSel   = isPhone ? MOBILE_IX : SIDEBAR,
                  links    = page.locator(`${navSel} ul a`),
                  featured = page.locator(FEATURED);

            await expect(featured.locator('.neo-list-item')).toHaveCount(12);
            await expect.poll(() => links.locator('.portal-examples-group-index-title').allTextContents()).toEqual(GROUPS);

            if (isPhone) {
                const indexBox = await page.locator(MOBILE_IX).evaluate(node => ({height: node.getBoundingClientRect().height}));
                expect(indexBox.height).toBeLessThanOrEqual(viewport.height * 1.35)
            } else {
                const sidebarBox = await page.locator(SIDEBAR).evaluate(node => node.getBoundingClientRect());
                expect(sidebarBox.bottom).toBeLessThanOrEqual(viewport.height + 1)
            }

            await expect(page.locator('.neo-tab-overflow-control:visible')).toHaveCount(0);
            await expect(page.getByRole('tab')).toHaveCount(0);
            await page.screenshot({path: testInfo.outputPath(`overview-${viewport.width}x${viewport.height}.png`)})
        })
    }

    test('the overview counts what the selected build publishes, and every count adds up to its headline', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        const headline = page.locator('.portal-examples-overview:visible .portal-examples-overview-headline'),
              counts   = page.locator(`${SIDEBAR} .portal-examples-group-index-count`);

        await expect(page.locator(SIDEBAR)).toBeVisible();
        await expect(headline).toHaveText('98 live examples in 21 groups');
        expect((await counts.allTextContents()).filter(text => !text.startsWith('(')).reduce((sum, text) => sum + Number(text), 0)).toBe(98);
        await expect(page.locator(`${SIDEBAR} .portal-examples-group-index-note`)).toBeVisible();
        await expect(page.locator(`${FEATURED} .neo-list-item`).first().locator('.portal-example-group-badge')).toHaveText('Multi-Window');

        // Dev mode cannot open liquid-glass, the one card of More components; its eight tiles stay
        await selectBuild(page, 'Dev mode');
        await expect(headline).toHaveText('97 live examples in 21 groups');
        await expect(page.locator(SIDEBAR).getByRole('link', {name: 'More components, 8 live examples'})).toHaveCount(1);
        await selectBuild(page, 'Production build');
        await expect(headline).toHaveText('98 live examples in 21 groups')
    });

    test('the index is a navigation landmark of links: Tab reaches every entry, Enter opens it, no entry claims to be a tab', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        const nav   = page.getByRole('navigation', {name: 'Example groups'}).locator('visible=true'),
              links = nav.getByRole('link');

        await expect(links).toHaveCount(GROUPS.length + 1);
        await expect(nav.locator('[aria-current="page"]')).toHaveText('All examples');
        await expect(nav.locator('[role="tab"], [aria-selected]')).toHaveCount(0);

        await links.first().focus();
        for (let index = 1; index <= GROUPS.length; index++) {
            await page.keyboard.press('Tab');
            await expect(links.nth(index)).toBeFocused()
        }

        await links.nth(GROUPS.indexOf('Calendar') + 1).focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/#\/examples\/calendar$/);
        await expect(page.locator(`${PAGE} .portal-examples-group-heading h1`)).toHaveText('Calendar')
    });

    test('390×844: the crumb\'s group button opens the full list as a sheet on entry and group routes', async ({page, neuralLink}, testInfo) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        const button = page.locator(`${CRUMB} .portal-examples-group-button`),
              sheet  = page.locator(SHEET);

        await expect(button).toBeVisible();
        await expect(button).toHaveText('All 21 groups');
        await button.click();
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('[aria-current="page"]')).toHaveText('All examples');
        await sheet.getByRole('link', {name: /^Grid & Table, /}).click();
        await expectOpenPage(page, 'Grid & Table');
        await expect(button).toHaveText('Grid & Table');

        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet).toHaveCount(0);

        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute('id', await button.getAttribute('aria-controls'));
        await expect.poll(() => sheet.evaluate(node => node.contains(document.activeElement))).toBe(true);
        await expect(sheet.locator('[aria-current="page"]')).toContainText('Grid & Table');
        await expect(sheet.locator('ul a .portal-examples-group-index-title')).toHaveText(GROUPS);
        // the sheet opens below the crumb, which stays in view
        const [crumbBottom, top] = await Promise.all([
            page.locator(CRUMB).evaluate(node => node.getBoundingClientRect().bottom),
            sheet.evaluate(node => node.getBoundingClientRect().top)
        ]);
        expect(top).toBeGreaterThanOrEqual(crumbBottom - 1);
        await page.screenshot({path: testInfo.outputPath('sheet-open-390x844.png')});

        await page.keyboard.press('Escape');
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet).toHaveCount(0);
        await expect(button).toBeFocused();

        await button.click();
        await sheet.getByRole('link', {name: /^Calendar, /}).click();
        await expect(page).toHaveURL(/#\/examples\/calendar$/);
        await expectOpenPage(page, 'Calendar');
        await expect(page.locator(`${CRUMB} .portal-examples-group-button`)).toHaveAttribute('aria-expanded', 'false');
        await expect(page.locator(`${CRUMB} .portal-examples-group-button`)).toHaveText('Calendar')
    });

    for (const viewport of [{width: 1440, height: 900}, {width: 1280, height: 720}]) {
        test(`${viewport.width}×${viewport.height}, list: the hoisted index stands beside the cards inside the viewport, 3 cols at 1440 with 2×2 lead`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples/grid`);
            await neuralLink.connectToApp('Portal');
            await expectOpenPage(page, 'Grid & Table');

            const index = page.locator(SIDEBAR);

            await expect(index.locator('[aria-current="page"]')).toContainText('Grid & Table');
            await expect(index.locator('ul a .portal-examples-group-index-title')).toHaveText(GROUPS);

            const layout = await readDesktopPage(page);

            expect(layout).toMatchObject({
                cardsBelow: true,
                columns   : viewport.width === 1440 ? 3 : 2,
                crumb     : false,
                index     : true,
                overflowX : false
            });
            expect(layout.indexBottom).toBeLessThanOrEqual(viewport.height);
            expect(layout.narrowest).toBeGreaterThanOrEqual(340);
            await page.screenshot({path: testInfo.outputPath(`list-${viewport.width}x${viewport.height}.png`)});

            // more groups than a laptop's height holds: the index scrolls on its own to its last group
            await index.evaluate(node => {node.scrollTop = node.scrollHeight});
            await expect(index.locator('a').last()).toBeInViewport({ratio: 1});
            await index.evaluate(node => {node.scrollTop = 0});

            // one action reaches a sibling
            await index.getByRole('link', {name: /^Calendar, /}).click();
            await expectOpenPage(page, 'Calendar');
            await expect(index.locator('[aria-current="page"]')).toContainText('Calendar')
        })
    }

    for (const [width, height, perRow] of [[1440, 900, 6], [390, 844, 2]]) {
        test(`${width}×${height}: Forms & Fields shows its 28 tiles by name, ${perRow} per row, each a 4:3 crop over its name`, async ({page, neuralLink}) => {
            await page.setViewportSize({width, height});
            await page.goto(`${PORTAL}#/examples/forms`);
            await neuralLink.connectToApp('Portal');

            const tiles = page.locator(`${TILES} .neo-list-item`),
                  image = tiles.first().locator('.preview-image');

            await expect(tiles).toHaveCount(28);
            await expect(tiles.first().locator('.neo-title')).toHaveText('Checkbox');
            await expect(tiles.last().locator('.neo-title')).toHaveText('ZIP code field');
            // at rest the caption says the tile opens a running example, through the name's own link
            await expect(tiles.first().locator('.portal-example-open-cue')).toHaveText('↗');
            await expect(tiles.first().locator('.portal-example-open-cue'))
                .toHaveAttribute('href', await tiles.first().locator('.neo-title').getAttribute('href'));
            // a page of one kind heads neither
            await expect(page.locator(`${PAGE} .portal-examples-kind-heading`)).toHaveCount(0);

            const tops = await tiles.evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
            expect(tops.filter(top => top === tops[0])).toHaveLength(perRow);

            await expect(image).toHaveCSS('background-image', /devmode\/tiles\/form-field-checkbox-14\.jpg/);
            const box = await image.boundingBox();
            expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.02)
        })
    }

    test('a page that holds both kinds heads each: More components shows Demonstrations, then Components', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/components`);
        await neuralLink.connectToApp('Portal');

        await expect(page.locator(`${PAGE} .portal-examples-kind-heading`)).toHaveText(['Demonstrations', 'Components']);
        await expect(page.locator(`${CARDS} .neo-list-item .neo-title`)).toHaveText(['Liquid Glass effect']);
        await expect(page.locator(`${TILES} .neo-list-item`)).toHaveCount(8)
    });

    test('what the boards cannot show: direct entry, history, the build kept across groups, the scroll of each group', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/forms`);
        const app = await neuralLink.connectToApp('Portal');

        await expect(page.locator(`${PAGE} .portal-examples-group-heading h1`)).toHaveText('Forms & Fields');
        await expect(page.locator(`${TILES} .neo-list-item`)).toHaveCount(28);

        await openGroup(page, 'Grid & Table');
        await selectBuild(page, 'ESM build');
        await page.locator(PAGE).evaluate(node => {node.scrollTop = 600});
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        await openOverview(page);
        await openGroup(page, 'Multi-Window');
        // the build selected on another page holds here
        await expect(page.getByRole('button', {name: /^Running /}).locator('visible=true')).toHaveText(/Running the ESM build/);
        await expect((await readList(app, 'multi-window')).properties.catalogMode).toBe('dist_esm');
        expect(await page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(0);

        // history returns through the overview to the scrolled page
        await page.goBack();
        await expect(page).toHaveURL(/#\/examples$/);
        await expect(page.locator(FEATURED)).toBeVisible();
        await expect(page.locator(PAGE)).toHaveCount(0);
        await page.goBack();
        await expect(page).toHaveURL(/#\/examples\/grid$/);
        await expectOpenPage(page, 'Grid & Table');
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        // an unknown group opens the overview; every defined group has a card or a tile, so the unit spec covers one without
        await page.goto(`${PORTAL}#/examples/unknown`);
        await expect(page.locator(FEATURED)).toBeVisible();
        await expect(page.locator(PAGE)).toHaveCount(0)
    });

    test('the build control and the pages share one catalog, and the four build routes resolve as before', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        // the Start here list plus every published group's card list and tile list borrow the one catalog
        await expect(page.locator(FEATURED)).toBeVisible();
        let sources;
        await expect.poll(async () => (sources = await app.queryComponent({className: 'Portal.view.examples.List'}, ['store'])).length).toBe(2 * GROUPS.length + 1);
        expect(new Set(sources.map(item => item.properties.store.sourceId)).size).toBe(1);

        for (const [label, mode, prefix] of [
            ['ESM build', 'dist_esm', 'dist/esm/'],
            ['Development build', 'dist_dev', 'dist/development/'],
            ['Dev mode', 'devmode', ''],
            ['Production build', 'dist_prod', 'dist/production/']
        ]) {
            await selectBuild(page, label);
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'Open the 100,000 × 200 grid'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/bigData/index.html`);
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation →'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`);

            await openGroup(page, 'Grid & Table');
            await expect(page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/treeBigData/index.html`);
            await openGroup(page, 'Multi-Window');
            // the six covered records plus dock-cross-window and Email (via alsoIn); the external OffscreenCanvas demo has
            // no ESM destination
            await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(mode === 'dist_esm' ? 7 : 8);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Colors Dashboard', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/colors/index.html`);
            await openOverview(page)
        }

        // A record without a cover stays in the catalog and gets no card: Calendar shows its one covered example.
        await openGroup(page, 'Calendar');
        await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(1);
        await expect(page.locator(CARDS).getByRole('link', {name: 'Studio Bookings', exact: true})).toHaveCount(0);

        for (const [mode, prefix] of [['dist_prod', 'dist/production/'], ['dist_esm', 'dist/esm/'], ['dist_dev', 'dist/development/'], ['devmode', '']]) {
            await page.goto(`${PORTAL}#/examples/${mode}`);
            await expect(page.locator(FEATURED)).toBeVisible();
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation →'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`)
        }
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 844, height: 390}]) {
            test(`${theme} ${viewport.width}px: Start here cards and Grid and Table features are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
                await page.setViewportSize(viewport);
                await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
                await page.goto(`${PORTAL}#/examples`);
                const app = await neuralLink.connectToApp('Portal');
                await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

                const featured = page.locator(FEATURED);
                await expect(featured.locator('.neo-list-item')).toHaveCount(12);
                await page.evaluate(() => document.fonts.ready);
                await expectCardLayout(featured, viewport.width);
                await expect(featured.locator('.neo-title').nth(0)).toHaveText('Workstation');
                await expect(featured.locator('.portal-example-group-badge').nth(0)).toHaveText('Multi-Window');
                await expect(featured.locator('.neo-title').nth(1)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(featured.locator('.portal-example-group-badge').nth(1)).toHaveText('Grid & Table');
                await expect(featured.locator('.neo-multi-window[aria-label="Multi-window live example"]').first().locator('.neo-multi-window-label')).toHaveText('Multi-window');
                await expectCaptionContrast(featured.locator('.neo-item-bottom-position').first(), testInfo, 'start-here-caption-contrast');

                await openGroup(page, 'Grid & Table');
                const overview = page.locator(CARDS);

                await expect(overview.locator('.portal-example-feature')).toHaveCount(18);
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 3 : 1);
                const list = await readList(app, 'grid-table');
                expect(list.id).toBe(await overview.getAttribute('id'));
                // the page's Store lists the covered records; the catalog keeps the others for their covers
                expect(list.properties.store.count).toBe(18);
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .neo-item-bottom-position');
                await expect(covered).toHaveCount(18);
                await expect(overview.locator('.portal-example-placeholder')).toHaveCount(0);

                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await expect(issues.locator('.portal-example-feature')).toHaveText('Searchable issue snapshot with wrapped rows');
                expect(await issues.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .toContain('grid-issues-14.jpg');

                const geometry = await expectCardLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                // Table Filtering has a white cover: the scrim alone has to carry the text there.
                await expectCaptionContrast(covered.nth(4), testInfo, 'light-cover-caption-contrast');
                await testInfo.attach('card-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
                expect(await page.locator(PAGE).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
                await page.screenshot({path: testInfo.outputPath(`grid-page-${viewport.width}.png`)});

                /**
                 * @summary Reads the opened Issues card: which parts lie inside it, and whether the caption left the cover.
                 * @returns {Promise<Object>}
                 */
                const opened = () => issues.evaluate(node => {
                    const card   = node.getBoundingClientRect(),
                          box    = selector => node.querySelector(selector).getBoundingClientRect(),
                          inside = rect => rect.height > 0 && rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1;

                    return {
                        height    : card.height,
                        action    : inside(box('.portal-example-look-for')),
                        scope     : inside(box('.portal-example-scope')),
                        source    : inside(box('.neo-github-image')),
                        title     : inside(box('.neo-title')),
                        belowImage: box('.neo-item-bottom-position').top >= box('.preview-image').bottom - 1
                    }
                });
                const restHeight = geometry.find(card => card.title === 'GitHub Issues Grid').height;

                if (viewport.width > 600) {
                    // The action, the limits and the source link open inside the card, on the cover.
                    await issues.hover();
                    await expect.poll(opened).toEqual({height: restHeight, action: true, scope: true, source: true, title: true, belowImage: false});
                    await expect(issues.locator('.portal-example-scope')).toContainText('public issue snapshot');
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                } else {
                    // One column has room to grow: a tapped card opens under its cover, nothing clamped.
                    await issues.locator('.preview-image').click({position: {x: 24, y: 20}});
                    await expect.poll(opened).toMatchObject({action: true, scope: true, source: true, title: true, belowImage: true});
                    expect((await opened()).height).toBeGreaterThan(restHeight);
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                }

                // A stable string identity also survives the lazy-cover path at the end of the list.
                await overview.locator('.neo-list-item').last().scrollIntoViewIfNeeded();
                await expect(overview.locator('.neo-list-item').last().getByRole('link', {name: 'Table Configuration'})).toBeVisible()
            })
        }
    }

    test('a card opens the actual Workstation and Grid UI', async ({page, neuralLink, context, baseURL}) => {
        await page.goto(`${PORTAL}#/examples/multi-window`);
        let app = await neuralLink.connectToApp('Portal');
        // the group pages exist once the catalog has loaded
        await expectOpenPage(page, 'Multi-Window');

        // Rebase only the deployment origin to this test server. The real catalog's path and click stay intact.
        const list = await readList(app, 'multi-window');
        await app.setProperties(list.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(list.id, 'createItems');
        await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true})).toHaveAttribute('href',
            `${baseURL}/dist/production/apps/workstation/index.html`);

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const devList = await readList(app, 'multi-window');
        await app.setProperties(devList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(devList.id, 'createItems');
        await page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true}).click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index.html$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();
        await expect(page.locator('.neo-dock-workspace')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(18);
        const gridList = await readList(app, 'grid-table');
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        const gridPopup = context.waitForEvent('page');
        await page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}).click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index.html$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await expect(grid.getByText('Organization', {exact: true}).first()).toBeVisible();
        await grid.close()
    });

    test('the Open live cue activates the exact launch link across pointer, touch, keyboard and build modes', async ({page, neuralLink, context, browser, baseURL}) => {
        await page.goto(`${PORTAL}#/examples/multi-window`);
        let app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Multi-Window');

        const prodList = await readList(app, 'multi-window');
        await app.setProperties(prodList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(prodList.id, 'createItems');

        const workstationCard = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}),
              workstationCue  = workstationCard.locator('.portal-example-open-cue');

        await expect(workstationCue).toHaveAttribute('href', `${baseURL}/dist/production/apps/workstation/index.html`);
        await expect(workstationCue).toHaveAttribute('target', '_blank');
        await expect(workstationCue).toHaveAttribute('aria-hidden', 'true');
        await expect(workstationCue).toHaveAttribute('tabindex', '-1');
        await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true})).toHaveCount(1);

        const titleLink = workstationCard.locator('.neo-title'),
              source    = workstationCard.locator('.neo-github-image');

        await titleLink.focus();
        await expect(titleLink).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(source).toBeFocused();
        await expect(workstationCue).not.toBeFocused();

        // In devmode, clicking Workstation's cue reuses the same window (sharedWorkers), while Enter on the title does the same
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const devList = await readList(app, 'multi-window');
        await app.setProperties(devList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(devList.id, 'createItems');

        const devWorkstation = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}),
              devCue         = devWorkstation.locator('.portal-example-open-cue');

        await expect(devCue).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html`);
        await expect(devCue).not.toHaveAttribute('target', /_blank/);
        await devCue.click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const enterList = await readList(app, 'multi-window');
        await app.setProperties(enterList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(enterList.id, 'createItems');

        const enterTitle = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}).locator('.neo-title');
        await expect(enterTitle).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html`);
        await enterTitle.focus();
        await expect(enterTitle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        // Single-window example keeps target="_blank" when clicking the cue in devmode
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        const gridList = await readList(app, 'grid-table');
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');

        const treeCue = page.locator(`${CARDS} .neo-list-item`, {hasText: 'TreeGrid - Big Data'}).locator('.portal-example-open-cue');
        await expect(treeCue).toHaveAttribute('href', `${baseURL}/examples/grid/treeBigData/index.html`);
        await expect(treeCue).toHaveAttribute('target', '_blank');
        const gridPopup = context.waitForEvent('page');
        await treeCue.click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index\.html$/);
        await expect(grid.locator('.neo-grid-container')).toBeVisible();
        await grid.close();

        // Real touch tap on mobile viewport preserves both popup (_blank) and same-window (sharedWorkers) launch targets
        const touchContext = await browser.newContext({baseURL, hasTouch: true, viewport: {width: 390, height: 844}});
        await touchContext.route('https://neomjs.com/**', route => route.fulfill({
            status     : 200,
            contentType: 'text/html',
            body       : '<title>Launched</title>'
        }));
        const touchPage = await touchContext.newPage();
        await touchPage.goto(`${PORTAL}#/examples/devmode`);
        await expect(touchPage.locator(FEATURED)).toBeVisible();

        const gridCard = touchPage.locator(`${FEATURED} .neo-list-item`, {hasText: 'Data Grid: 100k Rows & 200 Columns'});
        await gridCard.scrollIntoViewIfNeeded();
        const touchPopup = touchContext.waitForEvent('page');
        await gridCard.locator('.portal-example-open-cue').tap();
        const touchedGrid = await touchPopup;
        await expect(touchedGrid).toHaveURL(/\/examples\/grid\/bigData\/index\.html$/);
        await touchedGrid.close();

        const wsCard = touchPage.locator(`${FEATURED} .neo-list-item`, {hasText: 'Workstation'});
        await wsCard.scrollIntoViewIfNeeded();
        await wsCard.locator('.portal-example-open-cue').tap();
        await expect(touchPage).toHaveURL(/\/apps\/workstation\/index\.html$/);
        await touchContext.close()
    })
});
