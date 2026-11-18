import {expect, test} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/gantt/bigData/index.html',
    COUNTS      = '2,000 tasks · 1,972 links',
    // The rows in the DOM stay at most 3 % of the tasks: the grid renders the viewport and its buffer
    MAX_ROWS    = 60,
    THEMES      = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk'];

/**
 * @summary Collects page errors, failed requests and console errors, the browser's own favicon request aside.
 * @param {Object} page
 * @returns {String[]}
 */
function trackErrors(page) {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('response', res => {
        if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) errors.push(`${res.status()} ${res.url()}`)
    });
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) errors.push(msg.text())
    });
    return errors
}

/**
 * @summary Asserts that a parent's dates are its children's span.
 * @param {Object[]} tasks Every task of the programme
 * @param {String} parentId
 */
function expectSpan(tasks, parentId) {
    const
        parent   = tasks.find(task => task.id === parentId),
        children = tasks.filter(task => task.parentId === parentId),
        ms       = value => new Date(value).getTime();

    expect(children.length, parentId).toBeGreaterThan(0);
    expect(ms(parent.startDate), parentId).toBe(Math.min(...children.map(child => ms(child.startDate))));
    expect(ms(parent.endDate),   parentId).toBe(Math.max(...children.map(child => ms(child.endDate))))
}

const rows = page => page.locator('.neo-gantt .neo-grid-row').count();

test('opens 2,000 seeded tasks and 1,972 links on the first phase, each phase spanning its tasks, with a small DOM', async ({page, neuralLink}) => {
    const errors = trackErrors(page);

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.programme-counts')).toHaveText(COUNTS);
    await expect(page.locator('.neo-gantt-dependency-arrow').first()).toBeAttached();

    const
        app     = await neuralLink.connectToApp('GanttBigData'),
        [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id']),
        tasks   = await app.callMethod(gantt.id, 'collectAllTasks'),
        stores  = await app.getComponent(gantt.id, ['store', 'dependencyStore']);

    expect(tasks).toHaveLength(2000);
    expect(stores.dependencyStore.count).toBe(1972);
    // phase 1 is open, the other seven are closed: 1 + 12 zones + 237 tasks + 7 phases
    expect(stores.store.count).toBe(257);

    expectSpan(tasks, 'p1');
    tasks.filter(task => task.parentId === 'p1').forEach(zone => expectSpan(tasks, zone.id));

    const first = page.locator('.neo-gantt .neo-timeline-bar[data-event-id="p1-z01-t01"]');
    await expect(first).toBeVisible();
    const seeded = await first.getAttribute('aria-label');
    expect(await rows(page)).toBeLessThanOrEqual(MAX_ROWS);

    // Every phase open: 2,000 rows, and the DOM still holds the same window of them
    await app.callMethod(gantt.id, 'store.expandAll');
    await expect.poll(() => app.getComponent(gantt.id, ['store']).then(state => state.store.count)).toBe(2000);
    // The view grows to 2,000 rows after the store does: scroll to its end again on every poll until the last row renders
    const view = page.locator('.neo-gantt .neo-grid-view'), lastRow = page.locator('.neo-gantt .neo-grid-row[aria-rowindex="2001"]');
    await expect.poll(async () => {
        await view.evaluate(node => {node.scrollTop = node.scrollHeight});
        return lastRow.count()
    }, {timeout: 15000}).toBe(1);
    expect(await rows(page)).toBeLessThanOrEqual(MAX_ROWS);

    // The same plan on every load
    await page.reload();
    await expect(page.locator('.programme-counts')).toHaveText(COUNTS);
    await expect(first).toHaveAttribute('aria-label', seeded);
    expect(errors).toEqual([])
});

test('moving the first task a day moves every successor, and its zone and phase span their tasks again', async ({page, neuralLink}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.programme-counts')).toHaveText(COUNTS);

    const
        app     = await neuralLink.connectToApp('GanttBigData'),
        [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id']),
        task    = id => app.callMethod(gantt.id, 'resolveTaskRecord', [id]),
        day     = 86_400_000,
        before  = await app.callMethod(gantt.id, 'collectAllTasks'),
        first   = before.find(row => row.id === 'p1-z01-t01'),
        last    = before.filter(row => row.isLeaf).reduce((a, b) => new Date(b.endDate) > new Date(a.endDate) ? b : a),
        bar     = page.locator('.neo-timeline-bar[data-event-id="p1-z01-t01"]');

    await bar.focus();
    await expect(bar).toBeFocused();
    await page.keyboard.press('ArrowRight');

    await expect.poll(async () => new Date((await task(first.id)).startDate).getTime()).toBe(new Date(first.startDate).getTime() + day);
    // The last task of the programme follows the first through the cascade
    await expect.poll(async () => new Date((await task(last.id)).endDate).getTime()).toBe(new Date(last.endDate).getTime() + day);

    // A parent keeps its stored dates in the chart; the example writes the touched ones back to their children's span
    const after = await app.callMethod(gantt.id, 'collectAllTasks');
    for (const id of ['p1-z01', 'p1', 'p8']) expectSpan(after, id)
});

test('a phase or zone moved by itself settles back on its children\'s span', async ({page, neuralLink}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.programme-counts')).toHaveText(COUNTS);

    const
        app     = await neuralLink.connectToApp('GanttBigData'),
        [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id']),
        before  = await app.callMethod(gantt.id, 'collectAllTasks');

    for (const id of ['p1', 'p1-z01']) {
        const bar = page.locator(`.neo-timeline-bar[data-event-id="${id}"]`), label = await bar.getAttribute('aria-label');

        await bar.focus();
        await expect(bar).toBeFocused();
        await page.keyboard.press('ArrowRight');

        // The chart moves the bar a day; the example writes it back, so it ends where its children span
        await expect.poll(async () => {
            const tasks = await app.callMethod(gantt.id, 'collectAllTasks'), task = tasks.find(row => row.id === id);
            return [task.startDate, task.endDate]
        }).toEqual([before.find(row => row.id === id).startDate, before.find(row => row.id === id).endDate]);
        await expect(bar).toHaveAttribute('aria-label', label);
        expectSpan(await app.callMethod(gantt.id, 'collectAllTasks'), id)
    }
});

for (const theme of THEMES) {
    test(`renders at 1440 × 900 and 390 × 844 without a console error (${theme})`, async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
        await expect(page.locator('.programme-counts')).toHaveText(COUNTS);
        await expect(page.locator('.neo-gantt .neo-timeline-bar').first()).toBeVisible();
        await expect.poll(() => page.locator('.neo-gantt').first().evaluate((el, cls) => Boolean(el.closest(`.${cls}`)), theme)).toBe(true);

        await page.setViewportSize({width: 390, height: 844});
        await page.reload();
        await expect(page.locator('.neo-gantt .neo-timeline-bar').first()).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
        expect(errors).toEqual([])
    })
}
