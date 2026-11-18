import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The board's swimlanes example: a product team's quarter, one row per team.
 *
 * The rows come from the board's `laneField: 'team'` and its explicit `lanes`, with Web starting collapsed; the four
 * cards without a team sit in the "Unassigned" row the board adds. A drop is a real pointer drag, and the record is
 * the truth to wait on.
 *
 * Run: npm run test-e2e -- test/playwright/e2e/board/SwimlanesNL.spec.mjs
 */
const
    // [title, count, collapsed] per row, in display order
    LANES   = [['Design', 9, false], ['Web', 10, true], ['Mobile', 9, false], ['Platform', 8, false], ['Unassigned', 4, false]],
    THEMES  = ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'],
    asArray = value => Array.isArray(value) ? value : value ? [value] : [],
    // The rows as a visitor reads them
    headers = page => page.locator('.neo-board-lane').evaluateAll(lanes => lanes.map(lane => [
        lane.querySelector('.neo-board-lane-title').textContent,
        Number(lane.querySelector('.neo-board-lane-count').textContent),
        lane.querySelector('.neo-board-lane-collapse').getAttribute('aria-expanded') === 'false'
    ])),
    // Opens the example and binds the Neural Link to it, with readers bound to its board
    open    = async (page, neuralLink, theme) => {
        await page.goto(`/examples/board/swimlanes/index.html${theme ? `?theme=${theme}` : ''}`);
        await page.locator('.neo-board-card').first().waitFor({timeout: 30000});

        const app     = await neuralLink.connectToApp('BoardSwimlanes'),
              boardId = asArray(await app.findInstances({className: 'Neo.board.Container'}, ['id']))[0]?.id;

        return {
            boardId,
            column : (status, team) => page.locator(`[id="${boardId}__col__${status}__${team}"]`),
            lane   : team => page.locator(`[id="${boardId}__lane__${team}"]`),
            records: (status, team) => app.callMethod(boardId, 'getColumnRecords', [status, team])
        }
    };

test.describe('Board, swimlanes example: one row per team', () => {
    test.setTimeout(120000);
    test.use({viewport: {height: 900, width: 1440}});

    test('opens with one row per team in order, Web collapsed, each with its title and count, and the cards without a team in Unassigned', async ({page, neuralLink}) => {
        const {boardId, lane} = await open(page, neuralLink);

        await expect.poll(() => headers(page)).toEqual(LANES);
        await expect(lane('Web').locator('.neo-board-column'), 'a collapsed row shows no columns').toHaveCount(0);
        await expect(lane('Design').locator('.neo-board-column')).toHaveCount(5);
        await expect(page.locator(`[id="${boardId}__lane___unassigned_"] .neo-board-card`)).toHaveCount(4)
    });

    test('a row collapses and expands by click, and by Enter and Space on its toggle, and keeps its header and count', async ({page, neuralLink}) => {
        const {lane} = await open(page, neuralLink),
              design = lane('Design'),
              toggle = design.locator('.neo-board-lane-collapse');

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(design.locator('.neo-board-column'), 'collapsed by click').toHaveCount(0);
        await expect(design.locator('.neo-board-lane-count')).toHaveText('9');

        await toggle.click();
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(design.locator('.neo-board-column'), 'expanded by click').toHaveCount(5);

        await toggle.focus();
        await page.keyboard.press('Enter');
        await expect(toggle).toHaveAttribute('aria-expanded', 'false');
        await expect(design.locator('.neo-board-column'), 'collapsed by Enter').toHaveCount(0);
        await expect(design.locator('.neo-board-lane-count')).toHaveText('9');

        await page.keyboard.press('Space');
        await expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await expect(design.locator('.neo-board-column'), 'expanded by Space').toHaveCount(5)
    });

    test('a card dropped into another team\'s row takes that team, and both rows\' counts change', async ({page, neuralLink}) => {
        const {boardId, column, lane, records} = await open(page, neuralLink),
              // "Audit the colour contrast", Design's second Ready card
              cardId = `${boardId}__card__4`;

        expect((await records('ready', 'Design')).map(record => record.id), 'card 4 starts in Design').toContain(4);

        const from = await page.locator(`[id="${cardId}"]`).boundingBox(),
              to   = await column('ready', 'Mobile').boundingBox();

        await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
        await page.mouse.down();
        await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2, {steps: 4});
        await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, {steps: 16});
        await page.mouse.up();

        await expect.poll(async () => (await records('ready', 'Mobile')).find(record => record.id === 4)?.team, {message: 'card 4 is a Mobile record'}).toBe('Mobile');
        expect((await records('ready', 'Design')).map(record => record.id), 'and no longer a Design one').not.toContain(4);
        await expect(column('ready', 'Mobile').locator(`[id="${cardId}"]`), 'the Mobile row shows it').toHaveCount(1);
        await expect(lane('Design').locator('.neo-board-lane-count')).toHaveText('8');
        await expect(lane('Mobile').locator('.neo-board-lane-count')).toHaveText('10')
    });

    test('opens in the dark theme on a system that prefers dark, unless ?theme= names another', async ({page}) => {
        const url   = '/examples/board/swimlanes/index.html',
              theme = () => page.locator('.board-swimlanes-example').evaluate(node => [...node.classList].find(cls => cls.startsWith('neo-theme-')));

        await page.emulateMedia({colorScheme: 'light'});
        await page.goto(url);
        await expect.poll(theme, 'a light system gets the first configured theme').toBe('neo-theme-neo-light');

        await page.emulateMedia({colorScheme: 'dark'});
        await page.goto(url);
        await expect.poll(theme, 'a dark system gets the dark theme').toBe('neo-theme-neo-dark');

        await page.goto(`${url}?theme=neo-theme-light`);
        await expect.poll(theme, '?theme= wins over the system').toBe('neo-theme-light')
    });

    for (const theme of THEMES) {
        test(`at 1440 × 900 and at 390 × 844 the rows render without a console error (${theme})`, async ({page, neuralLink}) => {
            const errors = [];

            page.on('pageerror', error => errors.push(error.message));
            // The test server has no favicon: that request is the browser's own, not the example's
            page.on('console', msg => msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico') && errors.push(msg.text()));

            await open(page, neuralLink, theme);
            await expect.poll(() => headers(page)).toEqual(LANES);

            await page.setViewportSize({height: 844, width: 390});
            await page.reload();
            await page.locator('.neo-board-card').first().waitFor({timeout: 30000});
            await expect.poll(() => headers(page)).toEqual(LANES);

            expect(errors).toEqual([])
        })
    }
});
