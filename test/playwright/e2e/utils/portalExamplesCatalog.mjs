import fs          from 'node:fs';
import {expect}    from '../../fixtures.mjs';
import {decodePng} from './pngPixels.mjs';

/**
 * @module e2e/utils/portalExamplesCatalog
 * @summary Shared catalog readers, route helpers, card-geometry guards, contrast checks and keyboard-walk utilities
 * for the Portal Examples catalog E2E suite (`ExamplesCatalogNL`, `ExamplesCatalogLaunchNL`, `ExamplesCatalogKeysNL`).
 */

export const CATALOG = new URL('../../../../apps/portal/resources/data/examples/', import.meta.url);

/**
 * @summary Counts the records a group's page lists in a build mode, its own and the ones it borrows through
 * `alsoIn`, by the rule `Portal.model.Example.publishes` applies, so a pin follows the catalog's group files.
 * @param {String} family
 * @param {String} mode
 * @returns {Number}
 */
export const groupSize = (family, mode) => fs.readdirSync(CATALOG)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .flatMap(file => JSON.parse(fs.readFileSync(new URL(file, CATALOG), 'utf8')))
    .filter(record => (record.family === family || record.alsoIn?.includes(family)) &&
        !!record.image && !record.hidden && !record.hiddenIn?.includes(mode) && !!record.urls?.[mode])
    .length;

/**
 * @summary Returns every published record marked `Mobile` in `environments` for the given build mode.
 * @param {String} mode
 * @returns {Object[]}
 */
export const mobilePublished = mode => fs.readdirSync(CATALOG)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .flatMap(file => JSON.parse(fs.readFileSync(new URL(file, CATALOG), 'utf8')))
    .filter(record => record.environments?.includes('Mobile') &&
        !!record.image && !record.hidden && !record.hiddenIn?.includes(mode) && !!record.urls?.[mode]);

