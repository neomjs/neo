import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Negative product witness: the REAL AgentOS Fleet Manager (the production cockpit, NOT
 * the demo host) exposes no tour affordance. The choreography moved to the dedicated demo host
 * (`?demo=mission`, `MissionControlWorkspace`); this guards the product/demo boundary against
 * regression — if a Play-tour button or a tour caption strip returns to the product cockpit, this
 * reds. It also proves the surgical removal left the product cockpit itself intact (it still mounts
 * and renders its fleet).
 *
 * Mounted, not source-text (the guard discipline): a returning tour control is caught by the
 * RENDERED control bar, not by grepping the source — a source guard aimed at a class name goes
 * vacuous the moment the code moves, while a rendered-affordance assertion tracks the real product.
 *
 * Run: NEO_E2E_PORT=8119 npx playwright test agentos/FleetManagerNoTourWitnessNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('AgentOS Fleet Manager — the production cockpit carries no tour (product/demo boundary)', () => {
    test.setTimeout(90000);

    test('the real cockpit still renders its fleet but shows no Play-tour button and no tour caption', async ({page}) => {
        await page.goto('/apps/agentos/index.html');

        // the surgical tour removal left the product cockpit intact — it still mounts and renders
        await expect(page.locator('.fm-fleet-cockpit'), 'the production cockpit still renders post-removal').toBeVisible({timeout: 60000});
        await expect(page.locator('.fm-agent-card').first(), 'the fleet still renders').toBeVisible({timeout: 30000});

        // …but the tour affordance is gone from the product surface — it lives only on the demo host
        await expect(page.locator('.fm-fusion-tour'), 'no Play-tour button in the product cockpit').toHaveCount(0);
        await expect(page.locator('.fm-tour-caption'), 'no tour caption strip in the product cockpit').toHaveCount(0)
    });
});
