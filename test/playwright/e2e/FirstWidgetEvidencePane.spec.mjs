import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 render smoke: the first-widget evidence pane and the live grid render TOGETHER.
 *
 * This is the AC6 counterpart to the unit specs (which prove the projection + safe-render source
 * boundary). It boots the AgentOSWidget child app and verifies end-to-end that the EvidencePane
 * (request / response / accepted-blueprint metadata) and the live grid BOTH render, and that the
 * grid actually rendered the SAME deterministic blueprint's rows the evidence pane describes — the
 * H2 provenance point. No Neural Link / NL orchestration is involved (out of scope for the leaf);
 * the blueprint is fixed, so the render is deterministic.
 *
 * @see apps/agentos/childapps/widget/view/Viewport.mjs
 */
test.describe('AgentOS first widget — evidence pane + live grid (H2 render smoke)', () => {
    test.setTimeout(90000);

    test('renders the evidence pane and the live grid together from one blueprint', async ({page}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');

        const evidence = page.locator('.agent-os-evidence-pane'),
              grid     = page.locator('.agent-os-first-widget-grid');

        // 1) the evidence pane renders
        await expect(evidence).toBeVisible({timeout: 30000});
        // 2) the live grid renders alongside it (render TOGETHER)
        await expect(grid).toBeVisible({timeout: 30000});

        // 3) the evidence pane shows the deterministic request + accepted-blueprint metadata
        await expect(evidence).toContainText('build me a neo grid');
        await expect(evidence).toContainText('Neo.grid.Container');
        await expect(evidence).toContainText('First Neo Grid');

        // 4) the live grid actually rendered the SAME blueprint's rows (provenance: evidence == grid)
        await expect(grid).toContainText('Verify intent', {timeout: 30000});
        await expect(grid).toContainText('Show evidence');
    });
});