export const PORTAL    = '/apps/portal/index.html',
             SIDEBAR   = '.portal-examples-sidebar:visible nav.portal-examples-group-index-list',
             MOBILE_IX = '.portal-examples-overview:visible nav.portal-examples-group-index-overview',
             CRUMB     = '.portal-examples-main-container > .portal-examples-group-crumb:visible',
             SHEET     = '.portal-examples-main-container .portal-examples-group-index-sheet',
             PAGE      = '.portal-examples-group-page:visible',
             CARDS     = `${PAGE} .portal-examples-list:not(.portal-examples-tiles)`,
             TILES     = `${PAGE} .portal-examples-tiles`,
             FEATURED  = '.portal-examples-overview:visible .portal-examples-overview-cards',
             MATCHES   = '.portal-examples-search-groups:visible .neo-list-item',
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
export async function readList(app, family, reference='group-list') {
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
export async function readOverviewList(app) {
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
export async function expectOpenPage(page, name) {
    await expect(page.locator(PAGE).filter({has: page.getByRole('heading', {level: 1, name, exact: true})})).toBeVisible();
    await expect(page.locator(PAGE)).toHaveCount(1)
}

/**
 * @summary Returns to the overview through the header's Examples link, and waits until no group page shows.
 * @param {Object} page The test page.
 * @returns {Promise<void>}
 */
export async function openOverview(page) {
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
export async function openGroup(page, name) {
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
export async function selectBuild(page, label) {
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
export async function readDesktopPage(page) {
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
export async function expectCardLayout(list, width) {
    await list.page().mouse.move(0, 0);
    await list.page().evaluate(() => document.activeElement?.blur());
    await expect.poll(() => list.evaluate(node => {
        const ul        = node.matches('.portal-examples-list') ? node : node.querySelector('.portal-examples-list'),
              style     = getComputedStyle(ul),
              listWidth = ul.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
              leadCard  = ul.classList.contains('portal-examples-list-lead') && listWidth >= 1100,
              listItems = [...ul.querySelectorAll('.neo-list-item')].filter(item => item.offsetWidth);

        return listItems.every((item, index) => {
            const h = item.querySelector('.portal-example-more')?.getBoundingClientRect().height || 0;
            return leadCard && index === 0 ? h > 20 : h < 1
        })
    })).toBe(true);

    const gridInfo = await list.evaluate(node => {
        const ul    = node.matches('.portal-examples-list') ? node : node.querySelector('.portal-examples-list'),
              style = getComputedStyle(ul);

        return {
            columns  : style.gridTemplateColumns.split(' ').length,
            leadCard : ul.classList.contains('portal-examples-list-lead'),
            listWidth: ul.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
        }
    });

    const cards = await list.locator('.neo-list-item').evaluateAll((nodes, {columns, leadCard, listWidth}) => nodes.filter(node => node.offsetWidth).map((node, index) => {
        const card     = node.getBoundingClientRect(),
              wrap     = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
              caption  = node.querySelector('.portal-example-footer'),
              copy     = caption.getBoundingClientRect(),
              image    = node.querySelector('.preview-image').getBoundingClientRect(),
              feature  = node.querySelector('.portal-example-feature'),
              more     = node.querySelector('.portal-example-more'),
              moreRect = more?.getBoundingClientRect(),
              isLead   = leadCard && listWidth >= 1100 && index === 0,
              shown    = [
                  node.querySelector('.portal-example-group-badge'),
                  node.querySelector('.neo-title'),
                  node.querySelector('.neo-github-image'),
                  node.querySelector('.portal-example-open-cue'),
                  node.querySelector('.portal-example-feature')
              ].filter(el => el && el.offsetWidth > 0),
              texts    = [...caption.querySelectorAll('*')];

        return {
            title     : node.querySelector('.neo-title').textContent,
            left      : card.left,
            width     : card.width,
            top       : card.top,
            bottom    : card.bottom,
            height    : card.height,
            isLead,
            coverRatio: wrap.width / wrap.height,
            clearCover: ((isLead && moreRect ? Math.min(copy.top, moreRect.top) : copy.top) - wrap.top) / wrap.height,
            coverFills: ['left', 'right', 'top', 'bottom'].every(side => Math.abs(image[side] - wrap[side]) < 1.5),
            docked    : isLead
                ? Math.abs(copy.left - card.left) < 1.5 && Math.abs(copy.right - card.right) < 1.5 &&
                  copy.top >= wrap.bottom - 1.5 && moreRect && Math.abs(moreRect.left - card.left) < 1.5 &&
                  Math.abs(moreRect.right - card.right) < 1.5 && moreRect.top >= copy.bottom - 1.5 &&
                  Math.abs(moreRect.bottom - card.bottom) < 1.5
                : Math.abs(copy.left - card.left) < 1.5 && Math.abs(copy.right - card.right) < 1.5 &&
                  Math.abs(copy.bottom - card.bottom) < 1.5 && copy.top >= wrap.bottom - 1.5,
            fits      : caption.scrollHeight <= caption.clientHeight + 1 && caption.scrollWidth <= caption.clientWidth + 1 &&
                        (!isLead || !more || (more.scrollHeight <= more.clientHeight + 1 && more.scrollWidth <= more.clientWidth + 1)),
            textFits  : shown.every(text => {
                const rect = text.getBoundingClientRect();
                return rect.left >= copy.left - 1 && rect.right <= copy.right + 1 && rect.top >= copy.top - 1 && rect.bottom <= copy.bottom + 1
            }),
            closed      : isLead ? Boolean(moreRect && moreRect.height > 20) : (!more || moreRect.height < 1),
            opaque      : [node, caption, ...(isLead && more ? [more] : []), ...texts].every(text => getComputedStyle(text).opacity === '1'),
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
export function luminance(color) {
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
export async function expectCaptionContrast(caption, testInfo, name) {
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
 * @summary A group's link in the desktop side nav, by the title its accessible name starts with.
 * @param {Object} page
 * @param {String} name
 * @returns {Object} The locator
 */
export const groupLink = (page, name) => page.locator(SIDEBAR).getByRole('link', {name: new RegExp(`^${name}, `)});

/**
 * @param {Object} page
 * @returns {Object} The side nav's `"Start here"` link
 */
export const startLink = page => page.locator(SIDEBAR).getByRole('link', {name: /^Start here\b/});

/**
 * @param {Object} page
 * @returns {Promise<Number>} The browser history's length
 */
export const historyLength = page => page.evaluate(() => history.length);

/**
 * @summary The id of the list that holds the focused card or tile, or null.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<String|null>}
 */
export const focusedListId = page => page.evaluate(() => document.activeElement?.closest('.portal-examples-list')?.id || null);

/**
 * @summary Presses a key and waits until focus moves. A row step lands after a worker round trip; at an edge nothing
 * moves, so the wait ends quietly after a second.
 * @param {import('@playwright/test').Page} page
 * @param {String} key
 * @returns {Promise<void>}
 */
export async function pressAndSettle(page, key) {
    const focusedId = () => page.evaluate(() => document.activeElement?.id || null),
          before    = await focusedId();

    await page.keyboard.press(key);
    await expect.poll(focusedId, {timeout: 1000}).not.toBe(before).catch(() => {})
}

/**
 * @summary Steps down row by row while focus stays in the given list, at most `max` presses: rows differ per layout, so
 * the walk reads the page instead of counting presses. Resolves the list that holds focus at the end.
 * @param {import('@playwright/test').Page} page
 * @param {String} listId
 * @param {Number} [max=12]
 * @returns {Promise<String|null>}
 */
export async function walkDownOutOf(page, listId, max=12) {
    for (let press = 0; press < max && await focusedListId(page) === listId; press++) {
        await pressAndSettle(page, 'ArrowDown')
    }

    return focusedListId(page)
}
