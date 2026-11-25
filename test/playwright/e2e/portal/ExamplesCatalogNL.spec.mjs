import {expect, test} from '../../fixtures.mjs';
import {
    CARDS,
    CRUMB,
    expectCardLayout,
    expectOpenPage,
    FEATURED,
    GROUPS,
    MOBILE_IX,
    openGroup,
    openOverview,
    PAGE,
    PORTAL,
    readDesktopPage,
    readList,
    readOverviewList,
    selectBuild,
    SHEET,
    SIDEBAR,
    TILES
} from '../utils/portalExamplesCatalog.mjs';

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

        const headline      = page.locator('.portal-examples-overview:visible .portal-examples-overview-headline'),
              counts        = page.locator(`${SIDEBAR} li .portal-examples-group-index-count`),
              startCount    = page.locator(`${SIDEBAR} .portal-examples-group-index-all .portal-examples-group-index-count`),
              featuredCards = page.locator(`${FEATURED} .neo-list-item`),
              findInput     = page.locator('.portal-examples-sidebar:visible .portal-examples-find-field input'),
              note          = page.locator(`${SIDEBAR} .portal-examples-group-index-note`),
              components    = counts.nth(GROUPS.indexOf('More components')),
              apps          = counts.nth(GROUPS.indexOf('Apps')),
              sum           = async () => (await counts.allTextContents()).reduce((sum, text) => sum + Number(text), 0),
              noteOf        = published => `${published} examples in all. Some appear in more than one group.`,
              headlineOf    = published => `${published} live examples in ${GROUPS.length} groups`;

        await expect(page.locator(SIDEBAR)).toBeVisible();
        await expect(counts).toHaveCount(GROUPS.length);
        await expect(note).toHaveText(/^\d+ examples in all\. Some appear in more than one group\.$/);

        const published      = Number((await note.textContent()).split(' ')[0]),
              curatedCount   = await featuredCards.count(),
              componentCount = Number(await components.textContent());

        // Start here counts the curated cards on /examples, the search placeholder and footer line give the published total
        await expect(headline).toHaveText(headlineOf(published));
        await expect(startCount).toHaveText(String(curatedCount));
        await expect(findInput).toHaveAttribute('placeholder', `Search ${published} examples…  /`);
        expect(published).toBeGreaterThan(0);
        expect((await counts.allTextContents()).every(text => /^\d+$/.test(text)), 'every group shows a number').toBe(true);
        expect(await sum()).toBeGreaterThan(published);
        await expect(counts.filter({hasText: '('}), 'no count needs a footnote').toHaveCount(0);
        await expect(page.locator(`${FEATURED} .neo-list-item`).first().locator('.portal-example-group-badge')).toHaveText('Multi-Window');

        // Dev mode cannot open liquid-glass, one of the three cards of More components; the markdown and Live preview cards and the tiles stay
        await selectBuild(page, 'Dev mode');
        await expect(headline).toHaveText(headlineOf(published - 1));
        await expect(note).toHaveText(noteOf(published - 1));
        await expect(startCount).toHaveText(String(curatedCount));
        await expect(findInput).toHaveAttribute('placeholder', `Search ${published - 1} examples…  /`);
        await expect(page.locator(SIDEBAR).getByRole('link', {name: `More components, ${componentCount - 1} live examples`})).toHaveCount(1);
        await selectBuild(page, 'Production build');
        await expect(headline).toHaveText(headlineOf(published));

        await expect(startCount).toHaveText(String(curatedCount));
        await expect(findInput).toHaveAttribute('placeholder', `Search ${published} examples…  /`);

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
        await expect(nav.locator('[aria-current="page"]')).toHaveAccessibleName(/^Start here, \d+ live examples?$/);
        await expect(nav.locator('[role="tab"], [aria-selected]')).toHaveCount(0);

        // The open destination's link is the one Tab stop; the arrow keys walk the rest (side nav keys, below)
        await expect(nav.locator('a[href]:not([tabindex="-1"])')).toHaveCount(1);

        await links.nth(GROUPS.indexOf('Calendar') + 1).focus();
        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/examples\/calendar$/);
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
        await expect(page.locator(`${CRUMB} .portal-examples-find-field input`)).toHaveAttribute('placeholder', /^Search \d+ examples…  \/$/);
        await button.click();
        await expect(sheet).toBeVisible();
        await expect(sheet.locator('[aria-current="page"]')).toHaveAccessibleName(/^Start here, \d+ live examples?$/);
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
        await expect(page).toHaveURL(/\/examples\/calendar$/);
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

    for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
        test(`${theme}: a compact tile's crop takes the pointer's reflection and one glint, in place (#22122)`, async ({page, neuralLink}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await page.addInitScript(theme => localStorage.setItem('portalTheme', theme), theme);
            await page.goto(`${PORTAL}#/examples/forms`);

            await expect(page.locator(`.neo-viewport.${theme}`)).toBeVisible();
            const app = await neuralLink.connectToApp('Portal');

            const read = tile => tile.locator('.preview-image').evaluate(node => {
                const rect = node.getBoundingClientRect();

                return {
                    light      : getComputedStyle(node, '::before').backgroundImage,
                    motions    : Object.fromEntries(node.getAnimations({subtree: true}).filter(a => a.animationName).map(a => [a.animationName, a.effect.getComputedTiming().duration])),
                    opacity    : getComputedStyle(node, '::after').opacity,
                    ratio      : rect.width / rect.height,
                    selectLight: getComputedStyle(node).getPropertyValue('--portal-examples-list-light-select').trim()
                }
            });

            // Checkbox on Forms: hover gives the crop the pointer's reflection and one glint
            let tiles = page.locator(`${TILES} .neo-list-item`);
            await expect(tiles.first()).toBeVisible();
            await expect(tiles.first().locator('.neo-title')).toHaveText('Checkbox');

            const tile = tiles.first(),
                  cue  = tile.locator('.portal-example-open-cue');

            await tile.scrollIntoViewIfNeeded();

            const captionBox = await tile.locator('.portal-example-title-row').boundingBox();
            const cueBox     = await cue.boundingBox();

            await page.mouse.move(5, 895);
            const rest = await read(tile);
            expect(rest.opacity).toBe('0');
            expect(rest.motions['portal-examples-list-glint']).toBeUndefined();
            expect(rest.selectLight).toBe('rgba(0, 0, 0, 0)');

            await tile.hover();

            await expect.poll(async () => (await read(tile)).opacity, 'the glint rests on the crop while hovered').toBe('1');
            const hovered = await read(tile);
            expect(hovered.light, 'the pointer light falls onto the crop').toContain('radial-gradient');
            expect(hovered.motions['portal-examples-list-glint'], 'one glint crosses the crop').toBeGreaterThan(0);
            expect(Math.abs(hovered.ratio - 4 / 3), 'the crop keeps its 4:3').toBeLessThan(0.02);

            // The caption and the launch target stay where they were
            expect(await tile.locator('.portal-example-title-row').boundingBox()).toEqual(captionBox);
            expect(await cue.boundingBox()).toEqual(cueBox);

            // Selection and pointer cues stay distinguishable on a hovered, selected tile
            await page.mouse.move(5, 895);
            await tile.locator('.content').click();
            await expect(tile).toHaveClass(/neo-selected/);
            await tile.hover();
            await expect.poll(async () => (await read(tile)).opacity).toBe('1');
            const selectedHovered = await read(tile);
            expect(selectedHovered.selectLight, 'the selection light still rises from the details').not.toBe('rgba(0, 0, 0, 0)');
            await page.mouse.move(5, 895);
            await tile.locator('.content').click();

            // A compact tile of another group (More components) behaves the same
            await openGroup(page, 'More components');
            tiles = page.locator(`${TILES} .neo-list-item`);
            await expect(tiles.first()).toBeVisible();

            const other = tiles.first();
            await other.hover();

            await expect.poll(async () => (await read(other)).opacity).toBe('1');
            const otherHovered = await read(other);
            expect(otherHovered.light).toContain('radial-gradient');
            expect(otherHovered.motions['portal-examples-list-glint']).toBeGreaterThan(0);
            await page.mouse.move(5, 895);

            // Reduced motion keeps the static cue and skips the glint; the first tap still opens the example
            await openGroup(page, 'Forms & Fields');
            await expect(tiles.first()).toBeVisible();
            await page.emulateMedia({reducedMotion: 'reduce'});
            await tile.hover();

            const reduced = await read(tile);
            expect(reduced.opacity).toBe('1');
            expect(reduced.light).toContain('radial-gradient');
            expect(reduced.motions['portal-examples-list-glint'] ?? 0, 'no motion under reduce').toBe(0);

            const portalUrl = page.url(),
                  [popup]   = await Promise.all([
                      page.context().waitForEvent('page', {timeout: 15000}).then(p => p).catch(() => null),
                      page.waitForURL(url => url.toString() !== portalUrl, {timeout: 15000}).then(() => null).catch(() => null),
                      cue.click()
                  ]);

            expect((popup || page).url()).toContain('/examples/');
            await popup?.close();
            await page.emulateMedia({reducedMotion: null})
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
        await expect(page).toHaveURL(/\/examples$/);
        await expect(page.locator(FEATURED)).toBeVisible();
        await expect(page.locator(PAGE)).toHaveCount(0);
        await page.goBack();
        await expect(page).toHaveURL(/\/examples\/grid$/);
        await expectOpenPage(page, 'Grid & Table');
        await expect.poll(() => page.locator(PAGE).evaluate(node => node.scrollTop)).toBe(600);

        // an unknown group opens the overview; every defined group has a card or a tile, so the unit spec covers one without
        await page.goto(`${PORTAL}#/examples/unknown`);
        await expect(page.locator(FEATURED)).toBeVisible();
        await expect(page.locator(PAGE)).toHaveCount(0)
    });
});
