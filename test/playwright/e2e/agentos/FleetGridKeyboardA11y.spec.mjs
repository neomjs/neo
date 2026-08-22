import {test, expect}           from '../../fixtures.mjs';
import {NeuralLink_DataService} from '../../../../ai/services.mjs';
import {
    authenticatedFleetOptions,
    fleetE2EFailure,
    fleetE2ESuccess,
    reloadRoster,
    wireAuthenticatedFleetBridge
} from './authenticatedFleetHarness.mjs';

const KEYBOARD_SOURCES = {
    roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
    repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
    runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
};

/**
 * @summary Build one production-shaped Fleet roster DTO row for the keyboard witness.
 * @param {Object} row Stable identity/display fields.
 * @returns {Object}
 */
function createKeyboardRosterRow(row) {
    return {
        ...row,
        avatarUrl: '',
        lifecycle: {source: KEYBOARD_SOURCES.runtime.source, state: 'running', confidence: 'observed'},
        sources  : KEYBOARD_SOURCES
    }
}

const KEYBOARD_ROSTER_ROWS = [
    {id: 'a11y-b', displayName: 'Bravo',   engineTag: 'fixture', family: 'claude'},
    {id: 'a11y-c', displayName: 'Charlie', engineTag: 'fixture', family: 'claude'},
    {id: 'a11y-d', displayName: 'Delta',   engineTag: 'fixture', family: 'claude'}
].map(createKeyboardRosterRow);

/**
 * @summary Start a test-owned Fleet bridge which serves three wired residents, records lifecycle
 * requests, and rejects Stop. The app still exercises its production `installFleetBridge` /
 * `createFleetRegistryBridge` client. A deterministic rejection keeps the card-local status visible
 * without a success-driven roster refresh, making lifecycle intent evidence observable without
 * inferring from transient UI.
 * @returns {Promise<{close: Function, requests: Object[], setRosterRows: Function}>}
 */
async function startRejectingFleetBridge() {
    const
        {startFleetBridgeServer} = await import('../../../../ai/services/fleet/fleetBridgeServer.mjs'),
        requests                 = [];

    let rosterRows = KEYBOARD_ROSTER_ROWS;

    const
        options                  = authenticatedFleetOptions({
            port    : 8083,
            dispatch: async request => {
                requests.push(request);

                if (request.method === 'stopAgent') {
                    return fleetE2EFailure('fleet: stop rejected by keyboard witness')
                }

                if (request.method === 'fleetRoster') {
                    return fleetE2ESuccess({rows: rosterRows})
                }

                if (request.method === 'fleetActivity') {
                    return fleetE2ESuccess({
                        capability: {source: 'fleet:test', state: 'wired', confidence: 'observed'},
                        events    : []
                    })
                }

                return fleetE2EFailure(`fleet: unexpected keyboard-witness method '${request.method}'`)
            }
        });

    const server = await startFleetBridgeServer(options);

    return {
        requests,
        bearerToken  : options.bearerToken,
        endpoint     : `http://127.0.0.1:${server.address().port}/fleet`,
        close        : () => new Promise(resolve => server.close(resolve)),
        setRosterRows: rows => rosterRows = rows
    }
}

/**
 * @summary The FM cockpit keyboard-a11y contract proven on the MOUNTED grid via Neural Link possession —
 * the mount-authority the unit layer (fleetGrid.spec / agentCard.spec) guards off. The gate-1 shape: a
 * `role=list` owner of NON-interactive `role=listitem` cards, each with a dedicated native drill
 * `<button>` (the resident name) + sibling lifecycle Buttons in ordinary Tab order. This spec EXECUTES —
 * not merely infers — every claimed path: native Enter AND Space activation on the drill; a lifecycle
 * Button that fires its intent WITHOUT drilling (proven by a test-owned recording/rejecting Fleet
 * loopback); the optional drill-only Up/Down jump with zero page scroll; and gate-3 focus continuity
 * restoring the resident's EXACT semantic child (drill AND toggle) across an index-shifting rebuild.
 * Zero uncaught page errors throughout.
 *
 * @see apps/agentos/view/fleet/roster/card/Container.mjs
 * @see apps/agentos/view/fleet/roster/Container.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/roster/container.spec.mjs
 */
