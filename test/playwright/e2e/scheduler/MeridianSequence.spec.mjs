import {test, expect} from '../../fixtures.mjs';

const entry = '/examples/scheduler/meridian/index.html',
      gantt = '.meridian-gantt', schedule = '.meridian-scheduler',
      bar   = (surface, key) => `${surface} .neo-timeline-bar[data-event-id="${key}"]`;

test('keyboard comparison projects two linked plans, Escape restores, and the accepted geometry matches its forecast', async ({page, neuralLink}) => {
    await page.setViewportSize({width: 1440, height: 900});
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto(entry);
    const mosaic   = page.locator(bar(gantt, 'mosaic')), stack = page.locator(bar(gantt, 'stack')),
          control  = name => page.getByRole('button', {name, exact: true}),
          activate = async name => { await control(name).focus(); await page.keyboard.press('Enter') },
          left     = item => item.evaluate(node => Number.parseFloat(node.style.left));
    await expect(mosaic).toBeVisible();
    const boardBox    = await page.locator('.meridian-board').boundingBox(),
          scheduleBox = await page.locator(schedule).boundingBox();
    expect(Math.abs(boardBox.y + boardBox.height - scheduleBox.y - scheduleBox.height)).toBeLessThanOrEqual(1);
    const app      = await neuralLink.connectToApp('MeridianObservatory'),
          [desk]   = await app.queryComponent({className: 'Neo.examples.scheduler.meridian.Viewport'}, ['id']),
          state    = () => app.callMethod(desk.id, 'getNightState', []),
          baseline = await state(), original = await left(mosaic), oldStack = await left(stack);
    await activate('Compare slots');
    await expect(page.locator('.meridian-verdict-title')).toHaveText(/600 samples/);
    await expect.poll(() => left(mosaic)).toBeGreaterThan(original);
    await expect.poll(() => left(stack)).toBeGreaterThan(oldStack);
    const north = await left(mosaic), northStack = await left(stack);
    expect(await state()).toEqual({...baseline, proposed: true});
    await activate('Switch telescope');
    await expect(page.locator('.meridian-verdict-title')).toHaveText(/240 samples/);
    await expect.poll(() => left(mosaic)).toBe(original);
    await page.keyboard.press('Escape');
    await expect.poll(state).toEqual(baseline);
    await expect(page.locator('.meridian-slot-preview')).toHaveCount(0);

    await activate('Compare slots');
    await activate('Book this slot');
    await expect.poll(state).toMatchObject({booked: true, stage: 'booked', resource: 'north', start: 13, mosaicStart: 21, stackStart: 29, proposed: false});
    await expect.poll(() => left(mosaic)).toBe(north);
    await expect.poll(() => left(stack)).toBe(northStack);
    await expect(control('Compare slots')).toBeFocused();
    await expect(control('Run observation')).toBeEnabled();
    await activate('Run observation');
    await expect(page.locator('.meridian-signal')).toContainText('Simulated observation', {ignoreCase: true});
    await expect(page.locator('.meridian-verdict-title')).toContainText('600 samples');

    // Moving the actual Gantt prerequisite moves the exposure and readout through finish-to-start links.
    const guide = page.locator(bar(gantt, 'guide'));
    await guide.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(state).toMatchObject({start: 14, mosaicStart: 22, stackStart: 30});
    await expect(page.locator(bar(schedule, 'arc17'))).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect.poll(state).toMatchObject({start: 15, mosaicStart: 23, stackStart: 31});
    await expect(page.locator('.meridian-verdict-title')).toContainText('Misses ingress');
    await expect(control('Run observation')).toBeDisabled();
    await activate('Reset night');
    await expect.poll(state).toMatchObject({booked: false, stage: 'cleared', start: 12, mosaicStart: 13, stackStart: 21})
});

test('the phone-sized desk lets a visitor compare, book, and move the scheduled exposure', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(entry);
    await page.getByRole('button', {name: 'Compare slots'}).click();
    await page.getByRole('button', {name: 'Switch telescope'}).click();
    await page.getByRole('button', {name: 'Book this slot'}).click();
    const arc = page.locator(bar(schedule, 'arc17'));
    await expect(arc).toBeVisible();
    await arc.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.meridian-verdict-detail')).toContainText('22:13–22:17 UTC');
    await expect(page.locator('.meridian-board')).toContainText('22:13');
    expect(await page.locator('.meridian-desk').evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true)
});
