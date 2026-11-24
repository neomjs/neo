import fs             from 'node:fs';
import {expect, test} from '../../fixtures.mjs';
import {decodePng}    from '../utils/pngPixels.mjs';

const CATALOG = new URL('../../../../apps/portal/resources/data/examples/', import.meta.url);

/**
 * @summary Counts the records a group's page lists in a build mode, its own and the ones it borrows through
 * `alsoIn`, by the rule `Portal.model.Example.publishes` applies, so a pin follows the catalog's group files.
 * @param {String} family
 * @param {String} mode
 * @returns {Number}
 */
const groupSize = (family, mode) => fs.readdirSync(CATALOG)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .flatMap(file => JSON.parse(fs.readFileSync(new URL(file, CATALOG), 'utf8')))
    .filter(record => (record.family === family || record.alsoIn?.includes(family)) &&
        !!record.image && !record.hidden && !record.hiddenIn?.includes(mode) && !!record.urls?.[mode])
    .length;

const PORTAL    = '/apps/portal/index.html',
      SIDEBAR   = '.portal-examples-sidebar:visible nav.portal-examples-group-index-list',
      MOBILE_IX = '.portal-examples-overview:visible nav.portal-examples-group-index-overview',
      CRUMB     = '.portal-examples-main-container > .portal-examples-group-crumb:visible',
      SHEET     = '.portal-examples-main-container .portal-examples-group-index-sheet',
      PAGE      = '.portal-examples-group-page:visible',
      CARDS     = `${PAGE} .portal-examples-list:not(.portal-examples-tiles)`,
      TILES     = `${PAGE} .portal-examples-tiles`,
      FEATURED  = '.portal-examples-overview:visible .portal-examples-overview-cards',
      // The Portal boots on Neo Dark here, and every local launch link names the Portal's theme
      THEME     = '?theme=neo-theme-neo-dark',
      GROUPS    = [
          'Apps', 'Grid & Table', 'Trees', 'Lists & Galleries', 'Charts, Canvas & Maps',
          'Calendar', 'Scheduler', 'Gantt', 'Task Board',
          'Dashboard & Docking', 'Tabs', 'Containers & Layouts', 'Dialogs & Overlays',
          'Forms & Fields', 'Buttons, Menus & Toolbars', 'More components',
          'Multi-Window', 'Workers & Platform', 'State & Data', 'Functional Components', 'Drag & Drop'
      ];

/**
 * @summary Reads a mounted examples list of the open group page from this page's App Worker.
 * @param {Object} app The bound Neural Link app.
 * @param {String} family The open page's group
 * @param {String} [reference='group-list'] The page's card list, or `'tile-list'`
 * @returns {Promise<Object>} The list's identity and Store.
 */
async function readList(app, family, reference='group-list') {
    const pages = await app.queryComponent({className: 'Portal.view.examples.GroupPage'}, ['id', 'family']),
          page  = pages.find(match => match.properties.family === family),
          lists = await app.queryComponent({className: 'Portal.view.examples.List'}, ['id', 'parentId', 'reference', 'catalogMode', 'store']);

    return lists.find(match => match.properties.parentId === page.id && match.properties.reference === reference)
}

/**
 * @summary Reads the overview's featured "Start here" list from this page's App Worker.
 * @param {Object} app The bound Neural Link app.
 * @returns {Promise<Object>} The list's Store.
 */
