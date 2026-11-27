import {expect, test} from '@playwright/test';

const APP      = '/test/playwright/component/apps/theme-switcher/index.html',
      VIEWPORT = 'theme-switcher-test-viewport',
      LIGHT    = 'neo-theme-neo-light',
      DARK     = 'neo-theme-neo-dark',
      THEMES   = {
          'Neo Light': LIGHT,
          'Neo Dark' : DARK,
          Light      : 'neo-theme-light',
          Dark       : 'neo-theme-dark',
          Cyberpunk  : 'neo-theme-cyberpunk'
      };

/**
 * @summary Checks both the owner viewport's effective theme and its browser surface after a switch.
 * @param {import('@playwright/test').Page} page
 * @param {String} theme
 */
async function expectTheme(page, theme) {
    const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

    expect(worker, 'the fixture must be running its own App Worker').toBeDefined();
    await expect.poll(() => worker.evaluate(id => Neo.getComponent(id).getTheme(), VIEWPORT)).toBe(theme);
    await expect(page.locator(`#${VIEWPORT}`)).toHaveClass(new RegExp(`\\b${theme}\\b`))
}

/**
 * @summary Checks the menu offers every configured choice and marks exactly the effective theme.
 * @param {import('@playwright/test').Locator} menu
 * @param {String} activeName
 */
async function expectChoices(menu, activeName) {
    await expect(menu.getByRole('menuitemradio')).toHaveCount(5);

    for (const name of Object.keys(THEMES)) {
        await expect(menu.getByRole('menuitemradio', {name, exact: true})).toHaveAttribute('aria-checked', String(name === activeName))
    }
}

test('two themes toggle from the URL-selected boot theme with a wave from the click', async ({page}) => {
    await page.addInitScript(() => {
        const animate = Element.prototype.animate,
              start   = document.startViewTransition?.bind(document);

        if (start) {
            document.startViewTransition = callback => {
                const transition = start(callback);

                window.themeSwitcherTransition = transition;
                return transition
            }
        }

        Element.prototype.animate = function (keyframes, options) {
            if (options?.pseudoElement === '::view-transition-new(root)') {
                window.themeSwitcherWave = keyframes[0].clipPath
            }

            return animate.call(this, keyframes, options)
        };

        document.addEventListener('click', event => {
            if (event.target.closest('.neo-themeswitcher')) {
                window.themeSwitcherOrigin = [event.clientX / innerWidth * 100, event.clientY / innerHeight * 100]
            }
        })
    });
    await page.goto(`${APP}?mode=two&theme=${DARK}`);

    const switcher = page.locator('.neo-themeswitcher');

    await expect(switcher).toHaveAccessibleName('Switch to Neo Light');
    await expectTheme(page, DARK);
    await switcher.click();
    await expectTheme(page, LIGHT);
    await expect(switcher).toHaveAccessibleName('Switch to Neo Dark');
    await expect.poll(() => page.evaluate(() => window.themeSwitcherWave)).toMatch(/^circle\(0% at [\d.]+% [\d.]+%\)$/);

    const {origin, wave} = await page.evaluate(() => ({origin: window.themeSwitcherOrigin, wave: window.themeSwitcherWave})),
          [waveX, waveY] = wave.match(/[\d.]+(?=%)/g).slice(1).map(Number);

    expect(waveX).toBeCloseTo(origin[0], 1);
    expect(waveY).toBeCloseTo(origin[1], 1);
    await page.evaluate(() => window.themeSwitcherTransition.finished);

    await switcher.press('Space');
    await expectTheme(page, DARK);
    await expect(switcher).toHaveAccessibleName('Switch to Neo Light');
    await expect(page.getByRole('menu')).toHaveCount(0)
});

