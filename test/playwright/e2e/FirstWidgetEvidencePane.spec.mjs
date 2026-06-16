import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 render proof: the live grid is CREATED through the insert seam and the evidence pane
 * projects from it — the two render together and describe the SAME created grid, not an empty grid.
 *
 * The AC6 counterpart to the unit specs (which prove the projection + safe-render boundary). It boots
 * the AgentOSWidget child app, where the controller creates the grid via the `add → insert` path a
 * Neural-Link `create_component` drives and projects the actually-created grid into the evidence pane.
 * The pane therefore shows the created grid's identity (`first-widget-grid`, its id) — NOT the
 * `EvidencePane` default (`First Neo Grid`), so this assertion fails if the projection never fired.
 * The cell-COUNT + per-row cell-VALUE assertions are deliberate: a grid that mounts but renders zero
 * content rows MUST fail. (An earlier weak `toContainText`-only check passed against a stale
 * dev-server render and never validated a real row — fixed.)
 *
 * @see apps/agentos/childapps/widget/view/ViewportController.mjs
 */
test.describe('AgentOS first widget — created grid + projected evidence (H2 render proof)', () => {
    test.setTimeout(90000);

    test('creates the grid via the insert seam and projects it into the evidence pane', async ({page}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');

        const evidence = page.locator('.agent-os-evidence-pane'),
              grid     = page.locator('.agent-os-first-widget-grid');

        await expect(evidence).toBeVisible({timeout: 30000});
        await expect(grid).toBeVisible({timeout: 30000});

        // evidence pane: deterministic request + the projected CREATED grid's metadata (scalar text).
        // `first-widget-grid` is the created grid's id — its appearance proves the projection ran and
        // overwrote the EvidencePane default title (`First Neo Grid`).
        await expect(evidence).toContainText('build me a neo grid');
        await expect(evidence).toContainText('Neo.grid.Container');
        await expect(evidence).toContainText('first-widget-grid');

        // the live grid renders ALL rows — 3 rows × 4 columns = 12 cells. `toHaveCount` auto-waits for
        // the async create+render to settle; an empty grid (0 cells) FAILS this assertion.
        await expect(grid.locator('.neo-grid-cell')).toHaveCount(12, {timeout: 30000});

        // and each content row's value is actually rendered in the grid (not just buffered) — the
        // provenance link: what the evidence pane describes is what the created grid renders.
        for (const value of ['Verify intent', 'Render grid', 'Show evidence']) {
            await expect(grid.locator('.neo-grid-cell', {hasText: value})).toHaveCount(1)
        }
    });
});
