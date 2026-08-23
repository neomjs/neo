import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The evolved-D/synthesis AgentCard rendered against a pathological fleet at the
 * card-width matrix — the mounted witness for the operator-selected composition, carrying the
 * falsifiers the retired design-evidence baseline established (the carry-forward where they earn permanence):
 *
 * - long display/engine names crowding the identity column;
 * - two lanes sharing their first seven characters + 2-digit overflow counts — the narrow falsifier:
 *   the head+tail middle elision must preserve each lane's DISTINGUISHING tail;
 * - wake/throttle telltales + a pending control + a retained reject reason;
 * - mixed session state (wedged/limited/idle/off) and the full source-health vocabulary
 *   (wired-observed / wired-inferred / missing / not-wired) — the summary strip must NAME the
 *   abnormal source (no 9px acronym wall) and can never contradict the facts;
 * - the operator avatar-keeper invariant: a visible avatar at every card width (real image slot).
 *
 * Captured on the CARD's own width (294 / 319 / 320 / 328 / 360 / 720) in BOTH skins (neo-dark +
 * neo-light, driven through the real ViewportController#setTheme) — the same axis the selected
 * design renders against. The 319/320 pair is the box-model transition: container queries evaluate
 * the content box (outer − 28px padding − 2px border), so 319 outer = 289 content (last narrow:
 * engine hidden, 44px touch targets) and 320 outer = 290 content (first regular: engine shown,
 * 32px controls); 328 is the operator's exact realistic case. The animated List is pinned to one
 * card-width-plus-margins surface per width, so its own measured geometry seats a one-column item
 * and the card-owned `@container` modes engage; the contrast guard is a luminance delta, honest in
 * either skin.
 * Goldens are created/refreshed under the visual/e2e config only. Fidelity against the repaired mockup
 * head is Phoebe's narrow/mobile design-check seat.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/AgentCardSynthesisRenderNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --update-snapshots
 *
 * @see apps/agentos/view/fleet/roster/card/Container.mjs (the composition under test)
 */

// a deterministic generic-profile avatar at the real slot size; distinct hue per card stands in for
// the production github face image (no flaky network fetch in the golden)
const avatar = hue => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
    `<rect width="80" height="80" fill="${hue}"/>` +
    `<circle cx="40" cy="31" r="14" fill="#ffffff" opacity="0.92"/>` +
    `<path d="M16 72 a24 22 0 0 1 48 0 Z" fill="#ffffff" opacity="0.92"/>` +
    `</svg>`
);

// per-axis source-health facts honoring the closed contract (wired needs the producer literal +
// observed/inferred confidence, else it fails closed to not-wired)
const
    roster  = (state, confidence = 'none') => ({source: 'fleet:listAgents',    state, confidence}),
    repo    = (state, confidence = 'none') => ({source: 'fleet:fleetStatus',    state, confidence}),
    runtime = (state, confidence = 'none') => ({source: 'fleet:runtimeStatus',  state, confidence});

// two lanes sharing the first seven chars ("control") + 2-digit overflow — the tail-elision falsifier
const PATHOLOGICAL_ROSTER = [
    {
        agentId      : 'stress-wedged', githubUsername: '@stress-wedged', displayName: 'Alexander Constantine Maximilianus',
        engineTag    : 'opus-4.8-experimental-preview-turbo', family: 'claude', state: 'wedged', avatarUrl: avatar('#7c5cbf'),
        laneLine     : 'control-plane restart actuator R3 seam reconciliation across the multi-window dock topology',
        openLaneCount: 23,
        wake         : {source: 'fleet:wake', state: 'suppressed', confidence: 'observed'},
        throttle     : {source: 'fleet:throttle', state: 'rate-limited', confidence: 'observed'},
        controlReason: {action: 'stop', kind: 'rejected', reason: 'fleet: stop rejected — resident holds an uncommitted transaction'},
        sources      : {roster: roster('wired', 'observed'), repoStatus: repo('not-wired'), runtime: runtime('wired', 'observed')}
    },
    {
        agentId      : 'stress-limited', githubUsername: '@stress-limited', displayName: 'Bartholomew Wolfgang Amadeus',
        engineTag    : 'gpt-5.6-sol-turbo-preview', family: 'gpt', state: 'limited', avatarUrl: avatar('#2f9e6b'),
        laneLine     : 'control-plane deployment-state bridge self-heal recent-event-limit tuning + overlay migration',
        openLaneCount: 17,
        pendingAction: 'start',
        throttle     : {source: 'fleet:throttle', state: 'overage', confidence: 'observed'},
        sources      : {roster: roster('wired', 'observed'), repoStatus: repo('wired', 'inferred'), runtime: runtime('missing')}
    },
    {
        agentId: 'stress-idle', githubUsername: '@stress-idle', displayName: 'Clementina', engineTag: 'fable-5',
        family : 'claude', state: 'idle', avatarUrl: avatar('#c0873a'), laneLine: 'awaiting review', openLaneCount: 3,
        wake   : {source: 'fleet:wake', state: 'unknown', confidence: 'unobserved'},
        sources: {roster: roster('not-wired'), repoStatus: repo('not-wired'), runtime: runtime('wired', 'observed')}
    },
    {
        agentId: 'stress-off', githubUsername: '@stress-off', displayName: 'Dionysius', engineTag: '3.1-pro',
        family : 'gemini', state: 'off', avatarUrl: avatar('#3f72c4'), laneLine: 'operator-benched', openLaneCount: null,
        sources: {roster: roster('wired', 'observed'), repoStatus: repo('missing'), runtime: runtime('not-wired')}
    }
];

