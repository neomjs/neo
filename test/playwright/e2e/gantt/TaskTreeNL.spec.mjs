import {test, expect} from '../../fixtures.mjs';

const URL = '/examples/gantt/taskTree/index.html';

/** @summary Opens the exhibition plan and connects to its Gantt in the App Worker. */
async function openPlan(page, neuralLink, theme) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text())
    });
    await page.goto(`${URL}${theme ? `?theme=${theme}` : ''}`);
    await expect(page.locator('.neo-timeline-bar[data-event-id="build"]')).toBeVisible();
    const app     = await neuralLink.connectToApp('GanttTaskTree'),
          [gantt] = await app.findInstances({className: 'Neo.gantt.Container'}, ['id']);

    return {app, errors, ganttId: gantt.id}
}

/** @summary The page itself stays within the visitor's viewport. */
async function expectNoPageOverflow(page) {
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
}

/** @summary The opening phase intersects the viewport and each ancestor that clips its timeline. */
async function expectOpeningFits(page) {
    await expect(page.locator('.neo-timeline-bar[data-event-id="build"]')).toBeInViewport({ratio: 0.5});
    await expect.poll(() => page.locator('.task-tree-hint').evaluate(node =>
        node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight)).toBe(true)
}

test.describe('Gantt task tree example', () => {
    test('a phase follows its tasks through collapse, delay, and reset', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        const {app, errors, ganttId} = await openPlan(page, neuralLink, 'neo-theme-neo-dark'),
              read                   = id => app.callMethod(ganttId, 'resolveTaskRecord', [id]),
              phase                  = page.locator('.neo-grid-row', {hasText: 'Prepare gallery'}),
              toggle                 = phase.locator('.neo-tree-toggle'),
              bar                    = page.locator('.neo-timeline-bar[data-event-id="build"]');

        await expectNoPageOverflow(page);
        await expectOpeningFits(page);
        await expect(bar).not.toHaveClass(/neo-draggable/);
        await expect(bar.locator('.neo-timeline-bar-handle')).toHaveCount(0);
        await expect(page.locator('.neo-timeline-bar[data-event-id="lighting"] .neo-timeline-bar-handle')).toHaveCount(2);
        await expect.poll(async () => {
            const task = await read('build');
            return [task.startDate, task.endDate, Math.round(task.percentDone)]
        }).toEqual(['2026-11-09T00:00:00.000Z', '2026-11-15T00:00:00.000Z', 45]);
        await expect(phase.locator('[data-field="percentDone"]')).toHaveText('45%');
        const initialWidth = (await bar.boundingBox()).width;

        await expect(toggle).toHaveClass(/is-expanded/);
        await toggle.click();
        await expect(toggle).toHaveClass(/is-collapsed/);
        await expect(page.locator('.neo-tree-content', {hasText: 'Focus lighting'})).toHaveCount(0);
        await expect(bar).toBeVisible();
        await toggle.click();
        await expect(toggle).toHaveClass(/is-expanded/);
        await expect(page.locator('.neo-tree-content', {hasText: 'Focus lighting'})).toBeVisible();

        await page.locator('.task-tree-delay').click();
        await expect.poll(async () => {
            const parent = await read('build'), task = await read('lighting');
            return [task.startDate, task.endDate, parent.startDate, parent.endDate, Math.round(parent.percentDone)]
        }).toEqual(['2026-11-16T00:00:00.000Z', '2026-11-18T00:00:00.000Z',
            '2026-11-09T00:00:00.000Z', '2026-11-18T00:00:00.000Z', 45]);
        await expect.poll(async () => (await bar.boundingBox()).width).toBeGreaterThan(initialWidth);
        await expect(phase.locator('[data-field="percentDone"]')).toHaveText('45%');

        await page.locator('.task-tree-reset').click();
        await expect.poll(async () => (await read('build')).endDate).toBe('2026-11-15T00:00:00.000Z');
        expect(errors).toEqual([])
    });

    for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark', 'neo-theme-light', 'neo-theme-dark', 'neo-theme-cyberpunk']) {
        test(`phone shows and advances the plan without document overflow (${theme})`, async ({page, neuralLink}) => {
            await page.setViewportSize({width: 390, height: 844});
            const {app, errors, ganttId} = await openPlan(page, neuralLink, theme);
            await expect(page.locator(`.task-tree-viewport.${theme}`)).toBeVisible();
            await expectNoPageOverflow(page);
            await expectOpeningFits(page);
            await page.locator('.task-tree-delay').click();
            await expect.poll(async () => (await app.callMethod(ganttId, 'resolveTaskRecord', ['build'])).endDate)
                .toBe('2026-11-18T00:00:00.000Z');
            await expectNoPageOverflow(page);
            expect(errors).toEqual([])
        })
    }
});
