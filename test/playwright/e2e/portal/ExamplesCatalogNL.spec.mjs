import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const PORTAL = '/apps/portal/index.html',
      PAGE   = '.portal-examples-group-page:visible',
      INDEX  = `${PAGE} nav.portal-examples-group-index-list`,
      SHEET  = `${PAGE} nav.portal-examples-group-index-sheet`,
      CARDS  = `${PAGE} .portal-examples-list`,
      GROUPS = [
          'Grid & Table', 'Forms & Fields', 'Calendar', 'Scheduler', 'Gantt', 'Tab Container', 'Dashboard & Docking',
          'Drag & Drop', 'Lists & Galleries', 'Dialogs & Overlays', 'Charts, Canvas & Maps', 'More components', 'Multi-Window',
          'State & Data', 'Workers & Platform', 'Apps'
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
 * @summary Waits until the named page is the only page that shows. The card switch updates the page it hides and the
 * page it shows one by one, so for a moment either both show or still the old one.
 * @param {Object} page The test page.
 * @param {String} name Group title, or 'All examples'.
 * @returns {Promise<void>}
 */
async function expectOpenPage(page, name) {
    await expect(page.locator(PAGE).filter({has: page.getByRole('heading', {level: 1, name, exact: true})})).toBeVisible();
    await expect(page.locator(PAGE)).toHaveCount(1)
}

/**
 * @summary Returns to the page of all examples through the header's Examples link.
 * @param {Object} page The test page.
 * @returns {Promise<void>}
 */
async function openAll(page) {
    await page.locator('.portal-header-toolbar').getByRole('link', {name: 'Examples', exact: true}).click();
    await expectOpenPage(page, 'All examples')
}

/**
 * @summary Opens a group the way a reader does: through the index beside the cards, or below 640 px through the
 * sheet under the crumb.
 * @param {Object} page The test page.
 * @param {String} name Group title.
 * @returns {Promise<void>}
 */
async function openGroup(page, name) {
    const link = {name: new RegExp(`^${name}, `)};

    // a page shows once the catalog has loaded
    await expect(page.locator(PAGE)).toHaveCount(1);

    if (await page.locator(INDEX).isVisible()) {
        await page.locator(INDEX).getByRole('link', link).click()
    } else {
        await page.locator(`${PAGE} .portal-examples-group-button`).click();
        await page.locator(SHEET).getByRole('link', link).click()
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
 * @summary Reads the open page's desktop control: the crumb, the upright index and the cards beside them.
 * @param {Object} page The test page.
 * @returns {Promise<Object>}
 */
async function readDesktopPage(page) {
    return page.locator(PAGE).evaluate(node => {
        const index = node.querySelector('.portal-examples-group-index-list'),
              list  = node.querySelector('.portal-examples-list'),
              // the heading's and the build control's own boxes: a clipping header row can collapse below them
              heading = Math.max(...['.portal-examples-group-heading', '.portal-examples-build-control']
                  .map(selector => node.querySelector(selector).getBoundingClientRect().bottom));

        return {
            cardsBelow : list.getBoundingClientRect().top >= heading - 1,
            columns    : getComputedStyle(list).gridTemplateColumns.split(' ').length,
            crumb      : getComputedStyle(node.querySelector('.portal-examples-group-crumb')).display !== 'none',
            index      : Boolean(index?.offsetHeight),
            indexBottom: index ? index.getBoundingClientRect().bottom : null,
            narrowest  : Math.min(...[...list.querySelectorAll('.neo-list-item')].map(card => card.getBoundingClientRect().width)),
            overflowX  : node.scrollWidth > node.clientWidth + 1
        }
    })
}

/**
 * @summary Checks the resting card: a 16:9 cover that fills it, with title and proof line on a docked scrim.
 * @param {Object} list The mounted list locator.
 * @param {Number} width Viewport width.
 * @returns {Promise<Object[]>} Measured cards for the retained evidence.
 */
async function expectCardLayout(list, width) {
    // a hovered or a focused card opens its action line: measure the resting one, once its line has closed
    await list.page().mouse.move(0, 0);
    await list.page().evaluate(() => document.activeElement?.blur());
    await expect.poll(() => list.locator('.portal-example-more').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height < 1))).toBe(true);

    const cards = await list.locator('.neo-list-item').evaluateAll(nodes => nodes.filter(node => node.offsetWidth).map(node => {
        const card    = node.getBoundingClientRect(),
              caption = node.querySelector('.neo-item-bottom-position'),
              copy    = caption.getBoundingClientRect(),
              image   = node.querySelector('.preview-image').getBoundingClientRect(),
              more    = node.querySelector('.portal-example-more'),
              shown   = [node.querySelector('.neo-title'), node.querySelector('.portal-example-feature')].filter(Boolean),
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
            closed      : more.getBoundingClientRect().height < 1,
            opaque      : [node, caption, ...texts].every(text => getComputedStyle(text).opacity === '1'),
            noInlineSize: !node.style.height && !node.querySelector('.content').style.aspectRatio
        }
    }));

    expect(cards.length).toBeGreaterThan(0);
    expect(cards.every(card => card.coverFills && Math.abs(card.ratio - 16 / 9) < 0.02), 'the cover fills a 16:9 card').toBe(true);
    // the cards that miss a check, by name, so a red run says which check failed where
    expect(cards.filter(card => !(card.docked && card.fits && card.textFits && card.closed && card.opaque && card.noInlineSize)),
        'title and proof line fit a full-width, bottom-docked scrim; the action stays closed; no text is dimmed by opacity; no card is sized by hand').toEqual([]);
    expect(cards.every(card => card.clearCover >= (width <= 600 ? 0.3 : 0.45)),
        'the resting caption leaves the upper part of the cover clear: 45 % of the card, 30 % at phone widths').toBe(true);

    const rows = new Map();
    cards.forEach(card => {
        const top = Math.round(card.top);
        rows.has(top) || rows.set(top, []);
        rows.get(top).push(card.bottom)
    });
    expect([...rows.values()].every(bottoms => Math.max(...bottoms) - Math.min(...bottoms) < 1),
        'cards sharing a row have aligned bottoms').toBe(true);
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
          colors     = await caption.locator('a, .neo-title span, .portal-example-feature, p, .neo-inner-details').evaluateAll(nodes =>
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
 * @summary The page of all examples, the group pages, their banded index and the phone's sheet over the canonical
 * catalog.
 */
test.describe('Portal examples section', () => {
    for (const viewport of [{width: 1440, height: 900}, {width: 1366, height: 768}, {width: 1280, height: 720}]) {
        test(`${viewport.width}×${viewport.height}: /examples shows every published example beside the group list, "All examples" current`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples`);
            await neuralLink.connectToApp('Portal');
            await expectOpenPage(page, 'All examples');

            const index = page.locator(INDEX);

            await expect(index.locator('a .portal-examples-group-index-title')).toHaveText(GROUPS);
            await expect(index.locator('[aria-current="page"]')).toHaveText('All examples');
            expect(await readDesktopPage(page)).toMatchObject({cardsBelow: true, columns: 2, crumb: false, index: true, overflowX: false});
            // each published record once, in catalog order: the page opens on the showcases
            await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(43);
            await expect(page.locator(`${CARDS} .neo-title`).nth(0)).toHaveText('Workstation');
            await expect(page.locator(`${CARDS} .neo-title`).nth(1)).toHaveText('Web Desktop');
            await expect(page.getByRole('tab')).toHaveCount(0);
            await page.screenshot({path: testInfo.outputPath(`all-${viewport.width}x${viewport.height}.png`)})
        })
    }

    for (const viewport of [{width: 390, height: 844}, {width: 390, height: 664}]) {
        test(`${viewport.width}×${viewport.height}: /examples shows one crumb button, which opens every group as a sheet`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples`);
            await neuralLink.connectToApp('Portal');
            await expectOpenPage(page, 'All examples');

            const crumb  = page.locator(`${PAGE} .portal-examples-group-crumb`),
                  button = crumb.locator('.portal-examples-group-button'),
                  sheet  = page.locator(SHEET);

            // "Examples ›" would lead to the page itself
            await expect(crumb.locator('.portal-examples-group-crumb-home, .portal-examples-group-crumb-separator')).toHaveCount(0);
            await expect(button).toHaveText('All examples');
            await expect(page.locator(INDEX)).toBeHidden();
            await page.screenshot({path: testInfo.outputPath(`all-${viewport.width}x${viewport.height}.png`)});

            await button.click();
            await expect(sheet.locator('a .portal-examples-group-index-title')).toHaveText(GROUPS);
            await expect(sheet.locator('[aria-current="page"]')).toHaveText('All examples');

            // a followed link closes the sheet, and a group's crumb leads back
            await sheet.getByRole('link', {name: /^Calendar, /}).click();
            await expectOpenPage(page, 'Calendar');
            await expect(page.locator(SHEET)).toHaveCount(0);
            await page.locator(`${PAGE} .portal-examples-group-crumb-home`).click();
            await expectOpenPage(page, 'All examples')
        })
    }

    test('the page of all examples counts what the selected build publishes, and the groups\' counts add up to it', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        const line   = page.locator(`${PAGE} .portal-examples-group-heading p`),
              counts = page.locator(`${INDEX} .portal-examples-group-index-count`);

        await expect(line).toHaveText(/^43 examples · /);
        expect((await counts.allTextContents()).filter(text => !text.startsWith('(')).reduce((sum, text) => sum + Number(text), 0)).toBe(43);
        await expect(page.locator(`${INDEX} .portal-examples-group-index-note`)).toBeVisible();
        await expect(page.locator(CARDS).getByRole('link', {name: 'Liquid Glass effect', exact: true})).toHaveCount(1);

        // Dev mode cannot open liquid-glass, the one card of More components
        await selectBuild(page, 'Dev mode');
        await expect(line).toHaveText(/^42 examples · /);
        await expect(page.locator(CARDS).getByRole('link', {name: 'Liquid Glass effect', exact: true})).toHaveCount(0);
        await expect(page.locator(INDEX).getByRole('link', {name: /^More components, /})).toHaveCount(0);
        await selectBuild(page, 'Production build');
        await expect(line).toHaveText(/^43 examples · /)
    });

    test('the page of all examples requests a cover when its card nears the viewport', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'All examples');

        const cards = page.locator(`${CARDS} .neo-list-item`),
              cover = card => card.locator('.preview-image').evaluate(node => node.style.backgroundImage.includes('url('));

        await expect.poll(() => cover(cards.first())).toBe(true);
        expect(await cover(cards.last())).toBe(false);
        await cards.last().scrollIntoViewIfNeeded();
        await expect.poll(() => cover(cards.last())).toBe(true)
    });

    test('the index is a navigation landmark of links: Tab reaches every entry, Enter opens it, no entry claims to be a tab', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        // "All examples", then every group
        const nav   = page.getByRole('navigation', {name: 'Example groups'}).locator('visible=true'),
              links = nav.getByRole('link');

        await expect(links).toHaveCount(GROUPS.length + 1);
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

    test('390×844: the crumb\'s group button opens the full list as a sheet, one tap opens it and a second navigates', async ({page, neuralLink}, testInfo) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${PORTAL}#/examples/grid`);
        await neuralLink.connectToApp('Portal');

        const button = page.locator(`${PAGE} .portal-examples-group-button`),
              sheet  = page.locator(`${PAGE} .portal-examples-group-index-sheet`);

        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet).toHaveCount(0);

        await button.click();
        await expect(button).toHaveAttribute('aria-expanded', 'true');
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute('id', await button.getAttribute('aria-controls'));
        await expect.poll(() => sheet.evaluate(node => node.contains(document.activeElement))).toBe(true);
        await expect(sheet.locator('[aria-current="page"]')).toContainText('Grid & Table');
        await expect(sheet.locator('a .portal-examples-group-index-title')).toHaveText(GROUPS);
        // the sheet opens below the crumb, which stays in view
        const [crumb, top] = await Promise.all([
            page.locator(`${PAGE} .portal-examples-group-crumb`).evaluate(node => node.getBoundingClientRect().bottom),
            sheet.evaluate(node => node.getBoundingClientRect().top)
        ]);
        expect(top).toBeGreaterThanOrEqual(crumb - 1);
        await page.screenshot({path: testInfo.outputPath('sheet-open-390x844.png')});

        await page.keyboard.press('Escape');
        await expect(button).toHaveAttribute('aria-expanded', 'false');
        await expect(sheet).toHaveCount(0);
        await expect(button).toBeFocused();

        await button.click();
        await sheet.getByRole('link', {name: /^Calendar, /}).click();
        await expect(page).toHaveURL(/#\/examples\/calendar$/);
        await expectOpenPage(page, 'Calendar');
        await expect(page.locator(`${PAGE} .portal-examples-group-button`)).toHaveAttribute('aria-expanded', 'false')
    });

    for (const viewport of [{width: 1440, height: 900}, {width: 1280, height: 720}]) {
        test(`${viewport.width}×${viewport.height}, list: the index stands beside the cards inside the viewport and scrolls on its own, no card under 410 px`, async ({page, neuralLink}, testInfo) => {
            await page.setViewportSize(viewport);
            await page.goto(`${PORTAL}#/examples/grid`);
            await neuralLink.connectToApp('Portal');
            await expectOpenPage(page, 'Grid & Table');

            const index = page.locator(`${PAGE} nav.portal-examples-group-index-list`);

            await expect(index.locator('[aria-current="page"]')).toContainText('Grid & Table');
            await expect(index.locator('a .portal-examples-group-index-title')).toHaveText(GROUPS);

            const layout = await readDesktopPage(page);

            expect(layout).toMatchObject({cardsBelow: true, columns: 2, crumb: false, index: true, overflowX: false});
            expect(layout.indexBottom).toBeLessThanOrEqual(viewport.height);
            expect(layout.narrowest).toBeGreaterThanOrEqual(410);
            await page.screenshot({path: testInfo.outputPath(`list-${viewport.width}x${viewport.height}.png`)});

            // more groups than a laptop's height holds: the index scrolls on its own to its last group
            await index.evaluate(node => {node.scrollTop = node.scrollHeight});
            await expect(index.locator('a').last()).toBeInViewport({ratio: 1});
            await index.evaluate(node => {node.scrollTop = 0});

            // one action reaches a sibling
            await index.getByRole('link', {name: /^Calendar, /}).click();
            await expectOpenPage(page, 'Calendar');
            await expect(page.locator(`${PAGE} nav.portal-examples-group-index-list [aria-current="page"]`)).toContainText('Calendar')
        })
    }

    test('what the boards cannot show: direct entry, history, the build kept across groups, the scroll of each group', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/forms`);
        const app = await neuralLink.connectToApp('Portal');

        await expect(page.locator(`${PAGE} .portal-examples-group-heading h1`)).toHaveText('Forms & Fields');
        await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(3);

        await openGroup(page, 'Grid & Table');
        await selectBuild(page, 'ESM build');
        await page.locator(PAGE).evaluate(node => {node.scrollTop = 600});
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        await openGroup(page, 'Multi-Window');
        // the build selected on another page holds here
        await expect(page.getByRole('button', {name: /^Running /}).locator('visible=true')).toHaveText(/Running the ESM build/);
        await expect((await readList(app, 'multi-window')).properties.catalogMode).toBe('dist_esm');
        expect(await page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(0);

        // history returns to the scrolled page
        await page.goBack();
        await expectOpenPage(page, 'Grid & Table');
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        // a group without a card in this build, and an unknown one, open the page of all examples
        await page.goto(`${PORTAL}#/examples/board`);
        await expectOpenPage(page, 'All examples');
        await page.goto(`${PORTAL}#/examples/unknown`);
        await expectOpenPage(page, 'All examples')
    });

    test('the build control and the pages share one catalog, and the four build routes resolve as before', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        // all examples and every published group have their page once the catalog has loaded, and every page borrows
        // the one catalog
        await expectOpenPage(page, 'All examples');
        let sources;
        await expect.poll(async () => (sources = await app.queryComponent({className: 'Portal.view.examples.List'}, ['store'])).length).toBe(GROUPS.length + 1);
        expect(new Set(sources.map(item => item.properties.store.sourceId)).size).toBe(1);

        for (const [label, mode, prefix] of [
            ['ESM build', 'dist_esm', 'dist/esm/'],
            ['Development build', 'dist_dev', 'dist/development/'],
            ['Dev mode', 'devmode', ''],
            ['Production build', 'dist_prod', 'dist/production/']
        ]) {
            await selectBuild(page, label);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Data Grid: 100k Rows & 200 Columns', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/bigData/index.html`);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`);

            await openGroup(page, 'Grid & Table');
            await expect(page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/treeBigData/index.html`);
            await openGroup(page, 'Multi-Window');
            // the six covered records; the external OffscreenCanvas demo has no ESM destination
            await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(mode === 'dist_esm' ? 5 : 6);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Colors Dashboard', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/colors/index.html`);
            await openAll(page)
        }

        // A record without a cover stays in the catalog and gets no card: Calendar shows its one covered example.
        await openGroup(page, 'Calendar');
        await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(1);
        await expect(page.locator(CARDS).getByRole('link', {name: 'Studio Bookings', exact: true})).toHaveCount(0);

        for (const [mode, prefix] of [['dist_prod', 'dist/production/'], ['dist_esm', 'dist/esm/'], ['dist_dev', 'dist/development/'], ['devmode', '']]) {
            await page.goto(`${PORTAL}#/examples/${mode}`);
            await expectOpenPage(page, 'All examples');
            await expect(page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html`)
        }
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 844, height: 390}]) {
            test(`${theme} ${viewport.width}px: the cards of all examples and of Grid and Table are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
                await page.setViewportSize(viewport);
                await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
                await page.goto(`${PORTAL}#/examples`);
                const app = await neuralLink.connectToApp('Portal');
                await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

                // every published card, on the page a visitor meets first. The caption is measured in the web font it
                // renders in, not in the fallback that stands in while the font loads.
                await expectOpenPage(page, 'All examples');
                await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(43);
                await page.evaluate(() => document.fonts.ready);
                await expectCardLayout(page.locator(CARDS), viewport.width);

                await openGroup(page, 'Grid & Table');
                const overview = page.locator(CARDS);

                await expect(overview.locator('.portal-example-feature')).toHaveCount(17);
                // beside the upright index a card keeps 410 px: two columns at 1440, one at 844 and on a phone
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 2 : 1);
                const list = await readList(app, 'grid-table');
                expect(list.id).toBe(await overview.getAttribute('id'));
                // the page's Store lists the covered records; the catalog keeps the others for their covers
                expect(list.properties.store.count).toBe(17);
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .neo-item-bottom-position');
                await expect(covered).toHaveCount(17);
                await expect(overview.locator('.portal-example-placeholder')).toHaveCount(0);

                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await expect(issues.locator('.portal-example-feature')).toHaveText('Searchable issue snapshot with wrapped rows');
                expect(await issues.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .toContain('grid-issues-14.jpg');

                const geometry = await expectCardLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                // Table Filtering has a white cover: the scrim alone has to carry the text there.
                await expectCaptionContrast(covered.nth(3), testInfo, 'light-cover-caption-contrast');
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
        await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(17);
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
    })
});
