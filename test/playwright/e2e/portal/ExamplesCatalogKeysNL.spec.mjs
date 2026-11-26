import {expect, test} from '../../fixtures.mjs';
import {
    CARDS,
    CRUMB,
    expectOpenPage,
    FEATURED,
    focusedListId,
    groupLink,
    groupSize,
    historyLength,
    MATCHES,
    MOBILE_IX,
    mobilePublished,
    openOverview,
    PAGE,
    PORTAL,
    pressAndSettle,
    readList,
    SHEET,
    SIDEBAR,
    startLink,
    TILES,
    walkDownOutOf
} from '../utils/portalExamplesCatalog.mjs';

/**
 * @summary Live slash search, pointer/selection hitboxes, and keyboard navigation across side nav, cards, tiles and phone index.
 */
test.describe('Portal examples search, selection and row navigation', () => {
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
        await expect(page).toHaveURL(/\/examples\/grid$/);
        expect(await page.evaluate(() => window.history.length)).toBe(initialHistoryLength);

        await sidebarInput.fill('date');
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Calendar', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Studio Bookings', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-search-cards').getByRole('link', {name: 'Community Garden Plan', exact: true})).toBeVisible();
        await expect(results.locator('.portal-examples-tiles').getByRole('link', {name: 'Date field', exact: true})).toBeVisible();

        // Searching "mobile" returns every published mobile-qualified card and zero desktop-only / tile items
        const expectedMobile = mobilePublished(mainState.properties.catalogMode),
              expectedGroups = new Set(expectedMobile.map(record => record.family)).size;
        expect(expectedMobile.length).toBeGreaterThan(0);
        await sidebarInput.fill('mobile');
        await expect(results.getByRole('heading', {level: 1})).toHaveText(`${expectedMobile.length} matching examples in ${expectedGroups} groups`);
        await expect(results.locator('.portal-examples-search-cards .neo-list-item')).toHaveCount(expectedMobile.length);
        await expect(results.locator('.portal-examples-tiles .neo-list-item')).toHaveCount(0);
        await expect(results.getByRole('link', {name: 'Workstation', exact: true})).toHaveCount(0);

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

        // AC-4: zero browser lists anywhere; Grid Big Data shows Desktop · Mobile without Multi-window
        await expect(page.locator(CARDS).filter({hasText: 'Chrome, Edge, Firefox, Safari'})).toHaveCount(0);
        await expect(card0.locator('.portal-example-mobile')).toHaveText('Desktop · Mobile');
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

        // AC-3: On the 2x2 lead card, .portal-example-more stays docked below .portal-example-footer leaving 100 % of .preview-image-wrap clear; on 1x1 multi-column cards, it opens <= 40 % inside .preview-image-wrap
        const leadBounds = await card0.evaluate(node => {
            const card   = node.getBoundingClientRect(),
                  wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                  more   = node.querySelector('.portal-example-more').getBoundingClientRect();
            return {cardBottom: card.bottom, footerBottom: footer.bottom, footerTop: footer.top, moreBottom: more.bottom, moreHeight: more.height, moreTop: more.top, wrapBottom: wrap.bottom}
        });
        expect(leadBounds.moreHeight).toBeGreaterThan(20);
        expect(leadBounds.footerTop, '2x2 lead cover stays 100 % unoccluded').toBeGreaterThanOrEqual(leadBounds.wrapBottom - 1.5);
        expect(leadBounds.moreTop, '2x2 lead details dock below .portal-example-footer').toBeGreaterThanOrEqual(leadBounds.footerBottom - 1.5);
        expect(Math.abs(leadBounds.moreBottom - leadBounds.cardBottom), '2x2 lead details fill to card bottom').toBeLessThan(1.5);

        // Neighbor hit-owner control: 25 px into row 2 card3's cover belongs to card3, never card0's disclosure band
        const hitOwnerMatchesRow2 = await card3.evaluate(node => {
            const cover = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  hit   = document.elementFromPoint(cover.left + cover.width / 2, cover.top + 25);
            return node.contains(hit)
        });
        expect(hitOwnerMatchesRow2, 'point 25 px into row 2 cover hits row 2 card').toBe(true);

        // Cross-row selection transfer (card0 -> card3) keeps card3's Open live ↗ at 0.0 px displacement and opens card3's <= 40 % in-cover band
        await card3.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(card3).toHaveClass(/neo-selected/);
        await expect(card0).not.toHaveClass(/neo-selected/);
        const afterCrossRow = await measureRects();
        expect(Math.abs(afterCrossRow.card3Cue.y - beforeHover.card3Cue.y)).toBe(0);

        const bandBounds = await card3.evaluate(node => {
            const wrap   = node.querySelector('.preview-image-wrap').getBoundingClientRect(),
                  footer = node.querySelector('.portal-example-footer').getBoundingClientRect(),
                  more   = node.querySelector('.portal-example-more').getBoundingClientRect();
            return {footerTop: footer.top, moreBottom: more.bottom, moreHeight: more.height, wrapBottom: wrap.bottom, wrapHeight: wrap.height}
        });
        expect(bandBounds.moreHeight).toBeGreaterThan(20);
        expect(bandBounds.moreHeight).toBeLessThanOrEqual(bandBounds.wrapHeight * 0.40 + 1);
        expect(bandBounds.moreBottom, '.portal-example-more stays inside .preview-image-wrap').toBeLessThanOrEqual(bandBounds.wrapBottom + 1);
        expect(bandBounds.moreBottom, '.portal-example-more never overlaps .portal-example-footer').toBeLessThanOrEqual(bandBounds.footerTop + 1);

        const readPill = locator => locator.evaluate(node => {
            const meta  = node.querySelector('.portal-example-meta'),
                  pill  = node.querySelector('.portal-example-mobile'),
                  scope = node.querySelector('.portal-example-scope'),
                  inner = node.querySelector('.portal-example-more-inner');

            if (!meta || !pill) {
                return {hasMeta: Boolean(meta), hasPill: Boolean(pill)}
            }

            const pillRect  = pill.getBoundingClientRect(),
                  innerRect = inner.getBoundingClientRect(),
                  style     = getComputedStyle(pill);

            return {
                fitsX     : pillRect.left >= innerRect.left - 1 && pillRect.right <= innerRect.right + 1,
                fitsY     : pillRect.top >= innerRect.top - 1 && pillRect.bottom <= innerRect.bottom + 1,
                hasMeta   : true,
                hasPill   : true,
                hasScope  : Boolean(scope && scope.offsetHeight > 0),
                lineBoxes : pill.getClientRects().length,
                text      : pill.textContent,
                transform : style.textTransform,
                whiteSpace: style.whiteSpace
            }
        });

        // At 1440px 3-col, Country Statistics Grid (115-char scope) keeps Desktop · Mobile on 1 unwrapped line box
        await expect.poll(() => readPill(card3), '1440px Country Statistics Grid pill').toEqual({
            fitsX     : true,
            fitsY     : true,
            hasMeta   : true,
            hasPill   : true,
            hasScope  : true,
            lineBoxes : 1,
            text      : 'Desktop · Mobile',
            transform : 'uppercase',
            whiteSpace: 'nowrap'
        });

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

        // At the two-column boundary and at 390×844 phone width, a card with look-for and scope text keeps Desktop · Mobile whole on one line.
        await page.setViewportSize({width: 1016, height: 900});
        const issuesCard = cards.filter({has: page.getByRole('link', {name: 'GitHub Issues Grid', exact: true})});
        await issuesCard.locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
        await expect(issuesCard).toHaveClass(/neo-selected/);
        await expect.poll(() => readPill(issuesCard), '1016×900 GitHub Issues Grid pill').toEqual({
            fitsX     : true,
            fitsY     : true,
            hasMeta   : true,
            hasPill   : true,
            hasScope  : true,
            lineBoxes : 1,
            text      : 'Desktop · Mobile',
            transform : 'uppercase',
            whiteSpace: 'nowrap'
        });

        await page.setViewportSize({width: 390, height: 844});
        await issuesCard.scrollIntoViewIfNeeded();
        await expect(issuesCard).toHaveClass(/neo-selected/);
        await expect.poll(() => readPill(issuesCard), '390×844 GitHub Issues Grid pill').toEqual({
            fitsX     : true,
            fitsY     : true,
            hasMeta   : true,
            hasPill   : true,
            hasScope  : true,
            lineBoxes : 1,
            text      : 'Desktop · Mobile',
            transform : 'uppercase',
            whiteSpace: 'nowrap'
        });

        // Featured 2x2 leadCard at 1440x900: Workstation has Multi-window without .portal-example-meta / Mobile, and ArrowDown from 2x2 card0 crosses two rows to card3
        await page.setViewportSize({width: 1440, height: 900});
        await openOverview(page);
        const featCards = page.locator(`${FEATURED} .neo-list-item`);
        await expect(featCards.nth(0).locator('.neo-multi-window')).toBeVisible();
        await expect(featCards.nth(0).locator('.portal-example-meta')).toHaveCount(0);
        await expect(featCards.nth(0).locator('.portal-example-mobile')).toHaveCount(0);
        await featCards.nth(0).locator('.preview-image-wrap').click({position: {x: 40, y: 40}});
        await featCards.nth(0).locator('.neo-title').focus();
        await page.keyboard.press('ArrowDown');
        await expect(featCards.nth(3)).toHaveClass(/neo-selected/)
    })
});

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
        await expect(startLink(page)).toBeFocused();
        await expect(page.locator(`${FEATURED} .neo-list-item`).first()).toBeVisible();
        await expect(page).toHaveURL(/\/examples$/);

        expect(await historyLength(page), 'one history entry for the whole walk').toBe(before + 1);
        await page.evaluate(() => history.back());
        await expect(page).toHaveURL(/\/examples\/scheduler$/);
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
        await expect(page, 'nothing opens while the key is held').toHaveURL(/\/examples\/scheduler$/);

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
        await expect(page).toHaveURL(/\/examples\/scheduler$/);

        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toHaveClass(/\bneo-selected\b/);

        await scheduler.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1), 'the selected card is the way back in').toBeFocused()
    });

    test('on Start here and under a filter ArrowRight enters what the stage shows, and Tab into the side nav keeps the filter', async ({page}) => {
        await page.goto(`${PORTAL}#/examples`);

        const all  = startLink(page),
              find = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples');

        await expect(all).toHaveAttribute('aria-current', 'page');
        await all.focus();
        await page.keyboard.press('ArrowRight');
        await expect(page.locator(`${FEATURED} .neo-list-item`).first()).toBeFocused();

        await find.fill('grid');
        await expect(page.locator(MATCHES).first()).toBeVisible();
        await expect(all).toHaveAccessibleName(/^Start here, [1-9]\d* matching examples?$/);
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

    test('after Back, the side nav focuses the open destination\'s link, while Back outside the side nav leaves focus where it was (#22120)', async ({page, neuralLink}) => {
        await page.goto(`${PORTAL}#/examples/scheduler`);
        const app = await neuralLink.connectToApp('Portal');

        const scheduler = groupLink(page, 'Scheduler'),
              gantt     = groupLink(page, 'Gantt'),
              cards     = page.locator(`${CARDS} .neo-list-item`),
              find      = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples');

        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        await scheduler.focus();
        await page.keyboard.press('ArrowDown');
        await expect(gantt).toBeFocused();
        await expectOpenPage(page, 'Gantt');

        await page.goBack();
        await expect(page).toHaveURL(/\/examples\/scheduler$/);
        await expectOpenPage(page, 'Scheduler');
        await expect(scheduler).toHaveAttribute('aria-current', 'page');

        const indices   = await app.queryComponent({className: 'Portal.view.examples.GroupIndex'}, ['activeFamily', 'presentation']),
              listIndex = indices.find(match => match.properties.presentation === 'list');
        expect(listIndex.properties.activeFamily).toBe('scheduler');

        await page.keyboard.press('ArrowRight');
        await expect(page).toHaveURL(/\/examples\/scheduler$/);
        await expect(cards.first()).toBeFocused();
        await expect(cards.first().locator('.neo-title')).toHaveText('Studio Bookings');

        await page.keyboard.press('ArrowLeft');
        await expect(scheduler).toBeFocused();

        // A subsequent walk after Back pushes a fresh history entry rather than replacing Scheduler's entry
        await page.keyboard.press('ArrowDown');
        await expect(gantt).toBeFocused();
        await expectOpenPage(page, 'Gantt');

        // AC-2: Back while focus sits outside the side nav returns to Scheduler and leaves focus where it was
        await find.focus();
        await expect(find).toBeFocused();
        await page.goBack();
        await expect(page).toHaveURL(/\/examples\/scheduler$/);
        await expectOpenPage(page, 'Scheduler');
        await expect(find).toBeFocused()
    });

    test('Enter on a focused card or tile launches its example while preserving selection, and Tab onto GitHub source launches only GitHub (#22223)', async ({page, neuralLink, context, baseURL}) => {
        await context.route('https://neomjs.com/**', route => route.fulfill({
            status     : 200,
            contentType: 'text/html',
            body       : '<title>Launched Example</title>'
        }));
        await context.route('https://github.com/neomjs/**', route => route.fulfill({
            status     : 200,
            contentType: 'text/html',
            body       : '<title>GitHub Source</title>'
        }));

        await page.goto(`${PORTAL}#/examples/forms`);
        let app = await neuralLink.connectToApp('Portal');
        await expectOpenPage(page, 'Forms & Fields');

        const formsLink = groupLink(page, 'Forms & Fields'),
              cards     = page.locator(`${CARDS} .neo-list-item`),
              tiles     = page.locator(`${TILES} .neo-list-item`);

        // 1. GroupPage demonstration card: ArrowRight -> Enter opens _blank popup and keeps selection + focus on the card
        await formsLink.focus();
        await page.keyboard.press('ArrowRight');
        await expect(cards.first()).toBeFocused();
        await expect(cards.first()).toHaveClass(/\bneo-selected\b/);
        const cardHref = await cards.first().locator('.neo-title').getAttribute('href');

        const cardPopupPromise = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const cardPopup = await cardPopupPromise;
        await expect(cardPopup).toHaveURL(cardHref);
        await cardPopup.close();
        await expect(cards.first()).toHaveClass(/\bneo-selected\b/);
        await expect(cards.first()).toBeFocused();

        // 2. Tab onto .neo-github-image + Enter opens only the GitHub source tab (never double-launching .neo-title)
        const openedUrls = [];
        const onPage     = popup => openedUrls.push(popup);
        context.on('page', onPage);

        await page.keyboard.press('Tab');
        await expect(cards.first().locator('.neo-title')).toBeFocused();
        await page.keyboard.press('Tab');
        const githubLink = cards.first().locator('.neo-github-image');
        await expect(githubLink).toBeFocused();
        const githubHref = await githubLink.getAttribute('href');

        const ghPopupPromise = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const ghPopup = await ghPopupPromise;
        await expect(ghPopup).toHaveURL(githubHref);
        await ghPopup.close();
        context.off('page', onPage);
        expect(openedUrls).toHaveLength(1);
        await expect(cards.first()).toHaveClass(/\bneo-selected\b/);

        // 3. GroupPage compact component tile: walk down into tiles -> Enter launches tile popup and keeps tile selected
        await cards.first().focus();
        const cardsList = await focusedListId(page);
        expect(await walkDownOutOf(page, cardsList)).not.toBe(cardsList);
        const focusedTile = page.locator(`${TILES} .neo-list-item:focus`);
        await expect(focusedTile).toHaveClass(/\bneo-selected\b/);
        const tileHref = await focusedTile.locator('.neo-title').getAttribute('href');

        const tilePopupPromise = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const tilePopup = await tilePopupPromise;
        await expect(tilePopup).toHaveURL(tileHref);
        await tilePopup.close();
        await expect(focusedTile).toHaveClass(/\bneo-selected\b/);
        await expect(focusedTile).toBeFocused();

        // 4. SearchResults card: filter -> ArrowRight from Start here -> Enter launches matched card popup
        const find = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples');
        await find.fill('sprint');
        await expect(page.locator(MATCHES).first()).toBeVisible();
        await startLink(page).focus();
        await page.keyboard.press('ArrowRight');
        const firstMatch = page.locator(MATCHES).first();
        await expect(firstMatch).toBeFocused();
        const matchHref = await firstMatch.locator('.neo-title').getAttribute('href');

        const matchPopupPromise = context.waitForEvent('page');
        await page.keyboard.press('Enter');
        const matchPopup = await matchPopupPromise;
        await expect(matchPopup).toHaveURL(matchHref);
        await matchPopup.close();
        await expect(firstMatch).toHaveClass(/\bneo-selected\b/);

        // 5. Overview "Start here" sharedWorkers card in devmode: Enter on Workstation navigates in the same window
        await page.goto(`${PORTAL}#/examples/devmode`);
        app = await neuralLink.connectToApp('Portal');
        await expect(page.locator(FEATURED)).toBeVisible();
        let overviewList;
        await expect.poll(async () => {
            overviewList = (await app.queryComponent({className: 'Portal.view.examples.List'}, ['id', 'reference']))
                .find(item => item.properties.reference === 'overview-list');
            return Boolean(overviewList?.id)
        }).toBe(true);
        await app.setProperties(overviewList.id, {baseUrl: `${baseURL}/`});
        await app.callMethod(overviewList.id, 'createItems');

        await startLink(page).focus();
        await page.keyboard.press('ArrowRight');
        const workstationCard = page.locator(`${FEATURED} .neo-list-item`).first();
        await expect(workstationCard).toBeFocused();
        await expect(workstationCard.locator('.neo-title')).toHaveText('Workstation');
        await expect(workstationCard.locator('.neo-title')).not.toHaveAttribute('target', /_blank/);

        await page.keyboard.press('Enter');
        await expect(page).toHaveURL(/\/apps\/workstation\/index\.html\?theme=neo-theme-neo-dark$/);
        await expect(page.locator('.workstation-viewport')).toBeVisible()
    });
});

