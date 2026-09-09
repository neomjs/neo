import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: maximize on a host-less consumer measures the DOCK AREA, not the app view.
 *
 * `examples/dashboard/dock` lets the workspace host the projected shell directly (no
 * `dockHostReference`) and frames it with a perspective toolbar at index 0 (`dockShellIndex: 1`).
 * The maximize contract says the chrome outside the dock area stays in sight; a measurement taken
 * off the workspace root paints the maximized pane over that toolbar. The component fixture
 * witnesses the rule on a synthetic bar; this arm reads it on the shipped consumer that showed
 * the defect, through the real header action behind its focus gate.
 *
 * Run: npm run test-e2e -- e2e/dashboard/DockExampleMaximizeGeometry --workers=1
 */
const readGeometry = () => {
    const rect  = sel => document.querySelector(sel)?.getBoundingClientRect() || null,
          pane  = rect('.neo-dock-maximized'),
          bar   = rect('.neo-dashboard-dock-perspective-toolbar'),
          shell = document.querySelector('.neo-dashboard-dock-edge-zone.neo-dashboard'),
          root  = rect('.neo-dock-workspace'),
          gap   = shell ? parseFloat(getComputedStyle(shell).getPropertyValue('--dock-maximize-gap')) || 0 : null;

    return pane && bar && shell && root ? {
        barBottom : bar.bottom,
        gap,
        paneBottom: pane.bottom,
        paneLeft  : pane.left,
        paneTop   : pane.top,
        rootTop   : root.top,
        shellLeft : shell.getBoundingClientRect().left,
        shellTop  : shell.getBoundingClientRect().top
    } : null
};

test.describe('examples/dashboard/dock — maximize keeps the perspective toolbar in sight', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1280, height: 720}});

    test('the maximized pane fills the projected shell inset by the gap, under the toolbar', async ({page}) => {
        await page.goto('/examples/dashboard/dock/index.html');

        const strategy = page.locator('.neo-dashboard-dock-tabs', {
            has: page.locator('.neo-tab-header-button:has-text("Strategy")')
        });

        await expect(strategy, 'the example must project its main tabs node').toBeVisible({timeout: 60000});

        // The header actions are focus-gated: a real click on the tab reveals the rail.
        await strategy.locator('.neo-tab-header-button', {hasText: 'Strategy'}).click();

        const maximize = strategy.locator('.neo-tab-header-toolbar .neo-button:has([class*="fa-window-maximize"])');

        await expect(maximize, 'the maximize action appears on the focused node').toBeVisible({timeout: 15000});
        await maximize.click();

        await expect(page.locator('.neo-dock-maximized')).toHaveCount(1);

        // A cleared inline transform is not a settled FLIP, and reading geometry there is the
        // whole failure mode this arm guards. While a maximize play exposed its committed rect
        // before installing the inverse, the inline transform was empty for that entire window,
        // so this resolved mid-exposure and measured the destination by accident. With the
        // invert installed in time it resolves at RELEASE instead — the node still gliding — and
        // the read lands one gap short. The running transition is the authority: it exists for
        // exactly as long as the motion does.
        await page.waitForFunction(() => {
            const el = document.querySelector('.neo-dock-maximized');

            return el && !el.style.transform && el.getAnimations().length === 0
        }, undefined, {timeout: 15000});

        const geometry = await page.evaluate(readGeometry);

        expect(geometry, 'the example must render the toolbar, the shell and the maximized pane').toBeTruthy();
        expect(geometry.barBottom, 'the perspective toolbar sits above the shell').toBeCloseTo(geometry.shellTop, 0);
        expect(geometry.paneTop, 'the pane starts at the SHELL inset by the gap, not at the workspace root')
            .toBeCloseTo(geometry.shellTop + geometry.gap, 0);
        expect(geometry.paneLeft).toBeCloseTo(geometry.shellLeft + geometry.gap, 0);
        expect(geometry.paneTop, 'the toolbar stays uncovered').toBeGreaterThanOrEqual(geometry.barBottom - 0.5);
        expect(geometry.paneTop - geometry.rootTop, 'a root measurement would put the pane one gap below the root')
            .toBeGreaterThan(geometry.gap + 1);

        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dock-maximized')).toHaveCount(0)
    });
});