test('the five-theme menu switches by pointer and keyboard and restores trigger focus', async ({page}) => {
    await page.addInitScript(() => { document.startViewTransition = undefined });
    await page.goto(`${APP}?theme=${THEMES.Light}`);

    const switcher  = page.locator('.neo-themeswitcher'),
          menu      = page.getByRole('menu'),
          cyberpunk = menu.getByRole('menuitemradio', {name: 'Cyberpunk', exact: true}),
          neoLight  = menu.getByRole('menuitemradio', {name: 'Neo Light', exact: true}),
          neoDark   = menu.getByRole('menuitemradio', {name: 'Neo Dark', exact: true});

    await expect(switcher).toHaveAccessibleName('Theme: Light');
    await expectTheme(page, THEMES.Light);
    await expect(switcher).toHaveAttribute('aria-haspopup', 'menu');
    await expect(switcher).toHaveAttribute('aria-expanded', 'false');
    await switcher.click();
    await expectChoices(menu, 'Light');
    await expect(switcher).toHaveAttribute('aria-expanded', 'true');
    await expect(switcher).not.toHaveClass(/\bneo-theme-/);
    await expect(switcher.locator('.neo-button-glyph')).not.toHaveClass(/\bneo-theme-/);
    expect(await menu.evaluate(el => [...el.classList].filter(c => c.startsWith('neo-theme-')))).toEqual([THEMES.Light]);
    await cyberpunk.click();
    await expectTheme(page, THEMES.Cyberpunk);
    await expect(switcher).toHaveAccessibleName('Theme: Cyberpunk');
    await expect(menu).toBeHidden();
    await expect(switcher).toBeFocused();

    await page.keyboard.press('Enter');
    await expectChoices(menu, 'Cyberpunk');
    await page.keyboard.press('Home');
    await expect(neoLight).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(neoDark).toBeFocused();
    await page.keyboard.press('Enter');
    await expectTheme(page, DARK);
    await expect(switcher).toHaveAccessibleName('Theme: Neo Dark');
    await expect(menu).toBeHidden();
    await expect(switcher).toBeFocused();

    await page.keyboard.press('Enter');
    await expectChoices(menu, 'Neo Dark');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(switcher).toHaveAttribute('aria-expanded', 'false');
    await expect(switcher).toBeFocused()
});

test('the phone toolbar keeps a visible glyph, an accessible name, and room for its other control', async ({page}) => {
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(APP);

    const switcher = page.getByRole('button', {name: 'Theme: Neo Light', exact: true}),
          glyph    = switcher.locator('.neo-button-glyph'),
          toolbar  = page.locator('#theme-switcher-test-toolbar');

    await expect(switcher).toBeInViewport();
    await expect(toolbar.getByRole('button', {name: 'Run example'})).toBeInViewport();
    await expect(switcher.locator('.neo-button-text')).toBeHidden();
    await expect(glyph).toBeVisible();
    await expect.poll(() => glyph.evaluate(node => {
        const paints = [getComputedStyle(node), getComputedStyle(node, '::before')];

        return Boolean(node.querySelector('svg')) || paints.some(style => style.backgroundImage !== 'none' || style.maskImage !== 'none')
    })).toBe(true);
    await expect.poll(() => toolbar.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    await page.keyboard.press('Tab');
    await expect(toolbar.getByRole('button', {name: 'Run example'})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(switcher).toBeFocused();
    await expect(switcher).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expectChoices(page.getByRole('menu'), 'Neo Light')
});

test('a theme change from the viewport refreshes the trigger and selected menu row', async ({page}) => {
    await page.goto(APP);

    const switcher = page.locator('.neo-themeswitcher');

    await expect(switcher).toHaveAccessibleName('Theme: Neo Light');

    const worker = page.workers().find(candidate => candidate.url().includes('/worker/App.mjs'));

    await worker.evaluate(({id, theme}) => { Neo.getComponent(id).theme = theme }, {id: VIEWPORT, theme: THEMES.Dark});
    await expectTheme(page, THEMES.Dark);
    await expect(switcher).toHaveAccessibleName('Theme: Dark');
    await switcher.click();
    await expectChoices(page.getByRole('menu'), 'Dark')
});
