import {test, expect}                                       from '../../fixtures.mjs';
import {NeuralLink_DataService, NeuralLink_InstanceService} from '../../../../ai/services.mjs';

/**
 * @summary The FM cockpit keyboard-a11y contract proven on the MOUNTED grid via Neural Link possession —
 * the mount-authority the unit layer (fleetGrid.spec / agentCard.spec) guards off. The gate-1 shape: a
 * NON-interactive listitem card whose keyboard-operable drill is a dedicated NATIVE `<button>` (the
 * resident name), with lifecycle toggle/restart as sibling native Buttons — every control a real element
 * in ordinary Tab order. An OPTIONAL Up/Down efficiency shortcut jumps focus between drill Buttons only;
 * activation is native Enter/Space; and focus survives a roster rebuild, restored to the resident's EXACT
 * semantic child. This is what catches the class of bug a `.vdom` unit assertion cannot see (a root attr
 * set on the vdom but never flushed to the DOM).
 *
 * @see apps/agentos/view/fleet/AgentCard.mjs
 * @see apps/agentos/view/fleet/FleetGrid.mjs
 * @see test/playwright/unit/apps/agentos/view/fleet/fleetGrid.spec.mjs
 */
test.describe('AgentOS fleet grid — keyboard a11y (native listitem + drill Button, Neural Link, #14619)', () => {
    test.setTimeout(90000);

    test('listitem topology + native drill Button + drill-only Up/Down jump + gate-3 focus survives rebuild', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-fleet-grid')).toBeVisible({timeout: 30000});

        // possess only after the async autoLoad seed lands (mirrors the scale spec's ordering)
        await expect(page.locator('.fm-fleet-title')).not.toHaveText('Fleet · 0 agents', {timeout: 30000});

        const
            app       = await neuralLink.connectToApp('AgentOS'),
            sessionId = app.sessionId,
            stores    = await NeuralLink_DataService.listStores({sessionId}),
            roster    = stores.stores.find(candidate => candidate.model === 'AgentOS.model.FleetAgent');

        expect(roster, 'the provider-hosted FleetRoster store should be registered').toBeTruthy();

        // three ONLINE cards with DISTINCT names so identity is provable across a rebuild (sorted by
        // agentId → Bravo, Charlie, Delta)
        const fixture = [
            {agentId: 'a11y-b', state: 'ok', displayName: 'Bravo',   engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: ''},
            {agentId: 'a11y-c', state: 'ok', displayName: 'Charlie', engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: ''},
            {agentId: 'a11y-d', state: 'ok', displayName: 'Delta',   engineTag: 'fixture', family: 'claude', laneLine: 'kbd fixture', avatarUrl: ''}
        ];

        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'clear'});
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [fixture]});

        const cards  = page.locator('.fm-fleet-cards .fm-agent-card');
        const drills = page.locator('.fm-fleet-cards .fm-agent-card .fm-card-drill');
        await expect(cards).toHaveCount(3);
        await expect(drills).toHaveCount(3);

        // ── TOPOLOGY reaches the mounted DOM (the vdom-flush regression guard) ──
        // the card ROOT is a NON-interactive listitem: role=listitem and NO tabindex (not focusable)
        await expect(cards.nth(0)).toHaveAttribute('role', 'listitem');
        expect(await cards.nth(0).getAttribute('tabindex')).toBeNull();

        // the drill target is a dedicated NATIVE <button> whose accessible name is the resident's name
        expect(await drills.nth(0).evaluate(el => el.tagName)).toBe('BUTTON');
        await expect(drills.nth(0)).toContainText('Bravo');

        // lifecycle isolation: the toggle control is ALSO a native button — a SEPARATE element from the
        // drill (ordinary Tab reaches drill → toggle → restart; they are not nested in one interactive)
        const toggle0 = cards.nth(0).locator('.fm-card-control-verbs button').first();
        expect(await toggle0.evaluate(el => el.tagName)).toBe('BUTTON');

        // ── NATIVE drill activation (Enter) ── focus the first drill Button, press Enter → the detail pane
        // reveals THIS resident (onAgentSelect set its record). Native <button> supplies Enter/Space itself.
        await drills.nth(0).focus();
        expect(await page.evaluate(() => document.activeElement?.textContent)).toContain('Bravo');
        await page.keyboard.press('Enter');
        await expect(page.locator('.fm-agent-detail')).toContainText('Bravo', {timeout: 10000});

        // ── drill-only Up/Down efficiency jump + scroll stability ── focus the first drill, ArrowDown moves
        // focus to the NEXT card's drill Button (Charlie), and the page does not scroll (neo-selection rule)
        await drills.nth(0).focus();
        const scrollBefore = await page.evaluate(() => window.scrollY);
        await page.keyboard.press('ArrowDown');
        await expect.poll(async () => page.evaluate(() => document.activeElement?.textContent)).toContain('Charlie');
        expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

        // ── gate-3: focus survives a roster REBUILD, restored to the resident's EXACT drill Button ──
        // focus Charlie's drill, then add a joiner (Alpha) that sorts ABOVE it → every index shifts, the card
        // is destroyed/recreated, and focus must FOLLOW Charlie (identity), never drop to <body> or a neighbor
        await drills.nth(1).focus();
        expect(await page.evaluate(() => document.activeElement?.textContent)).toContain('Charlie');

        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [[
            {agentId: 'a11y-a', state: 'ok', displayName: 'Alpha', engineTag: 'fixture', family: 'claude', laneLine: 'joiner', avatarUrl: ''}
        ]]});
        await expect(cards).toHaveCount(4);

        // focus stayed on Charlie's DRILL Button (the same resident's semantic child) across the rebuild
        await expect.poll(async () => page.evaluate(() => document.activeElement?.textContent)).toContain('Charlie');
        expect(await page.evaluate(() => document.activeElement?.tagName)).toBe('BUTTON');
        expect(await page.evaluate(() => document.activeElement?.classList?.contains('fm-card-drill'))).toBe(true)
    })
});
