import {test, expect} from '../../fixtures.mjs';

/**
 * @summary A tear-out released after its vessel has loaded commits by moving the staged pane.
 *
 * A vessel that connects before the release stages the live pane in its provisional chrome; the release
 * then commits the vessel's Workspace, whose projection must take that pane out of the chrome by DOM move.
 * Releasing once the staged pane is in the vessel's DOM is the late order. The early order (release before
 * the vessel connects) never stages and is covered by the other tear-out specs.
 */
test.describe('Workstation — a tear-out released after its vessel loaded', () => {
    test.setTimeout(120000);
    test.use({colorScheme: 'dark', viewport: {height: 800, width: 1280}});

    test('commits the staged pane into the vessel dock by move, with a clean receipt', async ({page, neuralLink}) => {
        const errors = [];

        page.on('console', message => message.type() === 'error' && errors.push(`[main] ${message.text()}`));

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-tour-play',    {timeout: 30000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 30000});

        const
            app        = await neuralLink.connectToApp('Workstation'),
            found      = await app.findInstances({className: 'Workstation.view.Workspace'}, ['id']),
            workspaces = Array.isArray(found) ? found : found ? [found] : [];

        expect(workspaces, 'the page owns exactly one Workspace').toHaveLength(1);

        const
            wsId   = workspaces[0].id,
            header = page.locator('.neo-tab-header-button', {hasText: 'Audit'}).first();

        await expect(header).toBeVisible();

        const
            box          = await header.boundingBox(),
            viewport     = await page.evaluate(() => ({h: innerHeight, w: innerWidth})),
            popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 12, box.y + box.height / 2 + 12, {steps: 4});
        await page.mouse.move(viewport.w + 180, viewport.h + 180, {steps: 36});

        const vessel = await popupPromise;

        vessel.on('console', message => message.type() === 'error' && errors.push(`[vessel] ${message.text()}`));
        await vessel.waitForLoadState('domcontentloaded');
        await expect(vessel.locator('.workstation-vessel-provisional-chrome .workstation-pane-audit'), 'the late order: the vessel stages the live pane before the release').toBeAttached({timeout: 10000});

        // Marks the staged node: a commit that moves it keeps the mark, a re-render loses it
        await vessel.evaluate(() => {document.querySelector('.workstation-vessel-provisional-chrome .workstation-pane-audit').__stagedNode = true});

        await page.mouse.up();

        await expect(vessel.locator('.workstation-vessel-provisional-chrome'), 'the provisional chrome retires').toHaveCount(0, {timeout: 15000});
        await expect(vessel.locator('.workstation-vessel-dock-host .neo-dashboard-dock-tabs .workstation-pane-audit'), 'the pane lands in the vessel dock').toBeVisible({timeout: 15000});

        expect.soft((await app.getComponent(wsId, ['lastCrossWindowTransfer'])).lastCrossWindowTransfer, 'the commit records no error').toBeNull();
        expect.soft(await vessel.evaluate(() => document.querySelector('.workstation-pane-audit')?.__stagedNode === true), 'the staged node moved, not re-rendered').toBe(true);
        expect.soft(errors.filter(text => /provisional chrome|repaint render failed/.test(text)), 'no window logs the failed hand-over').toEqual([])
    })
});
