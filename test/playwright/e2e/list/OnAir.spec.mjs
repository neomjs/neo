import {test, expect} from '../../fixtures.mjs';

const entry = '/examples/list/onAir/index.html';

test('a rundown drop changes the presenter cue and the next program picture in the same show', async ({page, neuralLink}) => {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto(entry);
    const rows = page.locator('.air-list .neo-list-item');
    await expect(rows).toHaveCount(2);
    const app    = await neuralLink.connectToApp('OnAir');
    const [list] = await app.queryComponent({className: 'Neo.examples.list.onAir.Rundown'}, ['store']);
    const store  = list.properties.store.id;

    const [presenter] = await Promise.all([
        page.waitForEvent('popup'),
        page.getByRole('button', {name: 'Open presenter window'}).click()
    ]);
    await expect(presenter.locator('.air-cue')).toHaveText('Introduce Mara Lin');
    await expect(page.locator('.air-margin')).toHaveText('Guest slot is 01:20 early');

    const from = await rows.nth(1).boundingBox(), to = await rows.first().boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 4, {steps: 16});
    await page.mouse.up();

    await expect(presenter.locator('.air-cue')).toHaveText('Roll Night Service');
    await expect(page.locator('.air-margin')).toHaveText('Guest line ready with 00:10 to spare');
    await expect(page.locator('.air-screen')).toHaveClass(/air-titles/);
    const ordered = await app.inspectStore(store, 5, 0);
    expect(ordered.items.map(row => (row.data || row).id)).toEqual(['film', 'guest']);

    const take = page.getByRole('button', {name: 'Take next cue'});
    await take.click();
    await expect(page.locator('.air-screen')).toHaveClass(/air-film/);
    await expect(page.locator('.air-clock strong')).toHaveText('20:00:00');
    await expect(page.getByRole('status')).toHaveText('Film on air. The guest will be ready for the next cue.');
    await expect(presenter.locator('.air-cue')).toHaveText('Introduce Mara Lin');
    await take.click();
    await expect(page.locator('.air-screen')).toHaveClass(/air-guest/);
    await expect(page.locator('.air-clock strong')).toHaveText('20:01:30');
    await take.click();
    await expect(page.locator('.air-screen')).toHaveClass(/air-end/);
    await expect(take).toBeDisabled();
    await page.getByRole('button', {name: 'Replay'}).click();
    await expect(rows).toHaveCount(2);
    await expect(page.locator('.air-clock strong')).toHaveText('19:59:50');
    await expect(page.getByRole('status')).toHaveText('Titles end at 20:00:00. The ninety-second film is ready.');
    await expect(page.locator('.air-margin')).toHaveText('Guest slot is 01:20 early');
    await expect(presenter.locator('.air-cue')).toHaveText('Introduce Mara Lin');
    await presenter.close()
});

test('titles expire into dead air, then the show can be rescued with a keyboard on a phone-sized desk', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(entry);
    await page.getByRole('button', {name: 'Run clock'}).click();
    await expect(page.locator('.air-screen')).toHaveClass(/air-black/, {timeout: 20000});
    await expect(page.getByRole('status')).toContainText('Dead air at 20:00:00');
    await expect(page.locator('.air-clock strong')).toHaveText('20:00:00');
    await page.getByRole('button', {name: 'Replay'}).click();
    const cueFilm = page.getByRole('button', {name: 'Cue film first'});
    await expect(page.locator('.air-screen')).toHaveClass(/air-titles/);
    await expect(cueFilm).toBeEnabled();
    await cueFilm.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.air-cue')).toHaveText('Roll Night Service');
    await page.getByRole('button', {name: 'Take next cue'}).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.air-screen')).toHaveClass(/air-film/);
    expect(await page.locator('.air-desk').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
});