test.describe('Portal examples gallery rows across cards and tiles (#22121)', () => {
    for (const {width, height, family, name} of [
        {width: 1440, height: 900, family: 'forms',   name: 'Forms & Fields'},
        {width: 1440, height: 900, family: 'buttons', name: 'Buttons, Menus & Toolbars'},
        {width: 900,  height: 800, family: 'forms',   name: 'Forms & Fields'}
    ]) {
        test(`${width}×${height} ${family}: ArrowDown leaves the last demonstration row for the tiles, ArrowUp comes back, and one card stays selected`, async ({page}) => {
            await page.setViewportSize({width, height});
            await page.goto(`${PORTAL}#/examples/${family}`);

            const link  = groupLink(page, name),
                  cards = page.locator(`${CARDS} .neo-list-item`),
                  tiles = page.locator(`${TILES} .neo-list-item`),
                  rings = page.locator(`${PAGE} .neo-list-item.neo-selected`);

            await expect(link).toHaveAttribute('aria-current', 'page');
            await expect(tiles.first()).toBeVisible();

            await link.focus();
            await page.keyboard.press('ArrowRight');
            await expect(cards.first()).toBeFocused();

            // ArrowUp on the first row has nowhere to go: the gallery's top edge
            await pressAndSettle(page, 'ArrowUp');
            await expect(cards.first(), 'the top edge keeps the card').toBeFocused();

            const cardsList = await focusedListId(page);

            expect(await walkDownOutOf(page, cardsList), 'ArrowDown past the last demonstration row enters the tiles').not.toBe(cardsList);
            await expect(page.locator(`${TILES} .neo-list-item:focus`)).toHaveClass(/\bneo-selected\b/);
            await expect(rings, 'focus and selection move together: one ring').toHaveCount(1);

            await pressAndSettle(page, 'ArrowUp');
            expect(await focusedListId(page), 'ArrowUp past the first tile row returns to the demonstrations').toBe(cardsList);
            await expect(page.locator(`${CARDS} .neo-list-item:focus`)).toHaveClass(/\bneo-selected\b/);
            await expect(rings).toHaveCount(1);

            // A pointer selection in the other kind clears the ring here too
            await cards.first().locator('.preview-image-wrap').click({position: {x: 32, y: 32}});
            await expect(cards.first()).toHaveClass(/\bneo-selected\b/);
            await expect(rings).toHaveCount(1);
            await tiles.first().locator('.preview-image').click({position: {x: 16, y: 16}});
            await expect(tiles.first()).toHaveClass(/\bneo-selected\b/);
            await expect(rings).toHaveCount(1)
        })
    }

    test('1440×900 search results: ArrowDown walks from one result list into the next, keeping one ring', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${PORTAL}#/examples`);

        const find    = page.locator('.portal-examples-sidebar:visible').getByLabel('Find examples'),
              matches = page.locator(MATCHES),
              rings   = page.locator('.portal-examples-search-groups:visible .neo-list-item.neo-selected');

        await find.fill('field');
        await expect(matches.first()).toBeVisible();

        await startLink(page).focus();
        await page.keyboard.press('ArrowRight');
        await expect(matches.first()).toBeFocused();

        const firstList = await focusedListId(page),
              lists     = await page.locator('.portal-examples-search-groups:visible .portal-examples-list').count();

        expect(lists, 'the query must yield more than one result list for a crossing').toBeGreaterThan(1);
        expect(await walkDownOutOf(page, firstList), 'ArrowDown past the first result list\'s last row enters the next').not.toBe(firstList);
        await expect(rings).toHaveCount(1)
    })
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