async function readOverviewList(app) {
    const lists = await app.queryComponent({className: 'Portal.view.examples.List'}, ['reference', 'store']);

    return lists.find(match => match.properties.reference === 'overview-list')
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
    const control = page.getByRole('button', {name: /^(Examples open|Open) in: /}).locator('visible=true');

    await control.click();
    await page.locator('.neo-menu-list:visible .neo-list-item').filter({hasText: label}).click();
    await expect(page.locator('.neo-menu-list:visible')).toHaveCount(0);
    await expect(control).toHaveText(new RegExp(`^(Examples open|Open) in: ${label}$`))
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
 * @summary Checks the resting two-zone card: an unoccluded 16:9 cover frame above a stationary surface footer rail.
 * @param {Object} list The mounted list locator.
 * @param {Number} width Viewport width.
 * @returns {Promise<Object[]>} Measured cards for the retained evidence.
 */
async function expectCardLayout(list, width) {
    await list.page().mouse.move(0, 0);
    await list.page().evaluate(() => document.activeElement?.blur());
    await expect.poll(() => list.locator('.portal-example-more').evaluateAll(nodes => nodes.every(node => node.getBoundingClientRect().height < 1))).toBe(true);

    const gridInfo = await list.evaluate(node => ({
        columns : getComputedStyle(node).gridTemplateColumns.split(' ').length,
        leadCard: node.classList.contains('portal-examples-list-lead')
    }));

    const cards = await list.locator('.neo-list-item').evaluateAll((nodes, {columns, leadCard}) => nodes.filter(node => node.offsetWidth).map((node, index) => {
        const card    = node.getBoundingClientRect(),
              wrap    = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
              caption = node.querySelector('.portal-example-footer'),
              copy    = caption.getBoundingClientRect(),
              image   = node.querySelector('.preview-image').getBoundingClientRect(),
              feature = node.querySelector('.portal-example-feature'),
              more    = node.querySelector('.portal-example-more'),
              isLead  = leadCard && columns === 3 && index === 0,
              shown   = [
                  node.querySelector('.portal-example-group-badge'),
                  node.querySelector('.neo-title'),
                  node.querySelector('.neo-github-image'),
                  node.querySelector('.portal-example-open-cue'),
                  node.querySelector('.portal-example-feature')
              ].filter(el => el && el.offsetWidth > 0),
              texts   = [...caption.querySelectorAll('*')];

        return {
            title     : node.querySelector('.neo-title').textContent,
            left      : card.left,
            width     : card.width,
            top       : card.top,
            bottom    : card.bottom,
            height    : card.height,
            isLead,
            coverRatio: wrap.width / wrap.height,
            clearCover: (copy.top - wrap.top) / wrap.height,
            coverFills: ['left', 'right', 'top', 'bottom'].every(side => Math.abs(image[side] - wrap[side]) < 1.5),
            docked    : Math.abs(copy.left - card.left) < 1.5 && Math.abs(copy.right - card.right) < 1.5 && Math.abs(copy.bottom - card.bottom) < 1.5 && copy.top >= wrap.bottom - 1.5,
            fits      : caption.scrollHeight <= caption.clientHeight + 1 && caption.scrollWidth <= caption.clientWidth + 1,
            textFits  : shown.every(text => {
                const rect = text.getBoundingClientRect();
                return rect.left >= copy.left - 1 && rect.right <= copy.right + 1 && rect.top >= copy.top - 1 && rect.bottom <= copy.bottom + 1
            }),
            closed      : !more || more.getBoundingClientRect().height < 1,
            opaque      : [node, caption, ...texts].every(text => getComputedStyle(text).opacity === '1'),
            noInlineSize: !node.style.height && !node.querySelector('.content').style.aspectRatio,
            featureWhole: !feature || feature.scrollHeight <= feature.clientHeight + 1
        }
    }), gridInfo);

    expect(cards.length).toBeGreaterThan(0);
    // Covers are captured at 16:9, so any other frame ratio crops them; the 2 × 2 lead is no exception
    expect(cards.filter(card => !(card.coverFills && Math.abs(card.coverRatio - 16 / 9) < 0.025)).map(card => `${card.title} ${card.coverRatio.toFixed(3)}`),
        'every card, the lead included, has an unoccluded 16:9 cover frame').toEqual([]);
    expect(cards.filter(card => !(card.docked && card.fits && card.textFits && card.closed && card.opaque && card.noInlineSize)),
        'title, source icon, cue and proof line fit the stationary footer below the cover; details stay closed at rest').toEqual([]);
    expect(cards.every(card => card.clearCover >= 0.99),
        '100 % of the cover frame is unoccluded at rest').toBe(true);

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
 * @summary Computes relative luminance from three sRGB channels in the 0–255 range.
 * @param {Number[]} color
 * @returns {Number}
 */
function luminance(color) {
    return color.slice(0, 3).map(value => {
        value /= 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

/**
 * @summary Measures the caption's text colors against the actual composited paint of scrim and cover behind them.
 * The first sampled row is where the title starts, the place the scrim has to hold against a white cover.
 * Below the text the scrim must paint its opaque surface: a cover that shows through fails.
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
    // the text region is opaque: inside the bottom padding the caption paints its surface, never the cover
    const surface = await caption.evaluate(node => {
        const probe = document.body.appendChild(document.createElement('i'));
        probe.style.color = getComputedStyle(node).getPropertyValue('--portal-examples-list-surface');
        const color = getComputedStyle(probe).color, values = color.match(/[\d.]+/g).map(Number);
        probe.remove();
        return color.startsWith('color(') ? values.slice(0, 3).map(value => value * 255) : values.slice(0, 3)
    });
    [0.12, 0.5, 0.88].forEach(fraction => {
        const offset = ((decoded.height - 4) * decoded.width + Math.floor(decoded.width * fraction)) * decoded.channels;
        expect([...decoded.pixels.subarray(offset, offset + 3)].every((value, index) => Math.abs(value - surface[index]) <= 2),
            'the caption paints its surface behind the text, not the cover').toBe(true)
    });
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
            const app = await neuralLink.connectToApp('Portal');

            const isPhone  = viewport.width <= 640,
                  navSel   = isPhone ? MOBILE_IX : SIDEBAR,
                  links    = page.locator(`${navSel} ul a`),
                  featured = page.locator(FEATURED);

            // the featured list's Store holds the count to show; the unit spec pins which examples it holds
            await expect(featured.locator('.neo-list-item').first()).toBeVisible();
            await expect(featured.locator('.neo-list-item')).toHaveCount((await readOverviewList(app)).properties.store.count);
            await expect.poll(() => links.locator('.portal-examples-group-index-title').allTextContents()).toEqual(GROUPS);

            // the build control is a setting, not a second action: beside the heading on a desktop, and under the featured
            // cards on a phone, off its first screen. Its phone label waits for the viewport to measure its size.
            await expect.poll(() => page.locator('.portal-examples-build-control').locator('visible=true').evaluate(node => {
                const control  = node.getBoundingClientRect(),
                      overview = node.closest('.portal-examples-overview'),
                      cards    = overview.querySelector('.portal-examples-overview-cards').getBoundingClientRect(),
                      heading  = overview.querySelector('.portal-examples-overview-start .portal-examples-overview-heading').getBoundingClientRect();

                return {
                    height: control.height,
                    label : node.textContent.trim(),
                    place : control.top < heading.bottom ? 'beside the heading' : control.top >= cards.bottom ? 'under the cards' : 'between',
                    weight: getComputedStyle(node.querySelector('.neo-button-text')).fontWeight
                }
            })).toEqual({
                height: 36,
                label : `${isPhone ? 'Open' : 'Examples open'} in: Production build`,
                place : isPhone ? 'under the cards' : 'beside the heading',
                weight: '400'
            });

            // Phone viewports use the concise two-line lead and bring the first featured card above the screen's midpoint
            await expect.poll(() => page.locator('.portal-examples-overview:visible .portal-examples-overview-lead').evaluate(node => {
                const style = getComputedStyle(node);

                return {
                    linesValid: Math.round(node.getBoundingClientRect().height / parseFloat(style.lineHeight)) <= (window.innerWidth <= 640 ? 2 : 3),
                    text      : node.textContent.trim()
                }
            })).toEqual({
                linesValid: true,
                text      : isPhone
                    ? 'Grids, Gantt charts, forms and apps, each one running live in your browser.'
                    : 'Grids with 100,000 rows × 200 columns, forms, calendars, a Gantt chart, docking dashboards and multi-window apps, each one running live in your browser. Neo.mjs keeps the app and its data in workers, so the main thread only paints.'
            });

            if (isPhone) {
                if (viewport.width === 390 && viewport.height === 844) {
                    const firstCardTop = await featured.locator('.neo-list-item').first().evaluate(node => node.getBoundingClientRect().top);
                    expect(firstCardTop).toBeLessThanOrEqual(422)
                }

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

    test('the overview counts what the selected build publishes, each group number counts its page, and one line gives the total', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        const app = await neuralLink.connectToApp('Portal');

        const headline   = page.locator('.portal-examples-overview:visible .portal-examples-overview-headline'),
              counts     = page.locator(`${SIDEBAR} li .portal-examples-group-index-count`),
              allCount   = page.locator(`${SIDEBAR} .portal-examples-group-index-all .portal-examples-group-index-count`),
              note       = page.locator(`${SIDEBAR} .portal-examples-group-index-note`),
              components = counts.nth(GROUPS.indexOf('More components')),
              apps       = counts.nth(GROUPS.indexOf('Apps')),
              sum        = async () => (await counts.allTextContents()).reduce((sum, text) => sum + Number(text), 0),
              noteOf     = published => `${published} examples in all. Some appear in more than one group.`,
              headlineOf = published => `${published} live examples in ${GROUPS.length} groups`;

        await expect(page.locator(SIDEBAR)).toBeVisible();
        await expect(counts).toHaveCount(GROUPS.length);
        await expect(note).toHaveText(/^\d+ examples in all\. Some appear in more than one group\.$/);

        const published      = Number((await note.textContent()).split(' ')[0]),
              componentCount = Number(await components.textContent());

        // the line gives the headline's total; a borrowed example counts in every group that shows it, so the list adds up to more
        await expect(headline).toHaveText(headlineOf(published));
        await expect(allCount).toHaveText(String(published));
        expect(published).toBeGreaterThan(0);
        expect((await counts.allTextContents()).every(text => /^\d+$/.test(text)), 'every group shows a number').toBe(true);
        expect(await sum()).toBeGreaterThan(published);
        await expect(counts.filter({hasText: '('}), 'no count needs a footnote').toHaveCount(0);
        await expect(page.locator(`${FEATURED} .neo-list-item`).first().locator('.portal-example-group-badge')).toHaveText('Multi-Window');

        // Dev mode cannot open liquid-glass, one of the three cards of More components; the markdown and Live preview cards and the tiles stay
        await selectBuild(page, 'Dev mode');
        await expect(headline).toHaveText(headlineOf(published - 1));
        await expect(note).toHaveText(noteOf(published - 1));
        await expect(allCount).toHaveText(String(published - 1));
        await expect(page.locator(SIDEBAR).getByRole('link', {name: `More components, ${componentCount - 1} live examples`})).toHaveCount(1);
        await selectBuild(page, 'Production build');
        await expect(headline).toHaveText(headlineOf(published));

        await expect(allCount).toHaveText(String(published));

        // a planning group's number is its page's cards; it is read, so an examples PR edits no line here
        for (const name of ['Scheduler', 'Gantt', 'Task Board']) {
            const count = Number(await counts.nth(GROUPS.indexOf(name)).textContent());

            expect(count, name).toBeGreaterThan(0);
            await expect(page.locator(SIDEBAR).getByRole('link', {
                name : `${name}, ${count} live examples`,
                exact: true
            })).toBeVisible();
            await openGroup(page, name);
            await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount(count)
        }

        await openGroup(page, 'Buttons, Menus & Toolbars');
        await expect(page.locator(CARDS).getByRole('link', {name: 'A toolbar loaded from JSON', exact: true})).toHaveCount(1);

        // Apps shows its own examples and the ones other groups lend it, and its number counts the whole page
        const appsCount = Number(await apps.textContent());
        await openGroup(page, 'Apps');
        await expect(page.locator(PAGE)).toHaveCount(1);
        await expect(page.locator(`${PAGE} .portal-examples-group-heading p`)).toHaveText(new RegExp(`^${appsCount} live examples( · |$)`));
        await expect.poll(async () => {
            const cards = await readList(app, 'apps'),
                  tiles = await readList(app, 'apps', 'tile-list');
            return (cards?.properties.store.count || 0) + (tiles?.properties.store.count || 0)
        }).toBe(appsCount)
    });

    test('the index is a navigation landmark of links: one Tab stop, Enter opens an entry, no entry claims to be a tab', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples`);
        await neuralLink.connectToApp('Portal');

        const nav   = page.getByRole('navigation', {name: 'Example groups'}).locator('visible=true'),
              links = nav.getByRole('link');

        await expect(links).toHaveCount(GROUPS.length + 1);
        await expect(nav.locator('[aria-current="page"]')).toHaveAccessibleName(/^All examples, \d+ live examples?$/);
        await expect(nav.locator('[role="tab"], [aria-selected]')).toHaveCount(0);

        // The open destination's link is the one Tab stop; the arrow keys walk the rest (side nav keys, below)
        await expect(nav.locator('a[href]:not([tabindex="-1"])')).toHaveCount(1);

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
        await expect(button).toHaveText(`All ${GROUPS.length} groups`);
        await button.click();
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('[aria-current="page"]')).toHaveAccessibleName(/^All examples, \d+ live examples?$/);
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

    for (const width of [360, 639]) {
        test(`${width}×800: the phone crumb shares one row with >=180px find field and neither crumb nor hero actions overflow`, async ({page, neuralLink}) => {
            await page.setViewportSize({width, height: 800});
            await page.goto(`${PORTAL}#/examples`);
            await neuralLink.connectToApp('Portal');

            const button = page.locator(`${CRUMB} .portal-examples-group-button`),
                  find   = page.locator(`${CRUMB} .portal-examples-find-field`);

            await expect(button).toHaveText(`All ${GROUPS.length} groups`);
            await expect(find).toBeVisible();

            const geometry = await page.locator(CRUMB).evaluate((crumb, width) => {
                const btn      = crumb.querySelector('.portal-examples-group-button'),
                      btnText  = btn.querySelector('.neo-button-text'),
                      findNode = crumb.querySelector('.portal-examples-find-field'),
                      overview = document.querySelector('.portal-examples-overview'),
                      actions  = overview.querySelector('.portal-examples-overview-actions'),
                      wsLink   = overview.querySelector('[data-ref="overview-action-workstation"]') || actions.lastElementChild,
                      btnRect  = btn.getBoundingClientRect(),
                      findRect = findNode.getBoundingClientRect(),
                      wsRect   = wsLink.getBoundingClientRect();

                return {
                    actionsOverflow: actions.scrollWidth > actions.clientWidth + 1 || wsRect.right > width + 0.5,
                    buttonLabelCut : btnText.scrollWidth > btnText.clientWidth + 1,
                    crumbOverflow  : crumb.scrollWidth > crumb.clientWidth + 1 || findRect.right > width + 0.5,
                    findWidth      : findRect.width,
                    overviewScrollX: overview.scrollWidth > overview.clientWidth + 1,
                    sameCrumbRow   : Math.abs((btnRect.top + btnRect.height / 2) - (findRect.top + findRect.height / 2)) <= 2
                }
            }, width);

            expect(geometry).toMatchObject({
                actionsOverflow: false,
                buttonLabelCut : false,
                crumbOverflow  : false,
                overviewScrollX: false,
                sameCrumbRow   : true
            });
            expect(geometry.findWidth).toBeGreaterThanOrEqual(180)
        })
    }

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

    test('1440×900: the 2 × 2 lead shows its cover whole at 16:9, beside two cards, beside one, and alone (#22049)', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${PORTAL}#/examples/forms`);
        await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Forms & Fields');
        await page.evaluate(() => document.fonts.ready);

        // Two cards beside the lead set its bottom; one card or none leave its second row to the lead
        for (const [group, count] of [['Forms & Fields', 4], ['Containers & Layouts', 2], ['Tabs', 1]]) {
            await openGroup(page, group);
            const cards = await expectCardLayout(page.locator(CARDS), 1440);

            expect(cards.length, `${group} demonstrations`).toBe(count);
            expect(cards[0].isLead, `${group} leads with its first card`).toBe(true)
        }
    });

    test('1440×900 and 1366×768: trailing 3n + 4 cards stay 1 × 1 in column 1 and ArrowDown reaches the final card (#22127)', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${PORTAL}#/examples/apps`);
        const app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Apps');
        // Matching environment hides Portal App (11 -> 10 cards), reproducing live neomjs.com's 3n + 4 row on On Air at Eight
        await selectBuild(page, 'Dev mode');
        await page.evaluate(() => document.fonts.ready);

        const list  = page.locator(CARDS),
              cards = await expectCardLayout(list, 1440),
              last  = cards.at(-1);

        expect(cards.length).toBe(10);
        expect(last.title).toBe('On Air at Eight');
        expect(Math.abs(last.left - cards[0].left), 'trailing card aligns to column 1').toBeLessThan(1.5);
        expect(Math.abs(last.width - cards[1].width), 'trailing card keeps single-column 1×1 width').toBeLessThan(1.5);

        // ArrowDown from column 1 above (Multi-Step Account Form, visible index 6) selects and focuses On Air at Eight (visible index 9)
        const items = list.locator('.neo-list-item:visible');
        await expect(items.nth(6).locator('.neo-title')).toHaveText('Multi-Step Account Form');
        await expect(items.nth(9).locator('.neo-title')).toHaveText('On Air at Eight');
        await items.nth(6).locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await items.nth(6).locator('.neo-title').focus();
        await expect(items.nth(6)).toHaveClass(/\bneo-selected\b/);
        await page.keyboard.press('ArrowDown');
        await expect(items.nth(9)).toHaveClass(/\bneo-selected\b/);
        await expect.poll(() => items.nth(9).evaluate(node => node.contains(document.activeElement))).toBe(true);
        const listState = await readList(app, 'apps');
        expect(listState.properties.catalogMode).toBe('devmode');

        const more = await items.nth(9).evaluate(node => {
            const wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                  band   = node.querySelector('.portal-example-more').getBoundingClientRect();
            return {bandBottom: band.bottom, footerTop: footer.top, height: band.height, ratio: band.height / wrap.height, wrapBottom: wrap.bottom}
        });
        expect(more.height).toBeGreaterThan(20);
        expect(more.ratio, 'selection details stay <= 40% of the 16:9 cover').toBeLessThanOrEqual(0.41);
        expect(more.bandBottom, '.portal-example-more stays inside .preview-image-wrap').toBeLessThanOrEqual(more.wrapBottom + 1);
        expect(more.bandBottom, '.portal-example-more never overlaps .portal-example-footer').toBeLessThanOrEqual(more.footerTop + 1);

        // Return to resting state before checking all 3n + 4 groups at 1440×900 and 1366×768 (1054 px list width -> 2 columns)
        await page.keyboard.press('Escape');
        await expect(list.locator('.neo-list-item.neo-selected')).toHaveCount(0);

        for (const [group, count] of [
            ['Forms & Fields', 4],
            ['Dialogs & Overlays', 4],
            ['Buttons, Menus & Toolbars', 4],
            ['Lists & Galleries', 7],
            ['Scheduler', 13],
            ['Apps', 10]
        ]) {
            await openGroup(page, group);
            const threeCol = await expectCardLayout(list, 1440),
                  tail     = threeCol.at(-1);

            expect(threeCol.length, `${group} 3n + 4 count`).toBe(count);
            expect(Math.abs(tail.left - threeCol[0].left), `${group} trailing card aligns to column 1`).toBeLessThan(1.5);
            expect(Math.abs(tail.width - threeCol[1].width), `${group} trailing card keeps 1×1 width`).toBeLessThan(1.5)
        }

        await page.setViewportSize({width: 1366, height: 768});
        const twoCol = await expectCardLayout(list, 1366);
        expect(twoCol.length).toBe(10);
        expect(twoCol[0].width, '1366×768 keeps two >= 340 px columns on GroupPage').toBeGreaterThanOrEqual(340);
        expect(Math.abs(twoCol[8].top - twoCol[9].top), 'cards 9 and 10 share row 5 in two-column mode').toBeLessThan(1.5);
        expect(Math.abs(twoCol[8].width - twoCol[9].width), 'cards 9 and 10 share equal two-column width').toBeLessThan(1.5)
    });

    for (const [width, height, perRow] of [[1440, 900, 6], [390, 844, 2]]) {
        test(`${width}×${height}: Forms & Fields shows its tiles by name, ${perRow} per row, each a 4:3 crop over its name`, async ({page, neuralLink}) => {
            await page.setViewportSize({width, height});
            await page.goto(`${PORTAL}#/examples/forms`);

            const tiles = page.locator(`${TILES} .neo-list-item`),
                  image = tiles.first().locator('.preview-image');

            // bind once the page shows its tiles: the Store behind them holds the count to show
            await expect(tiles.first()).toBeVisible();
            const app = await neuralLink.connectToApp('Portal');

            await expect(tiles).toHaveCount((await readList(app, 'forms', 'tile-list')).properties.store.count);
            await expect(tiles.first().locator('.neo-title')).toHaveText('Checkbox');
            await expect(tiles.last().locator('.neo-title')).toHaveText('ZIP code field');
            // at rest the caption says the tile opens a running example, through the name's own link
            await expect(tiles.first().locator('.portal-example-open-cue')).toHaveText('');
            await expect(tiles.first().locator('.portal-example-open-cue .fa')).toHaveClass(/fa-arrow-up-right-from-square/);
            await expect(tiles.first().locator('.portal-example-open-cue'))
                .toHaveAttribute('href', await tiles.first().locator('.neo-title').getAttribute('href'));
            // the form app's card stands above the tiles, and a page of both kinds heads each
            await expect(page.locator(`${PAGE} .portal-examples-kind-heading`)).toHaveText(['Demonstrations', 'Field types']);

            const tops = await tiles.evaluateAll(items => items.map(item => Math.round(item.getBoundingClientRect().top)));
            expect(tops.filter(top => top === tops[0])).toHaveLength(perRow);

            await expect(image).toHaveCSS('background-image', /devmode\/tiles\/form-field-checkbox-14\.jpg/);
            const box = await image.boundingBox();
            expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.02)
        })
    }

    test('a page that holds both kinds heads each: More components shows Demonstrations, then Components', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/components`);
        const app   = await neuralLink.connectToApp('Portal'),
              tiles = page.locator(`${TILES} .neo-list-item`);

        await expect(page.locator(`${PAGE} .portal-examples-kind-heading`)).toHaveText(['Demonstrations', 'Components']);
        await expect(page.locator(`${CARDS} .neo-list-item .neo-title`)).toHaveText(['Markdown VDOM', 'Live Preview', 'Liquid Glass effect']);
        // the Store behind the tiles holds the count to show, so a new tile changes only the unit spec's table
        await expect(tiles.first()).toBeVisible();
        await expect(tiles).toHaveCount((await readList(app, 'components', 'tile-list')).properties.store.count)
    });

    test('what the boards cannot show: direct entry, history, the build kept across groups, the scroll of each group', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/forms`);
        const app = await neuralLink.connectToApp('Portal');

        await expect(page.locator(`${PAGE} .portal-examples-group-heading h1`)).toHaveText('Forms & Fields');
        await expect(page.locator(`${TILES} .neo-list-item`)).toHaveCount((await readList(app, 'forms', 'tile-list')).properties.store.count);

        await openGroup(page, 'Grid & Table');
        await selectBuild(page, 'ESM build');
        await page.locator(PAGE).evaluate(node => {node.scrollTop = 600});
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        await openOverview(page);
        await openGroup(page, 'Multi-Window');
        // the build selected on another page holds here
        await expect(page.getByRole('button', {name: /^Examples open in: /}).locator('visible=true')).toHaveText('Examples open in: ESM build');
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
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/bigData/index.html${THEME}`);
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html${THEME}`);

            await openGroup(page, 'Grid & Table');
            await expect(page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}examples/grid/treeBigData/index.html${THEME}`);
            await openGroup(page, 'Multi-Window');
            // the six covered records plus dock-cross-window, dock-tear-out and Email (via alsoIn); the external
            // OffscreenCanvas demo has no ESM destination, so the list's Store holds one card fewer there
            await expect.poll(async () => (await readList(app, 'multi-window')).properties.catalogMode).toBe(mode);
            await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount((await readList(app, 'multi-window')).properties.store.count);
            await expect(page.locator(CARDS).getByRole('link', {name: 'Colors Dashboard', exact: true}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/colors/index.html${THEME}`);
            await openOverview(page)
        }

        // A record without a cover stays in the catalog and gets no card: Calendar shows its covered examples only.
        await openGroup(page, 'Calendar');
        await expect(page.locator(`${CARDS} .neo-list-item`).first()).toBeVisible();
        await expect(page.locator(`${CARDS} .neo-list-item`)).toHaveCount((await readList(app, 'calendar')).properties.store.count);
        await expect(page.locator(CARDS).getByRole('link', {name: 'Studio Bookings', exact: true})).toHaveCount(0);

        for (const [mode, prefix] of [['dist_prod', 'dist/production/'], ['dist_esm', 'dist/esm/'], ['dist_dev', 'dist/development/'], ['devmode', '']]) {
            await page.goto(`${PORTAL}#/examples/${mode}`);
            await expect(page.locator(FEATURED)).toBeVisible();
            await expect(page.locator('.portal-examples-overview:visible').getByRole('link', {name: 'or the Workstation'}))
                .toHaveAttribute('href', `https://neomjs.com/${prefix}apps/workstation/index.html${THEME}`)
        }
    });

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: the Examples sidebar keeps hovered labels and counts readable`, async ({page}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
            await page.goto(`${PORTAL}#/examples`);
            await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

            const sidebar = page.locator(SIDEBAR),
                  trees   = sidebar.getByRole('link', {name: /^Trees, /}),
                  current = sidebar.getByRole('link', {name: /^All examples, \d+ live examples?$/}),
                  paint   = link => link.evaluate(node => {
                      const style = getComputedStyle(node);
                      return {background: style.backgroundColor, marker: style.boxShadow}
                  });

            const resting = await paint(trees);
            await trees.hover();
            await expect.poll(async () => (await paint(trees)).background).not.toBe(resting.background);

            const row = decodePng(await trees.screenshot({animations: 'disabled'})),
                  // Sample the center of the right padding, clear of the count, glyph and rounded corners.
                  pixel  = (Math.floor(row.height / 2) * row.width + row.width - 4) * row.channels,
                  fill   = luminance([...row.pixels.subarray(pixel, pixel + 3)]),
                  labels = trees.locator('.portal-examples-group-index-title, .portal-examples-group-index-count'),
                  colors = await labels.evaluateAll(nodes => nodes.map(node =>
                      getComputedStyle(node).color.match(/[\d.]+/g).map(Number)
                  ));

            expect(colors).toHaveLength(2);
            for (const color of colors) {
                const text = luminance(color);
                expect((Math.max(fill, text) + 0.05) / (Math.min(fill, text) + 0.05)).toBeGreaterThanOrEqual(4.5)
            }

            const selected = await paint(current);
            expect(selected.marker).not.toBe('none');
            await current.hover();
            await expect(current).toHaveAttribute('aria-current', 'page');
            expect(await paint(current)).toEqual(selected);

            await sidebar.getByRole('link', {name: /^Grid & Table, /}).focus();
            await page.keyboard.press('ArrowDown');
            await expect(trees).toBeFocused();
            await expect(trees).toHaveCSS('outline-style', 'solid')
        });

        for (const viewport of [{width: 1440, height: 900}, {width: 375, height: 812}, {width: 390, height: 844}, {width: 844, height: 390}]) {
            test(`${theme} ${viewport.width}px: Start here cards and Grid and Table features are visible and fit their cards`, async ({page, neuralLink}, testInfo) => {
                await page.setViewportSize(viewport);
                await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
                await page.goto(`${PORTAL}#/examples`);
                const app = await neuralLink.connectToApp('Portal');
                await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();

                const featured = page.locator(FEATURED);
                await expect(featured.locator('.neo-list-item').first()).toBeVisible();
                await expect(featured.locator('.neo-list-item')).toHaveCount((await readOverviewList(app)).properties.store.count);
                await page.evaluate(() => document.fonts.ready);
                const startHere = await expectCardLayout(featured, viewport.width);

                if (viewport.width > 600) {
                    // a desktop card never opens its proof line: what rests on the card is all a visitor reads
                    expect(startHere.filter(card => !card.featureWhole).map(card => card.title), 'every Start here proof line reads whole at rest').toEqual([])
                }
                await expect(featured.locator('.neo-title').nth(0)).toHaveText('Workstation');
                await expect(featured.locator('.portal-example-group-badge').nth(0)).toHaveText('Multi-Window');
                await expect(featured.locator('.neo-title').nth(1)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(featured.locator('.portal-example-group-badge').nth(1)).toHaveText('Grid & Table');
                await expect(featured.locator('.neo-multi-window[aria-label="Multi-window live example"]').first().locator('.neo-multi-window-label')).toHaveText('Multi-window');
                await expectCaptionContrast(featured.locator('.portal-example-footer').first(), testInfo, 'start-here-caption-contrast');

                await openGroup(page, 'Grid & Table');
                const overview = page.locator(CARDS),
                      list     = await readList(app, 'grid-table'),
                      // the page's Store lists the covered records, one card each; the catalog keeps the others for their covers
                      cards    = list.properties.store.count;

                await expect(overview.locator('.portal-example-feature')).toHaveCount(cards);
                const columns = await overview.evaluate(node => getComputedStyle(node).gridTemplateColumns.split(' ').length);
                expect(columns).toBe(viewport.width === 1440 ? 3 : 1);
                expect(list.id).toBe(await overview.getAttribute('id'));
                expect(list.properties.store.model.className).toBe('Portal.model.Example');
                await expect(overview.locator('.neo-title').nth(0)).toHaveText('Data Grid: 100k Rows & 200 Columns');
                await expect(overview.locator('.neo-title').nth(1)).toHaveText('TreeGrid - Big Data');
                await expect(overview.locator('.neo-title').nth(2)).toHaveText('GitHub Issues Grid');

                const covered = overview.locator('.portal-example-image-card .portal-example-footer');
                await expect(covered).toHaveCount(cards);
                await expect(overview.locator('.portal-example-placeholder')).toHaveCount(0);

                const issues = overview.locator('.neo-list-item').filter({hasText: 'GitHub Issues Grid'});
                await expect(issues.locator('.portal-example-feature')).toHaveText('Searchable issue snapshot with wrapped rows');
                expect(await issues.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage))
                    .toContain(theme === 'neo-theme-neo-light' ? 'grid-issues-14-light.jpg' : 'grid-issues-14.jpg');

                const geometry = await expectCardLayout(overview, viewport.width);
                await expectCaptionContrast(covered.nth(2), testInfo, 'issues-caption-contrast');
                // Table Filtering has a white cover: the footer rail and selected band stay legible across both themes.
                await expectCaptionContrast(covered.nth(4), testInfo, 'light-cover-caption-contrast');
                await testInfo.attach('card-geometry', {body: JSON.stringify(geometry), contentType: 'application/json'});
                expect(await page.locator(PAGE).evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
                await page.screenshot({path: testInfo.outputPath(`grid-page-${viewport.width}.png`)});

                /**
                 * @summary Reads the Issues card geometry across hover and selection.
                 * @returns {Promise<Object>}
                 */
                const opened = () => issues.evaluate(node => {
                    const card   = node.getBoundingClientRect(),
                          wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                          footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                          more   = node.querySelector('.portal-example-more').getBoundingClientRect(),
                          box    = selector => node.querySelector(selector).getBoundingClientRect(),
                          inside = rect => rect.height > 0 && rect.top >= card.top - 1 && rect.bottom <= card.bottom + 1;

                    return {
                        height     : card.height,
                        moreHeight : more.height,
                        moreRatio  : more.height / wrap.height,
                        moreInCover: more.height > 0 && more.bottom <= wrap.bottom + 1.5 && more.top >= wrap.top - 1,
                        moreBelow  : more.height > 0 && more.top >= footer.bottom - 1.5,
                        action     : inside(box('.portal-example-look-for')),
                        scope      : inside(box('.portal-example-scope')),
                        source     : inside(box('.neo-github-image')),
                        title      : inside(box('.neo-title'))
                    }
                });
                const restHeight = geometry.find(card => card.title === 'GitHub Issues Grid').height;

                if (columns > 1) {
                    // Hover applies the chromatic blue wash without opening .portal-example-more; clicking selects and opens <= 40 % inside the cover frame.
                    await issues.hover();
                    expect((await opened()).moreHeight).toBeLessThan(1);
                    await issues.locator('.preview-image-wrap').click({position: {x: 24, y: 20}});
                    await expect(issues).toHaveClass(/neo-selected/);
                    await expect.poll(async () => (await opened()).action).toBe(true);
                    const state = await opened();
                    expect(Math.abs(state.height - restHeight)).toBeLessThan(1);
                    expect(state.moreInCover).toBe(true);
                    expect(state.moreRatio).toBeLessThanOrEqual(0.4 + 0.01);
                    expect(state.scope && state.source && state.title).toBe(true);
                    await expect(issues.locator('.portal-example-scope')).toContainText('public issue snapshot');
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                } else {
                    // Single-column (< 704 px list width, including 844 px sidebar 1-col and phones): selected details open in-flow below the footer.
                    await issues.locator('.preview-image-wrap').click({position: {x: 24, y: 20}});
                    await expect(issues).toHaveClass(/neo-selected/);
                    await expect.poll(async () => {
                        const s = await opened();
                        return s.moreBelow && s.action && s.scope && s.source && s.title && s.height > restHeight
                    }).toBe(true);
                    await issues.screenshot({path: testInfo.outputPath(`issues-card-open-${viewport.width}.png`)})
                }

                // A stable string identity also survives the lazy-cover path when scrolled into view.
                const tableLink = overview.getByRole('link', {name: 'When to Use a Table', exact: true});
                await tableLink.scrollIntoViewIfNeeded();
                await expect(tableLink).toBeVisible()
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
            `${baseURL}/dist/production/apps/workstation/index.html${THEME}`);

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const devList = await readList(app, 'multi-window');
        await app.setProperties(devList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(devList.id, 'createItems');
        await page.locator(CARDS).getByRole('link', {name: 'Workstation', exact: true}).click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();
        await expect(page.locator('.neo-dock-workspace')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        const gridList = await readList(app, 'grid-table');
        await expect(page.locator(`${CARDS} .portal-example-feature`)).toHaveCount(gridList.properties.store.count);
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        const gridPopup = context.waitForEvent('page');
        await page.locator(CARDS).getByRole('link', {name: 'TreeGrid - Big Data', exact: true}).click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index.html\?theme=neo-theme-neo-dark$/);
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

        await expect(workstationCue).toHaveAttribute('href', `${baseURL}/dist/production/apps/workstation/index.html${THEME}`);
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

        await expect(devCue).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html${THEME}`);
        await expect(devCue).not.toHaveAttribute('target', /_blank/);
        await devCue.click();
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Multi-Window');
        const enterList = await readList(app, 'multi-window');
        await app.setProperties(enterList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(enterList.id, 'createItems');

        const enterTitle = page.locator(`${CARDS} .neo-list-item`, {hasText: 'Workstation'}).locator('.neo-title');
        await expect(enterTitle).toHaveAttribute('href', `${baseURL}/apps/workstation/index.html${THEME}`);
        await enterTitle.focus();
        await expect(enterTitle).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible();

        // Single-window example keeps target="_blank" when clicking the cue in devmode
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await openGroup(page, 'Grid & Table');
        const gridList = await readList(app, 'grid-table');
        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');

        const treeCue = page.locator(`${CARDS} .neo-list-item`, {hasText: 'TreeGrid - Big Data'}).locator('.portal-example-open-cue');
        await expect(treeCue).toHaveAttribute('href', `${baseURL}/examples/grid/treeBigData/index.html${THEME}`);
        await expect(treeCue).toHaveAttribute('target', '_blank');
        const gridPopup = context.waitForEvent('page');
        await treeCue.click();
        const grid = await gridPopup;
        await expect(grid).toHaveURL(/\/examples\/grid\/treeBigData\/index\.html\?theme=neo-theme-neo-dark$/);
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
        await expect(touchedGrid).toHaveURL(/\/examples\/grid\/bigData\/index\.html\?theme=neo-theme-neo-dark$/);
        await touchedGrid.close();

        const wsCard = touchPage.locator(`${FEATURED} .neo-list-item`, {hasText: 'Workstation'});
        await wsCard.scrollIntoViewIfNeeded();
        await wsCard.locator('.portal-example-open-cue').tap();
        await expect(touchPage).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await touchContext.close()
    });

    test('find filters across all groups live, focuses on slash, dims zero-match groups, and Escape restores the open page without history churn', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${PORTAL}#/examples/grid`);
        const app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Grid & Table');

        const initialHistoryLength = await page.evaluate(() => window.history.length),
              sidebarInput         = page.locator('.portal-examples-sidebar:visible .portal-examples-find-field input'),
              results              = page.locator('.portal-examples-search-results:visible');

        await page.keyboard.press('/');
        await expect(sidebarInput).toBeFocused();

        await page.keyboard.type('drag');
        await expect(results.getByRole('heading', {level: 1})).toContainText('matching examples');

        const [mainState] = await app.queryComponent({className: 'Portal.view.examples.MainContainer'}, ['id', 'findQuery', 'catalogMode']);
        expect(mainState.properties.findQuery).toBe('drag');

        // Every Drag & Drop example matches "drag" through its group's title, so the count is the group's size
        const dragDrop = groupSize('drag-drop', mainState.properties.catalogMode);
        expect(dragDrop, 'the Drag & Drop group lists examples').toBeGreaterThan(0);

        await expect(results.getByRole('link', {name: 'Sprint Board', exact: true})).toBeVisible();
        await expect(page.locator(SIDEBAR).getByRole('link', {name: `Drag & Drop, ${dragDrop} matching examples`, exact: true})).toBeVisible();
        // its matches are all borrowed, and like outside a filter its number counts what its page shows
        await expect(page.locator(SIDEBAR).getByRole('link', {name: `Drag & Drop, ${dragDrop} matching examples`, exact: true})
            .locator('.portal-examples-group-index-count')).toHaveText(String(dragDrop));
        // the line under the list explains the catalog's sums; a filter shows matches, so it stays out
        await expect(page.locator(`${SIDEBAR} .portal-examples-group-index-note`)).toHaveCount(0);
        await expect(page.locator(`${SIDEBAR} li.portal-examples-group-index-zero`).filter({hasText: 'Calendar'})).toBeVisible();
        await expect(page).toHaveURL(/#\/examples\/grid$/);
        expect(await page.evaluate(() => window.history.length)).toBe(initialHistoryLength);

        await sidebarInput.fill('date');
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Calendar', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Studio Bookings', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Community Garden Plan', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-tiles').getByRole('link', {name: 'Date field', exact: true})).toBeVisible();

        await sidebarInput.press('Escape');
        await expectOpenPage(page, 'Grid & Table');
        await expect(sidebarInput).not.toBeFocused();

        const [clearedState] = await app.queryComponent({className: 'Portal.view.examples.MainContainer'}, ['findQuery']);
        expect(clearedState.properties.findQuery).toBe('');

        await page.setViewportSize({width: 390, height: 844});
        const mobileInput = page.locator(`${CRUMB} .portal-examples-find-field input`);
        await expect(mobileInput).toBeVisible();
        await mobileInput.fill('drag');
        await expect(results.getByRole('link', {name: 'Sprint Board', exact: true})).toBeVisible();
        await results.getByRole('button', {name: 'Clear (Esc)'}).click();
        await expectOpenPage(page, 'Grid & Table')
    });

    test('cards keep pointer and selection feedback distinct and preserve launch hitboxes and row navigation (#21676)', async ({page, neuralLink, context, baseURL}) => {
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.setViewportSize({width: 1440, height: 1080});
        await page.goto(`${PORTAL}#/examples/grid`);
        const app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Grid & Table');

        const gridList = await readList(app, 'grid-table'),
              cards    = page.locator(`${CARDS} .neo-list-item`),
              card0    = cards.nth(0),
              card1    = cards.nth(1),
              card3    = cards.nth(3);

        await app.setProperties(gridList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(gridList.id, 'createItems');
        await expect(card0.locator('.portal-example-open-cue')).toHaveAttribute('href', new RegExp(`^${baseURL}`));

        await expect(card0.locator('.preview-image')).toHaveCSS('background-position', '0% 0%');
        await expect(card1.locator('.preview-image')).toHaveCSS('background-position', '0% 0%');

        // AC-4: zero browser lists anywhere; Grid Big Data shows Mobile without Multi-window
        await expect(page.locator(CARDS).filter({hasText: 'Chrome, Edge, Firefox, Safari'})).toHaveCount(0);
        await expect(card0.locator('.portal-example-mobile')).toHaveText('Mobile');
        await expect(card0.locator('.neo-multi-window')).toHaveCount(0);

        // AC-1: the pointer light and the persistent selection ring combine independently.
        await page.mouse.move(0, 0);
        const readPaint = locator => locator.evaluate(node => {
            const card = getComputedStyle(node),
                  ring = getComputedStyle(node, '::before'),
                  edge = getComputedStyle(node, '::after'),
                  cue  = getComputedStyle(node.querySelector('.portal-example-open-cue'));

            return {
                cueBorder   : cue.borderTopColor,
                cueFill     : cue.backgroundImage,
                edgeOpacity : edge.opacity,
                hoverLight  : card.getPropertyValue('--portal-examples-list-light-hover').trim(),
                ringLead    : ring.getPropertyValue('--portal-examples-list-ring-lead').trim(),
                ringProgress: parseFloat(ring.getPropertyValue('--portal-examples-list-ring-progress')),
                selectLight : card.getPropertyValue('--portal-examples-list-light-select').trim()
            }
        });

        const rest = await readPaint(card0);
        expect(rest.ringProgress).toBe(0);
        expect(rest.edgeOpacity).toBe('0');

        // AC-2: bottom-entry hover onto Open live ↗ moves Title, GitHub, and Open live ↗ by 0.0 px
        const measureRects = async () => ({
            card0Cue   : await card0.locator('.portal-example-open-cue').boundingBox(),
            card0GitHub: await card0.locator('.neo-github-image').boundingBox(),
            card0Title : await card0.locator('.neo-title').boundingBox(),
            card3Cue   : await card3.locator('.portal-example-open-cue').boundingBox(),
            scrollTop  : await page.locator(PAGE).evaluate(node => node.scrollTop)
        });
        await page.evaluate(() => document.fonts.ready);
        const beforeHover = await measureRects();

        // Enter from below card0 straight onto Open live ↗ center
        await page.mouse.move(beforeHover.card0Cue.x + beforeHover.card0Cue.width / 2, beforeHover.card0Cue.y + beforeHover.card0Cue.height + 8);
        await page.mouse.move(beforeHover.card0Cue.x + beforeHover.card0Cue.width / 2, beforeHover.card0Cue.y + beforeHover.card0Cue.height / 2);

        const hover      = await readPaint(card0),
              afterHover = await measureRects();

        expect(hover.hoverLight).not.toBe(rest.hoverLight);
        expect(hover.selectLight).toBe(rest.selectLight);
        expect(hover.ringProgress).toBe(0);
        expect(hover.edgeOpacity).toBe('1');
        expect(hover.cueFill).not.toBe(rest.cueFill);
        for (const key of ['card0Cue', 'card0GitHub', 'card0Title', 'card3Cue']) {
            expect(Math.abs(afterHover[key].x - beforeHover[key].x), `${key}.x on hover`).toBe(0);
            expect(Math.abs(afterHover[key].y - beforeHover[key].y), `${key}.y on hover`).toBe(0)
        }

        await card0.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(card0).toHaveClass(/neo-selected/);
        const both = await readPaint(card0);

        await page.mouse.move(0, 0);
        const selected       = await readPaint(card0),
              afterSelectRow = await measureRects();

        expect(selected.hoverLight).toBe(rest.hoverLight);
        expect(selected.selectLight).not.toBe(rest.selectLight);
        expect(selected.ringProgress).toBeGreaterThanOrEqual(100);
        expect(selected.edgeOpacity).toBe('0');
        expect(selected.cueBorder).not.toBe(rest.cueBorder);
        expect(both.hoverLight).toBe(hover.hoverLight);
        expect(both.selectLight).toBe(selected.selectLight);
        expect(both.ringProgress).toBe(selected.ringProgress);
        expect(both.ringLead).not.toBe(selected.ringLead);
        expect(both.cueFill).not.toBe(hover.cueFill);

        for (const key of ['card0Cue', 'card0GitHub', 'card0Title', 'card3Cue']) {
            expect(Math.abs(afterSelectRow[key].x - beforeHover[key].x), `${key}.x on select`).toBe(0);
            expect(Math.abs(afterSelectRow[key].y - beforeHover[key].y), `${key}.y on select`).toBe(0)
        }

        // AC-3: In multi-column (>= 704 px), .portal-example-more anchors inside .preview-image-wrap (<= 40 % height) and never overlaps .portal-example-footer
        const bandBounds = await card0.evaluate(node => {
            const wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                  more   = node.querySelector('.portal-example-more').getBoundingClientRect();
            return {footerTop: footer.top, moreBottom: more.bottom, moreHeight: more.height, wrapBottom: wrap.bottom, wrapHeight: wrap.height}
        });
        expect(bandBounds.moreHeight).toBeGreaterThan(20);
        expect(bandBounds.moreHeight).toBeLessThanOrEqual(bandBounds.wrapHeight * 0.40 + 1);
        expect(bandBounds.moreBottom, '.portal-example-more stays inside .preview-image-wrap').toBeLessThanOrEqual(bandBounds.wrapBottom + 1);
        expect(bandBounds.moreBottom, '.portal-example-more never overlaps .portal-example-footer').toBeLessThanOrEqual(bandBounds.footerTop + 1);

        // Neighbor hit-owner control: 25 px into row 2 card3's cover belongs to card3, never card0's disclosure band
        const hitOwnerMatchesRow2 = await card3.evaluate(node => {
            const cover = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  hit   = document.elementFromPoint(cover.left + cover.width / 2, cover.top + 25);
            return node.contains(hit)
        });
        expect(hitOwnerMatchesRow2, 'point 25 px into row 2 cover hits row 2 card').toBe(true);

        // Cross-row selection transfer (card0 -> card3) keeps card3's Open live ↗ at 0.0 px displacement
        await card3.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(card3).toHaveClass(/neo-selected/);
        await expect(card0).not.toHaveClass(/neo-selected/);
        const afterCrossRow = await measureRects();
        expect(Math.abs(afterCrossRow.card3Cue.y - beforeHover.card3Cue.y)).toBe(0);

        // AC-5: With card3 selected, clicking card1's Open live ↗ launches once and leaves card3 selected; zero focusables in .portal-example-more
        const focusablesInMore = await card3.locator('.portal-example-more a, .portal-example-more button, .portal-example-more input, .portal-example-more [tabindex]').count();
        expect(focusablesInMore).toBe(0);

        await context.route('**/examples/grid/treeBigData/index.html', route => route.fulfill({status: 200, contentType: 'text/html', body: '<title>TreeGrid</title>'}));
        const popupPromise = context.waitForEvent('page');
        await card1.locator('.portal-example-open-cue').click();
        const popup = await popupPromise;
        await popup.close();
        await expect(card3).toHaveClass(/neo-selected/);
        await expect(card1).not.toHaveClass(/neo-selected/);

        // Escape clears selection
        await card3.locator('.neo-title').focus();
        await page.keyboard.press('Escape');
        await expect(page.locator(`${CARDS} .neo-list-item.neo-selected`)).toHaveCount(0);

        // AC-5: ArrowDown at 1440 crosses a 3-column row (card0 -> card3) and keeps focus + selection on card3
        await card0.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await card0.locator('.neo-title').focus();
        await page.keyboard.press('ArrowDown');
        await expect(card3).toHaveClass(/neo-selected/);
        await expect.poll(() => card3.evaluate(node => node.contains(document.activeElement))).toBe(true);
        await expect.poll(() => card3.evaluate(node => {
            const probe = document.createElement('span');
            probe.style.color = 'var(--portal-examples-list-focus)';
            node.append(probe);
            const neutral = getComputedStyle(probe).color;
            probe.remove();
            return getComputedStyle(node).boxShadow.includes(`${neutral} 0px 0px 0px 4px`)
        }), 'keyboard focus paints a separate neutral ring on the selected card').toBe(true);

        // 900x800 sidebar 1-column (< 704 px list content width): details open below footer and ArrowDown steps +1 (card0 -> card1)
        await page.setViewportSize({width: 900, height: 800});
        await card0.scrollIntoViewIfNeeded();
        await card0.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(card0).toHaveClass(/neo-selected/);
        const oneColMoreBelow = await card0.evaluate(node => {
            const footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                  more   = node.querySelector('.portal-example-more').getBoundingClientRect();
            return more.height > 0 && more.top >= footer.bottom - 1.5
        });
        expect(oneColMoreBelow).toBe(true);
        await card0.locator('.neo-title').focus();
        await page.keyboard.press('ArrowDown');
        await expect(card1).toHaveClass(/neo-selected/);

        // At the two-column boundary, a card with look-for and scope text still shows its whole Mobile badge.
        await page.setViewportSize({width: 1016, height: 900});
        const issuesCard = cards.filter({has: page.getByRole('link', {name: 'GitHub Issues Grid', exact: true})});
        await issuesCard.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(issuesCard).toHaveClass(/neo-selected/);
        const mobileBounds = await issuesCard.evaluate(node => {
            const chip  = node.querySelector('.portal-example-mobile').getBoundingClientRect(),
                  inner = node.querySelector('.portal-example-more-inner').getBoundingClientRect();
            return {chipBottom: chip.bottom, chipHeight: chip.height, innerBottom: inner.bottom}
        });
        expect(mobileBounds.chipHeight).toBeGreaterThan(0);
        expect(mobileBounds.chipBottom).toBeLessThanOrEqual(mobileBounds.innerBottom);

        // Featured 2x2 leadCard at 1440x900: Workstation has Multi-window without Mobile, and ArrowDown from 2x2 card0 crosses two rows to card3
        await page.setViewportSize({width: 1440, height: 900});
        await openOverview(page);
        const featCards = page.locator(`${FEATURED} .neo-list-item`);
        await expect(featCards.nth(0).locator('.neo-multi-window')).toBeVisible();
        await expect(featCards.nth(0).locator('.portal-example-mobile')).toHaveCount(0);
        await featCards.nth(0).locator('.preview-image-wrap').click({position: {x: 40, y: 40}});
        await featCards.nth(0).locator('.neo-title').focus();
        await page.keyboard.press('ArrowDown');
        await expect(featCards.nth(3)).toHaveClass(/neo-selected/)
    })
});

