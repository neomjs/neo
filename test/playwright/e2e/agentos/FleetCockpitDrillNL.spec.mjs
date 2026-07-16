import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The FM cockpit card→detail drill, proven LIVE over the dedicated native drill Button —
 * the basic "live drill" the detail-view AC requires. Activating one resident's name Button reveals
 * the auto-hidden AgentDetail inspector and renders THAT resident: the whole chain — native DOM
 * click → `onCardSelect` → `agentSelect` → cockpit `onAgentSelect` → owner-held `detailRecord`
 * → dock `setItemAutoHidden` reveal → projection — is exercised end-to-end, never via a
 * controller call. Whitebox: the DOM proves the render, the possessed component proves the engine
 * truth (the mounted inspector holds the activated resident's record).
 *
 * @see apps/agentos/view/fleet/AgentDetail.mjs
 * @see apps/agentos/view/fleet/FleetCockpitController.mjs (onAgentSelect)
 * @see test/playwright/e2e/agentos/FleetActivityStreamBurstNL.spec.mjs (sibling possession pattern)
 */
test.describe('AgentOS fleet cockpit — native Button→detail live drill (#14608, #15212)', () => {
    test.setTimeout(90000);

    test('a resident drill Button reveals the AgentDetail inspector rendering that agent + its four panes', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const app   = await neuralLink.connectToApp('AgentOS'),
              cards = await app.queryComponent({className: 'AgentOS.view.fleet.AgentCard'}, ['record', 'id']);
        expect(cards.length, 'the fleet should render cards with records').toBeGreaterThan(0);

        // Pin ONE specific card and derive its EXACT durable identity + DOM element id (=== the
        // component id) — so activation and assertion reference the same resident, not the set.
        const target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);
        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const expectedAgentId = target.properties.record.agentId,
              targetCardId    = target.properties.id;

        // The REAL DOM click targets THAT card's dedicated native drill Button. The non-interactive
        // listitem/card and its avatar deliberately do not own activation after native-button convergence.
        await page.locator(`[id="${targetCardId}"] .fm-card-drill`).click();

        // the auto-hidden inspector reveals + renders a resident + the four SSOT panes
        const detail = page.locator('.fm-agent-detail');
        await expect(detail).toBeVisible({timeout: 15000});
        await expect(detail.locator('.fm-detail-name')).not.toBeEmpty();
        await expect(detail.locator('.fm-detail-pane')).toHaveCount(4);

        // Engine truth: the mounted inspector holds the EXACT activated resident — equality, not
        // set-membership. The Button routed through owner-held selection to the exact durable id.
        const [d] = await app.queryComponent({className: 'AgentOS.view.fleet.AgentDetail'}, ['record']);
        expect(d?.properties?.record?.agentId, 'the inspector drilled into the exact activated resident').toBe(expectedAgentId)
    })
});
