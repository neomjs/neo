import {test, expect}                                       from '../../fixtures.mjs';
import {NeuralLink_DataService, NeuralLink_InstanceService} from '../../../../ai/services.mjs';

/**
 * @summary The FM cockpit keyboard-a11y contract proven on the MOUNTED grid via Neural Link possession —
 * the mount-authority the unit layer (fleetGrid.spec / agentCard.spec) guards off. The gate-1 shape: a
 * `role=list` owner of NON-interactive `role=listitem` cards, each with a dedicated native drill
 * `<button>` (the resident name) + sibling lifecycle Buttons in ordinary Tab order. This spec EXECUTES —
 * not merely infers — every claimed path: native Enter AND Space activation on the drill; a lifecycle
 * Button that fires its intent WITHOUT drilling; the optional drill-only Up/Down jump with zero page
 * scroll; and gate-3 focus continuity restoring the resident's EXACT semantic child (drill AND toggle)
 * across an index-shifting rebuild. Zero uncaught page errors throughout.
 *
 * @see apps/agentos/view/fleet/AgentCard.mjs
 * @see apps/agentos/view/fleet/FleetGrid.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/fleetGrid.spec.mjs
 */
test.describe('AgentOS fleet grid — keyboard a11y (native list/listitem + drill Button, Neural Link, #14619)', () => {
    test.setTimeout(90000);

    test('list/listitem topology + native drill Enter/Space + lifecycle isolation + drill jump + gate-3 restoration (drill AND toggle)', async ({page, neuralLink}) => {
        const pageErrors = [];
        page.on('pageerror', err => pageErrors.push(err.message));

        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});
        await expect(page.locator('.fm-fleet-title')).not.toHaveText('Fleet · 0 agents', {timeout: 30000});

        const
            app       = await neuralLink.connectToApp('AgentOS'),
            sessionId = app.sessionId,
            stores    = await NeuralLink_DataService.listStores({sessionId}),
            roster    = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent');

        expect(roster, 'the provider-hosted FleetRoster store should be registered').toBeTruthy();

        // three ONLINE cards with DISTINCT names so identity is provable across a rebuild (sorted by
        // agentId → Bravo, Charlie, Delta)
        // wired sources so the lifecycle Buttons are ENABLED (focusable — gate-3 can restore focus to a
        // control) AND the control-status starts HIDDEN, so its appearance after a lifecycle activation
        // proves the emitted INTENT rendered, not a not-wired source banner.
        const wired = {
            roster    : {source: 'fleet:listAgents',    state: 'wired', confidence: 'observed'},
            repoStatus: {source: 'fleet:fleetStatus',   state: 'wired', confidence: 'observed'},
            runtime   : {source: 'fleet:runtimeStatus', state: 'wired', confidence: 'observed'}
        };
        const fixture = [
            {agentId: 'a11y-b', state: 'ok', displayName: 'Bravo',   engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: '', sources: wired},
            {agentId: 'a11y-c', state: 'ok', displayName: 'Charlie', engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: '', sources: wired},
            {agentId: 'a11y-d', state: 'ok', displayName: 'Delta',   engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: '', sources: wired}
        ];

        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'clear'});
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [fixture]});

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
        const bravoToggle = cards.nth(0).locator('.fm-card-control-verbs button').first();
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
        // Bravo is 'ok' → its toggle is the STOP verb; activating it must NOT switch the detail pane (no
        // drill leakage), and the emitted intent → Lane-C round-trip renders a control-status on Bravo's
        // card (the visible proof the intent was emitted + handled, not swallowed into a drill).
        await bravoToggle.focus();
        expect(await page.evaluate(() => !!document.activeElement?.closest?.('.fm-card-control-verbs'))).toBe(true);
        await page.keyboard.press('Enter');
        await expect(page.locator('.fm-agent-detail')).toContainText('Charlie'); // no drill leakage — still Charlie
        await expect(cards.nth(0).locator('.fm-card-control-status')).toBeVisible({timeout: 10000});

        // ── gate-3 focus continuity across an index-shifting rebuild — for BOTH drill AND a lifecycle control ──
        // (a) DRILL: focus Charlie's drill, add a joiner that sorts above → focus follows Charlie's drill
        await drills.nth(1).focus();
        await page.waitForTimeout(500); // let focusin reach the App-Worker (containsFocus) before the rebuild
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [[
            {agentId: 'a11y-a', state: 'ok', displayName: 'Alpha', engineTag: 'fixture', family: 'claude', laneLine: 'joiner', avatarUrl: '', sources: wired}
        ]]});
        await expect(cards).toHaveCount(4);
        await expect.poll(async () => page.evaluate(() => document.activeElement?.textContent)).toContain('Charlie');
        expect(await page.evaluate(() => document.activeElement?.classList?.contains('fm-card-drill'))).toBe(true);

        // (b) TOGGLE: focus Charlie's TOGGLE, add another joiner → focus follows Charlie's TOGGLE (the exact
        // semantic child, NOT the drill) — proves gate-3 restores the specific control, not just the drill
        const charlieCard   = cards.filter({has: page.locator('.fm-card-drill', {hasText: 'Charlie'})});
        const charlieToggle = charlieCard.locator('.fm-card-control-verbs button').first();
        await charlieToggle.focus();
        // let the focusin propagate to the App-Worker (manager.Focus → containsFocus) BEFORE the rebuild:
        // gate-3 reads worker-side containsFocus, which lags the synchronous DOM focus by one main↔worker
        // hop. A real async roster rebuild never races freshly-set focus this tightly; the wait models that.
        await page.waitForTimeout(500);
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [[
            {agentId: 'a11y-0', state: 'ok', displayName: 'Zero', engineTag: 'fixture', family: 'claude', laneLine: 'joiner2', avatarUrl: '', sources: wired}
        ]]});
        await expect(cards).toHaveCount(5);
        // focus landed on a control-verb Button INSIDE Charlie's card (not the drill, not <body>)
        await expect.poll(async () => page.evaluate(() => {
            const el = document.activeElement;
            return el?.closest?.('.fm-agent-card')?.querySelector('.fm-card-drill')?.textContent ?? null;
        })).toContain('Charlie');
        expect(await page.evaluate(() => !!document.activeElement?.closest?.('.fm-card-control-verbs'))).toBe(true);

        expect(pageErrors, 'no uncaught page errors during the keyboard journey').toEqual([])
    })
});
