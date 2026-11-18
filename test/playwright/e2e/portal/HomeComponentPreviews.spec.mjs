import {expect, test} from '../../fixtures.mjs';

const HOME_URL = '/apps/portal/index.html#/home';

/**
 * Scrolls one of the home's snap pages into view and waits until its live preview has run.
 * @param {import('@playwright/test').Page} page
 * @param {String} selector The page's own class
 * @param {String} rendered A selector that only the running preview produces
 * @returns {Promise<import('@playwright/test').Locator>} The page's locator
 */
async function openPage(page, selector, rendered) {
    const section = page.locator(selector);

    await expect(section).toBeAttached({timeout: 30000});
    await section.evaluate(node => node.scrollIntoView());
    await expect(section.locator(rendered).first()).toBeVisible({timeout: 20000});

    return section
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<Object>} The boxes of the page's editor, its last code line and its preview card, and the
 * window's size
 */
function readLayout(section) {
    return section.evaluate(node => {
        const box = target => {
            const rect = (typeof target === 'string' ? node.querySelector(target) : target)?.getBoundingClientRect();
            return rect && {bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, width: rect.width}
        };

        return {
            card    : box('.neo-tab-body-container > :last-child'),
            code    : Math.max(...[...node.querySelectorAll('.view-line > span')].map(span => span.getBoundingClientRect().right)),
            editor  : box('.neo-monaco-editor'),
            lastLine: box([...node.querySelectorAll('.view-line')].sort((a, b) => a.offsetTop - b.offsetTop).at(-1)),
            pane    : box('.page-live-preview'),
            window  : {height: innerHeight, scrollWidth: document.documentElement.scrollWidth, width: innerWidth}
        }
    })
}

/**
 * @summary Asserts that a page shows its code and its result side by side inside the window, with every line of
 * the snippet inside the editor: none is cut at the bottom or at the right.
 * @param {Object} layout The result of readLayout()
 */
function expectWholeSnippetBesideResult(layout) {
    expect(layout.editor.width).toBeGreaterThan(400);
    expect(layout.card.width).toBeGreaterThan(400);
    expect(layout.editor.right).toBeLessThanOrEqual(layout.card.left + 2);
    expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);
    expect(layout.pane.bottom).toBeLessThanOrEqual(layout.window.height);
    expect(layout.lastLine.bottom).toBeLessThanOrEqual(layout.editor.bottom);
    expect(layout.code).toBeLessThanOrEqual(layout.editor.right)
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<Object>} Each task bar's left edge and fill, by task id
 */
function readBars(section) {
    return section.locator('.neo-timeline-bar').evaluateAll(bars => Object.fromEntries(bars.map(bar => [
        bar.dataset.eventId,
        {color: getComputedStyle(bar).backgroundColor, left: Math.round(bar.getBoundingClientRect().left)}
    ])))
}

/**
 * @summary The home's two component pages: a grid under a live feed, and one plan as a Gantt chart and a task
 * board on one store, each built by the code shown beside it.
 * Covers what a unit test cannot see: both halves on screen inside one snap page, the feed reaching the cells,
 * the preview following an edit, a card move recolouring its bar and a bar move taking its successors along, the
 * links to the other families, the wheel passing the code on its way down the page, and the phone layout.
 */
