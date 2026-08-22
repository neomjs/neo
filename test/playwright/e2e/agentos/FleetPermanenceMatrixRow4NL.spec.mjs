import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Matrix row 4 — object permanence / reintegration WITH live-store continuity, on the
 * Fleet product surface (the ledger's required live-`data.Store` reference receipt).
 *
 * The receipt's four teeth, all gesture- or store-driven (never a controller shortcut):
 *
 * 1. **Drill + pop-out** — the native card drill seats the AgentDetail; the shell toggle moves the
 *    SAME App-Worker instance into the real vessel window (the round-trip chassis).
 * 2. **Live-store continuity while detached** — the drilled resident's `FleetAgent` record is
 *    mutated through the worker (`record.set` on the live model instance) WHILE the detail is
 *    windowed: the store's `recordChange` flows to the detached inspector and the vessel renders
 *    the mutation. Streaming stays live across the hop — observed, not inferred.
 * 3. **Identity permanence** — the same record instance, the same roster store, and the same
 *    detail instance before detach and after reintegration; the vessel terminally closes; the grid
 *    census is unchanged.
 * 4. **Universal invariants** — gesture continuity (native clicks), same-instance permanence,
 *    JSON-only persisted state (the REAL perspective writer: the live document saved through
 *    `DockPerspectiveStore`'s landed validation seam and read back byte-identical), exact-once
 *    (a single detail instance asserted by census, not first-match), idempotent cleanup (a
 *    repeated disconnect terminal on the retired window id is a byte-equal no-op), and an empty
 *    three-realm error ledger (main page, popup, worker runtime).
 *
 * Row 4's receipt is deliberately NOT the drill round-trip (which proves instance continuity
 * without the store axis) and NOT Demo B's CounterPane (not store-backed) — it is the
 * `FleetRoster` record's live identity across detach and reintegration.
 *
 * Run: npx playwright test agentos/FleetPermanenceMatrixRow4NL -c test/playwright/playwright.config.matrix.mjs --workers=1
 * (the matrix runner — headed by default, real Chrome, strict serial; the e2e config's GPU flags
 * are headless-calibrated and crash headed macOS Chrome, and CI must not run this config)
 *
 * @see learn/guides/specificfeatures/TearOutPortabilityMatrix.md (the living ledger this feeds)
 * @see apps/agentos/view/fleet/detail/Container.mjs (record-driven inspector under test)
 */
test.describe('matrix row 4 — AgentDetail permanence with live FleetRoster continuity (headed)', () => {
    test.setTimeout(150000);

    test('store identity + live mutation survive detach and reintegration on the same instances', async ({page, neuralLink}) => {
        // the full error ledger (row-7 sibling shape): main-page errors, popup errors, and
        // worker runtime errors via an exposed callback — every realm the receipt touches
        const ledger = {pageErrors: [], popupErrors: [], runtimeErrors: []};

        await page.context().exposeFunction('row4RuntimeError', payload => ledger.runtimeErrors.push(payload));
        await page.context().addInitScript(name => {
            globalThis.addEventListener('error', event => globalThis[name]({
                column : event.colno,
                line   : event.lineno,
                message: event.message,
                source : event.filename,
                type   : 'error'
            }));
            globalThis.addEventListener('unhandledrejection', event => globalThis[name]({
                reason: String(event.reason?.stack || event.reason?.message || event.reason),
                type  : 'unhandledrejection'
            }))
        }, 'row4RuntimeError');

        page.on('pageerror', error => {
            const value = error == null ? '' : String(error.stack || error.message || error);
            value && value !== 'undefined' && ledger.pageErrors.push(value)
        });
        page.context().on('page', popup => {
            popup.on('pageerror', error => ledger.popupErrors.push(String(error?.stack || error?.message || error)))
        });

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app      = await neuralLink.connectToApp('AgentOS'),
              cards    = await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['record', 'id']),
              rosters  = await app.findInstances({className: 'AgentOS.store.FleetRoster'}, ['id', 'count']),
              rosterId = (Array.isArray(rosters) ? rosters[0] : rosters)?.id;

        expect(cards.length, 'the fleet renders cards with records').toBeGreaterThan(1);
        expect(rosterId, 'the FleetRoster store must exist in the App Worker').toBeTruthy();

        const target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);

        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const firstAgentId = target.properties.record.agentId,
              targetCardId = target.properties.id,
              baselineLane = target.properties.record.laneLine;

        const queryDetail = async () => {
            const matches = await app.queryComponent({className: 'AgentOS.view.fleet.detail.Container'}, ['record', 'id', 'windowId']),
                  found   = (Array.isArray(matches) ? matches : [matches]).filter(Boolean);

            return {count: found.length, detail: found[0]}
        };

        const detailIdOf = async () => (await queryDetail()).detail?.id;

        // ── tooth 1: native drill → pop-out, same instance into the vessel ──────────────────
        await page.locator(`[id="${targetCardId}"] .fm-card-drill`).click();

        const detail = page.locator('.fm-agent-detail');

        await expect(detail).toBeVisible({timeout: 15000});

        const drilled = (await queryDetail()).detail;

        expect(drilled?.properties?.record?.agentId, 'the inspector drilled into the exact resident').toBe(firstAgentId);

        const detailId     = drilled.id,
              toggle       = page.locator('.fm-detail-window-toggle'),
              popupPromise = page.waitForEvent('popup', {timeout: 30000});

        await toggle.click();

        const popup = await popupPromise;

        await popup.waitForLoadState('domcontentloaded');
        await expect(popup.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-agent-detail')).toHaveCount(0);
        expect(await detailIdOf(), 'the OS-window hop reparents the SAME instance').toBe(detailId);

        const vesselWindowId = (await queryDetail()).detail?.properties?.windowId;

        expect(vesselWindowId, 'the vessel exposes its runtime window id while detached').toBeTruthy();

        // ── tooth 2: live-store continuity — mutate the record WHILE the detail is windowed.
        // The dot-path scopes onto the card's LIVE store record: record.set → recordChange →
        // every record-driven surface, including the detached inspector (the receipt's axis).
        const mutation = `matrix-row-4 live mutation ${Date.now()}`;

        await app.callMethod(targetCardId, 'record.set', [{laneLine: mutation}]);

        // the store's recordChange must reach the DETACHED inspector: the vessel renders the
        // mutated lane — streaming stays live across the hop (polled, never assumed)
        await expect.poll(async () => (await queryDetail()).detail?.properties?.record?.laneLine, {
            message  : 'the detached inspector received the live store mutation',
            timeout  : 10000,
            intervals: [200]
        }).toBe(mutation);

        await expect(popup.locator('.fm-agent-detail')).toContainText(mutation, {timeout: 10000});

        // ── tooth 3: reattach — same instances home, vessel terminally closed, grid stable ──
        const popupClosed = popup.waitForEvent('close', {timeout: 30000});

        await toggle.click();
        await popupClosed;

        expect(popup.isClosed(), 'the vessel terminally closed on reattach').toBe(true);
        await expect(page.locator('.fm-agent-detail')).toBeVisible({timeout: 30000});

        const homeResult = await queryDetail();

        expect(homeResult.count, 'exactly one AgentDetail instance exists after reintegration').toBe(1);

        const home = homeResult.detail;

        expect(home?.id, 'the detail instance survives the whole round trip').toBe(detailId);
        expect(home?.properties?.record?.agentId, 'the same record identity after reintegration').toBe(firstAgentId);
        expect(home?.properties?.record?.laneLine, 'the live mutation persists through reintegration').toBe(mutation);

        // the roster still resolves the SAME record (same store, same key, mutation persisted —
        // one continuous record, never a re-fetched copy)
        const recordAfter = await app.callMethod(rosterId, 'get', [firstAgentId]);

        expect(recordAfter?.laneLine, 'the roster resolves the same continuous record after reintegration').toBe(mutation);

        expect((await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['id'])).length,
            'the grid census is unchanged by the round trip').toBe(cards.length);

        // ── tooth 4: universal invariants + zero residue ────────────────────────────────────
        // gesture continuity: every hop above was a native click; exact-once: one detail
        // instance throughout; idempotent cleanup: no popup residue after the vessel retired
        const cockpits = await app.findInstances({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']),
              holderId = (Array.isArray(cockpits) ? cockpits[0] : cockpits)?.id,
              topology = await app.getDockTopology(holderId),
              document = topology?.document ?? topology;

        // JSON-only persisted state: the REAL perspective writer, not a serializability probe —
        // the live document saved through DockPerspectiveStore's landed validation seam and read
        // back byte-identical (the row-7 sibling's persistDockReceipt shape, on the Fleet surface)
        const layoutRecord = {
                captureScope     : 'window',
                dockZone         : document,
                layoutId         : 'matrix-row-4',
                metadata         : {},
                perspectiveName  : 'matrix-row-4',
                schema           : 'neo.harness.dockLayout.v2',
                title            : 'matrix-row-4',
                windowFingerprint: null
            },
            saveResult = await app.callMethod(holderId, 'perspectiveStore.savePerspective', [layoutRecord, {activate: false, replace: true}]);

        expect(saveResult?.errors, `the real perspective writer refused: ${JSON.stringify(saveResult?.errors)}`).toEqual([]);
        expect(saveResult?.saved, 'the live document persisted through the real writer').toBe(true);

        const stored = await app.callMethod(holderId, 'perspectiveStore.getPerspective', ['matrix-row-4']);

        expect(stored?.layout?.captureScope).toBe('window');
        expect(stored?.layout?.dockZone, 'the stored layout round-trips the live document byte-identically').toEqual(document);

        // idempotent cleanup: the vessel-close terminal repeated against the RETIRED window id
        // is a FULL no-op — snapshot the home state, repeat the terminal, and require byte-equal
        // state (the row-7 sibling's settled-snapshot shape, through the cockpit's
        // re-entrancy-disciplined path). The census rides both sides: a duplicate AgentDetail
        // created by the repeated terminal would escape an id-only comparison.
        const settledQuery = await queryDetail(),
              settled      = {
                  detailCount: settledQuery.count,
                  detailId   : settledQuery.detail?.id,
                  document,
                  popupCount : page.context().pages().filter(candidate => candidate !== page && !candidate.isClosed()).length
              };

        await app.callMethod(holderId, 'onWindowDisconnect', [{windowId: vesselWindowId}]);

        const repeatedQuery = await queryDetail();

        expect({
            detailCount: repeatedQuery.count,
            detailId   : repeatedQuery.detail?.id,
            document   : (await app.getDockTopology(holderId))?.document ?? await app.getDockTopology(holderId),
            popupCount : page.context().pages().filter(candidate => candidate !== page && !candidate.isClosed()).length
        }, 'a repeated disconnect terminal changes no state — same census, same instance, same document, same popups').toEqual(settled);

        expect(ledger.runtimeErrors, 'no worker runtime errors on the receipt path').toEqual([]);
        expect(ledger.pageErrors, 'no main-page errors on the receipt path').toEqual([]);
        expect(ledger.popupErrors, 'no popup errors on the receipt path').toEqual([]);

        // restore the baseline lane so the receipt leaves the fixture as found
        await app.callMethod(targetCardId, 'record.set', [{laneLine: baselineLane}]);
    });
});
