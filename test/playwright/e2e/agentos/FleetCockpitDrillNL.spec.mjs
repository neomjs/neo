import {test, expect} from '../../fixtures.mjs';

/**
 * @summary The FM cockpit card→detail drill, proven LIVE over the semantic roster item — the basic
 * "live drill" the detail-view AC requires. Selecting one resident's li reveals the auto-hidden
 * AgentDetail inspector and renders THAT resident: the whole chain — native DOM click →
 * `Neo.selection.ListModel` → roster `onRosterSelect` → `agentSelect` → cockpit `onAgentSelect` → owner-held `detailRecord`
 * → dock `setItemAutoHidden` reveal → projection — is exercised end-to-end, never via a
 * controller call. Whitebox: the DOM proves the render, the possessed component proves the engine
 * truth (the mounted inspector holds the activated resident's record).
 *
 * @see apps/agentos/view/fleet/detail/Container.mjs
 * @see apps/agentos/view/fleet/cockpit/Controller.mjs (onAgentSelect)
 * @see test/playwright/e2e/agentos/FleetActivityStreamBurstNL.spec.mjs (sibling possession pattern)
 */
test.describe('AgentOS fleet cockpit — semantic roster item→detail live drill (#14608, #15212)', () => {
    test.setTimeout(90000);

    test('a resident list item reveals the AgentDetail inspector rendering that agent + its four panes', async ({page, neuralLink}) => {
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
            detail        = page.locator('.fm-agent-detail'),
            readDockModel = async () => (await app.getComponent(cockpit.properties.id, ['dockModel'])).dockModel,
            dockBefore    = await readDockModel();

        expect(dockBefore.items.detail.autoHidden, 'the Fleet preset starts with detail auto-hidden').toBe(true);

        // Negative boundary: the avatar/listitem is inert. A redundant whole-card click listener would
        // keep the positive Button journey green while silently restoring mouse-only activation, so pin
        // the committed dock document byte-for-byte before exercising the dedicated control.
        await page.locator(`[id="${targetCardId}"] .fm-card-avatar`).click();
        await page.waitForTimeout(250); // allow a wrongly-restored main→worker click route to commit

        const dockAfterAvatar = await readDockModel();
        expect(dockAfterAvatar, 'avatar activation must not mutate the committed dock document').toEqual(dockBefore);
        await expect(detail, 'avatar activation must not reveal the inspector').not.toBeVisible();

        // The positive REAL DOM click targets the semantic li containing THAT card.
        await page.locator('.fm-fleet-cards > .neo-list-item', {
            has: page.locator(`[id="${targetCardId}"]`)
        }).click();

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
        expect(dockAfterDrill.items.detail.autoHidden, 'the dedicated Button must commit the reveal').toBe(false);

        // Engine truth: the mounted inspector holds the EXACT activated resident — equality, not
        // set-membership. The Button routed through owner-held selection to the exact durable id.
        const [d] = await app.queryComponent({className: 'AgentOS.view.fleet.detail.Container'}, ['record']);
        expect(d?.properties?.record?.agentId, 'the inspector drilled into the exact activated resident').toBe(expectedAgentId)
    })
});
