import {test, expect} from '@playwright/test';

/**
 * A guide's ```mermaid fence must reach the reader as an SVG, in the app that also loads Monaco.
 *
 * The portal is the only surface where both libraries meet, and that meeting is the defect this arm
 * exists to catch. `main.addon.MonacoEditor` installs Monaco's AMD loader, which publishes a global
 * `define`; the Mermaid addon used to load the UMD bundle, which prefers `define.amd` when it finds
 * one and so registered itself into Monaco's loader instead of attaching to `window`. Every diagram
 * then failed with `mermaid is not defined`, and nothing noticed — no spec had ever asserted that a
 * diagram renders.
 *
 * Two things make this arm able to fail rather than merely pass:
 *
 * 1. It asserts the **rendered SVG**, not the container. The container is created by the Markdown
 *    component from the fence alone and appears whether or not the library ever loads, so counting
 *    containers is the assertion that would have stayed green throughout the outage.
 * 2. It asserts Monaco's loader is **present**. Without that, a future change that stopped loading
 *    Monaco on this route would make the arm pass by removing the conflict rather than by fixing it.
 */

const GUIDE = '/apps/portal/index.html#/learn/guides/uibuildingblocks/DockLayouts';

/** The container the Markdown component emits per fence — present even when nothing renders. */
const MERMAID = '.neo-mermaid';

test.describe('learn guide mermaid rendering', () => {
    test('a guide diagram renders as SVG on a page that also carries Monaco\'s AMD loader', async ({page}) => {
        await page.goto(GUIDE);

        // Auto-waits: an empty article makes every locator below match nothing and pass vacuously.
        await expect(page.locator('.neo-app-content-component').locator('h1')).toContainText('Dock');

        // The precondition, asserted rather than assumed: this route really does install the AMD
        // loader, so a green result below means the two coexist and not that Monaco stayed away.
        await expect.poll(() => page.evaluate(() => !!(window.define && window.define.amd)), {
            message: 'Monaco\'s AMD loader must be present for this arm to mean anything'
        }).toBe(true);

        // The containers exist from the fence alone; the SVG only exists if the library loaded,
        // initialised and ran. Rendering is async and staggered, so this polls for the settled
        // state — `nodes.length > 0` is part of the predicate, or an empty page satisfies `every`.
        await expect.poll(() => page.evaluate(selector => {
            const nodes = [...document.querySelectorAll(selector)];
            return nodes.length > 0 && nodes.every(node => node.querySelector('svg'))
        }, MERMAID), {
            message: 'every mermaid container on the guide must hold a rendered SVG',
            timeout: 20000
        }).toBe(true);

        // Restated as counts, so a failure names how many fell short rather than just "false".
        const counts = await page.evaluate(selector => {
            const nodes = [...document.querySelectorAll(selector)];
            return {containers: nodes.length, rendered: nodes.filter(node => node.querySelector('svg')).length}
        }, MERMAID);

        expect(counts.containers, 'the guide authors mermaid fences').toBeGreaterThan(0);
        expect(counts.rendered, 'and every one of them renders').toBe(counts.containers)
    })
});
