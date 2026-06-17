import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 live-mutate proof: bounded follow-up edits change the EXISTING first widget in place and the
 * evidence pane reflects the actual mutated state — closing the "live-mutable, not generated once" gap.
 *
 * Drives the real follow-up edit surface against a live app (no stubs): type an edit → submit → the SAME
 * first-widget grid and its evidence re-render. Each accepted edit is asserted against the grid's
 * re-projected store/title truth (not a loose match): `show 8 rows` grows the live grid + the evidence Rows
 * count; `rename` relabels the evidence Title; an unknown command fails closed to a `Rejected:` outcome
 * with the grid left untouched; `reset` restores the seed. A no-op submit or a replacement-widget path must
 * fail these assertions.
 *
 * @see apps/agentos/childapps/widget/view/ViewportController.mjs
 * @see apps/agentos/childapps/widget/util/parseEditRequest.mjs
 * @see apps/agentos/childapps/widget/util/firstWidgetEditModel.mjs
 */
test.describe('AgentOS first widget — bounded follow-up edits (H2 live mutation)', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1280, height: 720}});

    test('accepted edits mutate the live grid + evidence; unknown edits fail closed', async ({page}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');

        const
            editField    = page.locator('.agent-os-edit-row input'),
            editButton   = page.locator('.agent-os-edit-submit'),
            outcome      = page.locator('.agent-os-evidence-edit-outcome'),
            // VISIBLE cells only — the grid recycles a row pool and hides surplus rows (`display:none`)
            // rather than removing them, so a count/content assertion must ignore the hidden pool nodes
            cells        = page.locator('.agent-os-first-widget-grid .neo-grid-cell:visible'),
            evidenceMeta = page.locator('.agent-os-evidence-meta dd'); // [schema, title, columns, rows]

        // baseline: the bootstrap grid rendered (3 seed rows × 4 cols) and the evidence reflects it
        await expect(editField).toBeVisible({timeout: 30000});
        await expect(cells).toHaveCount(12, {timeout: 30000});
        await expect(evidenceMeta.nth(3)).toHaveText('3'); // Rows
        await expect(evidenceMeta.nth(1)).toHaveText('first-widget-grid'); // Title (grid.id fallback)

        // accepted grid-shape edit: the SAME grid grows to 8 rows; store-truth re-projects into evidence
        await editField.fill('show 8 rows');
        await editButton.click();
        await expect(evidenceMeta.nth(3)).toHaveText('8', {timeout: 15000}); // Rows — store.count, re-projected
        await expect(cells).toHaveCount(32); // 8 rows × 4 cols, rendered in place
        await expect(cells.filter({hasText: 'Sample task 4'})).toHaveCount(1); // a row beyond the seed rendered
        await expect(outcome).toContainText('show 8 rows');

        // accepted label edit: the live grid's title relabels; evidence Title reflects the live read
        await editField.fill('rename it to Q3 Metrics');
        await editButton.click();
        await expect(evidenceMeta.nth(1)).toHaveText('Q3 Metrics', {timeout: 15000});
        await expect(outcome).toContainText('Q3 Metrics');
        await expect(evidenceMeta.nth(3)).toHaveText('8'); // row count unchanged by a rename

        // unknown command fails closed: a Rejected outcome, and the live grid is left untouched
        await editField.fill('delete everything');
        await editButton.click();
        await expect(outcome).toContainText(/Rejected.*Unknown edit/i, {timeout: 15000});
        await expect(evidenceMeta.nth(3)).toHaveText('8');          // rows untouched
        await expect(evidenceMeta.nth(1)).toHaveText('Q3 Metrics'); // title untouched
        await expect(cells).toHaveCount(32);

        // reset restores the canonical seed rows in place — the grid visibly shrinks back to 3 rows
        await editField.fill('reset data');
        await editButton.click();
        await expect(evidenceMeta.nth(3)).toHaveText('3', {timeout: 15000});
        await expect(cells).toHaveCount(12); // back to 3 visible rows × 4 cols (surplus rows hidden)
        await expect(cells.filter({hasText: 'Verify intent'})).toHaveCount(1);   // a canonical seed row is back
        await expect(cells.filter({hasText: 'Sample task 4'})).toHaveCount(0);   // generated filler no longer visible
        await expect(outcome).toContainText('Reset the widget')
    });
});
