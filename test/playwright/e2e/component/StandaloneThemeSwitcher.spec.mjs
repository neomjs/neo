import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E verification for `Neo.button.ThemeSwitcher` across standalone Form,
 * Component/Wrapper, StateProvider, and 3D Gallery examples, covering live App Worker `theme`
 * toggling via Neural Link, Mermaid diagram redraw, light-theme panel legibility on 3D stages,
 * mobile `390 × 844` fit, and cross-window theme synchronization in `stateProvider/multiWindow`.
 */
test.describe('Standalone examples ThemeSwitcher', () => {
    test.setTimeout(90000);

    test('form/validation toggles light <-> dark in App Worker and DOM and fits at 390x844', async ({page, neuralLink}) => {
        await page.emulateMedia({colorScheme: 'light'});
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/form/validation/index.html');

        const app      = await neuralLink.connectToApp('Neo.examples.form.validation'),
              viewport = page.locator('.neo-examples-form-validation'),
              switcher = page.locator('.neo-themeswitcher');

        await expect(switcher).toBeVisible({timeout: 30000});
        await expect(viewport).toHaveClass(/neo-theme-neo-light/);

        const [swNode] = await app.queryComponent({ntype: 'theme-switcher'}, ['id']);
        expect(swNode?.id).toBeTruthy();

        await switcher.click();
        await expect(viewport).toHaveClass(/neo-theme-neo-dark/);

        const [vpNode] = await app.queryComponent({className: 'Neo.examples.form.validation.MainContainer'}, ['theme']);
        expect(vpNode?.properties?.theme ?? vpNode?.theme).toBe('neo-theme-neo-dark');

        await page.setViewportSize({width: 390, height: 844});
        const swBox      = await switcher.boundingBox(),
              docScrollW = await page.evaluate(() => document.documentElement.scrollWidth);

        expect(swBox.x).toBeGreaterThanOrEqual(0);
        expect(swBox.x + swBox.width).toBeLessThanOrEqual(390);
        expect(docScrollW).toBeLessThanOrEqual(390)
    });

    test('component/wrapper/mermaid toggles light <-> dark and redraws cleanly', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/component/wrapper/mermaid/index.html');

        const app      = await neuralLink.connectToApp('Neo.examples.component.wrapper.mermaid'),
              viewport = page.locator('.neo-examples-mermaid'),
              switcher = page.locator('.neo-themeswitcher'),
              diagram  = page.locator('.neo-mermaid svg');

        await expect(switcher).toBeVisible({timeout: 30000});
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await expect(diagram).toBeVisible({timeout: 30000});

        await switcher.click();
        await expect(viewport).toHaveClass(/neo-theme-neo-dark/);
        await expect(diagram).toBeVisible();

        const [switchedVp] = await app.queryComponent({className: 'Neo.examples.component.wrapper.mermaid.MainContainer'}, ['theme']);
        expect(switchedVp?.properties?.theme ?? switchedVp?.theme).toBe('neo-theme-neo-dark');

        await switcher.click();
        await expect(viewport).toHaveClass(/neo-theme-neo-light/);
        await expect(diagram).toBeVisible()
    });

    test('component/sparkline switches themes without horizontal overflow at 390x844', async ({page, neuralLink}) => {
        await page.emulateMedia({colorScheme: 'light'});
        await page.setViewportSize({width: 390, height: 844});

        await page.goto('/examples/component/sparkline/index.html');
        const sparkApp = await neuralLink.connectToApp('Neo.examples.component.sparkline');
        await expect(page.locator('.neo-themeswitcher')).toBeVisible({timeout: 30000});
        await page.locator('.neo-themeswitcher').click();
        await expect(page.locator('.neo-examples-sparkline')).toHaveClass(/neo-theme-neo-dark/);

        const [sparkVp] = await sparkApp.queryComponent({className: 'Neo.examples.component.sparkline.MainContainer'}, ['theme']);
        expect(sparkVp?.properties?.theme ?? sparkVp?.theme).toBe('neo-theme-neo-dark');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    });

    test('stateProvider/advanced switches themes without horizontal overflow at 390x844', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 390, height: 844});

        await page.goto('/examples/stateProvider/advanced/index.html');
        const spApp = await neuralLink.connectToApp('Neo.examples.stateProvider.advanced');
        await expect(page.locator('.neo-themeswitcher')).toBeVisible({timeout: 30000});
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-dark/);
        await page.locator('.neo-themeswitcher').click();
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-neo-light/);

        const [spVp] = await spApp.queryComponent({className: 'Neo.examples.stateProvider.advanced.MainContainer'}, ['theme']);
        expect(spVp?.properties?.theme ?? spVp?.theme).toBe('neo-theme-neo-light');
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    });

    test('component/coronaGallery switches controls panel to light theme with readable label contrast', async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto('/examples/component/coronaGallery/index.html');

        const app      = await neuralLink.connectToApp('Neo.examples.component.coronaGallery'),
              viewport = page.locator('.neo-gallery-viewport'),
              switcher = page.locator('.neo-themeswitcher');

        await expect(switcher).toBeVisible({timeout: 30000});
        await expect(page.locator('body')).toHaveClass(/neo-theme-dark/);

        await switcher.click();
        await expect(viewport).toHaveClass(/neo-theme-light/);

        const [vpNode] = await app.queryComponent({className: 'Neo.examples.component.coronaGallery.Viewport'}, ['theme']);
        expect(vpNode?.properties?.theme ?? vpNode?.theme).toBe('neo-theme-light');

        // Verify the controls panel dropped the legacy hardcoded #2b2b2b dark background in light theme
        const panelColors = await page.evaluate(() => {
            const panel = document.querySelector('.neo-controls-panel'),
                  label = panel?.querySelector('.neo-rangefield .neo-textfield-label, .neo-box-label');

            return {
                panelBg  : panel ? getComputedStyle(panel).backgroundColor : '',
                labelText: label ? getComputedStyle(label).color : ''
            }
        });

        expect(panelColors.panelBg).not.toBe('rgb(43, 43, 43)');
        expect(panelColors.panelBg).not.toBe(panelColors.labelText)
    });

    test('stateProvider/multiWindow propagates ThemeSwitcher changes across primary and companion windows', async ({context, page}) => {
        await page.setViewportSize({width: 900, height: 600});
        await page.goto('/examples/stateProvider/multiWindow/index.html');

        const openButton = page.getByRole('button', {name: 'Open second window'}),
              switcher   = page.locator('.neo-themeswitcher');

        await expect(openButton).toBeVisible({timeout: 30000});
        await expect(switcher).toBeVisible();
        await expect(page.locator('body')).toHaveClass(/neo-theme-dark/);

        const [companion] = await Promise.all([
            context.waitForEvent('page'),
            openButton.click()
        ]);

        await expect(companion.locator('.neo-themeswitcher')).toBeVisible({timeout: 30000});
        await expect(companion.locator('body')).toHaveClass(/neo-theme-dark/);

        await switcher.click();
        await expect(page.locator('.neo-viewport')).toHaveClass(/neo-theme-light/);
        await expect(companion.locator('.neo-viewport')).toHaveClass(/neo-theme-light/);

        await companion.close({runBeforeUnload: true})
    })
});
