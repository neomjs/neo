import { test, expect } from '../fixtures.mjs';

/**
 * @summary E2E proof for the `create_component` Neural Link tool — the live-app counterpart to the
 * unit specs (which mock the transport). Drives a live Neo app over the Neural Link, creates a
 * component into a real container via `create_component`, and verifies end-to-end that the new
 * component is registered (queryable + present in `get_component_tree`) AND actually rendered into
 * the live DOM — the full App-Worker round-trip the unit coverage cannot exercise.
 *
 * Multi-window note: a create targeting a globally-unique `parentId` lands in that container's
 * window by construction — component ids are unique across the (single, shared) App Worker, so no
 * windowId param is needed to target a specific window's container.
 */
test.describe('Neural Link — create_component (e2e)', () => {
    test.setTimeout(90000);

    test('creates a component into a live container; it renders + appears in the component tree', async ({ page, neuralLink }) => {
        await page.goto('/examples/button/base/index.html');
        await expect(page.locator('.neo-button').first()).toBeVisible({ timeout: 30000 });

        const app = await neuralLink.connectToApp('Neo.examples.button.base');

        // Resolve a target container (the example's root viewport, else any container). The NL query
        // return shape is normalized defensively so this proof does not couple to one envelope shape.
        const pick = res => res?.[0]?.id ?? res?.components?.[0]?.id ?? res?.instances?.[0]?.id ?? res?.id ?? null;

        let containerId = pick(await app.findInstances({ ntype: 'viewport' }, ['id']));

        if (!containerId) {
            containerId = pick(await app.findInstances({ ntype: 'container' }, ['id']));
        }

        expect(containerId, 'could not resolve a target container id for the create').toBeTruthy();

        const text = 'NL-Created-' + Date.now();

        await app.createComponent(containerId, { ntype: 'button', text });

        // 1) get_component_tree visibility — the created component shows up in the live tree (async render).
        await expect.poll(async () => JSON.stringify(await app.getComponentTree()).includes(text), {
            message: 'the created component should appear in get_component_tree',
            timeout: 15000
        }).toBe(true);

        // 2) registered + queryable by selector.
        const found = await app.queryComponent({ ntype: 'button', text });
        expect(JSON.stringify(found), 'the created component should be queryable').toContain(text);

        // 3) actually rendered into the live DOM.
        await expect(page.locator(`.neo-button:has-text("${text}")`)).toBeVisible({ timeout: 10000 });
    });
});
