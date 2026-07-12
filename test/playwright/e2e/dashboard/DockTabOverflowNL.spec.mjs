import { test, expect } from '../../fixtures.mjs';

/**
 * Out-of-collection floating dock tab-overflow control (Neural Link).
 *
 * At a narrow viewport the heavy `main-tabs` node overflows; the runtime {@link Neo.dashboard.plugin.TabOverflow}
 * plugin creates a single overflow control (a `button.Base` with a `menu`) and mounts it as a `floating`
 * component to `document.body` — OUT of the header toolbar's item collection, so `owner.items` stays exactly
 * the real tabs (the model contract's collection invariant).
 *
 * This witness asserts the parentless `initVnode(true)` autoMount actually reaches the DOM — it relies on the
 * merged hidden-document render-queue drain (a parentless auto-mount no longer parks behind a suspended
 * `requestAnimationFrame` in a hidden / offscreen document).
 *
 * Run: NEO_E2E_PORT=8094 npx playwright test dashboard/DockTabOverflowNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */
test.describe('#14771 dock tab-overflow floating control', () => {
    test.setTimeout(120000);
    test.use({ viewport: { width: 600, height: 800 } });

    test('the out-of-collection floating overflow control mounts on main-tabs overflow', async ({ page, neuralLink }) => {
        await page.goto('/examples/dashboard/dock/');
        page.on('pageerror', err => console.error('BROWSER JS ERROR:', err));

        const app = await neuralLink.connectToApp('Neo.examples.dashboard.dock');

        // The 7 main-tabs overflow at 600px → the plugin eagerly mounts the floating overflow control to
        // document.body. The parentless autoMount only settles because the hidden-document render queue drains.
        let control = null;

        await expect.poll(async () => {
            const found = await app.findInstances(
                    { className: 'Neo.dashboard.plugin.TabOverflow' },
                    ['control.mounted', 'control.id', 'control.parentId', 'control.floating', 'control.autoMount']
                ),
                  inst = Array.isArray(found) ? found[0] : found;

            control = inst?.properties ?? null;

            return control?.['control.mounted'] === true ? 'mounted' : 'pending';
        }, { message: 'the parentless floating overflow control must mount', timeout: 30000, intervals: [500] }).toBe('mounted');

        console.log('CTRL_DEBUG ' + JSON.stringify(control));
        const domDebug = await page.evaluate((id) => ({
            hidden      : document.hidden,
            byId        : id ? (document.getElementById(id) ? 1 : 0) : 'no-id',
            overflowCls : document.querySelectorAll('.neo-dock-tab-overflow-control').length,
            ellipsis    : document.querySelectorAll('.fa-ellipsis').length,
            bodyChildren: document.body.children.length
        }), control?.['control.id']);
        console.log('DOM_DEBUG ' + JSON.stringify(domDebug));

        // Stale-bundle guard (per Euclid's runtime trace): a reused webpack dev-server can serve the
        // committed toolbar-item HEAD (owner.add → floating=false) instead of this floating syncControl,
        // which then reads as a false "runtime re-parent" (parentId=owner.id). Assert the floating module
        // actually loaded BEFORE the DOM checks, so a stale bundle fails LOUDLY here rather than masquerading.
        expect(control['control.floating'], 'stale bundle: loaded the toolbar-item HEAD (floating=false), not the floating syncControl — kill the reused :8094 webpack server and re-run').toBe(true);

        // Out-of-collection invariant: it is mounted DIRECTLY to document.body (a floating child), NOT as a
        // trailing header-toolbar item — so owner.items stays exactly the real tabs (a toolbar item would
        // corrupt tab.Container's items.length insertion index and be SortZone-draggable).
        expect(control['control.parentId']).toBe('document.body');

        // And the control instance reached the real DOM (query by its own id — robust vs class transforms).
        await expect(page.locator(`#${control['control.id']}`)).toHaveCount(1)
    })
});
