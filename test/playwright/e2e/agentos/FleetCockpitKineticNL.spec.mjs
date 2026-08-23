import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Publishes one popup's observed frame after CDP automation moved the real window —
 * when the child realm hosts the WindowPosition addon. The widget childapp (`?detail=`) loads
 * no main-thread addons, so the probe is bounded and absence is silent: this spec's assertions
 * are App-Worker truth (instance, vessel state, popup close) and never consume manager geometry.
 * @param {import('@playwright/test').Page} popup
 */
async function publishObservedGeometry(popup) {
    const hasPublisher = await popup.evaluate(() =>
        Boolean(globalThis.Neo?.main?.addon?.WindowPosition?.publishGeometry)
    ).catch(() => false);

    if (hasPublisher) {
        await popup.evaluate(() => globalThis.Neo.main.addon.WindowPosition.publishGeometry())
    }
}

/**
 * @summary The kinetic glide: moves one real vessel window in smooth deterministic steps through
 * CDP (headed Chrome honors automation placement only this way; the app-owned placement lands
 * ~1–2s after `window.open` resolves, so callers MUST pass a settled start rect — glide earlier
 * and the vessel snaps back to its feature-placed origin). Dock semantics, pointer events and
 * commits stay entirely Neo-owned.
 * @param {import('@playwright/test').Page} popup
 * @param {{x: Number, y: Number}} target
 * @param {Number} [steps=24]
 */
async function glidePopup(popup, target, steps=24) {
    const cdp    = await popup.context().newCDPSession(popup),
          win    = await cdp.send('Browser.getWindowForTarget'),
          startX = win.bounds.left,
          startY = win.bounds.top,
          width  = win.bounds.width,
          height = win.bounds.height;

    for (let i = 1; i <= steps; i++) {
        await cdp.send('Browser.setWindowBounds', {
            bounds: {
                height,
                left       : Math.round(startX + (target.x - startX) * i / steps),
                top        : Math.round(startY + (target.y - startY) * i / steps),
                width,
                windowState: 'normal'
            },
            windowId: win.windowId
        });

        await popup.waitForTimeout(40)
    }

    await expect.poll(async () => {
        const observed = await popup.evaluate(() => ({x: globalThis.screenX, y: globalThis.screenY}));

        return Math.max(Math.abs(observed.x - target.x), Math.abs(observed.y - target.y))
    }, {
        message  : 'the glide must land within tolerance of the target origin',
        timeout  : 5000,
        intervals: [25, 50, 100]
    }).toBeLessThanOrEqual(80);

    await publishObservedGeometry(popup)
}

