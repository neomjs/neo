import {test, expect} from '@playwright/test';

/**
 * The native `<progress>` draws its track in the platform's light or dark palette. Every theme
 * declares which one it is in `--neo-color-scheme` (its `Global.css`), and `Progress.css` hands
 * that declaration to the component, as `Select.css` does for the select field.
 *
 * Component tier: the value is a computed style on a live document. The switch swaps the
 * `neo-theme-*` class on the themed nodes, as `dashboard/ThemeColorSchemeStaging.spec.mjs` does,
 * because this fixture loads the sheets of the default themes only: Light, Dark and Neo Light.
 */

let componentId;

test.beforeEach(async ({page}) => {
    componentId = null;
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'});

    componentId = await page.evaluate(async () => {
        const result = await Neo.worker.App.createNeoInstance({
            importPath: '../component/Progress.mjs',
            labelText : 'Numbers checked',
            ntype     : 'progress',
            parentId  : 'component-test-viewport',
            value     : 40
        });
        if (!result.success) throw new Error(`Progress creation failed: ${result.error.message}`);
        return result.id
    });
    // `getVdomRoot()` is the `<progress>`, so the component id names the native element
    await expect(page.locator(`progress#${componentId}`)).toBeVisible()
});

test.afterEach(async ({page}) => {
    if (componentId) {
        const result = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        expect(result.success).toBe(true)
    }
});

test.describe('Neo.component.Progress', () => {
    for (const {theme, scheme} of [
        {theme: 'neo-theme-dark',  scheme: 'dark'},
        {theme: 'neo-theme-light', scheme: 'light'}
    ]) {
        test(`the track takes the scheme that ${theme} declares`, async ({page}) => {
            const schemes = await page.evaluate(({id, theme}) => {
                document.querySelectorAll('[class*="neo-theme-"]').forEach(node => {
                    node.className = node.className.replace(/neo-theme-[a-z-]+/, theme)
                });

                const style = getComputedStyle(document.getElementById(id));

                return {
                    declared: style.getPropertyValue('--neo-color-scheme').trim(),
                    used    : style.colorScheme
                }
            }, {id: componentId, theme});

            // Non-vacuity: without the theme's sheet in the fixture, both reads would come back empty
            expect(schemes.declared, `${theme} declares a scheme`).toBe(scheme);
            expect(schemes.used, 'the track uses the declared scheme').toBe(scheme)
        })
    }
});
