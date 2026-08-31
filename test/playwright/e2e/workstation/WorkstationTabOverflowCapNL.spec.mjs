import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: an over-wide active tab is bounded at the overflow control's edge.
 *
 * The overflow packing keeps the active tab visible even when it alone is wider than the usable
 * strip (active-never-hidden). Unbounded, that box — and every geometry derived from it: the
 * persistent per-button indicator, the strip's crossfade indicator, the label glyphs — runs
 * beneath the floating overflow control. The workstation heavy header stages this degenerate
 * case at default boot (twelve canonical titles in a narrow pane), so the assertions run against
 * the real composition: the capped box must end where the control begins, the reservation the cap
 * used must equal the RENDERED trailing action cluster (one value, render-grounded, never a second
 * derivation), and headers without an overflow control must keep their full natural width.
 *
 * The reserve is the cluster and not the control alone because the header's trailing partition is
 * variable — an engine action set opts in per consumer, and gated actions keep their box — so a
 * cap measured against one control would let the active tab run under the rest of them.
 *
 * Run: NEO_E2E_PORT=8156 npx playwright test workstation/WorkstationTabOverflowCapNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — the active tab never runs beneath the overflow control', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1180}
    });

    test('the degenerate over-wide active is capped at the control edge; ordinary headers stay full width', async ({page}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 60000});
        // The cap rides the same projection pass that syncs the control; the settle keeps this spec
        // anchored on the control (which exists in every variant) so a cap-less build fails on the
        // painted-intersection assertions below instead of a selector timeout.
        await page.waitForTimeout(1200);

        const facts = await page.evaluate(() => {
            const rect = el => {
                      const {left, right, top, bottom, width} = el.getBoundingClientRect();
                      return {left, right, top, bottom, width}
                  },
                  overlap = (a, b) => Math.max(0,
                      Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0,
                      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
                  control = document.querySelector('.neo-tab-overflow-control'),
                  capped  = document.querySelector('.neo-tab-overflow-capped'),
                  toolbar = capped?.closest('.neo-tab-header-toolbar'),
                  pressed = [...document.querySelectorAll('.neo-tab-header-button.pressed')];

            // The reserve is the WHOLE trailing action partition, not the overflow control alone.
            // Gated actions count: the focus-gating carrier hides them with `visibility`, which
            // preserves their box, so a tab allowed to run under a quiet action would still be
            // covered the moment its pane takes focus. Measured from the DOM rather than a count
            // times an assumed size — the partition is per-consumer and per-opt-in flag.
            const actions = toolbar ? [...toolbar.querySelectorAll(':scope > .neo-toolbar-action')] : [],
                  cluster = actions.length && toolbar
                      ? rect(toolbar).right - Math.min(...actions.map(action => rect(action).left))
                      : 0;

            return {
                control     : control && rect(control),
                actionCount : actions.length,
                clusterWidth: cluster,
                capped      : capped && {
                    rect         : rect(capped),
                    maxWidth     : parseFloat(capped.style.maxWidth),
                    textOverflow : getComputedStyle(capped.querySelector('.neo-button-text')).textOverflow,
                    indicatorRect: rect(capped.querySelector('.neo-tab-button-indicator')),
                    controlIx    : control ? overlap(rect(capped), rect(control)) : -1
                },
                toolbarRect: toolbar && rect(toolbar),
                pressedIx  : pressed.map(button => ({
                    text: button.textContent.trim(),
                    ix  : control ? overlap(rect(button), rect(control)) : -1
                })),
                // Ordinary case: every pressed button OUTSIDE the overflowing header is uncapped and its
                // absolute indicator spans its full box.
                ordinary: pressed.filter(button => !button.classList.contains('neo-tab-overflow-capped'))
                    .map(button => {
                        const indicator = button.querySelector('.neo-tab-button-indicator');
                        return {
                            text       : button.textContent.trim(),
                            hasCapStyle: !!button.style.maxWidth,
                            widthDelta : indicator ? Math.abs(rect(indicator).width - rect(button).width) : null
                        }
                    })
            }
        });

        expect(facts.control, 'precondition: the heavy header must render its overflow control at default boot').toBeTruthy();

        // The symptom, first: no pressed button anywhere paints beneath the control. This is the
        // assertion that convicts an uncapped build directly with the measured overlap in the message.
        facts.pressedIx.forEach(entry => {
            expect(entry.ix, `${entry.text}: pressed button must not intersect the overflow control`).toBe(0)
        });

        expect(facts.capped, 'the degenerate over-wide active must be capped — if no cap exists, the stage no longer exercises this branch and the spec must fail loudly').toBeTruthy();

        // The core geometry: the capped active box — and the per-button indicator spanning it — ends
        // where the control begins. Zero painted intersection.
        expect(facts.capped.controlIx, 'capped active button must not intersect the overflow control').toBe(0);
        expect(facts.capped.rect.right, 'capped box ends at or before the control edge').toBeLessThanOrEqual(facts.control.left + 0.5);
        expect(
            Math.abs(facts.capped.indicatorRect.width - facts.capped.rect.width),
            'the per-button indicator spans exactly the capped box'
        ).toBeLessThanOrEqual(1);

        // The staging guard: this identity is only meaningful while the header carries a real action
        // partition. If the app ever collapses back to a lone overflow control, the assertion below
        // degenerates into the single-operand form it replaced and stops testing the cluster at all.
        expect(facts.actionCount, 'the heavy header must stage a multi-action trailing partition')
            .toBeGreaterThan(1);

        // Reservation truth (single value, render-grounded): the cap the plugin applied equals the
        // toolbar extent minus the RENDERED trailing action cluster — not the pre-creation estimate,
        // and not the overflow control alone. The control was the whole partition once; the engine
        // action set made it a cluster, and a cap that reserved only the control would let the active
        // tab run under close and maximize — the exact covered-tab symptom this spec guards against.
        expect(
            facts.capped.maxWidth,
            `cap must derive from the rendered action cluster (extent ${facts.toolbarRect.width}, ${facts.actionCount} actions spanning ${facts.clusterWidth})`
        ).toBe(Math.floor(facts.toolbarRect.width) - Math.ceil(facts.clusterWidth));

        // The covered cut becomes an honest ellipsis.
        expect(facts.capped.textOverflow, 'capped label must ellipsize').toBe('ellipsis');

        // Ordinary headers (no overflow): full natural width, no stale cap, indicator spans the box.
        expect(facts.ordinary.length, 'the app must also stage ordinary non-overflowing headers').toBeGreaterThan(0);
        facts.ordinary.forEach(entry => {
            expect(entry.hasCapStyle, `${entry.text}: an uncapped button must carry no maxWidth`).toBe(false);
            entry.widthDelta !== null && expect(entry.widthDelta, `${entry.text}: indicator spans the full button`).toBeLessThanOrEqual(1)
        });

        expect(pageErrors, 'no page errors during the overflow-cap journey').toEqual([])
    })
});
