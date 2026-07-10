import { test, expect } from '../../fixtures.mjs';

/**
 * Whitebox-e2e for the dock motion pipeline — the "e2e-tested" half of "animated": committed dock
 * operations on the REAL app move real pixels, and the `neo-dashboard-dock-animating` signal
 * (`DockMotionSignal`) brackets each motion — appears when motion starts, clears when it settles.
 * That bracket is the exact lifecycle tour step-gating and the recording pipeline consume, so these
 * specs pin the integrated truth of the three-producer pipeline (the token contract, the
 * choreography classes, and the FLIP commit layer) rather than any single producer's unit view.
 *
 * Waits are event/state-driven only (`expect.poll` on DOM class presence, `observe_motion` rect
 * samples over a window) — no timing sleeps, per the house e2e rule.
 *
 * Run: NEO_E2E_PORT=8093 npx playwright test dashboard/DockMotionNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

const SIGNAL = '.neo-dashboard-dock-animating';

const connect = async (page, neuralLink) => {
    await page.goto('/examples/dashboard/dock/');
    page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
    await page.waitForTimeout(2500); // settle worker boot + first render (the one sanctioned boot wait)

    const app      = await neuralLink.connectToApp('Neo.examples.dashboard.dock');
    const holders  = await app.findInstances({ className: 'Neo.examples.dashboard.dock.MainContainer' }, ['id']);
    const holderId = Array.isArray(holders) ? holders[0]?.id : holders?.id;
    expect(holderId, 'the dock MainContainer must exist in the App Worker').toBeTruthy();

    // Motion-contract readiness: the dock tokens arrive via the per-surface theme-file loading
    // — a state-driven wait, not a sleep. If this times out, the LOADER is the defect
    // (tokens absent → every motion collapses to instant): see the token-delivery bug ticket.
    await expect.poll(async () => page.evaluate(() => {
        const scope = document.querySelector('.neo-dashboard') || document.body;
        return getComputedStyle(scope).getPropertyValue('--dock-transition-duration').trim();
    }), { message: 'the dock motion tokens must be resolvable on the surface (theme-file delivery)', timeout: 15000, intervals: [250] }).not.toBe('');

    return { app, holderId };
};

// The signal class must APPEAR (motion started) — polled fast enough to catch a token-length
// (260ms) window — and then CLEAR (motion settled). Producer-side leaves are event-driven
// (transitionend / animationend / FLIP play resolution); the clear bound includes the signal's
// own fail-safe horizon so a lost end event fails the spec only if the BACKSTOP also fails.
const expectSignalBracket = async (page, {appearMs = 1500, clearMs = 3500} = {}) => {
    await expect.poll(
        () => page.locator(SIGNAL).count(),
        { message: 'the dock-animating signal must APPEAR when motion starts', timeout: appearMs, intervals: [25] }
    ).toBeGreaterThan(0);

    await expect.poll(
        () => page.locator(SIGNAL).count(),
        { message: 'the dock-animating signal must CLEAR when motion settles', timeout: clearMs, intervals: [50] }
    ).toBe(0);
};

test.describe('Dock motion pipeline (Neural Link) — the signal brackets real motion', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 } });

    test('a committed resizeSplit GLIDES: real geometry motion over time, signal-bracketed', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // sample DOM rects by the FLIP MARKER class, not by instance id: the re-projection
        // rebuilds the pane instances (removeAll + add), so any instance-bound observation dies
        // mid-window — the marker class is exactly the survives-recreation correlation key the
        // FLIP addon itself uses
        await page.evaluate(() => {
            window.__glide = [];
            const tick = () => {
                const el = document.querySelector('[class*="dock-flip-item-"]');
                el && window.__glide.push(Math.round(el.getBoundingClientRect().width));
                if (window.__glide.length < 120) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
        });

        // state-relative: the app heap is SHARED across the sweep (SharedWorker), so derive a
        // guaranteed-delta target from the CURRENT committed sizes rather than assuming seeds
        const topo0  = await app.getDockTopology(holderId);
        const doc0   = topo0?.document ?? topo0;
        const cur    = doc0.nodes['root-split'].sizes;
        const target = cur[0] < 0.5 ? [0.65, 0.35] : [0.3, 0.7];

        const result = await app.executeDockOperation(holderId, {
            operation: 'resizeSplit', splitNodeId: 'root-split', sizes: target
        });
        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        await expectSignalBracket(page);

        // real movement: the pane traveled THROUGH intermediate widths (a hard cut shows at
        // most the before/after pair; a glide shows a progression)
        const widths = [...new Set(await page.evaluate(() => window.__glide))].filter(w => w > 0);
        expect(widths.length, `the pane must move THROUGH intermediate widths (saw ${widths.length} distinct)`).toBeGreaterThan(2);
    });

    test('a committed moveItem is FLIP-bracketed: the signal appears and clears around the structural commit', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // state-relative (shared heap): pick a REAL cross-zone move from the current doc —
        // an item out of main-tabs if it has one, else one back INTO it
        const topo0     = await app.getDockTopology(holderId);
        const doc0      = topo0?.document ?? topo0;
        const mainItems = doc0.nodes['main-tabs']?.items || [];
        const move      = mainItems.length
            ? { itemId: mainItems[0], targetNodeId: 'terminal-tabs' }
            : { itemId: (doc0.nodes['terminal-tabs']?.items || [])[0], targetNodeId: 'main-tabs' };
        expect(move.itemId, 'a movable item must exist in the shared-heap doc').toBeTruthy();

        const [result] = await Promise.all([
            app.executeDockOperation(holderId, {
                operation: 'moveItem', itemId: move.itemId, targetNodeId: move.targetNodeId, index: 0
            }),
            expectSignalBracket(page)
        ]);

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);
        // document truth stays pinned by the structural suite; here the claim is the BRACKET —
        // but assert the move landed so a silent no-op cannot green this spec
        const topo = await app.getDockTopology(holderId);
        const doc  = topo?.document ?? topo;
        expect(doc.nodes[move.targetNodeId].items).toContain(move.itemId);
    });

    test('a rail-click reveal SLIDES: the overlay motion is signal-bracketed through the counted window', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        // the seeded workspace shows the inspector VISIBLE — auto-hide it first (the landed
        // reveal journey's own setup op), which projects its rail tab
        // idempotent under the shared heap: a prior spec may already have hidden or pinned it
        const topo0 = await app.getDockTopology(holderId);
        const doc0  = topo0?.document ?? topo0;

        if (doc0.items?.inspector?.autoHidden !== true) {
            const setup = await app.executeDockOperation(holderId, {
                operation: 'setItemAutoHidden', itemId: 'inspector', autoHidden: true
            });
            expect(setup.errors).toEqual([]);
        }

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', { hasText: 'Inspector' }).first();
        await expect(railTab, 'the inspector rail tab must render after auto-hiding').toBeVisible({ timeout: 10000 });


        await Promise.all([
            railTab.click(),
            expectSignalBracket(page)
        ]);

        // the reveal actually opened (the signal wasn't a stray)
        await expect(page.locator('.neo-dashboard-dock-reveal-overlay:not(.neo-dashboard-dock-reveal-overlay-hidden)'))
            .toHaveCount(1);
    });
});

test.describe('Dock motion pipeline — reduced-motion collapses through the token layer', () => {
    test.setTimeout(90000);
    test.use({ viewport: { width: 1600, height: 900 }, reducedMotion: 'reduce' });

    test('a committed resizeSplit lands INSTANTLY: correct document, no sustained motion, signal clears within the fail-safe', async ({ page, neuralLink }) => {
        const { app, holderId } = await connect(page, neuralLink);

        const tabs   = await app.findInstances({ ntype: 'tab-container' }, ['id']);
        const paneId = (Array.isArray(tabs) ? tabs : [tabs]).map(t => t?.id).filter(Boolean)[0];

        const [motion, result] = await Promise.all([
            app.observeMotion([paneId], 1200, 50),
            app.executeDockOperation(holderId, {
                operation: 'resizeSplit', splitNodeId: 'root-split', sizes: [0.3, 0.7]
            })
        ]);

        expect(result.errors).toEqual([]);
        expect(result.applied).toBe(true);

        // instant settle: at most the before/after widths — never a progression of intermediates
        const widths = [...new Set((motion?.samples || []).map(s => Math.round(s.rects?.[0]?.width ?? -1)).filter(w => w >= 0))];
        expect(widths.length, `reduced motion must NOT glide (saw widths: ${widths.join(',')})`).toBeLessThanOrEqual(2);

        // the HONEST signal bound under 0ms durations: a zero-duration transition fires no
        // transitionend, so the producer's leave may ride the fail-safe backstop (2s) — the
        // contract claim is "clears within the horizon", not a false instant-clear
        await expect.poll(
            () => page.locator(SIGNAL).count(),
            { message: 'the signal must clear within the fail-safe horizon', timeout: 3500, intervals: [100] }
        ).toBe(0);
    });
});
