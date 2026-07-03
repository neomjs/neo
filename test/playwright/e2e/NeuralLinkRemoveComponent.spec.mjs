import { test, expect } from '../fixtures.mjs';

/**
 * @summary E2E proof for the `remove_component` Neural Link tool — the live-app counterpart to the unit
 * spec (which mocks the transport). Creates a probe via `create_component`, verifies it is registered +
 * rendered, then removes it via `remove_component` and verifies it is GONE from both `get_component_tree`
 * AND the live DOM — the full destroy round-trip (instance deregistration + parent-vdom detach via the
 * pinned `destroy(true)`) that the unit coverage cannot exercise. The create→remove pairing also proves
 * the two write-locked tools compose over one live session.
 */
test.describe('Neural Link — remove_component (e2e)', () => {
    test.setTimeout(90000);

    test('removes a live component; it disappears from the component tree + the DOM', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');

        // Resolve a target container (root viewport, else any container) — normalized defensively so the
        // proof does not couple to one NL return-envelope shape (mirrors NeuralLinkCreateComponent.spec).
        const pick = res => res?.[0]?.id ?? res?.components?.[0]?.id ?? res?.instances?.[0]?.id ?? res?.id ?? null;

        let containerId = pick(await app.findInstances({ ntype: 'viewport' }, ['id']));
        if (!containerId) {
            containerId = pick(await app.findInstances({ ntype: 'container' }, ['id']));
        }
        expect(containerId, 'could not resolve a target container id for the create').toBeTruthy();

        // Create a probe to remove (a fixed id lets the assertions target it precisely).
        const probeId = 'nl-remove-probe-' + Date.now();
        await app.createComponent(containerId, { ntype: 'button', id: probeId, text: 'remove-me' });

        // Present first — registered in the tree AND rendered in the live DOM.
        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(probeId), {
            message: 'the probe should appear in get_component_tree before removal',
            timeout: 15000
        }).toBe(true);
        await expect(page.locator(`#${probeId}`)).toBeVisible({ timeout: 10000 });

        // The tool under test: remove it.
        await app.removeComponent(probeId);

        // GONE — absent from the tree (instance deregistered) AND detached from the DOM (`destroy(true)`).
        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(probeId), {
            message: 'the probe should be absent from get_component_tree after removal',
            timeout: 15000
        }).toBe(false);
        await expect(page.locator(`#${probeId}`)).toHaveCount(0);
    });
});
