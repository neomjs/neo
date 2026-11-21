import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The support desk example: 10,000 tickets in five windowed columns, New holding 6,200.
 *
 * A column renders a window of `maxRenderedCards` (100) plus `overscan` (10) cards, so five columns hold at most
 * 5 × 110 cards in the DOM whatever the store holds. Scrolls and drags are real input; the headers and the toolbar's
 * counter are read from the page.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/board/BigData.spec.mjs
 */
const
    THEMES  = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    STAGES  = ['new', 'triage', 'waiting', 'solved', 'closed'],
    MAX_DOM = 5 * 110,
    // Opens the example and collects console errors
    open = async (page, theme) => {
        const errors = [];

        // The test server has no favicon: that request is the browser's own, not the example's
        page.on('console', msg => {
            const {url} = msg.location();
            msg.type() === 'error' && !url?.endsWith('/favicon.ico') && errors.push(`${msg.text()} ${url}`.trim())
        });
        page.on('pageerror', err => errors.push(err.message));

        await page.goto(`/examples/board/bigData/index.html${theme ? `?theme=${theme}` : ''}`);
        await page.locator('.neo-board-card').first().waitFor({timeout: 30000});

        const counter = page.locator('.desk-counter');
        await expect(counter).toContainText('in the DOM');

        return {
            counter,
            errors,
            badge : stage => page.locator(`[id$="__col__${stage}"] .neo-board-column-count`),
            body  : stage => page.locator(`[id$="__col__${stage}"] .neo-board-column-body`),
            cards : ()    => page.locator('.neo-board-card').count(),
            column: stage => page.locator(`[id$="__col__${stage}"]`)
        }
    },
    // Scrolls a column body to the end in jumps, checking after each that its viewport shows cards, not a blank stretch
    scrollToEnd = async (page, body) => {
        const box    = await body.boundingBox();
        let   blanks = 0;

        for (let i = 1; i <= 6; i++) {
            await body.evaluate((el, f) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * f }, i / 6);
            await page.waitForTimeout(250);

            const hits = await page.evaluate(({x, y, h}) => [.2, .5, .8].map(f => !!document.elementFromPoint(x, y + h * f)?.closest('.neo-board-card')),
                {x: box.x + box.width / 2, y: box.y, h: box.height});

            hits.some(Boolean) || blanks++
        }

        // The window re-measures its stride as it moves, which grows the content under a written end: rest at the
        // true end before the caller reads it
        await expect.poll(async () => {
            const before = await body.evaluate(el => { el.scrollTop = el.scrollHeight; return Math.round(el.scrollTop) });
            await page.waitForTimeout(250);
            return before === await body.evaluate(el => Math.round(el.scrollTop))
        }, {message: 'the column rests at its end'}).toBe(true);

        return blanks
    },
    // The toolbar shows its theme switcher in view, and nothing in it runs past the screen's edge
    switcherInView = async (page, width) => {
        const switcher = page.locator('.desk-toolbar .neo-theme-switcher');

        await expect(switcher, 'the theme switcher is in the toolbar').toBeVisible();

        const box = await switcher.boundingBox();

        expect(box.x + box.width, 'and ends in view').toBeLessThanOrEqual(width);
        expect(await page.locator('.desk-toolbar').evaluate(el => el.scrollWidth <= el.clientWidth), 'the toolbar does not overflow').toBe(true)
    };

