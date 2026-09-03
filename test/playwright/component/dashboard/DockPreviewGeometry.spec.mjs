import {test, expect} from '@playwright/test';

/**
 * The preview overlay's own geometry, measured on a host that declares nothing but the positioning
 * context — the shape a downstream consumer arrives at by reading the docs and stopping there.
 *
 * A dock host lays out `fit`, so a preview the engine never positions is an in-flow
 * `.neo-layout-fit-item` at `flex: 1 0 100%` — a second full host width in the flex row. The host
 * then stays programmatically scrollable behind `overflow-x: hidden`, and any focus or
 * scroll-into-view aimed past the first width shifts the whole workspace out to the left. Nothing
 * scrolls it back: the preview keeps the overflow alive after the re-projection has retired the old
 * shell, so the displacement is permanent until a reload.
 *
 * **Why the fixture carries no stylesheet.** Every shipping consumer either wrote the missing rule
 * or copied it from one that had, so none of them can witness what the engine owes a host that did
 * neither. A fixture with an app sheet would pass whether or not the engine sheet positions the
 * preview, which is the failure mode this file exists to make impossible.
 *
 * **Why `scrollWidth === clientWidth` is the assertion.** It reads the CAUSE. The visible symptom is
 * a displaced shell — but a shell can be displaced for other reasons, and it can also sit correctly
 * at x=0 while the overflow quietly persists, waiting for the next focus call. The shell's position
 * is asserted too, as the consequence; the overflow is asserted as the thing that must not exist.
 *
 * @see https://github.com/neomjs/neo/issues/18142
 */

const HOST = '.dock-preview-geometry-host';

/**
 * Reads the host's overflow state together with the preview's computed position, in one evaluate so
 * every number describes the same frame.
 * @param {Object} page
 * @returns {Promise<Object>}
 */
const readGeometry = page => page.evaluate(host => {
    const el      = document.querySelector(host),
          preview = el?.querySelector(':scope > .neo-dock-preview'),
          shell   = el?.querySelector(':scope > .neo-dashboard-dock-tabs, :scope > .neo-layout-fit-item');

    return {
        clientWidth : el?.clientWidth,
        hostLeft    : el?.getBoundingClientRect().left,
        position    : preview && getComputedStyle(preview).position,
        present     : !!preview,
        scrollLeft  : el?.scrollLeft,
        scrollWidth : el?.scrollWidth,
        shellLeft   : shell?.getBoundingClientRect().left,
        shellPresent: !!shell
    }
}, HOST);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-preview-geometry/index.html');
    await page.waitForSelector('#dock-preview-geometry-workspace', {state: 'attached'});
    await expect(page.locator(`${HOST} .neo-dock-preview`)).toBeAttached({timeout: 10000});

    // Wait for the projection to SETTLE, not merely for the preview to attach. The reconciler
    // stages the next shell as a hidden sibling before retiring the old one, so for the duration of
    // that transaction the host legitimately holds two full-width shells — and `scrollWidth` is
    // then 2x `clientWidth` for a correct reason. Measuring inside that window reads a transient as
    // the defect: it never reproduced locally and failed on CI, which is a race against a slower
    // machine rather than a flaky suite.
    //
    // The settle signal is deliberately NOT `scrollWidth`, which is the property under test — that
    // would make the arms below vacuous, waiting for exactly what they claim to prove. Child count
    // is independent: the host holds its shell plus the two persistent overlays at rest, and one
    // more while a second shell is staged.
    await expect.poll(async () => page.evaluate(host =>
        document.querySelector(host)?.childElementCount ?? 0, HOST), {timeout: 10000}).toBe(3)
});

test.describe('Neo.dashboard.dock.interaction.Preview — the overlay carries its own geometry (#18142)', () => {
    test('a host that declares only position:relative gets no overflow from the preview', async ({page}) => {
        const geometry = await readGeometry(page);

        // Non-vacuity first: with no preview and no shell every assertion below is trivially true,
        // and this fixture would report a pass for an engine sheet that positions nothing.
        expect(geometry.present,      'the preview overlay must exist for this to measure anything').toBe(true);
        expect(geometry.shellPresent, 'the projected shell must exist for the same reason').toBe(true);
        expect(geometry.clientWidth,  'the host must have laid out').toBeGreaterThan(0);

        expect(geometry.position, 'the engine sheet positions the preview root').toBe('absolute');

        // The cause. An in-flow preview adds a full host width to the flex row; an absolute one
        // adds none, so the host has no overflow to be scrolled into.
        expect(geometry.scrollWidth, 'the preview must not make the fit host scrollable')
            .toBe(geometry.clientWidth);

        // The consequence, asserted separately: a host that cannot scroll cannot strand its shell.
        expect(geometry.scrollLeft, 'the host rests unscrolled').toBe(0);
        expect(Math.abs(geometry.shellLeft - geometry.hostLeft),
            'the shell sits at the host\'s left edge').toBeLessThanOrEqual(1)
    });

    test('a scroll forced onto the host cannot survive, because there is nowhere to scroll to', async ({page}) => {
        // The defect was never the scroll itself — the reconciler legitimately stages two shells for
        // a few frames, so a transient scroll is expected. It was that the preview kept the overflow
        // alive afterwards, so the scroll had somewhere to persist. Driving one directly is the
        // sharper witness: with the overlay out of the flow the host clamps straight back to 0.
        const settled = await page.evaluate(host => {
            const el = document.querySelector(host);

            el.scrollLeft = 5000;

            return {attempted: 5000, scrollLeft: el.scrollLeft, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth}
        }, HOST);

        expect(settled.scrollWidth, 'still no overflow after the attempt').toBe(settled.clientWidth);
        expect(settled.scrollLeft,  'the host clamps back to its only valid scroll position').toBe(0)
    })
});
