import {test, expect} from '@playwright/test';

/**
 * Global element typography lives in `resources/scss/src/Global.scss` as `var(--token, revert)` per
 * property. A family that declares the token gets its value; a family that declares nothing gets the
 * user-agent stylesheet.
 *
 * That contract has one failure mode no stylesheet diff can see. **A `var()` fallback fires on
 * ABSENCE, and inheritance is not absence.** Inside a neo scope the tokens are present on every
 * descendant by inheritance, so a nested classic scope never reaches `revert` unless it DECLARES its
 * decline — `--token: initial` at its own scope, which makes the custom property guaranteed-invalid
 * and lets `var()` fall through. Omitting the token and declaring it `initial` produce byte-identical
 * source in the structure layer and opposite renderings here.
 *
 * The shape is reachable, not hypothetical, and the precise reach is worth stating. `theme_` is a
 * first-class per-component config (`src/component/Base.mjs`), so any consumer can open a scope
 * anywhere. In this repository the classic-inside-neo case ships as `livePreviewCode` in
 * `apps/portal/view/home/parts/Helix.mjs` and `Colors.mjs` — source the portal compiles and mounts
 * when a reader opens the preview, rather than a scope present in the default page render.
 *
 * **The outer assertion is the non-vacuity control and runs first by construction.** If the neo arm
 * resolved nothing, every inner expectation would still pass — for the wrong reason — because "no
 * neo value here" is exactly what the inner arm claims. Each test therefore pins the outer scope to
 * a real neo value before reading the inner one.
 */

const
    // 2.5rem against the 16px root, from `--core-fontsize-h1` in both neo themes.
    NEO_H1_SIZE   = '40px',
    // The UA `h1` is 2em — and it comes from the UA sheet, NOT by inheritance, which is why the
    // fallback is `revert` and not `inherit`. An `inherit` fallback computes 16px here, so this
    // constant is also what separates the two fallback keywords.
    UA_H1_SIZE    = '32px',
    // neo-dark maps `--global-mark-background-color` to `--green-900`, which is `#000`.
    NEO_MARK_BG   = 'rgb(0, 0, 0)',
    UA_MARK_BG    = 'rgb(255, 255, 0)',
    UA_CODE_FAMILY = 'monospace';

const computed = (page, id, prop) =>
    page.locator(`#${id}`).evaluate((node, name) => getComputedStyle(node)[name], prop);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/global-typography-nesting/index.html');
    await page.waitForSelector('#global-typography-nesting-viewport', {state: 'attached'});
    await expect(page.locator('#outer-neo-h1')).toBeVisible();
    await expect(page.locator('#inner-classic-h1')).toBeVisible();

    // The scope renders its own theme class; the specimen inside carries none and inherits — the
    // arrangement under test. A specimen that carried its own class would make this a specificity
    // question instead of an inheritance one.
    await expect(page.locator('#classic-scope')).toHaveClass(/neo-theme-dark/);
    await expect(page.locator('#inner-classic')).not.toHaveClass(/neo-theme-/)
});

test.describe('Global element typography — a nested classic scope declines, and says so', () => {
    test('h1 font-size: the neo scope resolves its token, the nested classic scope reverts to the UA', async ({page}) => {
        await expect.poll(() => computed(page, 'outer-neo-h1', 'fontSize'),
            {message: 'control: the neo scope resolves --core-fontsize-h1, so the inner arm can mean something'}
        ).toBe(NEO_H1_SIZE);

        await expect.poll(() => computed(page, 'inner-classic-h1', 'fontSize'),
            {message: 'the classic scope declared the token `initial`, so var() reached `revert`'}
        ).toBe(UA_H1_SIZE)
    });

    test('mark background: the neo scope paints its token, the nested classic scope stays UA yellow', async ({page}) => {
        await expect.poll(() => computed(page, 'outer-neo-mark', 'backgroundColor'),
            {message: 'control: the neo scope paints --global-mark-background-color'}
        ).toBe(NEO_MARK_BG);

        await expect.poll(() => computed(page, 'inner-classic-mark', 'backgroundColor'),
            {message: 'UA yellow — one of the three falsifiers the Drop+Supersede named'}
        ).toBe(UA_MARK_BG)
    });

    test('code font-family: the neo scope resolves its mono token, the nested classic scope keeps UA monospace', async ({page}) => {
        await expect.poll(() => computed(page, 'outer-neo-code', 'fontFamily'),
            {message: 'control: the neo scope resolves --core-fontfamily-mono'}
        ).toContain('Source Code Pro');

        await expect.poll(() => computed(page, 'inner-classic-code', 'fontFamily'),
            {message: 'UA monospace, the second D+S falsifier'}
        ).toBe(UA_CODE_FAMILY)
    })
});