test.describe('Portal home: the live grid and the plan beside their code', () => {
    test.setTimeout(120000);

    test('desktop: code and result share one snap page, the views follow their data, and the families are linked', async ({page, neuralLink}) => {
        const errors = [];

        page.on('console',   message => {message.type() === 'error' && errors.push(message.text())});
        page.on('pageerror', error => errors.push(error.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const app    = await neuralLink.connectToApp('Portal'),
              grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              layout = await readLayout(grid);

        expectWholeSnippetBesideResult(layout);

        await expect(grid.getByRole('heading', {level: 2})).toHaveText('Data Grid');
        await expect(grid.locator('.neo-grid-row').first()).toContainText('Novatek Energy');

        // The sub-headline counts the lines the editor shows
        const lines = await grid.getByRole('heading', {level: 3}).textContent();

        await expect(grid.locator('.view-line')).toHaveCount(Number(lines.match(/(\d+) Lines/)[1]));

        // The feed reaches the cells: the prices on screen change by themselves
        const prices = () => grid.locator('.neo-grid-row').evaluateAll(rows => rows.map(row => row.innerText).join('|'));
        const before = await prices();

        await expect.poll(prices, {timeout: 10000}).not.toBe(before);

        // The other families are one click away
        const links = await grid.locator('.portal-content-links a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')));

        expect(links).toEqual([
            '#/examples/grid-table', '#/examples/forms', '#/examples/scheduler', '#/examples/gantt',
            '#/examples/board', '#/examples/calendar', '#/examples/dashboard'
        ]);

        // Changing the code changes the grid, and the feed keeps running on the smaller store
        const editorId = await grid.locator('.neo-monaco-editor').getAttribute('id');

        await expect.poll(() => page.evaluate(id => Boolean(Neo.main.addon.MonacoEditor.map[id]?.getModel()), editorId)).toBe(true);
        await page.evaluate(id => {
            const editor = Neo.main.addon.MonacoEditor.map[id];

            editor.setValue(editor.getValue().replace('length: 300', 'length: 3').replace("text: 'Price'", "text: 'Quote'"))
        }, editorId);

        await expect(grid.locator('.neo-grid-header-button', {hasText: 'Quote'})).toBeVisible({timeout: 15000});
        await expect(grid.getByText('Astradyne Logistics')).toBeVisible();
        await expect(grid.getByText('Vertagen Biotech')).toHaveCount(0);

        // The wheel over the code moves the page on: the snippet has nothing left to scroll
        const home      = page.locator('.portal-home-maincontainer'),
              scrollTop = await home.evaluate(node => node.scrollTop);

        await page.mouse.move(layout.editor.left + 200, layout.editor.top + 200);
        await page.mouse.wheel(0, 900);
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(scrollTop + 300);

        // The plan follows, built the same way: eleven bars, eight cards in four columns
        const planning = await openPage(page, '.portal-home-parts-planning', '.neo-timeline-bar');

        expectWholeSnippetBesideResult(await readLayout(planning));

        await expect(planning.getByRole('heading', {level: 3})).toHaveText('New in Engine 14');
        await expect(planning.locator('.neo-timeline-bar')).toHaveCount(11);
        await expect(planning.locator('.neo-board-column')).toHaveCount(4);
        await expect(planning.locator('.neo-board-card')).toHaveCount(8);

        // One store under both views
        const [board] = [].concat(await app.queryComponent({className: 'Neo.board.Container'}, ['id'])),
              [gantt] = [].concat(await app.queryComponent({className: 'Neo.gantt.Container'}, ['id'])),
              done    = planning.locator('.neo-board-column', {hasText: 'Done'}),
              atRest  = await readBars(planning);

        expect(atRest[5].color).toBe('rgb(68, 136, 255)');
        await expect(done.locator('.neo-board-card')).toHaveCount(2);

        // A card moved to "Done" through the board's writer recolours its bar in the chart
        await app.callMethod(board.id, 'moveCard', [{key: '5', status: 'Done'}]);

        await expect(done.locator('.neo-board-card', {hasText: 'Data layer'})).toBeVisible();
        await expect.poll(async () => (await readBars(planning))[5].color).toBe('rgb(34, 204, 102)');

        // A bar moved through the chart's writer takes its successors along, and the board keeps its cards
        await app.callMethod(gantt.id, 'moveTask', ['5', {endDate: '2026-11-14', startDate: '2026-11-11'}]);

        await expect.poll(async () => (await readBars(planning))[5].left).toBeGreaterThan(atRest[5].left);

        const moved = await readBars(planning);

        for (const successor of [7, 9, 10]) {
            expect(moved[successor].left).toBeGreaterThan(atRest[successor].left)
        }

        expect(moved[6].left).toBe(atRest[6].left);
        await expect(planning.locator('.neo-board-card')).toHaveCount(8);

        // The keyboard moves the page on as well, once the page itself was clicked
        const atPlanning = await home.evaluate(node => node.scrollTop);

        await planning.locator('.portal-content-text > p').click();
        await page.keyboard.press('PageDown');
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(atPlanning + 300);

        // Neither page asks for a file of the former demos
        const requested = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));

        expect(requested.filter(url => /\/apps\/colors\/|multiWindowHelix/.test(url))).toEqual([]);
        expect(errors).toEqual([])
    });

    test('phone: the pages fall back to tabs and stay inside the screen', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(HOME_URL);

        const grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              layout = await readLayout(grid);

        expect(layout.window.scrollWidth).toBeLessThanOrEqual(layout.window.width);
        expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);

        // Too narrow for both: the tabs are back, Preview in front
        await expect(grid.getByText('Source', {exact: true})).toBeVisible();
        await expect(grid.locator('.neo-monaco-editor')).toBeHidden();

        const planning = await openPage(page, '.portal-home-parts-planning', '.neo-timeline-bar');

        expect((await readLayout(planning)).window.scrollWidth).toBeLessThanOrEqual(layout.window.width)
    })
});
