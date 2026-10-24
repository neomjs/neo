import {test, expect} from '@playwright/test';

/**
 * The app-held reveal, on a rendered dock: an application reveals a railed item over the layout and
 * holds it open while a person keeps working beside it.
 *
 * **The click reveal is the control.** It opens the same item in the same document and must still
 * take focus and close on a press beside it; a held reveal surviving that press proves the hold only
 * if the same press ends the click reveal.
 */
const LOG     = '#dock-rail-held-log',
      OVERLAY = '.neo-dashboard-dock-reveal-overlay-right';

const activeId      = page => page.evaluate(() => document.activeElement?.id ?? null);
const insideOverlay = page => page.evaluate(sel => document.querySelector(sel)?.contains(document.activeElement) ?? false, OVERLAY);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-held/index.html');
    await page.waitForSelector('#dock-rail-held-workspace', {state: 'attached'});
    await expect(page.locator('.neo-dashboard-dock-edge-rail-right')).toBeVisible({timeout: 10000})
});

test.describe('Neo.dashboard.dock.Workspace — the app-held reveal', () => {
    test('a held reveal shows the pane without taking focus, and a click beside it keeps it open', async ({page}) => {
        await page.locator('#dock-rail-held-hold').click();

        await expect(page.locator(OVERLAY)).toBeVisible({timeout: 10000});
        await expect(page.locator(LOG)).toHaveText('revealed-held:detail');
        expect(await insideOverlay(page), 'focus stayed outside the overlay').toBe(false);

        await page.locator('#dock-rail-held-main-button').click();

        await expect(page.locator(LOG)).toHaveText('revealed-held:detail');
        await expect(page.locator(OVERLAY)).toBeVisible();
        expect(await activeId(page), 'the click beside it kept its focus').toBe('dock-rail-held-main-button')
    });

    test('Escape inside a held reveal ends it, and the workspace reports idle', async ({page}) => {
        await page.locator('#dock-rail-held-hold').click();
        await page.locator('#dock-rail-held-detail-button').click();

        expect(await insideOverlay(page), 'precondition: focus is inside the overlay').toBe(true);
        await expect(page.locator(LOG), 'focus entering leaves the hold alone').toHaveText('revealed-held:detail');

        await page.keyboard.press('Escape');

        await expect(page.locator(OVERLAY)).toBeHidden({timeout: 10000});
        await expect(page.locator(LOG)).toHaveText('idle:')
    });

    test('the application lets go of its reveal', async ({page}) => {
        await page.locator('#dock-rail-held-hold').click();
        await expect(page.locator(OVERLAY)).toBeVisible({timeout: 10000});

        await page.locator('#dock-rail-held-release').click();

        await expect(page.locator(OVERLAY)).toBeHidden({timeout: 10000});
        await expect(page.locator(LOG)).toHaveText('idle:')
    });

    test('control: a rail-tab click reveals with focus, and a click beside it dismisses', async ({page}) => {
        await page.locator('.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab').first().click();

        await expect(page.locator(OVERLAY)).toBeVisible({timeout: 10000});
        await expect.poll(() => insideOverlay(page), {message: 'the click reveal takes focus'}).toBe(true);

        await page.locator('#dock-rail-held-main-button').click();

        await expect(page.locator(OVERLAY)).toBeHidden({timeout: 10000})
    });
});