/**
 * @summary Whitebox kinetic multi-window witness for the Fleet Cockpit — the film's QT proof
 * beat as a REGENERABLE executable, so a surface fix re-runs this spec instead of re-recording
 * a one-shot video. One scripted drive, two consecutive runs, identical beat logs (the
 * determinism contract), worker-truth receipts per beat:
 *
 *  1. drill — the production selection seam seats Mnemosyne's detail (real `onAgentSelect` object,
 *     the walkthrough cue's own path);
 *  2. pop-out — `popOutAgentDetail`'s vessel state machine `docked → windowed`; the SAME detail
 *     instance renders in the real OS window (object permanence INTO the hop);
 *  3. glide — the vessel flights to the right-side space in smooth CDP steps (the kinetic beat);
 *  4. hold — two real windows, the detail live and mounted in the vessel;
 *  5. re-integration — `reattachAgentDetail` homes the SAME instance, vessel closes, dock truth
 *     restored (zero residue = the between-takes contract).
 *
 * Mailbox tear-out: deliberately descoped in v1 — its path is proven (reveal → pin → scripted
 * tear-out; the vessel is born mid-gesture and adopts the live pane), but a cockpit-side
 * scripted executor for the gesture would be new machinery (out of scope here), and the
 * vessel-death reintegration gap is an open defect tracked separately. The detail's
 * click-vessel path carries the full kinetic loop here.
 *
 * Headed run (the filmable form): NEO_E2E_PORT=8120 npx playwright test agentos/FleetCockpitKineticNL \
 *   -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet Cockpit — kinetic multi-window choreography (#15631)', () => {
    test.setTimeout(180000);
    // The vessel needs real screen estate to the right of the main window — stage geometry,
    // not a product layout assumption (the app stays container-responsive).
    test.use({
        contextOptions: {screen: {height: 1080, width: 1920}},
        viewport      : {height: 720, width: 1100}
    });

    test('drill → pop-out → glide → reattach: two runs, identical beat logs, same-instance continuity', async ({page, neuralLink}) => {
        const logs       = [],
              pageErrors = [];

        page.on('pageerror', error => {
            let value = String(error?.stack || error?.message || error || '');

            value && value !== 'undefined' && pageErrors.push(value)
        });

        for (let run = 0; run < 2; run++) {
            const beatLog = [];

            await page.goto('/apps/agentos/index.html');
            await page.waitForSelector('.fm-fleet-cockpit', {timeout: 60000});
            await page.waitForSelector('.fm-agent-card', {timeout: 30000});

            const app       = await neuralLink.connectToApp('AgentOS'),
                  cockpits  = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
                  cockpitId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id;

            expect(cockpitId, 'the FleetCockpit must exist in the App Worker').toBeTruthy();

            const readDetail = async () => {
                const details = await app.queryComponent({className: 'AgentOS.view.fleet.detail.Container'},
                    ['id', 'mounted', 'record', 'windowId']);

                return (Array.isArray(details) ? details : [details]).filter(Boolean)[0]
            };

            // baseline truth: the vessel machine starts docked with no detached bookkeeping
            const baseline = await app.getComponent(cockpitId, ['detailVesselState', 'detachedDetail']);

            expect(baseline.detailVesselState).toBe('docked');
            expect(baseline.detachedDetail).toBeNull();

            // ── beat 1: select through the production list seam (Playwright interaction → NL
            // validation: the semantic li is the target, the same path an operator drives) ──
            await page.locator('.fm-fleet-cards > .neo-list-item', {
                has: page.locator('.fm-card-name', {hasText: 'Mnemosyne'})
            }).click();

            let dockedDetail;

            await expect.poll(async () => {
                dockedDetail = await readDetail();
                return dockedDetail?.properties?.mounted === true && dockedDetail?.properties?.record?.agentId
            }, {
                message  : 'the drill must materialize Mnemosyne\'s detail',
                timeout  : 10000,
                intervals: [100, 250]
            }).toBe('neo-fable');

            beatLog.push({beat: 'drill', resident: 'neo-fable', detailId: dockedDetail.id});
            expect(dockedDetail.properties.windowId, 'the detail starts in the main window')
                .not.toBeUndefined();

            // ── beat 2: pop the detail out — the vessel state machine, no hand input ─────────
            const popupPromise = page.waitForEvent('popup', {timeout: 30000}),
                  popResult    = await app.callMethod(cockpitId, 'popOutAgentDetail'),
                  popup        = await popupPromise;

            expect(popResult.errors).toEqual([]);
            expect(popResult.detached).toBe(true);

            await expect.poll(async () =>
                (await app.getComponent(cockpitId, ['detailVesselState'])).detailVesselState, {
                message  : 'the vessel must reach the windowed state (heap join, not just window open)',
                timeout  : 15000,
                intervals: [100, 250]
            }).toBe('windowed');

            let vesselDetail;

            await expect.poll(async () => {
                vesselDetail = await readDetail();
                return vesselDetail?.properties?.mounted === true && vesselDetail?.id
            }, {
                message  : 'the live detail must render inside the vessel',
                timeout  : 10000,
                intervals: [100, 250]
            }).toBe(dockedDetail.id);

            beatLog.push({beat: 'pop-out', detached: true, detailId: vesselDetail.id});
            expect(vesselDetail.id, 'object permanence: the SAME instance crossed the boundary')
                .toBe(dockedDetail.id);

            // ── beat 3: THE GLIDE — settled placement, then the flight to the right space ────
            // the app-owned placement lands ~1–2s after windowOpen resolves; gliding earlier
            // loses to the snap-back
            await popup.waitForTimeout(2500);
            await glidePopup(popup, {x: 1400, y: 120});

            beatLog.push({beat: 'glide', to: {x: 1400, y: 120}});

            // ── beat 4: hold — two real windows, detail live in the vessel ───────────────────
            const held = await readDetail();

            expect(held.id).toBe(dockedDetail.id);
            expect(held.properties.mounted).toBe(true);
            beatLog.push({beat: 'hold', liveInVessel: true});

            // ── beat 5: re-integration — same instance home, vessel closes, zero residue ─────
            const closePromise   = popup.waitForEvent('close', {timeout: 30000}),
                  reattachResult = await app.callMethod(cockpitId, 'reattachAgentDetail');

            expect(reattachResult.errors).toEqual([]);
            expect(reattachResult.reattached).toBe(true);
            await closePromise;

            const restored = await app.getComponent(cockpitId, ['detailVesselState', 'detachedDetail']);

            expect(restored.detailVesselState).toBe('docked');
            expect(restored.detachedDetail).toBeNull();

            const homedDetail = await readDetail();

            expect(homedDetail.id, 'the return keeps the same instance').toBe(dockedDetail.id);
            expect(homedDetail.properties.mounted).toBe(true);
            beatLog.push({beat: 'reattach', reattached: true, detailId: homedDetail.id});

            logs.push(beatLog);

            // zero-residue baseline for the next run (the between-takes contract)
            if (run === 0) {
                await page.reload();
                await page.waitForSelector('.fm-fleet-cockpit', {timeout: 60000})
            }
        }

        // the determinism AC: two consecutive runs replay the identical beat log
        expect(logs[1], 'two scripted runs must replay the identical beat log').toEqual(logs[0]);
        expect(pageErrors, 'the choreography must be error-free in the main window').toEqual([])
    })
});
