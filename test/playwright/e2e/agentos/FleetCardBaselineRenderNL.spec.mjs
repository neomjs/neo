import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The current-density baseline "before": the REJECTED AgentCard composition rendered against a
 * pathological fleet at the card-width matrix, so the rebaseline directions are judged against the real
 * failure modes (not a benign 7-card seed). This is EVIDENCE, not a merge gate — it captures the exact
 * information-budget defects the operator rejected, plus the successful element the operator flagged as a
 * keeper (the profile avatar), so the control is honest about both what fails and what to preserve:
 *
 * - long display/engine names that crowd the ~149.95px identity body;
 * - two lane titles sharing their first seven characters plus a 2-digit `+N` overflow — the narrow-card
 *   falsifier: does the current card still distinguish the active lane, or collapse to a meaningless prefix?
 * - 2-digit `openLaneCount` badges;
 * - wake/throttle telltales (fixed-width siblings) present at once;
 * - a pending lifecycle control + a retained reject reason (the control-rail footprint);
 * - mixed session state (wedged/limited/idle/off) and the full honest source-health vocabulary
 *   (wired-observed / wired-inferred / missing / not-wired → the three ~78px 9px source markers that
 *   wrap into three tiny rows at narrow width, collapsing to one row only when brute-forced wider);
 * - a clearly visible avatar in each card (the operator's fast-recognition keeper) — a deterministic
 *   placeholder silhouette standing in for the production github profile image, so it occupies the real
 *   40px slot in the golden without a flaky network fetch.
 *
 * The pathological roster is INJECTED into the provider-owned `FleetRoster` store after a settled boot
 * (the registry bridge stays unwired — the fail-closed loaders keep the injected rows, they never race a
 * live payload over them). The capture axis is the CARD's own width, not the viewport: the rejected card
 * only responds to the outer FleetGrid's 3/2/1 viewport breakpoints, so the grid is pinned to a single
 * column at each matrix width (~294 / ~360 / ~480px) — the same card widths the A / B+C-fusion / D
 * directions render against, making this an apples-to-apples control instead of a viewport-only shot.
 * Goldens are created/refreshed under the visual/e2e config only.
 *
 * Run: NEO_E2E_PORT=8121 npx playwright test agentos/FleetCardBaselineRenderNL -c test/playwright/playwright.config.e2e.mjs --workers=1 --update-snapshots
 *
 * @see apps/agentos/model/FleetAgent.mjs (the record contract these rows honor)
 * @see apps/agentos/view/fleet/AgentCard.mjs (the composition under review)
 */

// a deterministic generic-profile avatar (colored silhouette) at the real 80px source size — the 40px
// .fm-card-avatar circle scales it; distinct hue per card stands in for the production github face image
const avatar = hue => 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80">` +
    `<rect width="80" height="80" fill="${hue}"/>` +
    `<circle cx="40" cy="31" r="14" fill="#ffffff" opacity="0.92"/>` +
    `<path d="M16 72 a24 22 0 0 1 48 0 Z" fill="#ffffff" opacity="0.92"/>` +
    `</svg>`
);

// per-axis source-health facts honoring the closed contract: a `wired` marker needs the axis's exact
// producer literal + `observed`/`inferred` confidence, else it fails closed to not-wired (sourceHealth.mjs)
const
    roster  = (state, confidence = 'none') => ({source: 'fleet:listAgents',    state, confidence}),
    repo    = (state, confidence = 'none') => ({source: 'fleet:fleetStatus',    state, confidence}),
    runtime = (state, confidence = 'none') => ({source: 'fleet:runtimeStatus',  state, confidence});

// two lanes sharing the first seven chars ("control") + a 2-digit overflow — the narrow falsifier; the
// source facts span the full honest vocabulary (wired-observed / wired-inferred / missing / not-wired),
// and a resolved card state (wedged/idle) needs runtime wired to render, so runtime is wired for those
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

// the card-OWN-width matrix (not viewport): the widths the rebaseline directions render against
const CARD_WIDTHS = [
    {label: 'narrow-294', width: 294},
    {label: 'regular-360', width: 360},
    {label: 'roomy-480', width: 480}
];

test.describe('AgentOS fleet cockpit — AgentCard rejected-baseline render at pathological density (card-width matrix)', () => {
    test.setTimeout(150000);

    test('the current composition under long names, shared-prefix lanes, 2-digit counts, telltales, mixed source health, and the avatar keeper', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 900, height: 1000});
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              [roster] = await app.findInstances({className: 'AgentOS.store.FleetRoster'}, ['id']),
              storeId  = (Array.isArray(roster) ? roster[0] : roster)?.id;

        expect(storeId, 'the provider-owned FleetRoster store must exist').toBeTruthy();

        // replace the seed with the pathological fleet via the store's own API (clear → add); a
        // store-level replace the bound grid reconciles, and the unwired loaders never race live rows over it
        await app.callMethod(storeId, 'clear');
        await app.callMethod(storeId, 'add', [PATHOLOGICAL_ROSTER]);

        await expect.poll(async () => (await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['id'])).length, {
            message: 'the grid re-renders one card per pathological resident', timeout: 15000, intervals: [250]
        }).toBe(PATHOLOGICAL_ROSTER.length);

        // the avatar keeper must actually be painted before capture (data-URI decode is async)
        await expect.poll(async () => page.evaluate(() => {
            const imgs = [...document.querySelectorAll('.fm-card-avatar')];
            return imgs.length === 4 && imgs.every(el => el.complete && el.naturalWidth > 0);
        }), {message: 'every card avatar image is loaded', timeout: 15000, intervals: [250]}).toBe(true);

        await page.evaluate(() => document.fonts.ready);

        // capture the rejected composition at each CARD-width: pin the card grid to one column at the
        // target width so the card renders at that own-width, independent of viewport breakpoints
        for (const {label, width} of CARD_WIDTHS) {
            const actual = await page.evaluate(w => {
                const cards = document.querySelector('.fm-fleet-cards');
                // a FIXED px track (not 1fr = minmax(auto,1fr), whose auto-min = the card's long-token
                // min-content and refuses to shrink) so the card is pinned to exactly the target width
                cards.style.gridTemplateColumns = `${w}px`;
                cards.style.width               = `${w}px`;
                cards.style.minWidth            = `${w}px`;
                cards.style.maxWidth            = `${w}px`;
                const card = document.querySelector('.fm-agent-card');
                return card ? Math.round(card.getBoundingClientRect().width) : null;
            }, width);

            expect(actual, `the pinned single column renders the card at ~${width}px`).toBeGreaterThanOrEqual(width - 4);
            expect(actual, `the pinned single column renders the card at ~${width}px`).toBeLessThanOrEqual(width + 4);

            await page.evaluate(() => document.fonts.ready);
            await expect(page.locator('.fm-fleet-cards')).toHaveScreenshot(`agentcard-rejected-baseline-${label}.png`)
        }
    });
});
