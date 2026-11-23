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
 * @returns {Promise<Object>} The boxes of the page's text block and its live preview, and the window's size
 */
function readLayout(section) {
    return section.evaluate(node => {
        const box = target => {
            const rect = (typeof target === 'string' ? node.querySelector(target) : target)?.getBoundingClientRect();
            return rect && {bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top, width: rect.width}
        };

        return {
            pane  : box('.page-live-preview'),
            text  : box('.portal-content-text'),
            window: {height: innerHeight, scrollWidth: document.documentElement.scrollWidth, width: innerWidth}
        }
    })
}

/**
 * @summary Asserts the shape of a home page: the text block beside the live preview, the preview the wider of the
 * two, and all of it inside the window.
 * @param {Object} layout The result of readLayout()
 * @param {Boolean} textFirst True when the text stands at the start of the page
 */
function expectTextBesidePreview(layout, textFirst) {
    const [first, second] = textFirst ? [layout.text, layout.pane] : [layout.pane, layout.text];

    expect(first.right).toBeLessThanOrEqual(second.left + 2);
    expect(layout.pane.width).toBeGreaterThan(layout.text.width);
    expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);
    expect(layout.pane.bottom).toBeLessThanOrEqual(layout.window.height)
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
 * @summary Asserts that a page's sub-headline counts the lines of the snippet in its Source tab.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} section
 */
async function expectLineCount(page, section) {
    const subHeadline = await section.getByRole('heading', {level: 3}).textContent(),
          editorId    = await section.locator('.neo-monaco-editor').getAttribute('id');

    await expect.poll(() => page.evaluate(id => Neo.main.addon.MonacoEditor.map[id]?.getModel()?.getLineCount(), editorId))
        .toBe(Number(subHeadline.match(/(\d+) Lines of Code/)[1]))
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<String[]>} The routes of the page's links to the other families
 */
function readLinks(section) {
    return section.locator('.portal-content-links a').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<String[]>} The task titles from top to bottom on screen; the grid recycles its row nodes
 */
function readTaskOrder(section) {
    return section.evaluate(node => [...node.querySelectorAll('.neo-grid-row')]
        .filter(row => row.textContent.trim())
        .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
        .map(row => row.textContent.trim()))
}

/**
 * @param {import('@playwright/test').Locator} section
 * @returns {Promise<Number>} The largest distance in px between a dependency link's end and the bar edge it joins.
 * The plan's links run finish to start, from a bar's right edge to the next one's left edge, at mid-height.
 */
function readLinkGap(section) {
    return section.evaluate(node => {
        const bars = Object.fromEntries([...node.querySelectorAll('.neo-timeline-bar')].map(bar => [bar.dataset.eventId, bar.getBoundingClientRect()]));

        return Math.max(0, ...[...node.querySelectorAll('path.neo-gantt-dependency-arrow')].map(path => {
            const matrix = path.getScreenCTM(),
                  first  = path.getPointAtLength(0).matrixTransform(matrix),
                  last   = path.getPointAtLength(path.getTotalLength()).matrixTransform(matrix),
                  from   = bars[path.dataset.fromId],
                  to     = bars[path.dataset.toId];

            return Math.max(Math.abs(first.x - from.right), Math.abs(first.y - (from.top + from.bottom) / 2),
                Math.abs(last.x - to.left), Math.abs(last.y - (to.top + to.bottom) / 2))
        }))
    })
}

/**
 * @summary The home's two component pages: one plan as a Gantt chart and a task board on one store, and a grid
 * under a live feed, each built by the snippet behind its Source tab.
 * Covers what a unit test cannot see: the text beside the preview inside one snap page, the switch from the source
 * to the running result, the selected card's bar highlighted and following a click, a card move recolouring its bar
 * and a bar move taking its successors along, a Task-header sort reordering the plan with its links on their bars,
 * the feed reaching the cells, a change coloured by its sign, the rate
 * the feed measured, the preview following an edit, the links to the other families, the wheel and the keyboard
 * moving the page on, and the phone layout.
 */
