import {test, expect} from '../../fixtures.mjs';

test('a linked project edit and a new dependency survive reload', async ({page, neuralLink}) => {
    await page.goto('/examples/gantt/basic/index.html');
    const survey          = page.locator('.neo-timeline-bar[data-event-id="survey"]');
    const design          = page.locator('.neo-timeline-bar[data-event-id="design"]');
    const materials       = page.locator('.neo-timeline-bar[data-event-id="materials"]');
    const build           = page.locator('.neo-timeline-bar[data-event-id="build"]');
    const arrow           = page.locator('[data-dependency-id="survey-design"]');
    const expectArrowEnds = async (path, from, to) => {
        await expect.poll(async () => path.evaluate((element, selectors) => {
            const source = document.querySelector(selectors.from)?.getBoundingClientRect();
            const target = document.querySelector(selectors.to)?.getBoundingClientRect();
            const matrix = element.getScreenCTM();
            if (!source || !target || !matrix) return null;
            const first = element.getPointAtLength(0).matrixTransform(matrix);
            const last  = element.getPointAtLength(element.getTotalLength()).matrixTransform(matrix);
            return [
                Math.round(first.x - source.right), Math.round(first.y - (source.top + source.height / 2)),
                Math.round(last.x - target.left), Math.round(last.y - (target.top + target.height / 2))
            ].every(delta => Math.abs(delta) <= 2)
        }, {from, to})).toBe(true)
    };
    await expect(survey).toBeVisible();
    await expect(design).toBeVisible();
    await expect(page.getByText('Edits stay on this device')).toBeVisible();
    const week    = page.getByRole('button', {name:'Week', exact:true});
    const day     = page.getByRole('button', {name:'Day', exact:true});
    const working = page.getByRole('button', {name:'Working time', exact:true});
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(day).toHaveAttribute('aria-pressed', 'false');
    await working.click();
    await expect(working).toHaveAttribute('aria-pressed', 'true');
    await working.click();
    await expect(working).toHaveAttribute('aria-pressed', 'false');
    await day.click();
    await expect(day).toHaveAttribute('aria-pressed', 'true');
    await week.click();
    await expect(week).toHaveAttribute('aria-pressed', 'true');
    await expect(arrow).toHaveAttribute('data-from-id', 'survey');
    await expect(arrow).toHaveAttribute('data-to-id', 'design');
    await expectArrowEnds(arrow, '.neo-timeline-bar[data-event-id="survey"]', '.neo-timeline-bar[data-event-id="design"]');

    const app     = await neuralLink.connectToApp('GanttBasic');
    const [gantt] = await app.findInstances({className:'Neo.gantt.Container'}, ['id']);
    expect(gantt.id).toBeTruthy();

    // The link terminal and resize handle are separate targets.
    await survey.hover();
    const port   = survey.locator('.neo-gantt-link-terminal');
    const resize = survey.locator('.neo-resizable-end');
    await expect(port).toBeVisible();
    const portRect = await port.boundingBox(), resizeRect = await resize.boundingBox();
    expect(portRect.x).toBeGreaterThanOrEqual(resizeRect.x + resizeRect.width);

    await survey.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => {
        const task = await app.callMethod(gantt.id, 'resolveTaskRecord', ['survey']);
        return [task.startDate, task.endDate]
    }).toEqual(['2026-11-09T01:00:00.000Z', '2026-11-10T01:00:00.000Z']);
    await expect(page.getByText('Saved on this device')).toBeVisible();

    // The lower half of the finish edge resizes without moving the start.
    const beforeResize = await app.callMethod(gantt.id, 'resolveTaskRecord', ['design']);
    const designRect   = await design.boundingBox();
    const finish       = await design.locator('.neo-resizable-end').boundingBox();
    await page.mouse.move(finish.x + finish.width / 2, designRect.y + designRect.height * 0.8);
    await page.mouse.down();
    await page.mouse.move(finish.x + finish.width / 2 + 12, designRect.y + designRect.height * 0.8, {steps:12});
    await page.mouse.up();
    await expect.poll(async () => {
        const task = await app.callMethod(gantt.id, 'resolveTaskRecord', ['design']);
        return [task.startDate, new Date(task.endDate).getTime() > new Date(beforeResize.endDate).getTime()]
    }).toEqual([beforeResize.startDate, true]);
    const editedDesign = await app.callMethod(gantt.id, 'resolveTaskRecord', ['design']);
    const cascaded     = await app.callMethod(gantt.id, 'resolveTaskRecord', ['materials']);

    // A physical drag from the separate link port creates the next edge.
    await materials.hover();
    const linkPort = materials.locator('.neo-gantt-link-terminal');
    await expect(linkPort).toBeVisible();
    const linkRect = await linkPort.boundingBox(), targetRect = await build.boundingBox();
    await page.mouse.move(linkRect.x + linkRect.width / 2, linkRect.y + linkRect.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetRect.x + targetRect.width / 2, targetRect.y + targetRect.height / 2, {steps:16});
    await page.mouse.up();
    const newArrow = page.locator('[data-from-id="materials"][data-to-id="build"]');
    await expect(newArrow).toBeVisible();
    await expect(page.getByText('Saved on this device')).toBeVisible();
    await expect.poll(async () => page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('neo-examples-gantt-project-plan-v1') || '{}');
        return [saved.tasks?.find(row => row.id === 'survey')?.startDate,
            saved.tasks?.find(row => row.id === 'survey')?.endDate,
            saved.tasks?.find(row => row.id === 'design')?.endDate,
            saved.tasks?.find(row => row.id === 'materials')?.startDate,
            saved.dependencies?.some(row => row.fromId === 'materials' && row.toId === 'build')]
    })).toEqual(['2026-11-09T01:00:00.000Z', '2026-11-10T01:00:00.000Z',
        editedDesign.endDate, cascaded.startDate, true]);

    await page.reload();
    await expect(survey).toBeVisible();
    await expect(page.getByText('Edits stay on this device')).toBeVisible();
    const restored = await neuralLink.connectToApp('GanttBasic');
    const [chart]  = await restored.findInstances({className:'Neo.gantt.Container'}, ['id']);
    await expect.poll(async () => {
        const task = await restored.callMethod(chart.id, 'resolveTaskRecord', ['survey']);
        return [task.startDate, task.endDate]
    }).toEqual(['2026-11-09T01:00:00.000Z', '2026-11-10T01:00:00.000Z']);
    await expect.poll(async () => {
        const task      = await restored.callMethod(chart.id, 'resolveTaskRecord', ['design']);
        const successor = await restored.callMethod(chart.id, 'resolveTaskRecord', ['materials']);
        return [task.startDate, task.endDate, successor.startDate, successor.endDate]
    }).toEqual([editedDesign.startDate, editedDesign.endDate, cascaded.startDate, cascaded.endDate]);
    await expect(arrow).toHaveAttribute('data-from-id', 'survey');
    await expect(arrow).toHaveAttribute('data-to-id', 'design');
    await expect(newArrow).toHaveAttribute('data-from-id', 'materials');
    await expect(newArrow).toHaveAttribute('data-to-id', 'build');
    await expect(newArrow).toBeVisible();
    await expectArrowEnds(arrow, '.neo-timeline-bar[data-event-id="survey"]', '.neo-timeline-bar[data-event-id="design"]');
    await expectArrowEnds(newArrow, '.neo-timeline-bar[data-event-id="materials"]', '.neo-timeline-bar[data-event-id="build"]')
});