// the card-OWN-width matrix (not viewport) — the axis the selected design renders against.
// The 319/320 pair is the box-model boundary: container queries evaluate the CONTENT box
// (outer − 28px padding − 2px border), so 319 outer = 289 content (last narrow) and
// 320 outer = 290 content (first regular). 328 is the operator's exact realistic case.
const CARD_WIDTHS = [
    {label: 'narrow-294'  , width: 294, narrow: true},
    {label: 'boundary-319', width: 319, narrow: true},
    {label: 'boundary-320', width: 320, narrow: false},
    {label: 'boundary-328', width: 328, narrow: false},
    {label: 'regular-360' , width: 360, narrow: false},
    {label: 'roomy-720'   , width: 720, narrow: false}   // the live-AC roomy width — the wide alignment mode at full breadth
];

test.describe('AgentOS fleet cockpit — AgentCard evolved-D synthesis render at pathological density (card-width matrix)', () => {
    test.setTimeout(150000);

    test('the selected composition under long names, tail-elided shared-prefix lanes, mixed source health, telltales, and the avatar keeper', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 900, height: 1000});
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              [roster] = await app.findInstances({className: 'AgentOS.store.FleetRoster'}, ['id']),
              storeId  = (Array.isArray(roster) ? roster[0] : roster)?.id;

        expect(storeId, 'the provider-owned FleetRoster store must exist').toBeTruthy();

        // replace the seed with the pathological fleet via the store's own API (clear → add)
        await app.callMethod(storeId, 'clear');
        await app.callMethod(storeId, 'add', [PATHOLOGICAL_ROSTER]);

        await expect.poll(async () => (await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['id'])).length, {
            message: 'the grid re-renders one card per pathological resident', timeout: 15000, intervals: [250]
        }).toBe(PATHOLOGICAL_ROSTER.length);

        // the avatar keeper must be painted before capture (data-URI decode is async)
        await expect.poll(async () => page.evaluate(() => {
            const imgs = [...document.querySelectorAll('.fm-card-avatar')];
            return imgs.length === 4 && imgs.every(el => el.complete && el.naturalWidth > 0);
        }), {message: 'every card avatar image is loaded', timeout: 15000, intervals: [250]}).toBe(true);

        await page.evaluate(() => document.fonts.ready);

        // resolve the viewport's theme controller — the RA-3 both-theme gate renders the matrix in BOTH
        // skins, driven through the real ViewportController#setTheme (never a CSS-class poke)
        const [viewport]    = await app.queryComponent({className: 'AgentOS.view.Viewport'}, ['id']),
              viewportState = await app.getComponent(viewport.properties.id, ['controller']),
              controllerId  = viewportState.controller.id;

        // Capture one skin's card-width matrix by sizing the LIST's own rendered surface. Animate's
        // one-column formula reserves two 10px outer margins, so list width = requested card width + 20.
        // This is the production geometry path, not a retired CSS-grid track override.
        const captureWidthMatrix = async themeTag => {
            for (const {label, width, narrow} of CARD_WIDTHS) {
                const scope = `${themeTag} ${label}`;

                await page.evaluate(({count, width}) => {
                    const list = document.querySelector('.fm-fleet-cards');

                    list.style.width     = `${width + 20}px`;
                    list.style.minWidth  = `${width + 20}px`;
                    list.style.maxWidth  = `${width + 20}px`;
                    // Absolute plugin items do not establish flow height. Give the capture one full
                    // column (top margin + N × [126px item + 10px margin]) so no card is scroll-clipped.
                    list.style.height    = `${10 + count * 136}px`;
                    list.style.maxHeight = 'none'
                }, {count: PATHOLOGICAL_ROSTER.length, width});

                await expect.poll(async () => page.evaluate(() => {
                    const card = document.querySelector('.fm-agent-card');
                    return card ? Math.round(card.getBoundingClientRect().width) : null
                }), {
                    message  : `[${scope}] Animate re-seats the card from the list's measured width`,
                    timeout  : 15000,
                    intervals: [100, 250]
                }).toBeGreaterThanOrEqual(width - 4);

                const settledWidth = await page.evaluate(() => Math.round(document.querySelector('.fm-agent-card').getBoundingClientRect().width));

                expect(settledWidth, `[${scope}] the measured list renders the card at ~${width}px`).toBeLessThanOrEqual(width + 4);

                await page.evaluate(() => document.fonts.ready);

                // render-fit + contrast guards (repaired-semantics pins, not just snapshot-green): every card
                // must CONTAIN its full anatomy (no overflow clip), the source strip must sit inside the card
                // boundary, and the name must read against the panel. Contrast is a luminance delta between
                // the resolved name colour and the card background — so this guard holds in BOTH skins.
                const fit = await page.evaluate(() => [...document.querySelectorAll('.fm-agent-card')].map(card => {
                    const rect  = card.getBoundingClientRect(),
                          strip = card.querySelector('.fm-card-strip'),
                          name  = card.querySelector('.fm-card-name'),
                          sRect = strip?.getBoundingClientRect(),
                          lum   = c => { const [r, g, b] = c.match(/\d+/g).map(Number); return 0.299 * r + 0.587 * g + 0.114 * b };
                    return {
                        clipped   : card.scrollHeight - card.clientHeight,
                        stripBelow: sRect ? sRect.bottom - rect.bottom : -1,
                        contrast  : name ? Math.abs(lum(getComputedStyle(name).color) - lum(getComputedStyle(card).backgroundColor)) : 0
                    }
                }));
                fit.forEach((g, i) => {
                    expect(g.clipped, `[${scope}] card ${i} contains its full anatomy (no overflow clip)`).toBe(0);
                    expect(g.stripBelow, `[${scope}] card ${i} source strip sits inside the card boundary`).toBeLessThanOrEqual(0);
                    expect(g.contrast, `[${scope}] card ${i} name text reads against the panel (luminance delta)`).toBeGreaterThan(90)
                });

                // Lifecycle controls stay INLINE + visible at EVERY width (a semantic guard, not just
                // snapshot-green): the real Start/Stop toggle is always a visible glyph, and there is NO
                // overflow ⋯ menu hiding the action behind a generic affordance (operator UX direction).
                const controls = await page.evaluate(() => [...document.querySelectorAll('.fm-agent-card')].map(card => {
                    const shown = sel => { const el = card.querySelector(sel); return !!el && getComputedStyle(el).display !== 'none' };
                    return {
                        toggle : shown('.fm-card-action:not(.fm-card-action-restart)'),
                        hasMenu: !!card.querySelector('.fm-card-action-menu')
                    }
                }));
                controls.forEach((c, i) => {
                    expect(c.toggle, `[${scope}] card ${i}: the primary lifecycle toggle is inline + visible`).toBe(true);
                    expect(c.hasMenu, `[${scope}] card ${i}: no overflow ⋯ menu — controls are inline, not hidden`).toBe(false)
                });

                // Capacity classification guard (the regression witness for the content-box breakpoint):
                // the engine tag is hidden only where the head genuinely cannot hold it (narrow class),
                // and controls compact to 32px wherever capacity exists. The 319/320 pair pins the exact
                // transition — previously the 319px content-box error hid the engine at 328 outer while
                // inflating controls to 44px (94px = 31.5% of a 298px head), manufacturing the scarcity
                // the rule was meant to absorb.
                const capacity = await page.evaluate(() => [...document.querySelectorAll('.fm-agent-card')].map(card => {
                    const engine = card.querySelector('.fm-card-engine'),
                          action = card.querySelector('.fm-card-action');

                    return {
                        engineShown: !!engine && getComputedStyle(engine).display !== 'none',
                        actionSize : action ? Math.round(action.getBoundingClientRect().width) : null
                    }
                }));

                capacity.forEach((c, i) => {
                    expect(c.engineShown, `[${scope}] card ${i}: engine tag ${narrow ? 'hidden at genuine narrow' : 'shown — head has capacity'}`).toBe(!narrow);
                    expect(c.actionSize, `[${scope}] card ${i}: controls ${narrow ? '44px touch target at genuine narrow' : 'compact 32px where capacity exists'}`).toBe(narrow ? 44 : 32)
                });

                await expect(page.locator('.fm-fleet-cards')).toHaveScreenshot(`agentcard-synthesis-${themeTag}-${label}.png`)
            }
        };

        for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
            await app.callMethod(controllerId, 'setTheme', [theme, false]);
            await expect.poll(async () => (await app.getComponent(viewport.properties.id, ['theme'])).theme, {
                message: `the viewport re-themes to ${theme}`, timeout: 15000, intervals: [250]
            }).toBe(theme);

            await captureWidthMatrix(theme.replace('neo-theme-neo-', ''))
        }

        // Motion contract (RA-2 delta): the ghost hover animates with the app's motion tokens, and the
        // reduced-motion contract is honored by construction — a reduced-motion user gets the instant state
        // (the wash is affordance feedback, not signal, so nothing informational is lost). A static golden
        // proves only the END state, so this is the deterministic motion witness: the animated background
        // wash is present in the transition set under no-preference and absent under reduce (robust to the
        // Button base's own outline-width transition).
        const actionTransitionProperty = () => page.evaluate(() =>
            getComputedStyle(document.querySelector('.fm-card-action')).transitionProperty);

        await page.emulateMedia({reducedMotion: 'no-preference'});
        expect(await actionTransitionProperty(), 'the ghost action animates its background wash under no-preference').toMatch(/background/);

        await page.emulateMedia({reducedMotion: 'reduce'});
        expect(await actionTransitionProperty(), 'reduced-motion users get the instant state — the wash is not animated').not.toMatch(/background/);

        await page.emulateMedia({reducedMotion: null})
    });
});
