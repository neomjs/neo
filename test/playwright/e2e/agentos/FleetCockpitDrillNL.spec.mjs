import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The FM cockpit card→detail drill, proven LIVE through nested content inside the semantic
 * roster item — the basic "live drill" the detail-view AC requires. Clicking one resident's avatar
 * selects its li, reveals the auto-hidden AgentDetail inspector, and renders THAT resident: the
 * whole chain — native DOM click →
 * `Neo.selection.ListModel` → roster `onRosterSelect` → `agentSelect` → cockpit `onAgentSelect` → owner-held `detailRecord`
 * → dock `setItemAutoHidden` reveal → projection — is exercised end-to-end, never via a
 * controller call. Whitebox: the DOM proves the render, the possessed component proves the engine
 * truth (the mounted inspector holds the activated resident's record).
 *
 * @see apps/agentos/view/fleet/detail/Container.mjs
 * @see apps/agentos/view/fleet/cockpit/Controller.mjs (onAgentSelect)
 * @see test/playwright/e2e/agentos/FleetActivityStreamBurstNL.spec.mjs (sibling possession pattern)
 */
test.describe('AgentOS fleet cockpit — semantic roster item→detail live drill (#14608, #15212, #17553)', () => {
    test.setTimeout(90000);

    test('nested avatar content selects its resident and reveals the AgentDetail inspector + four panes', async ({page, neuralLink}) => {
        await page.goto('/apps/agentos/index.html');
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 30000});

        const
            app       = await neuralLink.connectToApp('AgentOS'),
            cards     = await app.queryComponent({className: 'AgentOS.view.fleet.roster.card.Container'}, ['record', 'id']),
            [cockpit] = await app.queryComponent({className: 'AgentOS.view.fleet.cockpit.Container'}, ['id']);

        expect(cards.length, 'the fleet should render cards with records').toBeGreaterThan(0);
        expect(cockpit?.properties?.id, 'the cockpit should expose its committed dock document').toBeTruthy();

        // Pin ONE specific card and derive its EXACT durable identity + DOM element id (=== the
        // component id) — so activation and assertion reference the same resident, not the set.
        const target = cards.find(entry => entry?.properties?.record?.agentId && entry?.properties?.id);
        expect(target, 'a card exposes both a record agentId and a component id').toBeTruthy();

        const expectedAgentId = target.properties.record.agentId,
              targetCardId    = target.properties.id;

        const
            targetItem    = page.locator('.fm-fleet-cards > .neo-list-item', {
                has: page.locator(`[id="${targetCardId}"]`)
            }),
            detail        = page.locator('.fm-agent-detail'),
            readDockModel = async () => (await app.getComponent(cockpit.properties.id, ['dockModel'])).dockModel,
            dockBefore    = await readDockModel();

        expect(dockBefore.items.detail.autoHidden, 'the Fleet preset starts with detail auto-hidden').toBe(true);

        // The avatar is ordinary nested card content — not a lifecycle control. Its REAL DOM click
        // bubbles to the list's delegated selection path, proving whole-card selection without a
        // card-local click listener. The lifecycle-control carve-out has its own mounted witness.
        await targetItem.locator('.fm-card-avatar').click();
        await expect(targetItem, 'avatar activation selects the containing semantic item')
            .toHaveAttribute('aria-selected', 'true');

        // the auto-hidden inspector reveals + renders a resident + the four SSOT panes
        await expect(detail).toBeVisible({timeout: 15000});
        await expect(detail.locator('.fm-detail-name')).not.toBeEmpty();
        await expect(detail.locator('.fm-detail-pane')).toHaveCount(4);

        // The three-source provenance readout renders in the MOUNTED DOM (not merely worker vdom) — the
        // drill-in counterpart to the card's one honest word-line. All three sources state themselves
        // unconditionally, so every label is present regardless of each source's wired/not-wired state;
        // this is the resident-detail contract the compact card deliberately cannot carry.
        await expect(detail.locator('.fm-detail-sources')).toBeVisible();

        const sourceReadout = await detail.locator('.fm-detail-sources').innerText();
        expect(sourceReadout, 'the inspector states the runtime source fact in the mounted DOM').toMatch(/Runtime:/);
        expect(sourceReadout, 'the inspector states the repository source fact').toMatch(/Repository:/);
        expect(sourceReadout, 'the inspector states the roster source fact').toMatch(/Roster:/);

        const dockAfterDrill = await readDockModel();
        expect(dockAfterDrill.items.detail.autoHidden, 'nested avatar selection must commit the reveal').toBe(false);

        // Engine truth: the mounted inspector holds the EXACT activated resident — equality, not
        // set-membership. Delegated item selection routed through owner-held state to the durable id.
        const [d] = await app.queryComponent({className: 'AgentOS.view.fleet.detail.Container'}, ['record']);
        expect(d?.properties?.record?.agentId, 'the inspector drilled into the exact activated resident').toBe(expectedAgentId)
    })
});
