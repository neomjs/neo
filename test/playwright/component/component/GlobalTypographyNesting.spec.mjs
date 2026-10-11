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
    // neo-dark maps `--global-mark-background-color` to `--green-900`, which resolves to black.
    NEO_MARK_BG   = 'rgb(0, 0, 0)',
    UA_MARK_BG    = 'rgb(255, 255, 0)',
    // From the composed `resources/scss/src/util/HighlightJs.scss` — an AUTHOR rule, not the UA's.
    // The user agent's own `code` font is bare `monospace`; landing there means the author origin was
    // discarded rather than declined.
    AUTHOR_CODE_FAMILY = 'Menlo, monospace',
    // The user agent's own `code` font, i.e. what a declining family reaches when NO author rule
    // supplies one. Distinct from AUTHOR_CODE_FAMILY: landing here with HighlightJs composed would
    // mean the author origin was discarded rather than deferred to.
    UA_CODE_FAMILY     = 'monospace';

const computed = (page, id, prop) =>
    page.locator(`#${id}`).evaluate((node, name) => getComputedStyle(node)[name], prop);

/**
 * @summary Composes the REAL HighlightJs sheet into the running page, mid-test.
 *
 * Injected rather than linked in the fixture so one document can serve both compositions — linking it
 * makes every specimen composed and silently retires the uncomposed arm. Injected by PATH rather than
 * retyped, because a hand-copied `Menlo, monospace` would test this file's reconstruction of the sheet
 * instead of the sheet. `dist/development/**` is the tree this suite's `globalSetup` guarantees
 * (`build-themes -e dev`) and the one the fixture's own app reads, per its `environment` config.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
const composeHighlightJs = async page => {
    await page.addStyleTag({path: 'dist/development/css/src/util/HighlightJs.css'});
    // The sheet must actually take effect before anything is read from it; asserting the highlighted
    // control here means a failed injection surfaces as itself rather than as a confusing red on the
    // property under test.
    await expect.poll(() => page.locator('#outer-neo-code').evaluate(node => {
        node.classList.add('hljs');
        const family = getComputedStyle(node).fontFamily;
        node.classList.remove('hljs');
        return family
    }), {message: 'HighlightJs composed and in effect'}).toBe(AUTHOR_CODE_FAMILY)
};

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

    // Both compositions are asserted, and keeping BOTH is the point. HighlightJs lazy-loads, so a
    // document without it is an ordinary state rather than an edge case — and a revision of this file
    // that composed the sheet into every specimen deleted the uncomposed arm and made a real
    // regression (HighlightJs becoming a precondition for neo inline typography) invisible here.
    test('code font-family, UNCOMPOSED: neo resolves its mono token with no HighlightJs present', async ({page}) => {
        await expect.poll(() => computed(page, 'outer-neo-code', 'fontFamily'),
            {message: 'the always-loaded structure layer must carry this on its own'}
        ).toContain('Source Code Pro');

        // Nothing else declares a mono font in this composition, so a declining family reaches the UA.
        await expect.poll(() => computed(page, 'inner-classic-code', 'fontFamily'),
            {message: 'classic declines and there is no author rule left to defer to'}
        ).toBe(UA_CODE_FAMILY)
    });

    test('code font-family, COMPOSED: the classic decline defers to HighlightJs instead of erasing it', async ({page}) => {
        await composeHighlightJs(page);

        await expect.poll(() => computed(page, 'outer-neo-code', 'fontFamily'),
            {message: 'control: neo still resolves its token once the author sheet is present'}
        ).toContain('Source Code Pro');

        // The assertion a UA-only fixture cannot make. `revert` rolls back the whole author ORIGIN,
        // so a structural rule that outranked this sheet and then reverted would DELETE it. Landing
        // on the author value is what proves the decline deferred rather than destroyed.
        await expect.poll(() => computed(page, 'inner-classic-code', 'fontFamily'),
            {message: 'the composed HighlightJs declaration must survive the classic decline'}
        ).toBe(AUTHOR_CODE_FAMILY)
    });

    test('control: highlighted code is inert to the batch in both compositions', async ({page}) => {
        // `.hljs` outranks the inline-code rules in both sheets, so it must not move. This is what
        // separates "the decline erased an author rule" from "the batch broke code styling generally"
        // — without it, a red above has two candidate causes.
        const read = id => page.locator(`#${id}`).evaluate(node => {
            node.classList.add('hljs');
            const family = getComputedStyle(node).fontFamily;
            node.classList.remove('hljs');
            return family
        });

        for (const id of ['outer-neo-code', 'inner-classic-code']) {
            await expect.poll(() => read(id), {message: `${id}: UA, uncomposed`}).toBe(UA_CODE_FAMILY)
        }

        await composeHighlightJs(page);

        for (const id of ['outer-neo-code', 'inner-classic-code']) {
            await expect.poll(() => read(id), {message: `${id}: the author font, composed`}).toBe(AUTHOR_CODE_FAMILY)
        }
    })
});
