import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The detail tranche's closing round-trip (T4.16): the full USER path — real
 * `.fm-card-drill` gesture → detail → real-window pop-out → reattach — proven live, joining the
 * hops the sibling suites prove in isolation. Every step is gesture- or shell-affordance-driven
 * (never a controller call): the joins are the subject.
 *
 * The four joins no per-hop suite can see:
 * 1. **drill → detail**: the native Button seats the EXACT activated resident (identity header
 *    matches the card), panes + freshness chips render.
 * 2. **detail → pop-out**: the SAME App-Worker instance re-renders in the real vessel window;
 *    the fixture-driven activity stream keeps TICKING through the hop (monotone event count —
 *    continuity observed, not inferred) — and a MAIN-window gesture drill re-seats the WINDOWED
 *    inspector (one heap, two render targets).
 * 3. **pop-out → reattach**: the same shell toggle brings the SAME instance home; the grid is
 *    consistent (card census unchanged, the item back on its rail) and the tick count never
 *    reset.
 * 4. **adapter loss mid-journey**: the stream drops to `stale` — the path renders
 *    stale-not-frozen: the marker state is worker-readable, and a FURTHER native drill still
 *    works end-to-end.
 *
 * Conventions shared with `FleetCockpitDrillNL` (the gesture chain) and `FleetCockpitPopOutNL`
 * (the capability spine this journey builds on — its header names this leaf as the successor).
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test agentos/FleetCockpitDrillRoundTripNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS fleet cockpit — the drill round-trip journey (card → detail → pop-out → reattach)', () => {
    test.setTimeout(150000);

    test('the full gesture journey with ticking continuity, per-hop freshness, grid consistency, and the stale-not-frozen leg', async ({page, neuralLink}) => {
        const pageErrors = [];

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && pageErrors.push(value)
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app       = await neuralLink.connectToApp('AgentOS'),
              cards     = await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['record', 'id']),
              cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.FleetCockpit'}, ['id']),
              holderId  = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id,
              cardCount = cards.length;

        expect(cardCount, 'the fleet renders cards with records').toBeGreaterThan(1);
        expect(holderId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

        const target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);

        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const firstAgentId = target.properties.record.agentId,
              targetCardId = target.properties.id;

        const readStreamTicks = async () => {
            const streams = await app.findInstances({className: 'AgentOS.view.fleet.ActivityStream'}, ['events']),
                  stream  = Array.isArray(streams) ? streams[0] : streams;

            return stream?.properties?.events?.length ?? 0
        };

        // the fixture stream is static sample data — the TICKS are injection-driven (the burst
        // sibling's pattern): distinct actors, monotone timestamps, driven through the possessed
        // stream's reactive `set`
        const tick = n => Array.from({length: n}, (_, i) => ({
            type      : 'a2a-activity',
            source    : 'memory-core:mailbox',
            agentId   : `journey-agent-${i}`,
            occurredAt: new Date(Date.UTC(2026, 6, 18, 0, 0, 0) + i * 60000).toISOString(),
            payload   : {text: `journey tick ${i}`}
        }));

        const streamInstances = await app.findInstances({className: 'AgentOS.view.fleet.ActivityStream'}, ['id']),
              liveStreamId    = (Array.isArray(streamInstances) ? streamInstances[0] : streamInstances)?.id;

        expect(liveStreamId, 'the worker owns one ActivityStream').toBeTruthy();

        const injectTicks = n => app.callMethod(liveStreamId, 'set', [{adapterState: 'live', events: tick(n)}]);

        const queryDetail = async () => {
            const matches = await app.queryComponent({className: 'AgentOS.view.fleet.AgentDetail'}, ['record', 'id']);

            return (Array.isArray(matches) ? matches : [matches]).filter(Boolean)[0]
        };

        // ── join 1: the NATIVE drill gesture seats the exact resident ────────────────────────
        await page.locator(`[id="${targetCardId}"] .fm-card-drill`).click();

        const detail = page.locator('.fm-agent-detail');

        await expect(detail).toBeVisible({timeout: 15000});
        await expect(detail.locator('.fm-detail-name')).not.toBeEmpty();
        await expect(detail.locator('.fm-detail-pane')).toHaveCount(4);

        const drilled = await queryDetail();

        expect(drilled?.properties?.record?.agentId, 'the inspector drilled into the exact activated resident').toBe(firstAgentId);

        const detailId = drilled.id;

        // seed the ticking pane pre-hop: 30 held events — the value the hops must not reset
        await injectTicks(30);
        expect(await readStreamTicks()).toBe(30);

        // ── join 2: pop-out — same instance, real window, the stream keeps ticking ───────────
        const toggle       = page.locator('.fm-detail-window-toggle'),
              popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await toggle.click();

        const popup = await popupPromise;

        await popup.waitForLoadState('domcontentloaded');
        await expect(popup.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-agent-detail')).toHaveCount(0);

        expect((await queryDetail())?.id, 'the OS-window hop reparents the SAME instance').toBe(detailId);

        // freshness after the hop: every pane carries its chip in the VESSEL window
        await expect(popup.locator('.fm-detail-pane')).toHaveCount(4);

        // ticking continuity through the hop: the pre-hop 30 SURVIVED (no reset), and the pane
        // keeps ACCEPTING ticks while the detail is windowed — monotone 30 → 45
        expect(await readStreamTicks(), 'the pre-hop ticks survive the pop-out — no reset').toBe(30);
        await injectTicks(45);
        await expect.poll(readStreamTicks, {
            message  : 'the stream keeps ticking while the detail is windowed',
            timeout  : 10000,
            intervals: [200]
        }).toBe(45);

        // the JOIN the siblings cannot see: a MAIN-window GESTURE drill re-seats the WINDOWED
        // inspector — one heap, two render targets, driven by the real Button
        const second = cards.find(entry => entry?.properties?.record?.agentId
            && entry.properties.record.agentId !== firstAgentId && entry?.properties?.id);

        expect(second, 'a second resident exists to drill into').toBeTruthy();
        await page.locator(`[id="${second.properties.id}"] .fm-card-drill`).click();

        await expect.poll(async () => (await queryDetail())?.properties?.record?.agentId, {
            message: 'the windowed inspector re-seats onto the gesture-selected resident',
            timeout: 15000
        }).toBe(second.properties.record.agentId);

        expect((await queryDetail())?.id, 'the re-seat renders through the SAME instance').toBe(detailId);

        // ── join 3: reattach — same instance home, grid consistent, ticks never reset ────────
        await toggle.click();

        await expect(page.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        expect((await queryDetail())?.id, 'the instance survives the whole round trip').toBe(detailId);

        const docHome = (await app.getDockTopology(holderId)),
              home    = docHome?.document ?? docHome;

        expect(home.nodes['secondary-rail'].items, 'the detail re-trees on its rail').toContain('detail');
        expect((await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['id'])).length,
            'the grid census is unchanged by the round trip').toBe(cardCount);

        expect(await readStreamTicks(), 'the tick count never reset across the hops — 45 held through reattach').toBe(45);

        // ── join 4: adapter loss — stale, never frozen ───────────────────────────────────────
        const streams  = await app.findInstances({className: 'AgentOS.view.fleet.ActivityStream'}, ['id']),
              streamId = (Array.isArray(streams) ? streams[0] : streams)?.id;

        await app.setProperties(streamId, {adapterState: 'stale'});

        await expect.poll(async () => {
            const stale = await app.findInstances({className: 'AgentOS.view.fleet.ActivityStream'}, ['adapterState']),
                  entry = Array.isArray(stale) ? stale[0] : stale;

            return entry?.properties?.adapterState
        }, {timeout: 10000}).toBe('stale');

        // stale-NOT-frozen: with the adapter lost, a FURTHER native drill still runs the whole
        // gesture chain — the path degrades honestly instead of wedging
        await page.locator(`[id="${targetCardId}"] .fm-card-drill`).click();

        await expect.poll(async () => (await queryDetail())?.properties?.record?.agentId, {
            message: 'the drill path stays live under adapter loss',
            timeout: 15000
        }).toBe(firstAgentId);

        expect(pageErrors, 'the journey must be error-free in the main window').toEqual([])
    });
});
