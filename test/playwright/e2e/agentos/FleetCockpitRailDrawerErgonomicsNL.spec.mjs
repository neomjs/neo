import {test, expect} from '../../fixtures.mjs';

/**
 * Whitebox-e2e: the cockpit's edge-rail measure and its reveal-drawer content fit.
 *
 * Both properties are boxes, so this witness measures them rather than sampling a rendering of
 * them. That is not a preference: the visual-baseline suite runs in no workflow and fails its
 * goldens on an unmodified tree, so it cannot discriminate a change of this shape. A
 * `getBoundingClientRect` differential can, and it fails on the property rather than on an
 * anti-aliasing delta.
 *
 * The drawer's measure is ENGINE-owned, and the contract is recorded here because reading the
 * stylesheet alone suggests otherwise:
 *   - `DockRevealOverlay` sizes the free dimension (width for left/right rails) from
 *     `revealExtent ?? defaultRevealFraction`, as a PERCENTAGE of the workspace extent.
 *   - `defaultRevealFraction` is `0.25` and no application overrides it.
 *   - `src/dashboard/Container.scss` owns the overlay's `position`, per-edge `inset` and z-index.
 * So a drawer whose content looks undersized cannot be an absent width contract. It is either the
 * fraction being wrong for the surface, or the hosted pane failing to fill what it is handed.
 *
 * Measured at viewport 1280, and the drawer half is CLEAN:
 *   workspace 1229 · overlay 320 (0.260, the engine default) · slot 319 · slot content 295 ·
 *   pane root 295 · UNUSED 0 · slot is column/stretch.
 * The pane consumes the well exactly. The drawer assertions below are therefore a REGRESSION
 * GUARD over already-correct behaviour — they have never been red — and that is stated so their
 * green is not read as proof of a fix made alongside them.
 *
 * The rail half did NOT measure clean, and the rail assertions are the ones with teeth.
 *
 * Run: NEO_E2E_PORT=49221 NEO_TEST_SKIP_CI=true npx playwright test agentos/FleetCockpitRailDrawerErgonomicsNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet cockpit — rail measure + drawer content fit (Neural Link)', () => {
    test.setTimeout(90000);

    test('the strip is consumer-sized and the drawer hands its pane the full content width', async ({page}) => {
        await page.goto('/apps/agentos/index.html');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        const railTab = page.locator('.neo-dashboard-dock-rail-tab', {hasText: 'Agent detail'}).first();
        await expect(railTab, 'the authored detail item must start on the edge rail').toBeVisible({timeout: 30000});

        // Captured before the reveal opens: the strip's own measure is independent of the drawer,
        // so one boot serves both halves.
        const railMetrics = await page.evaluate(() => {
            const rail = document.querySelector('.neo-dashboard-dock-edge-rail'),
                  tabs = [...document.querySelectorAll('.neo-dashboard-dock-rail-tab')];

            if (!rail) return null;

            // The shell's primary navigation is a DIFFERENT component (a tab header toolbar), not a
            // dock edge-rail. It is measured here because the two rails are judged against each
            // other — a proportion decision on one is not reviewable without the other's number.
            const nav = document.querySelector('.agent-shell > .neo-tab-header-toolbar');

            // The label's own box, measured rather than inherited. The strip's cross-axis demand is
            // the rotated text node's WIDTH (writing-mode: vertical-rl) plus the button's horizontal
            // padding — that sum, not a remembered figure, is what the strip must contain.
            const firstTab  = tabs[0],
                  textNode  = firstTab?.querySelector('.neo-button-text'),
                  tabStyle  = firstTab ? getComputedStyle(firstTab) : null,
                  textStyle = textNode ? getComputedStyle(textNode) : null;

            return {
                viewportWidth: window.innerWidth,
                navWidth     : nav ? Math.round(nav.getBoundingClientRect().width) : null,
                railWidth    : Math.round(rail.getBoundingClientRect().width),
                label        : textNode ? {
                    boxWidth  : Number(textNode.getBoundingClientRect().width.toFixed(2)),
                    fontSize  : textStyle.fontSize,
                    lineHeight: textStyle.lineHeight,
                    padLeft   : tabStyle.paddingLeft,
                    padRight  : tabStyle.paddingRight,
                    demand    : Number((textNode.getBoundingClientRect().width +
                                        (parseFloat(tabStyle.paddingLeft) || 0) +
                                        (parseFloat(tabStyle.paddingRight) || 0)).toFixed(2))
                } : null,
                tabs         : tabs.map(tab => {
                    const tr = tab.getBoundingClientRect();
                    return {label: tab.innerText.trim(), w: Math.round(tr.width), h: Math.round(tr.height)}
                })
            }
        });

        expect(railMetrics, 'the right edge rail must be measurable').toBeTruthy();
        console.log('[rail metrics]', JSON.stringify(railMetrics));

        // The strip's extent must be a token a consumer can set, not a constant. Before this
        // contract existed the value was a literal repeated six times — the four rail rules and
        // the reveal overlay's four per-edge insets — which is why a host could restyle a rail tab
        // and could not resize the strip its labels sit in.
        const railSizeToken = await page.evaluate(() => {
            const rail = document.querySelector('.neo-dashboard-dock-edge-rail');
            return rail ? getComputedStyle(rail).getPropertyValue('--dock-edge-rail-size').trim() : ''
        });

        expect(railSizeToken, 'the strip\'s extent must be an overridable token, not a constant').not.toBe('');

        // The cockpit's own value actually reaching the strip. Asserted at the rail rather than at
        // the app root, because `.neo-dashboard` is a PROJECTED class carrying the engine's own
        // defaults — a value set on an outer scope is shadowed by the nested projected one, so
        // this is the assertion that distinguishes "declared" from "landed".
        expect(railMetrics.railWidth, 'the consumer value must reach the strip, not be shadowed by the projected default').toBe(20);

        // CONTAINMENT, measured rather than asserted from a remembered figure. The strip's demand is
        // the rotated text node's width plus the tab's horizontal padding; the strip must exceed it,
        // and the slack is what "cramped" was actually about — the engine's 14px default contains
        // the label with 1px to spare, so the reported defect is crowding, not clipping.
        expect(railMetrics.label, 'the rail tab must expose a measurable label box').toBeTruthy();
        expect(railMetrics.label.demand,
            `the label demands ${railMetrics.label.demand}px and the strip offers ${railMetrics.railWidth}px`
        ).toBeLessThan(railMetrics.railWidth);

        await railTab.click();

        const overlay = page.locator('.neo-dashboard-dock-reveal-overlay').first();
        await expect(overlay, 'the native rail click must open the runtime reveal').toBeVisible({timeout: 15000});
        await expect(overlay.locator('.neo-dashboard-dock-reveal-title')).toHaveText('Agent detail');

        // `paneSlot` is the well the engine stamps; `paneRoot` is the product pane mounted into it.
        // The invariant is that the pane consumes the slot's CONTENT width — slot width less its
        // own horizontal padding — and the delta names any dead space.
        const drawerMetrics = await page.evaluate(() => {
            const overlayEl = document.querySelector('.neo-dashboard-dock-reveal-overlay'),
                  slotEl    = overlayEl?.querySelector('.neo-dashboard-dock-reveal-pane-slot'),
                  paneEl    = slotEl?.firstElementChild;

            if (!overlayEl || !slotEl || !paneEl) return null;

            const slotStyle = getComputedStyle(slotEl),
                  padLeft   = parseFloat(slotStyle.paddingLeft)  || 0,
                  padRight  = parseFloat(slotStyle.paddingRight) || 0,
                  slotRect  = slotEl.getBoundingClientRect(),
                  paneRect  = paneEl.getBoundingClientRect(),
                  contentW  = slotRect.width - padLeft - padRight;

            return {
                workspaceWidth   : Math.round(document.querySelector('.fm-fleet-cockpit')?.getBoundingClientRect().width || 0),
                overlayWidth     : Math.round(overlayEl.getBoundingClientRect().width),
                slotContentWidth : Math.round(contentW),
                paneRootWidth    : Math.round(paneRect.width),
                unusedWidth      : Math.round(contentW - paneRect.width),
                slotFlexDirection: slotStyle.flexDirection,
                slotAlignItems   : slotStyle.alignItems
            }
        });

        expect(drawerMetrics, 'the reveal overlay, its pane slot and a hosted pane must all exist').toBeTruthy();
        console.log('[drawer metrics]', JSON.stringify(drawerMetrics));

        // Distinguishes a fraction regression from a fill regression. A generous band on purpose —
        // this is a discriminator, not a pixel lock.
        expect(drawerMetrics.overlayWidth / drawerMetrics.workspaceWidth,
            'the overlay must claim its engine-contracted share of the workspace'
        ).toBeGreaterThan(0.15);

        // REGRESSION GUARD (never been red): the hosted pane uses the width it is handed. One
        // rounded pixel absorbs sub-pixel layout; beyond that is dead space.
        expect(drawerMetrics.unusedWidth,
            `the hosted pane must fill the drawer's content width — ${drawerMetrics.unusedWidth}px unused of ${drawerMetrics.slotContentWidth}px`
        ).toBeLessThanOrEqual(1);

        // THE COUPLING CONTROL, asserted by mutation rather than by a single reading.
        //
        // The strip's width and the overlay's reserved inset must come from ONE source, because
        // the overlay reserves exactly the strip's extent — move one without the other and a gap
        // or an overlap opens with nothing to catch it. A single boot cannot tell "coupled" from
        // "two values that happen to agree today", which is precisely the state this contract
        // exists to end, so the token is moved in-page and both readers must follow.
        //
        // Deliberately NOT asserted: the strip and the drawer sit a small constant apart (~5px,
        // rounding between 4 and 6 across runs, because the overlay's width is a percentage and
        // its edge lands on fractional pixels). That offset predates this contract and is
        // unchanged by it. Freezing it would pin an unjustified number at a precision the
        // measurement does not have. The control below is immune to the rounding because it
        // compares two readings taken the same way.
        const coupled = await page.evaluate(() => {
            const rail = document.querySelector('.neo-dashboard-dock-edge-rail'),
                  zone = rail?.closest('.neo-dashboard');

            if (!rail || !zone) return null;

            const probe = value => {
                zone.style.setProperty('--dock-edge-rail-size', value);
                const r = rail.getBoundingClientRect(),
                      o = document.querySelector('.neo-dashboard-dock-reveal-overlay').getBoundingClientRect();
                return {rail: Math.round(r.width), gap: Math.round(r.left - o.right)}
            };

            const before = probe('20px'),
                  after  = probe('48px');

            zone.style.removeProperty('--dock-edge-rail-size');

            return {before, after}
        });

        expect(coupled, 'the rail and its projected zone must both be reachable').toBeTruthy();
        console.log('[coupling control]', JSON.stringify(coupled));

        expect(coupled.after.rail, 'the strip must follow the token').toBe(48);
        expect(coupled.after.gap,
            `the drawer must follow the SAME token — strip/drawer offset moved ${coupled.before.gap}px → ${coupled.after.gap}px, so the two are still independent`
        ).toBe(coupled.before.gap);
    });
});
