import {test, expect}                                       from '../../fixtures.mjs';
import {NeuralLink_DataService, NeuralLink_InstanceService} from '../../../../ai/services.mjs';

/**
 * @summary The FM cockpit keyboard-a11y roving proven on the MOUNTED grid via Neural Link possession —
 * the mount-authority the unit layer (fleetGrid.spec / agentCard.spec) guards off. A real browser
 * keydown drives the grid's KeyNavigation → `focusIndex` → `applyRovingTabIndex` → the DOM `tabindex`
 * attribute, so this proves the single-tab-stop roving ring the unit suite proves in isolation actually
 * obeys real arrow keys end-to-end (main-thread DomEvents → App-Worker → vdom → mounted DOM).
 *
 * @see apps/agentos/view/fleet/FleetGrid.mjs (applyRovingTabIndex / afterSetFocusIndex)
 * @see test/playwright/unit/apps/agentos/view/fleet/fleetGrid.spec.mjs
 */
test.describe('AgentOS fleet grid — keyboard-a11y roving (Neural Link, #14619)', () => {
    test.setTimeout(90000);

    test('arrow keys move the single roving tab stop across mounted cards — real keydown → KeyNavigation → DOM tabindex', async ({page, neuralLink}) => {
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

        // three online cards (below fold) so the roving ring has ≥3 stops rendered as cards
        const fixture = ['a11y-ok-a', 'a11y-ok-b', 'a11y-ok-c'].map(agentId => ({
            agentId, state: 'ok', displayName: agentId, engineTag: 'fixture', family: 'claude',
            laneLine: 'a11y roving fixture', avatarUrl: ''
        }));

        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'clear'});
        await NeuralLink_InstanceService.callMethod({sessionId, id: roster.id, method: 'add', args: [fixture]});

        const cards = page.locator('.fm-fleet-cards .fm-agent-card');
        await expect(cards).toHaveCount(3);

        // a11y ATTRIBUTES reach the mounted DOM (not just the vdom): role=button + a real tabindex.
        // Regression guard for the vdom-root-flush fix — a raw this.vdom write left these absent.
        await expect(cards.nth(0)).toHaveAttribute('role', 'button');

        // roving-tabindex mounted: EXACTLY ONE card is the tab stop, and it is the first card (focusIndex 0)
        await expect(page.locator('.fm-fleet-cards .fm-agent-card[tabindex="0"]')).toHaveCount(1);
        await expect(cards.nth(0)).toHaveAttribute('tabindex', '0');

        // real keydown drives the ring forward: focus the active card, ArrowDown → the tab stop MOVES to
        // the next card (Down/Right step forward per FleetGrid.onNavKey), and exactly one stop survives.
        await cards.nth(0).focus();
        await page.keyboard.press('ArrowDown');

        await expect(cards.nth(1)).toHaveAttribute('tabindex', '0');
        await expect(cards.nth(0)).toHaveAttribute('tabindex', '-1');
        await expect(page.locator('.fm-fleet-cards .fm-agent-card[tabindex="0"]')).toHaveCount(1);

        // and it clamps at the tail — arrowing past the last card keeps exactly one stop (never dangles)
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('ArrowDown');
        await expect(cards.nth(2)).toHaveAttribute('tabindex', '0');
        await expect(page.locator('.fm-fleet-cards .fm-agent-card[tabindex="0"]')).toHaveCount(1)
    })
});
