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
            return Math.abs(first.x - source.right) <= 2 && Math.abs(last.x - target.left) <= 2 &&
                Math.abs(first.y - (source.top + source.height / 2)) < 0.25 &&
                Math.abs(last.y - (target.top + target.height / 2)) < 0.25
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
    await expect(port).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
    const gap = await port.evaluate(node => node.offsetLeft - node.parentElement.clientWidth);
    expect(gap).toBe(0);
    const portRect = await port.boundingBox(), resizeRect = await resize.boundingBox();
    expect(portRect.x).toBeGreaterThanOrEqual(resizeRect.x + resizeRect.width);
    const arrowY = await arrow.evaluate(path => path.getPointAtLength(0).matrixTransform(path.getScreenCTM()).y);
    expect(Math.abs(arrowY - (portRect.y + portRect.height / 2))).toBeLessThan(0.25);

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

test('task and link previews follow the pointer without mutating the plan until release', async ({page, neuralLink}) => {
    await page.goto('/examples/gantt/basic/index.html');
    const survey    = page.locator('.neo-timeline-bar[data-event-id="survey"]');
    const design    = page.locator('.neo-timeline-bar[data-event-id="design"]');
    const materials = page.locator('.neo-timeline-bar[data-event-id="materials"]');
    const build     = page.locator('.neo-timeline-bar[data-event-id="build"]');
    await expect(survey).toBeVisible();
    await expect(page.getByText('Edits stay on this device')).toBeVisible();
    const app     = await neuralLink.connectToApp('GanttBasic');
    const [gantt] = await app.findInstances({className:'Neo.gantt.Container'}, ['id']);
    const read    = id => app.callMethod(gantt.id, 'resolveTaskRecord', [id]);

    const beforeMove = await read('survey'), source = await survey.boundingBox();
    const proxy      = page.locator('.neo-dragproxy');
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 18, source.y + source.height / 2, {steps:12});
    await expect(proxy).toBeVisible();
    await expect(survey).toHaveClass(/neo-gantt-task-source/);
    await expect(survey.locator('.neo-timeline-bar-label')).toBeHidden();
    await expect(design).not.toHaveClass(/neo-gantt-task-source/);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(proxy).toHaveCount(0);
    await expect(survey).not.toHaveClass(/neo-gantt-task-source/);
    expect([(await read('survey')).startDate, (await read('survey')).endDate])
        .toEqual([beforeMove.startDate, beforeMove.endDate]);

    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    await page.mouse.move(source.x + source.width / 2 + 36, source.y + source.height / 2, {steps:12});
    await expect(proxy).toBeVisible();
    await expect(survey).toHaveClass(/neo-gantt-task-source/);
    await expect(proxy.locator('.neo-timeline-bar')).toContainText('Survey the site');
    await expect.poll(async () => (await proxy.boundingBox())?.x).toBeGreaterThan(source.x + 20);
    const movePreview = await proxy.boundingBox();
    expect([(await read('survey')).startDate, (await read('survey')).endDate])
        .toEqual([beforeMove.startDate, beforeMove.endDate]);
    await page.mouse.up();
    await expect(proxy).toHaveCount(0);
    await expect(survey).not.toHaveClass(/neo-gantt-task-source/);
    await expect.poll(async () => (await survey.boundingBox())?.x).toBeCloseTo(movePreview.x, 0);

    const beforeResize = await read('design'), designRect = await design.boundingBox();
    const edge         = await design.locator('.neo-resizable-end').boundingBox();
    await page.mouse.move(edge.x + edge.width / 2, designRect.y + designRect.height * .8);
    await page.mouse.down();
    await page.mouse.move(edge.x + edge.width / 2 + 18, designRect.y + designRect.height * .8, {steps:12});
    await expect(proxy).toBeVisible();
    await expect(design).toHaveClass(/neo-gantt-task-source/);
    await expect.poll(async () => (await proxy.boundingBox())?.width).toBeGreaterThan(designRect.width + 10);
    const resizePreview = await proxy.boundingBox();
    expect([(await read('design')).startDate, (await read('design')).endDate])
        .toEqual([beforeResize.startDate, beforeResize.endDate]);
    await page.mouse.up();
    await expect(proxy).toHaveCount(0);
    await expect(design).not.toHaveClass(/neo-gantt-task-source/);
    await expect.poll(async () => (await design.boundingBox())?.width).toBeCloseTo(resizePreview.width, 0);
    expect((await read('design')).startDate).toBe(beforeResize.startDate);

    const startLink = async () => {
        await materials.hover();
        const port = materials.locator('.neo-gantt-link-terminal');
        await expect(port).toBeVisible();
        const a = await port.boundingBox(), b = await build.boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.mouse.down();
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, {steps:16});
        await expect(build).toHaveClass(/neo-gantt-link-target/)
    };
    await startLink();
    await expect(page.locator('[data-from-id="materials"][data-to-id="build"]')).toHaveCount(0);
    // Returning to a predecessor would make a cycle; it must not retain an eligible highlight.
    const invalid = await design.boundingBox();
    await page.mouse.move(invalid.x + invalid.width / 2, invalid.y + invalid.height / 2, {steps:12});
    await expect(build).not.toHaveClass(/neo-gantt-link-target/);
    await expect(design).not.toHaveClass(/neo-gantt-link-target/);
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.locator('.neo-gantt-link-target')).toHaveCount(0);
    await expect(page.locator('.neo-gantt-link-preview')).toHaveCount(0);
    await startLink();
    await page.mouse.up();
    await expect(page.locator('[data-from-id="materials"][data-to-id="build"]')).toBeVisible();
    await expect(page.locator('.neo-gantt-link-target')).toHaveCount(0);
    await expect(page.locator('.neo-gantt-link-preview')).toHaveCount(0);

    // Destroying an active zone must retire the floating preview without committing.
    const beforeDestroy = await read('build'), last = await build.boundingBox();
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2);
    await page.mouse.down();
    await page.mouse.move(last.x + last.width / 2 + 36, last.y + last.height / 2, {steps:12});
    await expect(proxy).toBeVisible();
    await expect(build).toHaveClass(/neo-gantt-task-source/);
    const [zone] = await app.findInstances({className:'Neo.gantt.EventDragZone'}, ['id']);
    await app.callMethod(zone.id, 'destroy', []);
    await page.mouse.up();
    await expect(proxy).toHaveCount(0);
    await expect(build).not.toHaveClass(/neo-gantt-task-source/);
    await expect(page.locator('.neo-gantt')).not.toHaveClass(/neo-is-dragging/);
    expect([(await read('build')).startDate, (await read('build')).endDate])
        .toEqual([beforeDestroy.startDate, beforeDestroy.endDate])
});
