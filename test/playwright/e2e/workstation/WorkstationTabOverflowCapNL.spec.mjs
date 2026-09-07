import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness: an over-wide active tab is bounded at the overflow control's edge.
 *
 * The overflow packing keeps the active tab visible even when it alone is wider than the usable
 * strip (active-never-hidden). Unbounded, that box — and every geometry derived from it: the
 * persistent per-button indicator, the strip's crossfade indicator, the label glyphs — runs
 * beneath the floating overflow control. So the assertions run against a real composition: the
 * capped box must end where the control begins, the reservation the cap used must equal the
 * RENDERED trailing action cluster (one value, render-grounded, never a second derivation), and
 * headers without an overflow control must keep their full natural width.
 *
 * The reserve is the cluster and not the control alone because the header's trailing partition is
 * variable — an engine action set opts in per consumer, and gated actions keep their box — so a
 * cap measured against one control would let the active tab run under the rest of them.
 *
 * **This spec stages the degenerate case itself.** It used to inherit it from the app's boot
 * composition and read it back with `document.querySelector('.neo-tab-overflow-capped')`. When that
 * composition drifted and no header overflowed any more, the query did not come back empty — it
 * returned the title of a collapsed, zero-width dock reveal, whose trailing partition is a single
 * pin by design. Every downstream measurement then described the reveal's strip, and the staging
 * guard reported `Expected: > 1, Received: 1` about a surface the spec never meant to touch. Two
 * peers spent a bisect and a mechanism hunt on a product regression that did not exist.
 *
 * Hence the shape below: the header is chosen by PREDICATE, the over-wide active is manufactured by
 * widening a real tab's label, and the capped button is read back BY ID. A missing stage now fails
 * as a missing stage.
 *
 * Run: NEO_E2E_PORT=8156 npx playwright test workstation/WorkstationTabOverflowCapNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('Workstation — the active tab never runs beneath the overflow control', () => {
    test.setTimeout(90000);
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 840, width: 1180}
    });

    /**
     * Long enough that the active label alone cannot fit the usable strip at any sane glyph width,
     * and distinctive so a failure message names the button the spec staged rather than one it
     * happened to find.
     */
    const OVER_WIDE = 'Priority Alert Observatory — staged over-wide active label for the overflow cap witness';

    test('the degenerate over-wide active is capped at the control edge; ordinary headers stay full width', async ({neo, page}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            let value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/workstation/index.html');
        await page.waitForSelector('.workstation-dock-host', {timeout: 60000});
        await page.waitForSelector('.neo-tab-overflow-control', {timeout: 60000});

        // Chosen by predicate, never by document order. The requirement is a header that owns an
        // overflow control AND a multi-action trailing partition — the two things the assertions
        // below measure against. A dock reveal satisfies neither, and excluding it explicitly
        // costs one clause and removes the whole substitution class.
        const stage = await page.evaluate(() => {
            const toolbar = [...document.querySelectorAll('.neo-tab-header-toolbar')].find(candidate =>
                !candidate.classList.contains('neo-dashboard-dock-reveal-header') &&
                candidate.clientWidth > 0 &&
                !!candidate.querySelector('.neo-tab-overflow-control') &&
                candidate.querySelectorAll(':scope > .neo-toolbar-action').length > 1);

            if (!toolbar) {
                // The rejected candidates travel with the failure, because "no header qualified" is
                // unactionable while "six headers, none with a control" names the drift.
                return {
                    rejected: [...document.querySelectorAll('.neo-tab-header-toolbar')].map(candidate => ({
                        actions: candidate.querySelectorAll(':scope > .neo-toolbar-action').length,
                        control: !!candidate.querySelector('.neo-tab-overflow-control'),
                        reveal : candidate.classList.contains('neo-dashboard-dock-reveal-header'),
                        width  : Math.round(candidate.clientWidth)
                    })),
                    toolbarId: null
                }
            }

            const active = toolbar.querySelector('.neo-tab-header-button.pressed');

            return {activeId: active?.id ?? null, rejected: null, toolbarId: toolbar.id}
        });

        expect(stage.toolbarId,
            `no header stages the overflow branch — the app must boot one non-reveal header owning an overflow control and a multi-action trailing partition. Candidates: ${JSON.stringify(stage.rejected)}`
        ).toBeTruthy();

        expect(stage.activeId, `${stage.toolbarId} must carry a pressed tab to widen`).toBeTruthy();

        // The stage has two halves, and BOTH are load-bearing.
        //
        // The label makes the active tab degenerate on purpose: widened through the component's own
        // config, so the box the plugin later measures is a genuinely rendered over-wide label
        // rather than anything simulated in the DOM.
        await neo.setConfig(stage.activeId, {text: OVER_WIDE});

        // The narrowing is what schedules the cap pass, and assuming otherwise cost an hour.
        // Measured: after the label alone, the active box rendered 474px inside a 276px strip with
        // `scrollWidth` 522 — a genuinely overflowing header — and NO cap appeared. A viewport nudge
        // did not help either, and the numbers say why: the toolbar stayed 276px through it, so a
        // geometry-keyed pass had nothing to react to. That control proved its branch ran and
        // proved nothing about the payload.
        //
        // A real width change (276 → 108) caps immediately. The cap is driven by toolbar geometry,
        // not by label content, so a spec that widens a label and waits is asserting against a pass
        // that was never scheduled.
        await page.setViewportSize({height: 840, width: 760});

        // Read back BY ID. The defect this spec now guards against was a document-order query
        // resolving to a different header's button, so waiting on the class alone would reinstate
        // exactly the substitution the stage exists to prevent.
        // `expect.poll` rather than `waitForFunction`, purely for what the timeout SAYS. A bare
        // `waitForFunction` expiry reads "Timeout 30000ms exceeded" and names neither the header
        // nor the stage, which is the failure this spec was rewritten to stop producing.
        await expect.poll(
            () => page.evaluate(id => document.getElementById(id)?.classList.contains('neo-tab-overflow-capped') ?? false, stage.activeId),
            {
                message: `${stage.activeId} in ${stage.toolbarId} must be capped after the stage — its label was widened and the toolbar narrowed. No cap means the projection never ran on the surface this spec staged.`,
                timeout: 30000
            }
        ).toBe(true);

        const facts = await page.evaluate(({activeId, toolbarId}) => {
            const rect = el => {
                      const {left, right, top, bottom, width} = el.getBoundingClientRect();
                      return {left, right, top, bottom, width}
                  },
                  overlap = (a, b) => Math.max(0,
                      Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0,
                      Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
                  toolbar = document.getElementById(toolbarId),
                  capped  = document.getElementById(activeId),
                  // Scoped to the staged header. A document-wide control query would pick whichever
                  // control comes first, which is the same defect one level along.
                  control = toolbar.querySelector('.neo-tab-overflow-control'),
                  // Resolved once and reported through sentinels below. A capped button that lost
                  // its text or indicator node is a DIFFERENT failure from one whose style is
                  // wrong, and reading them inline threw `getComputedStyle(null)` — a TypeError
                  // that aborts the evaluate and names neither condition.
                  cappedText      = capped.querySelector('.neo-button-text'),
                  cappedIndicator = capped.querySelector('.neo-tab-button-indicator'),
                  pressed         = [...document.querySelectorAll('.neo-tab-header-button.pressed')];

            // The reserve is the WHOLE trailing action partition, not the overflow control alone.
            // Gated actions count: the focus-gating carrier hides them with `visibility`, which
            // preserves their box, so a tab allowed to run under a quiet action would still be
            // covered the moment its pane takes focus. Measured from the DOM rather than a count
            // times an assumed size — the partition is per-consumer and per-opt-in flag.
            const actions = [...toolbar.querySelectorAll(':scope > .neo-toolbar-action')],
                  cluster = actions.length
                      ? rect(toolbar).right - Math.min(...actions.map(action => rect(action).left))
                      : 0;

            return {
                actionCount: actions.length,
                capped     : {
                    rect         : rect(capped),
                    maxWidth     : parseFloat(capped.style.maxWidth),
                    textOverflow : cappedText ? getComputedStyle(cappedText).textOverflow : 'no-text-node',
                    indicatorRect: cappedIndicator ? rect(cappedIndicator) : null,
                    controlIx    : control ? overlap(rect(capped), rect(control)) : -1
                },
                clusterWidth: cluster,
                control     : control && rect(control),
                // Every pressed button in the staged header, control-relative. Scoped, because a
                // pressed button in a header that owns no control cannot intersect one.
                pressedIx: pressed.filter(button => button.closest('.neo-tab-header-toolbar') === toolbar)
                    .map(button => ({
                        ix  : control ? overlap(rect(button), rect(control)) : -1,
                        text: button.textContent.trim()
                    })),
                toolbarRect: rect(toolbar),
                // Ordinary case: every pressed button OUTSIDE the staged header is uncapped and its
                // absolute indicator spans its full box.
                ordinary: pressed.filter(button => {
                    const owner = button.closest('.neo-tab-header-toolbar');

                    // Excluding the reveals is not tidying: a collapsed reveal's title is `pressed`
                    // and carries a STATIC cap class while measuring zero width, so it entered this
                    // control as an empty-text, zero-box row that no assertion below can fail. A
                    // control padded with unpaintable entries reports coverage it does not have —
                    // the same substitution this spec exists to remove, one level along, inside my
                    // own control.
                    return owner && owner !== toolbar &&
                        !owner.classList.contains('neo-dashboard-dock-reveal-header') &&
                        rect(button).width > 0
                })
                    .map(button => {
                        const indicator = button.querySelector('.neo-tab-button-indicator');
                        return {
                            hasCapStyle: !!button.style.maxWidth,
                            text       : button.textContent.trim(),
                            widthDelta : indicator ? Math.abs(rect(indicator).width - rect(button).width) : null
                        }
                    })
            }
        }, stage);

        expect(facts.control, `the staged header ${stage.toolbarId} must render its overflow control`).toBeTruthy();

        // The symptom, first: no pressed button in the staged header paints beneath the control.
        // This is the assertion that convicts an uncapped build directly with the measured overlap
        // in the message.
        facts.pressedIx.forEach(entry => {
            expect(entry.ix, `${entry.text}: pressed button must not intersect the overflow control`).toBe(0)
        });

        // The core geometry: the capped active box — and the per-button indicator spanning it — ends
        // where the control begins. Zero painted intersection.
        expect(facts.capped.controlIx, 'capped active button must not intersect the overflow control').toBe(0);
        expect(facts.capped.rect.right, 'capped box ends at or before the control edge').toBeLessThanOrEqual(facts.control.left + 0.5);
        // Presence before geometry: without this, a capped button that lost its indicator fails on
        // `Cannot read properties of null` one line down — an abort that names no condition, which
        // is the same crash this spec used to take inside the evaluate.
        expect(facts.capped.indicatorRect, 'the capped button carries a per-button indicator').not.toBeNull();
        expect(
            Math.abs(facts.capped.indicatorRect.width - facts.capped.rect.width),
            'the per-button indicator spans exactly the capped box'
        ).toBeLessThanOrEqual(1);

        // Guards the predicate that selected this header, against the header itself: the cluster
        // identity below is only meaningful while the trailing partition is real. If the staged
        // header ever collapses to a lone overflow control, this fails instead of degenerating into
        // the single-operand form it replaced.
        expect(facts.actionCount, `${stage.toolbarId} must still carry the multi-action trailing partition it was selected for`)
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
