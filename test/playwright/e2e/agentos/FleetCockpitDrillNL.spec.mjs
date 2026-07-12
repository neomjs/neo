import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The FM cockpit card→detail drill, proven LIVE over the REAL DOM click — the basic
 * "live drill" the detail-view AC requires. A click on a resident card (the avatar is the
 * always-sized, non-control region the whole-card domListener catches) reveals the auto-hidden
 * AgentDetail inspector and renders THAT resident: the whole chain — domListener → onCardSelect →
 * `agentSelect` → cockpit `onAgentSelect` → owner-held `detailRecord` → dock `setItemAutoHidden`
 * reveal → projection — is exercised end-to-end, never via a controller call. Whitebox: the DOM
 * proves the render, the possessed component proves the engine truth (the mounted inspector holds
 * the clicked resident's record).
 *
 * @see apps/agentos/view/fleet/AgentDetail.mjs
 * @see apps/agentos/view/fleet/FleetCockpitController.mjs (onAgentSelect)
 * @see test/playwright/e2e/agentos/FleetActivityStreamBurstNL.spec.mjs (sibling possession pattern)
 */
test.describe('AgentOS fleet cockpit — card→detail live drill over the real DOM click (#14608)', () => {
    test.setTimeout(90000);

    test('a card click reveals the AgentDetail inspector rendering that agent + its four panes', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app   = await neuralLink.connectToApp('AgentOS'),
              cards = await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['record', 'id']);
        expect(cards.length, 'the fleet should render cards with records').toBeGreaterThan(0);

        // pin ONE specific card and derive its EXACT durable identity + its DOM element id (=== the
        // component id) — so the click and the assertion reference the same resident, not the set.
        const target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);
        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const expectedAgentId = target.properties.record.agentId,
              targetCardId    = target.properties.id;

        // the REAL DOM click — on THAT card's always-sized avatar (a non-control region the whole-card
        // domListener catches; the flex body can render narrow), addressed by the card's own element id
        await page.locator(`[id="${targetCardId}"] .fm-card-avatar`).click();

        // the auto-hidden inspector reveals + renders a resident + the four SSOT panes
        const detail = page.locator('.fm-agent-detail');
        await expect(detail).toBeVisible({timeout: 15000});
        await expect(detail.locator('.fm-detail-name')).not.toBeEmpty();
        await expect(detail.locator('.fm-detail-pane')).toHaveCount(4);

        // engine truth: the mounted inspector holds the EXACT clicked resident — equality, not
        // set-membership. The click routed through the owner-held selection to the exact durable id.
        const [d] = await app.queryComponent({className: 'AgentOS.view.fleet.AgentDetail'}, ['record']);
        expect(d?.properties?.record?.agentId, 'the inspector drilled into the exact clicked resident').toBe(expectedAgentId)
    })
});