const MATCHES = '.portal-examples-search-groups:visible .neo-list-item';

/**
 * @summary A group's link in the desktop side nav, by the title its accessible name starts with.
 * @param {Object} page
 * @param {String} name
 * @returns {Object} The locator
 */
const groupLink = (page, name) => page.locator(SIDEBAR).getByRole('link', {name: new RegExp(`^${name}, `)});

/**
 * @param {Object} page
 * @returns {Object} The side nav's `"All examples"` link
 */
const allLink = page => page.locator(SIDEBAR).getByRole('link', {name: /^All examples\b/});

/**
 * @param {Object} page
 * @returns {Promise<Number>} The browser history's length
 */
const historyLength = page => page.evaluate(() => history.length);

test.describe('Portal examples side nav keys (#22061)', () => {
    test.use({viewport: {width: 1440, height: 900}});

    test('the arrow keys walk the side nav, the page follows the link focus rests on, and one Back returns to where the walk started', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const nav       = page.locator(SIDEBAR),
              scheduler = groupLink(page, 'Scheduler'),
              bands     = nav.locator('section'),
              last      = nav.getByRole('link').last();

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        const before = await historyLength(page);

        await scheduler.focus();
        await page.keyboard.press('ArrowDown');
        await expect(groupLink(page, 'Gantt')).toBeFocused();
        await expectOpenPage(page, 'Gantt');
        await expect(groupLink(page, 'Gantt')).toHaveAttribute('aria-current', 'page');
        await expect(nav, 'focus moves to real links, so the landmark names no active descendant').not.toHaveAttribute('aria-activedescendant');

        await page.keyboard.press('ArrowUp');
        await expect(scheduler).toBeFocused();
        await expectOpenPage(page, 'Scheduler');

        // A band heading takes no stop: the last link of a band steps to the first link of the next
        await bands.nth(0).getByRole('link').last().focus();
        await page.keyboard.press('ArrowDown');
        await expect(bands.nth(1).getByRole('link').first()).toBeFocused();

        await page.keyboard.press('End');
        await expect(last).toBeFocused();
        await expect(page).toHaveURL(new RegExp(`${await last.getAttribute('href')}$`));
        await page.keyboard.press('ArrowDown');
        await expect(last, 'the walk does not wrap').toBeFocused();

        await page.keyboard.press('Home');
        await expect(allLink(page)).toBeFocused();
        await expect(page.locator(`${FEATURED} .neo-list-item`).first()).toBeVisible();
        await expect(page).toHaveURL(/#\/examples$/);

        expect(await historyLength(page), 'one history entry for the whole walk').toBe(before + 1);
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(/#\/examples\/scheduler$/);
        await expectOpenPage(page, 'Scheduler')
    });

    test('a held arrow opens only the group focus rests on', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const scheduler = groupLink(page, 'Scheduler');

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        const before = await historyLength(page);

        await scheduler.focus();
        for (let press = 0; press < 3; press++) {
            await page.keyboard.down('ArrowDown')
        }

        await expect(groupLink(page, 'Dashboard & Docking')).toBeFocused();
        await expect(page, 'nothing opens while the key is held').toHaveURL(/#\/examples\/scheduler$/);

        await page.keyboard.up('ArrowDown');
        await expectOpenPage(page, 'Dashboard & Docking');
        expect(await historyLength(page)).toBe(before + 1)
    });

    test('the side nav is one Tab stop, the open group\'s link: Tab leaves for the content and Shift+Tab comes back', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const nav       = page.locator(SIDEBAR),
              scheduler = groupLink(page, 'Scheduler');

        await expect(scheduler).toHaveAttribute('aria-current', 'page');
        await expect(nav.locator('a[href]:not([tabindex="-1"])')).toHaveCount(1);

        await scheduler.focus();
        await page.keyboard.press('Tab');
        await expect(nav.locator(':focus')).toHaveCount(0);
        await expect(page.locator(`${PAGE} :focus`)).toHaveCount(1);

        await page.keyboard.press('Shift+Tab');
        await expect(scheduler).toBeFocused()
    });

    test('ArrowRight enters the cards at the selected card, or else the first, and ArrowLeft on the first card returns to the side nav', async ({page}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);

        const scheduler = groupLink(page, 'Scheduler'),
              cards     = page.locator(`${CARDS} .neo-list-item`);

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        await scheduler.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await expect(cards.first()).toHaveClass(/\bneo-selected\b/);

        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(cards.first(), 'ArrowLeft on another card steps back one card').toBeFocused();

        await page.keyboard.press('ArrowLeft');
        await expect(scheduler).toBeFocused();
        await expect(cards.first(), 'the card keeps its selection').toHaveClass(/\bneo-selected\b/);
        await expect(page).toHaveURL(/#\/examples\/scheduler$/);

        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toHaveClass(/\bneo-selected\b/);

        await scheduler.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1), 'the selected card is the way back in').toBeFocused()
    });

    test('on All examples and under a filter ArrowRight enters what the stage shows, and Tab into the side nav keeps the filter', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);

        const all  = allLink(page),
              find = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples');

        await expect(all).toHaveAttribute('aria-current', 'page');
        await all.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`${FEATURED} .neo-list-item`).first()).toBeFocused();

        await find.fill('grid');
        await expect(page.locator(MATCHES).first()).toBeVisible();
        await page.keyboard.press('Tab');
        await expect(all).toBeFocused();
        await expect(find, 'focus arriving by Tab opens nothing').toHaveValue('grid');

        await page.keyboard.press('ArrowRight');
        await expect(page.locator(MATCHES).first()).toBeFocused();
        await page.keyboard.press('ArrowLeft');
        await expect(all).toBeFocused();

        // A walk opens the group it rests on, as a click on its link does, and that ends the filter
        await page.keyboard.press('ArrowDown');
        await expect(find).toHaveValue('');
        await expectOpenPage(page, 'Apps')
    });
});

test.describe('Portal examples phone index keys (#22061)', () => {
    test.use({viewport: {width: 390, height: 844}});

    test('390 × 844: the overview index and the sheet keep every link in the tab order', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);

        await expect(page.locator(MOBILE_IX).getByRole('link').first()).toBeVisible();
        await expect(page.locator(`${MOBILE_IX} a[tabindex="-1"]`)).toHaveCount(0);

        await page.goto(`${PORTAL}#/examples/scheduler`);
        await page.locator(`${CRUMB} .portal-examples-group-button`).click();
        await expect(page.locator(SHEET)).toBeVisible();
        await expect(page.locator(`${SHEET} a`).first()).toBeVisible();
        await expect(page.locator(`${SHEET} a[tabindex="-1"]`)).toHaveCount(0)
    });
});