test.describe('AgentOS fleet grid — keyboard a11y (native list/listitem + drill Button, Neural Link, #14619)', () => {
    test.setTimeout(90000);

    let fleet;

    test.beforeEach(async () => {
        fleet = await startRejectingFleetBridge()
    });

    test.afterEach(async () => {
        await fleet?.close()
    });

    test('list/listitem topology + native drill Enter/Space + lifecycle isolation + drill jump + gate-3 restoration (drill AND toggle)', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});

        // fail-closed boot -> bearer through the worker-realm product injector -> sanctioned re-poll;
        // only then can the roster claim replace the sample seed.
        const app = await neuralLink.connectToApp('AgentOS');

        await wireAuthenticatedFleetBridge({app, fleetUrl: fleet.endpoint, bearerToken: fleet.bearerToken});
        await reloadRoster(app);

        // The production fleetRoster read path, backed by the test-owned loopback, must replace
        // the static (derived) roster with the three deterministic residents before any keyboard claim.
        await expect(page.locator('.fm-fleet-title')).toHaveText('Fleet · 3 agents', {timeout: 30000});

        const

            sessionId = app.sessionId,
            [grid]    = await app.queryComponent({className: 'AgentOS.view.fleet.roster.Container'}, ['id']),
            [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']);

        expect(grid, 'the mounted FleetGrid should be possessable').toBeTruthy();
        expect(cockpit, 'the mounted FleetCockpit should own roster reconciliation').toBeTruthy();

        const
            cockpitId = cockpit.properties.id,
            gridState = await app.getComponent(grid.properties.id, ['store.id']),
            rosterId  = gridState['store.id'];

        expect(rosterId, 'the mounted FleetGrid should expose its exact bound FleetRoster store').toBeTruthy();

        const seeded = await NeuralLink_DataService.inspectStore({sessionId, storeId: rosterId, limit: 10});
        expect(seeded.count, 'the grid-bound roster should hold the three loopback residents').toBe(3);

        const cards  = page.locator('.fm-fleet-cards .fm-agent-card');
        const drills = page.locator('.fm-fleet-cards .fm-agent-card .fm-card-drill');
        await expect(cards).toHaveCount(3);
        await expect(drills).toHaveCount(3);

        // ── TOPOLOGY: a role=list OWNER of role=listitem cards (a listitem needs a list owner) ──
        await expect(page.locator('.fm-fleet-cards')).toHaveAttribute('role', 'list');
        await expect(cards.nth(0)).toHaveAttribute('role', 'listitem');
        expect(await cards.nth(0).getAttribute('tabindex')).toBeNull();

        // the drill is a dedicated NATIVE <button>; the toggle is a SEPARATE native <button> (Tab isolation)
        expect(await drills.nth(0).evaluate(el => el.tagName)).toBe('BUTTON');
        await expect(drills.nth(0)).toContainText('Bravo');
        const
            bravoCard   = cards.filter({has: page.locator('.fm-card-drill', {hasText: 'Bravo'})}),
            bravoToggle = bravoCard.locator('.fm-card-control-verbs button').first();
        expect(await bravoToggle.evaluate(el => el.tagName)).toBe('BUTTON');

        // ── NATIVE drill activation — BOTH Enter AND Space (native <button> semantics) ──
        await drills.nth(0).focus();
        await page.keyboard.press('Enter');
        await expect(page.locator('.fm-agent-detail')).toContainText('Bravo', {timeout: 10000});

        await drills.nth(1).focus();
        await page.keyboard.press(' '); // Space activates a native button — the detail switches to Charlie
        await expect(page.locator('.fm-agent-detail')).toContainText('Charlie', {timeout: 10000});

        // ── drill-only Up/Down jump + scroll stability ──
        await drills.nth(0).focus();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => page.evaluate(() => document.activeElement?.textContent)).toContain('Charlie');
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

        // ── LIFECYCLE ISOLATION: activating a control Button fires its lifecycle intent WITHOUT drilling ──
        // Bravo is 'ok' → its toggle is the STOP verb. The test-owned bridge records exactly one
        // minimal stop request and rejects it with a named reason; the detail must stay on Charlie
        // (no drill leakage), while Bravo renders the honest terminal rejection.
        await bravoToggle.focus();
        expect(await page.evaluate(() => !!document.activeElement?.closest?.('.fm-card-control-verbs'))).toBe(true);
        await page.keyboard.press('Enter');
        await expect.poll(
            () => fleet.requests.filter(request => ['startAgent', 'stopAgent', 'restartAgent'].includes(request.method)),
            {message: 'the lifecycle Button should emit exactly one minimal Stop request'}
        ).toEqual([{method: 'stopAgent', params: 'a11y-b'}]);
        await expect(page.locator('.fm-agent-detail')).toContainText('Charlie'); // no drill leakage — still Charlie
        await expect(bravoCard.locator('.fm-card-control-status')).toContainText(
            '⚠ rejected: fleet: stop rejected by keyboard witness',
            {timeout: 10000}
        );

        // ── gate-3 focus continuity across an index-shifting rebuild — for BOTH drill AND a lifecycle control ──
        // (a) DRILL: focus Charlie's drill, add a joiner that sorts above → focus follows Charlie's drill
        const
            charlieCard  = cards.filter({has: page.locator('.fm-card-drill', {hasText: 'Charlie'})}),
            charlieDrill = charlieCard.locator('.fm-card-drill');

        await charlieDrill.focus();
        await page.waitForTimeout(500); // let focusin reach the App-Worker (containsFocus) before the rebuild
        const alpha = createKeyboardRosterRow({id: 'a11y-a', displayName: 'Alpha', engineTag: 'fixture', family: 'claude'});
        fleet.setRosterRows([...KEYBOARD_ROSTER_ROWS, alpha]);
        await app.callMethod(cockpitId, 'loadRoster');
        await expect(cards).toHaveCount(4);
        await expect(charlieDrill).toBeFocused();

        // (b) TOGGLE: focus Charlie's TOGGLE, add another joiner → focus follows Charlie's TOGGLE (the exact
        // semantic child, NOT the drill) — proves gate-3 restores the specific control, not just the drill
        const charlieToggle = charlieCard.locator('.fm-card-control-verbs button').first();
        await charlieToggle.focus();
        // let the focusin propagate to the App-Worker (manager.Focus → containsFocus) BEFORE the rebuild:
        // gate-3 reads worker-side containsFocus, which lags the synchronous DOM focus by one main↔worker
        // hop. A real async roster rebuild never races freshly-set focus this tightly; the wait models that.
        await page.waitForTimeout(500);
        const zero = createKeyboardRosterRow({id: 'a11y-0', displayName: 'Zero', engineTag: 'fixture', family: 'claude'});
        fleet.setRosterRows([...KEYBOARD_ROSTER_ROWS, alpha, zero]);
        await app.callMethod(cockpitId, 'loadRoster');
        await expect(cards).toHaveCount(5);
        // Focus landed on Charlie's exact toggle (not merely some control, the drill, or <body>).
        await expect(charlieToggle).toBeFocused();

        expect(pageErrors, 'no uncaught page errors during the keyboard journey').toEqual([])
    })
});
