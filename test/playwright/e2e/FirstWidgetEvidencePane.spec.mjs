import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 render proof: the first-widget evidence pane and the live grid render together, and
 * the grid actually renders the blueprint's content ROWS — not an empty grid.
 *
 * The AC6 counterpart to the unit specs (which prove the projection + safe-render boundary). It
 * boots the AgentOSWidget child app and verifies the EvidencePane (request + accepted-blueprint
 * metadata) AND that the live grid renders ALL of the SAME deterministic blueprint's rows — the
 * provenance point of the leaf. The cell-COUNT + per-row cell-VALUE assertions are deliberate: a
 * grid that mounts but renders zero content rows MUST fail here. (An earlier weak `toContainText`-
 * only check passed against a stale dev-server render and never validated a real row — fixed.)
 *
 * @see apps/agentos/childapps/widget/view/Viewport.mjs
 */
test.describe('AgentOS first widget — evidence pane + live grid rows (H2 render proof)', () => {
    test.setTimeout(90000);

    test('renders the evidence pane and the grid with all blueprint content rows', async ({page}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');

        const evidence = page.locator('.agent-os-evidence-pane'),
              grid     = page.locator('.agent-os-first-widget-grid');

        await expect(evidence).toBeVisible({timeout: 30000});
        await expect(grid).toBeVisible({timeout: 30000});

        // evidence pane: deterministic request + accepted-blueprint metadata (scalar, safe text)
        await expect(evidence).toContainText('build me a neo grid');
        await expect(evidence).toContainText('Neo.grid.Container');
        await expect(evidence).toContainText('First Neo Grid');

        // the live grid renders ALL blueprint rows — 3 rows × 4 columns = 12 cells. `toHaveCount`
        // auto-waits for the async render to settle; an empty grid (0 cells) FAILS this assertion.
        await expect(grid.locator('.neo-grid-cell')).toHaveCount(12, {timeout: 30000});

        // and each content row's value is actually rendered in the grid (not just buffered) — the
        // provenance link: what the evidence pane describes is what the grid below it renders.
        for (const value of ['Verify intent', 'Render grid', 'Show evidence']) {
            await expect(grid.locator('.neo-grid-cell', {hasText: value})).toHaveCount(1)
        }
    });
});
