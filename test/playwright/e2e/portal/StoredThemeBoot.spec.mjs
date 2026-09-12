import {test, expect} from '@playwright/test';

/**
 * A stored `portalTheme` preference must reach the whole page, not one half of it.
 *
 * #18571, measured at `dev@e99ffb6588`. With `localStorage.portalTheme = 'neo-theme-neo-light'` the
 * preference DOES arrive: `div#neo-viewport-1` carries `neo-theme-neo-light`. `document.body` keeps
 * `neo-theme-neo-dark`, because the body class is written ONCE on the main thread by
 * `main.addon.Stylesheet#addGlobalCss` from the static `Neo.config.themes[0]` — before any worker runs —
 * and nothing in the theme path ever rewrites it. The only other body-class writer in `src/` is
 * `main.DomAccess#setBodyCls`, whose sole caller repo-wide is `apps/shareddialog`.
 *
 * ## Why the split is worse than either half
 *
 * `background-color` is set by the theme class on the viewport; `color` is INHERITED from the body,
 * which is still on the other theme. Measured computed styles:
 *
 * | arm | viewport background | viewport color |
 * |---|---|---|
 * | no preference | `rgb(14,15,13)` | `rgb(240,242,240)` |
 * | stored light  | `rgb(255,255,255)` | `rgb(240,242,240)` |
 *
 * So the failure is not "the app renders dark". It renders a LIGHT background carrying the DARK
 * theme's text colour — a contrast ratio near 1:1. The content is invisible, which is why the
 * contrast arm below is the one that describes the user's experience.
 *
 * ## The liveness arm is load-bearing, not ceremony
 *
 * `addGlobalCss` stamps `themes[0]` from the MAIN thread, and the portal declares
 * `neo-theme-neo-dark` first. A portal that never boots therefore still shows `neo-theme-neo-dark` on
 * the body and still fails the light arm, for an unrelated reason — a dead page is indistinguishable
 * from the defect at the body class alone. `booted()` separates them and runs before every assertion.
 */

const PORTAL      = '/apps/portal/index.html',
      STORAGE_KEY = 'portalTheme',
      DARK        = 'neo-theme-neo-dark',
      LIGHT       = 'neo-theme-neo-light';

/**
 * Seeds the stored preference BEFORE any page script runs. `addInitScript` is the only hook early
 * enough: `ViewportController` reads the key during app start.
 * @param {import('@playwright/test').Page} page
 * @param {String|null} theme Stored value, or null for the no-preference case
 */
async function seedStoredTheme(page, theme) {
    await page.addInitScript(([key, value]) => {
        value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)
    }, [STORAGE_KEY, theme])
}

/**
 * Asserts the portal actually rendered. A Neo app replaces the body with a real tree; a boot failure
 * leaves the bootstrap script behind. Polls, because the render is worker-driven.
 * @param {import('@playwright/test').Page} page
 */
async function booted(page) {
    await expect
        .poll(() => page.evaluate(() => document.body.children.length), {
            message: 'portal never rendered — every theme assertion below would be vacuous',
            timeout: 30000
        })
        .toBeGreaterThan(1)
}

/**
 * Reads the theme class and the resolved colours of both surfaces in one pass.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{body: Object, viewport: Object}>}
 */
function readSurfaces(page) {
    return page.evaluate(() => {
        const read = el => {
            const style = getComputedStyle(el);

            return {
                theme     : [...el.classList].filter(cls => cls.startsWith('neo-theme-')),
                background: style.backgroundColor,
                color     : style.color
            }
        };

        return {body: read(document.body), viewport: read(document.querySelector('#neo-viewport-1'))}
    })
}

/**
 * WCAG relative-luminance contrast ratio between two `rgb(r, g, b)` strings.
 *
 * Asserting the ratio rather than an exact colour keeps the arm from pinning the palette: a theme
 * may restyle freely, and only a pairing drawn from two DIFFERENT themes collapses toward 1:1.
 * @param {String} a
 * @param {String} b
 * @returns {Number}
 */
function contrastRatio(a, b) {
    const luminance = value => {
        const [r, g, b] = value.match(/\d+/g).slice(0, 3).map(channel => {
            const part = Number(channel) / 255;

            return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4
        });

        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    };

    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);

    return (high + 0.05) / (low + 0.05)
}

test.describe('portal stored theme at boot', () => {
    test('the no-preference default boots dark on both surfaces', async ({page}) => {
        await seedStoredTheme(page, null);
        await page.goto(PORTAL);
        await booted(page);

        const {body, viewport} = await readSurfaces(page);

        // AC-3, and the control for every arm below: it fails if seeding, boot, or the surface read is
        // broken, so a red light arm cannot be blamed on the harness.
        expect(body.theme).toEqual([DARK]);

        // Measured, not assumed: with no preference the viewport carries NO theme class and inherits
        // the body's. That is `component.Base#getTheme`'s documented contract — "a child inside a
        // themed scope carries no theme class of its own by design" — so an empty list here is the
        // correct default, and asserting [DARK] would pin a behaviour the engine does not have.
        expect(viewport.theme).toEqual([]);
        expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBeNull();

        // The same floor the defect arm asserts — proving the floor is clearable, not decorative.
        expect(contrastRatio(viewport.background, viewport.color)).toBeGreaterThan(3)
    });

    test('a stored light preference reaches BOTH the body and the viewport', async ({page}) => {
        await seedStoredTheme(page, LIGHT);
        await page.goto(PORTAL);
        await booted(page);

        // Without this, a storage write that silently failed would present as the defect.
        expect(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY)).toBe(LIGHT);

        const {body, viewport} = await readSurfaces(page);

        // The half that already works today. Asserted so a regression here cannot hide behind the
        // body-class failure below.
        expect(viewport.theme, 'the viewport receives the stored preference').toEqual([LIGHT]);

        // AC-1. Red at e99ffb6588, where the body still reads neo-theme-neo-dark.
        expect(body.theme, 'the body must follow the stored preference').toEqual([LIGHT]);

        // AC-2, the no-split-brain invariant, and the one that survives a palette change: the viewport
        // either carries NO theme class (inheriting the body's, as the default arm shows) or carries
        // the SAME one. What it may never do is name a different theme than the surface it inherits
        // `color` from — that is the state this defect produces.
        expect(
            viewport.theme.length === 0 || viewport.theme[0] === body.theme[0],
            `viewport theme ${JSON.stringify(viewport.theme)} must inherit or match body ${JSON.stringify(body.theme)}`
        ).toBe(true)
    });

    test('a stored light preference leaves readable text', async ({page}) => {
        await seedStoredTheme(page, LIGHT);
        await page.goto(PORTAL);
        await booted(page);

        const {viewport} = await readSurfaces(page);

        // The user-visible harm, and the reason the split matters: the viewport takes its background
        // from its own theme and INHERITS its colour from the body's. Two themes, one element,
        // ~1:1 contrast. Red at e99ffb6588 — rgb(255,255,255) behind rgb(240,242,240).
        expect(
            contrastRatio(viewport.background, viewport.color),
            'viewport background and text must come from the same theme'
        ).toBeGreaterThan(3)
    })
});
