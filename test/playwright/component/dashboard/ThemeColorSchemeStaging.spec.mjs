import {test, expect} from '@playwright/test';

/**
 * A popup opened through `Neo.Main#windowOpen` paints a blank same-origin staging document before
 * the child app exists, so its colour is whatever the platform defaults to — a flash of the
 * user-agent scheme regardless of the opener's theme. The parameter that prevents it,
 * `stagedColorScheme`, has existed for a while and had exactly one caller.
 *
 * `Main#resolveThemeColorScheme` supplies it from the theme itself rather than from the caller.
 * Every theme declares `--neo-color-scheme` in its `Global.scss`, because the theme's NAME cannot
 * carry the fact: `theme-cyberpunk` declares `dark` and is named neither. These arms exist to keep
 * that a declaration and never a derivation.
 *
 * Component tier rather than unit: the value is a computed custom property on a live document, and
 * the read has to find the element carrying the `neo-theme-*` class — custom properties inherit
 * downward only, so the document root does not resolve it.
 */

/** Runs the main-thread resolver against whatever theme class the document currently carries. */
const readScheme = page => page.evaluate(() => Neo.Main.resolveThemeColorScheme());

/**
 * Captures the themed elements and their original classes ONCE, so a later swap that REMOVES the
 * theme class cannot lose them: `[class*="neo-theme-"]` matches nothing after a strip, and a
 * restore captured per-swap would only ever undo the previous swap.
 */
const captureThemes = page => page.evaluate(() => {
    const nodes = [...document.querySelectorAll('[class*="neo-theme-"]')];

    globalThis.__schemeProbe = {nodes, original: nodes.map(node => node.className)};

    return nodes.length
});

/** Swaps every captured element's `neo-theme-*` class; `''` strips it entirely. */
const withTheme = (page, themeClass) => page.evaluate(cls => {
    const {nodes, original} = globalThis.__schemeProbe;

    nodes.forEach((node, index) => {
        node.className = original[index].replace(/neo-theme-[a-z-]+/, cls).trim()
    })
}, themeClass);

/** Returns every captured element to the class list it was found with. */
const restoreTheme = page => page.evaluate(() => {
    const {nodes, original} = globalThis.__schemeProbe;

    nodes.forEach((node, index) => {
        node.className = original[index]
    })
});

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-maximize/index.html');
    await page.waitForSelector('#dock-maximize-workspace', {state: 'attached'});
    await page.waitForSelector('.neo-tab-header-button',   {state: 'visible'})
});

test.describe('theme colour scheme — declared, never derived from the name', () => {
    test('the active theme supplies the staging scheme, and an undeclared one supplies nothing', async ({page}) => {
        // Non-vacuity: the fixture must actually carry a theme class, or every arm below passes on
        // an empty document without exercising the resolver at all.
        const themedNodes = await captureThemes(page);

        expect(themedNodes, 'the fixture must carry a theme class for any of this to mean anything')
            .toBeGreaterThan(0);

        expect(await readScheme(page), 'the shipped theme declares a scheme').toMatch(/^(dark|light)$/);

        await withTheme(page, 'neo-theme-neo-dark');
        expect(await readScheme(page), 'a dark theme resolves dark').toBe('dark');

        await withTheme(page, 'neo-theme-neo-light');
        expect(await readScheme(page), 'a light theme resolves light').toBe('light');

        // `cyberpunk` — dark, and named neither — is the reason this is a declaration rather than a
        // derivation, but it cannot be asserted here: this fixture ships only the two neo themes
        // (`neo-config.json`), and a theme class whose sheet is absent resolves nothing at all. That
        // is the same shape as the arm below, so testing it here would prove the fixture's theme
        // list rather than cyberpunk's value. Its declaration lives in `theme-cyberpunk/Global.scss`.

        // A theme with no declaration must yield undefined, so `windowOpen` omits the parameter and
        // keeps the platform default rather than staging a guessed colour.
        await withTheme(page, 'neo-theme-undeclared-probe');
        expect(await readScheme(page), 'an undeclared theme must not leak a guess').toBeUndefined();

        await withTheme(page, '');
        expect(await readScheme(page), 'no theme class at all resolves nothing').toBeUndefined();

        await restoreTheme(page);
        expect(await readScheme(page), 'the document is left as it was found').toMatch(/^(dark|light)$/)
    })
});
