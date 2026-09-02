import {test, expect} from '@playwright/test';

/**
 * A rail reveal leaves the way it came. Dismissal used to land the hidden class at once — one
 * frame from open to gone next to an entry that slides — so the overlay now leaves in two phases:
 * a leaving class runs the exit keyframes on the DOM it keeps, and the hidden class lands on the
 * root's own `animationend`. Read on a rendered dock, per edge: after Escape the overlay carries
 * the leaving class with the exit animations running on its content, takes no pointer, and only
 * then becomes hidden.
 *
 * The animations are read through `getAnimations()` on the pane slot rather than through class
 * presence alone, so a leaving class with no keyframes behind it (a stylesheet that never applied)
 * cannot pass.
 */

const EDGES = ['left', 'right', 'top', 'bottom'];

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-origin/index.html');
    await page.waitForSelector('#dock-rail-origin-workspace', {state: 'attached'});

    for (const edge of EDGES) {
        await expect(page.locator(`.neo-dashboard-dock-edge-rail-${edge}`)).toBeVisible({timeout: 10000})
    }
});

test.describe('Neo.dashboard.dock.interaction.RevealOverlay — the exit motion', () => {
    for (const edge of EDGES) {
        test(`[${edge}] a dismissed reveal slides back under its strip before it hides`, async ({page}) => {
            const railSel    = `.neo-dashboard-dock-edge-rail-${edge}`,
                  overlaySel = `.neo-dashboard-dock-reveal-overlay-${edge}`,
                  overlay    = page.locator(overlaySel);

            await page.locator(`${railSel} .neo-dashboard-dock-rail-tab`).first().click();
            await expect(overlay).toBeVisible({timeout: 10000});

            // Let the entry settle so the exit is the only motion read below.
            await overlay.evaluate(node => Promise.all(node.getAnimations({subtree: true}).map(a => a.finished.catch(() => {}))));

            // What the slot HOLDS, not only that it animates. The arm below asserted the slot's
            // animation names and its `display`, all of which an EMPTY slot satisfies — and the rail
            // detached the pane on the dismissal frame, so the keyframes ran over nothing and the
            // panel read as an instant hide on the served app while this stayed green.
            const paneCount = await overlay.evaluate(node =>
                node.querySelector('.neo-dashboard-dock-reveal-pane-slot').children.length);

            expect(paneCount, `[${edge}] the reveal must hold a pane before it is dismissed`).toBeGreaterThan(0);

            const dismissedAt = Date.now();

            await page.keyboard.press('Escape');

            // Phase 1: leaving — the DOM is still there, the exit keyframes run on the content, and
            // the departing panel takes no pointer.
            await expect(overlay, `[${edge}] the dismissal leaves instead of cutting`).toHaveClass(/neo-dashboard-dock-reveal-overlay-leaving/);
            await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-hidden/);

            const exit = await overlay.evaluate(node => {
                const slot = node.querySelector('.neo-dashboard-dock-reveal-pane-slot');

                return {
                    display      : getComputedStyle(node).display,
                    paneCount    : slot.children.length,
                    pointerEvents: getComputedStyle(node).pointerEvents,
                    slotNames    : slot.getAnimations().map(a => a.animationName),
                    rootNames    : node.getAnimations().map(a => a.animationName)
                }
            });

            expect(exit.display, `[${edge}] still displayed while leaving`).not.toBe('none');
            expect(exit.pointerEvents, `[${edge}] a departing panel takes no pointer`).toBe('none');
            expect(exit.rootNames, `[${edge}] the root fades out`).toContain('neo-dock-reveal-fade-out');
            expect(exit.slotNames, `[${edge}] the content travels back to its edge`).toContain(`neo-dock-reveal-to-${edge}`);

            // The assertion this arm was missing: something must be travelling. An empty slot
            // carries the same animation name and the same computed styles as a full one.
            expect(exit.paneCount, `[${edge}] the pane is still mounted while the exit runs — an empty slot must not pass`).toBe(paneCount);

            // Phase 2: hidden, once the root's own animation has ended.
            await expect(overlay, `[${edge}] hidden after the exit`).toHaveClass(/neo-dashboard-dock-reveal-overlay-hidden/, {timeout: 10000});
            await expect(overlay).not.toHaveClass(/neo-dashboard-dock-reveal-overlay-leaving/);
            await expect(overlay).toBeHidden();

            // The hide came from the end event, not from the fail-safe: one reveal duration plus
            // the round trips is a few hundred milliseconds; the wedge backstop is two seconds.
            // A fail-safe hide would mean the root's `animationend` never reached the worker.
            const hiddenAfter = Date.now() - dismissedAt;

            expect(hiddenAfter, `[${edge}] hidden ${hiddenAfter} ms after the dismissal — the end event, not the backstop`).toBeLessThan(1500);

            // …and the deferral ends. A pane parked forever in a hidden overlay would satisfy every
            // assertion above and leak the instance the exit was protecting.
            const settled = await overlay.evaluate(node =>
                node.querySelector('.neo-dashboard-dock-reveal-pane-slot').children.length);

            expect(settled, `[${edge}] the pane is detached once the overlay is hidden`).toBe(0)
        })
    }

    /**
     * The operator saw this in one skin and not the other, which is the whole reason it needs a
     * theme dimension. The overlay's surface is deliberately the host's — `--dock-reveal-background`
     * resolves to `--neo-background-color` — so an empty overlay fading out is nearly invisible on a
     * dark ground and just barely legible on a light one. A single-theme eye-read would have called
     * this working (light) or shown nothing at all (dark); neither is evidence.
     *
     * The assertion is deliberately theme-INDEPENDENT: what must hold in both skins is that a pane
     * is travelling, not what it looks like while it does.
     */
    for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
        test(`[${theme}] the exit carries its pane in both skins`, async ({page}) => {
            const overlay = page.locator('.neo-dashboard-dock-reveal-overlay-left');

            await page.evaluate(name => {
                for (const el of [document.body, document.documentElement]) {
                    el.classList.forEach(c => c.startsWith('neo-theme-') && el.classList.remove(c))
                }
                document.body.classList.add(name)
            }, theme);

            await page.locator('.neo-dashboard-dock-edge-rail-left .neo-dashboard-dock-rail-tab').first().click();
            await expect(overlay).toBeVisible({timeout: 10000});
            await overlay.evaluate(node => Promise.all(node.getAnimations({subtree: true}).map(a => a.finished.catch(() => {}))));

            await page.keyboard.press('Escape');
            await expect(overlay).toHaveClass(/neo-dashboard-dock-reveal-overlay-leaving/);

            const during = await overlay.evaluate(node => {
                const slot = node.querySelector('.neo-dashboard-dock-reveal-pane-slot');

                return {paneCount: slot.children.length, slotNames: slot.getAnimations().map(a => a.animationName)}
            });

            expect(during.paneCount, `[${theme}] a pane travels with the exit`).toBeGreaterThan(0);
            expect(during.slotNames, `[${theme}] and it is actually animating`).toContain('neo-dock-reveal-to-left')
        })
    }
});
