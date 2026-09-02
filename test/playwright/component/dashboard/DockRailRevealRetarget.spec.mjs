import {test, expect} from '@playwright/test';

/**
 * Retargeting a reveal — clicking another item of the same rail while one is open — swapped the
 * pane in one frame: the state machine follows the click without closing, so no visibility
 * boundary is crossed and no motion runs. Now the incoming content enters the way a fresh reveal
 * does, while the root stays where it is: a swap generation class alternates two names for the
 * same keyframes, which is what makes a CSS animation restart, and the root runs a held keyframe
 * of the same duration so its own end event settles the motion window as an entry's does.
 *
 * Read on a rendered dock: after the retarget the overlay is never hidden or leaving, its title is
 * the new item's, the slot carries a running entry animation again, and the swap class alternates
 * on the next retarget. The animations are read through `getAnimations()`, so a class without
 * keyframes behind it cannot pass.
 */

const
    OVERLAY = '.neo-dashboard-dock-reveal-overlay-right',
    TAB     = title => `.neo-dashboard-dock-edge-rail-right .neo-dashboard-dock-rail-tab:has-text("${title}")`;

const settleAnimations = overlay => overlay.evaluate(node =>
    Promise.all(node.getAnimations({subtree: true}).map(a => a.finished.catch(() => {}))));

const readSlotAnimations = overlay => overlay.evaluate(node => ({
    root : node.getAnimations().map(a => `${a.animationName}:${a.playState}`),
    slot : node.querySelector('.neo-dashboard-dock-reveal-pane-slot').getAnimations().map(a => `${a.animationName}:${a.playState}`),
    title: node.querySelector('.neo-dashboard-dock-reveal-title')?.textContent.trim()
}));

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-retarget/index.html');
    await page.waitForSelector('#dock-rail-retarget-workspace', {state: 'attached'});
    await expect(page.locator(TAB('Alpha'))).toBeVisible({timeout: 10000});
    await expect(page.locator(TAB('Beta'))).toBeVisible()
});

test.describe('Neo.dashboard.dock.interaction.RevealOverlay — a retarget slides the incoming pane in', () => {
    test('clicking the other item of an open rail re-runs the content entry, and the next retarget alternates', async ({page}) => {
        const overlay = page.locator(OVERLAY);

        await page.locator(TAB('Alpha')).click();
        await expect(overlay).toBeVisible({timeout: 10000});
        await settleAnimations(overlay);

        expect(await overlay.evaluate(node => node.getAnimations({subtree: true}).length), 'the entry has settled').toBe(0);

        // Retarget: the overlay stays visible (never hidden, never leaving), the title follows, and
        // the slot runs the entry keyframes again under the swap generation.
        await page.locator(TAB('Beta')).click();

        await expect(overlay, 'the first retarget stamps swap generation 1').toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-1/);
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-(hidden|leaving)/);

        const first = await readSlotAnimations(overlay);

        expect(first.title).toBe('Beta');
        expect(first.slot.some(name => name.startsWith('neo-dock-reveal-from-right-b:')), `the incoming pane slides in from its edge (${first.slot})`).toBe(true);
        expect(first.root.some(name => name.startsWith('neo-dock-reveal-hold-b:')), `the root holds for the same duration (${first.root})`).toBe(true);

        await settleAnimations(overlay);

        // Back to Alpha: the generation alternates so the animation restarts again.
        await page.locator(TAB('Alpha')).click();

        await expect(overlay, 'the second retarget alternates to generation 2').toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-2/);
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-1/);

        const second = await readSlotAnimations(overlay);

        expect(second.title).toBe('Alpha');
        expect(second.slot.some(name => name.startsWith('neo-dock-reveal-from-right:')), `the alternate generation reuses the entry's own keyframes (${second.slot})`).toBe(true);

        // Dismissal clears the generation so the next entry runs the entry rules, not a swap.
        await page.keyboard.press('Escape');
        await expect(overlay).toHaveClass(/neo-dashboard-dock-reveal-overlay-hidden/, {timeout: 10000});
        await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-swap-/)
    })
});
