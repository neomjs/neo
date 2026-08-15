import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies the AgentOS harness shell boots to the left-rail keeper-view nav with the Fleet
 * cockpit as the default surface, and that the keeper views are reachable via the rail.
 *
 * The app boots to the header chrome + the left-rail nav (Home / Fleet / Accounts / Chat)
 * with Fleet active — the CARD cockpit (fleet grid + health bar + activity stream). The retired
 * settings panel must be GONE everywhere: no mounted surface, no Control rail tab — lifecycle
 * lives on the cards (B4), setup lives in the S5 zone + Accounts.
 *
 * @see apps/agentos/view/Viewport.mjs
 */
test.describe('AgentOS harness shell — left-rail keeper-view nav', () => {
    test.setTimeout(120000);

    test('boots to the Fleet cockpit default; the retired Control surface is gone; Accounts reachable via the rail', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        // boots end-to-end: the header chrome + the left-rail keeper-view shell
        await expect(page.locator('.agent-top-toolbar')).toBeVisible({timeout: 60000});
        await expect(page.locator('.agent-shell')).toBeVisible({timeout: 60000});

        // Fleet is the default keeper-view: the CARD cockpit (fleet grid + health bar + activity stream)
        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        expect(await page.locator('.fm-agent-card').count()).toBeGreaterThan(0);
        await expect(page.locator('.fm-health-bar')).toBeVisible();
        await expect(page.locator('.fm-activity-stream')).toBeVisible();

        // the retired settings panel is gone WHOLE: no mounted surface and no rail entry —
        // its grid was the FleetGrid's duplicate, lifecycle belongs to the card controls, and
        // add-agent belongs to the S5 rail zone
        await expect(page.locator('.agent-panel-settings')).toHaveCount(0);
        await expect(page.locator('.agent-shell').getByText('Control', {exact: true})).toHaveCount(0);

        // Accounts keeper-view reachable via the rail → the agent-identity form renders
        await page.locator('.agent-shell').getByText('Accounts', {exact: true}).click();
        await expect(page.locator('.agent-definition-form')).toBeVisible({timeout: 30000})
    });

    test('offline first-run renders the calm static-roster view — zero per-card source alarms (#17210)', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        await expect(page.locator('.fm-fleet-cockpit')).toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first()).toBeVisible({timeout: 60000});

        // the topology gate: this test's acceptance surface is the OFFLINE first-run — the sample
        // badge must be up (no fleet server reachable), else the run is measuring the wrong topology
        await expect(page.locator('.fm-fleet-head')).toHaveClass(/is-sample/, {timeout: 30000});
        await expect(page.locator('.fm-fleet-stale')).toHaveText('static roster');

        // the retired defect: one red "Roster not nominal · malformed source fact" strip per card.
        // Declared absence earns zero pixels — every strip stays hidden; the badge + banner announce
        // the condition once.
        expect(await page.locator('.fm-agent-card').count()).toBeGreaterThan(0);
        await expect(page.locator('.fm-card-strip:visible')).toHaveCount(0)
    });
});
