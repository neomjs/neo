import {test, expect} from '../fixtures.mjs';

/**
 * @summary H2 chat-intake proof: a typed first-widget request is captured into the evidence state,
 * and markup / invalid input fails closed without projecting an unsafe payload.
 *
 * Exercises the real flow against a live app (no stubs): type → submit → the EvidencePane request
 * line shows the typed request; then type markup → submit → the intake error line shows a bounded
 * fail-closed reason AND the evidence request is NOT replaced by the unsafe input. Assertions check
 * actual rendered text (not a loose match) so an unwired submit or a leaked payload must fail.
 *
 * @see apps/agentos/childapps/widget/view/RequestIntake.mjs
 * @see apps/agentos/childapps/widget/view/ViewportController.mjs
 */
test.describe('AgentOS first widget — chat intake (H2 request capture)', () => {
    test.setTimeout(90000);

    test('captures a valid request into the evidence state + fails closed on markup', async ({page}) => {
        await page.goto('/apps/agentos/childapps/widget/index.html');

        const
            field   = page.locator('.agent-os-request-intake input').first(),
            build   = page.locator('.agent-os-request-submit'),
            request = page.locator('.agent-os-evidence-request'),
            error   = page.locator('.agent-os-request-error');

        await expect(field).toBeVisible({timeout: 30000});
        await expect(build).toBeVisible();
        // baseline: the evidence pane shows the deterministic default request
        await expect(request).toContainText('build me a neo grid', {timeout: 30000});
        // all three surfaces render together (intake + evidence + live grid) — 3 rows x 4 cols
        await expect(page.locator('.agent-os-first-widget-grid .neo-grid-cell')).toHaveCount(12, {timeout: 30000});

        // valid submit → the typed request is projected into the evidence request state
        await field.fill('build me a neo dashboard');
        await build.click();
        await expect(request).toContainText('build me a neo dashboard', {timeout: 15000});
        await expect(error).toHaveText('');

        // markup submit → bounded fail-closed reason shown, evidence request NOT replaced by unsafe input
        await field.fill('<script>oops</script>');
        await build.click();
        await expect(error).toContainText(/plain text|markup/i, {timeout: 15000});
        await expect(request).toContainText('build me a neo dashboard');
        await expect(request).not.toContainText('script')
    });
});