test.describe('Portal home: the plan and the live grid beside their text', () => {
    test.setTimeout(120000);

    test('desktop: text and preview share one snap page, the views follow their data, and the families are linked', async ({page, neuralLink}) => {
        const errors = [];

        // A view that changes its height after the first render warns here: a cell registers on a node that is gone
        page.on('console',   message => {(message.type() === 'error' || message.text().includes('target node not found')) && errors.push(message.text())});
        page.on('pageerror', error => errors.push(error.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        // The plan comes first: eleven bars, eight cards in four columns
        const app      = await neuralLink.connectToApp('Portal'),
              planning = await openPage(page, '.portal-home-parts-planning', '.neo-timeline-bar'),
              layout   = await readLayout(planning);

        expectTextBesidePreview(layout, true);

        // The page opened on its source and switched to the running result; the source stays one click away
        await expect(planning.locator('.neo-monaco-editor')).toBeHidden();
        await expect(planning.getByText('Source', {exact: true})).toBeVisible();

        await expect(planning.getByRole('heading', {level: 2})).toHaveText('Gantt & Task Board');
        await expect(planning.getByRole('heading', {level: 3})).toHaveText('One Store · 48 Lines of Code');
        await expectLineCount(page, planning);
        await expect(planning.getByRole('link', {name: 'The Gantt guide'})).toBeVisible();
        await expect(planning.locator('.neo-timeline-bar')).toHaveCount(11);
        await expect(planning.locator('.neo-board-column')).toHaveCount(4);
        await expect(planning.locator('.neo-board-card')).toHaveCount(8);

        // No bar carries a label: the tree names the tasks, so no connector crosses a word
        expect(await planning.locator('.neo-timeline-bar-label').allTextContents()).toEqual(Array(11).fill(''));

        // At rest one task is one record in both views: the selected card, and its bar highlighted
        const highlighted = () => planning.locator('.neo-timeline-bar-highlighted').evaluateAll(bars => bars.map(bar => bar.dataset.eventId)),
              selected    = planning.locator('.neo-board-card.neo-selected');

        await expect(selected).toHaveCount(1);
        await expect(selected).toContainText('Prototype');
        expect(await highlighted()).toEqual(['3']);

        // A click on another card moves the highlight to that card's bar
        await planning.locator('.neo-board-card', {hasText: 'Data layer'}).click({position: {x: 20, y: 12}});

        await expect(selected).toContainText('Data layer');
        await expect.poll(highlighted).toEqual(['5']);

        // The planning page links its own families first
        expect(await readLinks(planning)).toEqual([
            '#/examples/gantt', '#/examples/board', '#/examples/grid', '#/examples/forms',
            '#/examples/scheduler', '#/examples/calendar', '#/examples/dashboard'
        ]);

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
        // The cascade may reach the chart's last bar one update after the moved bar
        await expect.poll(async () => (await readBars(planning))[10].left).toBeGreaterThan(atRest[10].left);

        const moved = await readBars(planning);

        for (const successor of [7, 9, 10]) {
            expect(moved[successor].left).toBeGreaterThan(atRest[successor].left)
        }

        expect(moved[6].left).toBe(atRest[6].left);
        await expect(planning.locator('.neo-board-card')).toHaveCount(8);

        // The wheel over the page's text moves the page on
        const home      = page.locator('.portal-home-maincontainer'),
              scrollTop = await home.evaluate(node => node.scrollTop);

        await page.mouse.move(layout.text.left + 100, layout.text.top + 100);
        await page.mouse.wheel(0, 900);
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(scrollTop + 300);

        // The grid follows, built the same way
        const grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              footer = grid.locator('.neo-grid-footer-toolbar');

        expectTextBesidePreview(await readLayout(grid), false);

        await expect(grid.getByRole('heading', {level: 2})).toHaveText('Data Grid');
        await expect(grid.getByRole('heading', {level: 3})).toHaveText('Live Data · 48 Lines of Code');
        await expectLineCount(page, grid);
        await expect(grid.getByRole('link', {name: 'The grid guide'})).toBeVisible();
        await expect(grid.locator('.neo-grid-row').first()).toContainText('Novatek Energy');

        // Demand stretches to the desktop grid's trailing edge and animates on same-record feed ticks
        const demandRight = await grid.locator('.neo-grid-header-button', {hasText: 'Demand'}).evaluate(node => node.getBoundingClientRect().right),
              gridRight   = await grid.locator('.neo-grid-container').evaluate(node => node.getBoundingClientRect().right),
              demands     = () => grid.locator('.neo-grid-cell[data-field="demand"] progress').evaluateAll(bars => bars.map(bar => bar.value).join('|')),
              demandStart = await demands();

        expect(gridRight - demandRight).toBeLessThanOrEqual(20);
        await expect.poll(demands, {timeout: 10000}).not.toBe(demandStart);
        await expect.poll(() => grid.locator('.neo-grid-cell[data-field="demand"] progress.neo-progress-animate').count(), {timeout: 10000}).toBeGreaterThan(0);

        // The feed reaches the cells: the prices on screen change by themselves
        const prices = () => grid.locator('.neo-grid-row').evaluateAll(rows => rows.map(row => row.innerText).join('|'));
        const before = await prices();

        await expect.poll(prices, {timeout: 10000}).not.toBe(before);

        // A change is coloured by its sign in every row on screen, also in one the feed has not touched
        const changes = await grid.locator('.neo-grid-cell[data-field="change"]').evaluateAll(cells => cells.map(cell => [
            cell.innerText.trim().startsWith('-'), getComputedStyle(cell).color
        ]));

        expect(changes.length).toBeGreaterThan(10);
        changes.forEach(([loss, color]) => expect(color).toBe(loss ? 'rgb(238, 85, 68)' : 'rgb(34, 153, 68)'));

        // The footer shows the rows and the rate the feed measured
        await expect(footer).toHaveText(/300 rows · \d+ updates\/s/);
        await expect.poll(async () => Number((await footer.innerText()).match(/· (\d+) updates/)?.[1]), {timeout: 10000}).toBeGreaterThan(0);

        // The other families are one click away
        expect(await readLinks(grid)).toEqual([
            '#/examples/grid', '#/examples/forms', '#/examples/scheduler', '#/examples/gantt',
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
        await expect(footer).toHaveText(/3 rows · \d+ updates\/s/);

        // The keyboard moves the page on as well, once the page itself was clicked
        const atGrid = await home.evaluate(node => node.scrollTop);

        await grid.locator('.portal-content-text > p').click();
        await page.keyboard.press('PageDown');
        await expect.poll(() => home.evaluate(node => node.scrollTop), {timeout: 10000}).toBeGreaterThan(atGrid + 300);

        // Neither page asks for a file of the former demos
        const requested = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));

        expect(requested.filter(url => /\/apps\/colors\/|multiWindowHelix/.test(url))).toEqual([]);
        expect(errors).toEqual([])
    });

    test('desktop: the board ends where the Gantt chart ends, in a wider window too', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        for (const size of [{width: 1440, height: 900}, {width: 1920, height: 1080}]) {
            await page.setViewportSize(size);

            const planning = await openPage(page, '.portal-home-parts-planning', '.neo-board-column'),
                  right    = selector => planning.locator(selector).last().evaluate(node => node.getBoundingClientRect().right);

            await expect.poll(async () => Math.abs(await right('.neo-board-column') - await right('.neo-timeline-header')))
                .toBeLessThanOrEqual(1)
        }
    });

    test('desktop: a Task-header sort reorders the plan within its phases, and every link stays on its bars', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(HOME_URL);

        const planning = await openPage(page, '.portal-home-parts-planning', '.neo-timeline-bar'),
              header   = planning.locator('.neo-grid-header-button', {hasText: 'Task'});

        expect(await readTaskOrder(planning)).toEqual([
            'Design', 'Wireframes', 'Visual design', 'Prototype', 'Build', 'Data layer', 'Grid views', 'Scheduling',
            'Launch', 'Load test', 'Go live'
        ]);
        expect(await readLinkGap(planning)).toBeLessThanOrEqual(1);

        // A tree sorts its phases, and each phase its own tasks
        for (const [direction, order] of [
            ['ascending',  ['Build', 'Data layer', 'Grid views', 'Scheduling', 'Design', 'Prototype', 'Visual design', 'Wireframes', 'Launch', 'Go live', 'Load test']],
            ['descending', ['Launch', 'Load test', 'Go live', 'Design', 'Wireframes', 'Visual design', 'Prototype', 'Build', 'Scheduling', 'Grid views', 'Data layer']]
        ]) {
            await header.click();

            await expect(header).toHaveAttribute('aria-sort', direction);
            await expect.poll(() => readTaskOrder(planning), {message: `${direction}: the rows follow the header`}).toEqual(order);
            await expect.poll(() => readLinkGap(planning), {message: `${direction}: every link on its bars`}).toBeLessThanOrEqual(1)
        }
    });

    test('phone: the pages fall back to tabs and stay inside the screen', async ({page}) => {
        await page.setViewportSize({width: 390, height: 844});
        await page.goto(HOME_URL);

        const grid   = await openPage(page, '.portal-home-parts-grid', '.neo-grid-row'),
              layout = await readLayout(grid);

        expect(layout.window.scrollWidth).toBeLessThanOrEqual(layout.window.width);
        expect(layout.pane.right).toBeLessThanOrEqual(layout.window.width);

        // The same tabs on a phone, Preview in front
        await expect(grid.getByText('Source', {exact: true})).toBeVisible();
        await expect(grid.locator('.neo-monaco-editor')).toBeHidden();

        const planning = await openPage(page, '.portal-home-parts-planning', '.neo-timeline-bar');

        expect((await readLayout(planning)).window.scrollWidth).toBeLessThanOrEqual(layout.window.width)
    })
});