test.describe('Board, big data example: 10,000 tickets in windowed columns', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1440}});

    test('the counter names 10,000 cards and the DOM holds at most five windows of them', async ({page}) => {
        const {badge, cards, counter, errors} = await open(page);

        expect(await Promise.all(STAGES.map(stage => badge(stage).innerText()))).toEqual(['6200', '1500', '1100', '800', '400']);

        const inDom = await cards();

        expect(inDom).toBeLessThanOrEqual(MAX_DOM);
        await expect(counter, 'the counter counts the DOM').toHaveText(`10,000 cards · ${inDom} in the DOM`);
        expect(errors).toEqual([])
    });

    test('New scrolls to its end without a blank stretch, and the last card drags into Triage', async ({page}, testInfo) => {
        const {badge, body, cards, column, counter, errors} = await open(page);

        expect(await scrollToEnd(page, body('new')), 'no blank stretch on the way down').toBe(0);
        expect(await cards(), 'after the scroll').toBeLessThanOrEqual(MAX_DOM);
        await expect(page.locator('[id$="__card__t-6200"]'), 'the last ticket is rendered at the end').toBeVisible();

        await testInfo.attach('board-big-data-end-of-new', {body: await page.screenshot(), contentType: 'image/png'});

        const last = page.locator('[id$="__card__t-6200"]'),
              from = await last.boundingBox(),
              to   = await column('triage').boundingBox(),
              x    = from.x + from.width / 2,
              y    = Math.min(from.y + from.height / 2, (await body('new').boundingBox()).y + (await body('new').boundingBox()).height - 12);

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 20, y - 10, {steps: 4});
        await page.mouse.move(to.x + to.width / 2, to.y + 200, {steps: 20});
        await expect(page.locator('[id$="__col__triage"] .neo-board-card-slot'), 'the card enters Triage').toHaveCount(1);
        await page.mouse.up();

        await expect(badge('new'),    'New counts one less').toHaveText('6199');
        await expect(badge('triage'), 'Triage one more').toHaveText('1501');
        await expect(page.locator('.neo-dragproxy'), 'the proxy leaves with the drop').toHaveCount(0);

        // New stays where it was scrolled to, at its end, and filled
        const newBox = await body('new').boundingBox();

        await expect.poll(() => body('new').evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop), {message: 'New still sits at its end'})
            .toBeLessThanOrEqual(1);
        await expect(page.locator('[id$="__card__t-6199"]'), 'and shows its new last ticket').toBeVisible();
        await expect.poll(() => page.evaluate(({x, y, h}) => [.2, .5, .8].every(f => !!document.elementFromPoint(x, y + h * f)?.closest('.neo-board-card')),
            {x: newBox.x + newBox.width / 2, y: newBox.y, h: newBox.height}), {message: 'no blank stretch in New after the drop'}).toBe(true);

        const inDom = await cards();

        expect(inDom, 'after the drop').toBeLessThanOrEqual(MAX_DOM);
        await expect(counter).toHaveText(`10,000 cards · ${inDom} in the DOM`);
        expect(errors).toEqual([])
    });

    test('a collapsed column takes its cards out of the DOM and out of the counter, and brings them back', async ({page}) => {
        const {body, cards, column, counter, errors} = await open(page),
              before                                 = await cards(),
              collapse                               = column('new').locator('.neo-board-column-collapse'),
              // The counter names what the DOM holds
              inSync   = async () => await counter.innerText() === `10,000 cards · ${await cards()} in the DOM`;

        await collapse.click();
        await expect(column('new'), 'New collapses').toHaveClass(/neo-board-column-collapsed/);
        await expect(body('new').locator('.neo-board-card'), 'its cards leave the DOM').toHaveCount(0);
        expect(await cards(), 'the board holds fewer cards').toBeLessThan(before);
        await expect.poll(inSync, {message: 'the counter drops them too'}).toBe(true);

        await collapse.click();
        await expect(column('new'), 'New opens again').not.toHaveClass(/neo-board-column-collapsed/);
        await expect.poll(cards, {message: 'its cards come back'}).toBe(before);
        await expect.poll(inSync, {message: 'and so does the counter'}).toBe(true);
        expect(errors).toEqual([])
    });

    for (const theme of THEMES) {
        test(`at 1440 × 900 the five columns are in view (${theme})`, async ({page}, testInfo) => {
            const {column, errors} = await open(page, theme);

            for (const stage of STAGES) {
                const {width, x} = await column(stage).boundingBox();

                expect(x, `${stage}: starts in view`).toBeGreaterThanOrEqual(0);
                expect(x + width, `${stage}: ends in view`).toBeLessThanOrEqual(1440)
            }

            await switcherInView(page, 1440);
            expect(errors).toEqual([]);
            await testInfo.attach(`board-big-data-1440-${theme}`, {body: await page.screenshot(), contentType: 'image/png'})
        })
    }

    test('at 390 × 844 New fits the screen whole, under the counter', async ({page}, testInfo) => {
        await page.setViewportSize({height: 844, width: 390});

        const {column, counter, errors} = await open(page),
              first                     = await column('new').boundingBox(),
              line                      = await counter.boundingBox();

        expect(first.x, 'New starts in view').toBeGreaterThanOrEqual(0);
        expect(first.x + first.width, 'and ends in view').toBeLessThanOrEqual(390);
        expect(first.y, 'below the counter').toBeGreaterThan(line.y + line.height);
        await switcherInView(page, 390);
        expect(errors).toEqual([]);

        await testInfo.attach('board-big-data-390', {body: await page.screenshot(), contentType: 'image/png'})
    })
});
