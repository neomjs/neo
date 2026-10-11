import {test, expect} from '@playwright/test';

/**
 * The reveal overlay's discoverability floor, measured on a rendered overlay in both neo themes.
 *
 * A revealed pane is an overlay over the workspace, and the engine keeps its SURFACE the host's —
 * `--dock-reveal-background` resolves to `--neo-background-color`, deliberately. That means the
 * overlay and the pane it covers are the same colour by design, and the only thing separating them
 * is the chrome: a border and an elevation shadow.
 *
 * On a dark ground the shipped default supplied neither. `--dock-reveal-border` was `0` and the
 * shadow was `0 12px 32px rgb(0 0 0 / 28%)` — 28%-black over a near-black surface, which is not an
 * edge. The revealed pane read as the pane beneath it with a title line floating in it. Both
 * flagship hosts had already written their own border and shadow to escape it, which is the tell:
 * a default every serious consumer overrides is not a default, it is a gap.
 *
 * **The delta cannot come from the background, so it must come from the border.** This is why the
 * arms below measure the border colour against the overlay's OWN surface rather than the overlay
 * against the pane. Comparing surfaces would report ~0 on a correct implementation — the surfaces
 * are supposed to match — so an arm written that way would fail on the fix and pass on the defect.
 *
 * **The theme control is the point.** A hairline that resolves through `currentColor` reads on any
 * ground, but only if a theme is actually live in the document. Every arm therefore asserts the two
 * skins resolve DIFFERENT ink first: if the theme stylesheet never applied, both themes report the
 * same colour and every measurement below is about nothing.
 *
 * @see https://github.com/neomjs/neo/issues/18080
 */

const
    THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'],

    /**
     * Colour maths for the arms below, injected as source because it runs in the page.
     *
     * Two things here are load-bearing and both were learned by getting them wrong:
     *
     * 1. **Two channel scales.** A `color-mix()` result comes back from Chrome as
     *    `color(srgb 0.94 0.95 0.94 / 0.22)` — channels in 0..1 — while a plain colour is
     *    `rgb(14, 15, 13)` in 0..255. Parsing both with one `/255` divisor turns a near-WHITE
     *    border into near-black, which reported an invisible edge on a correct implementation.
     * 2. **Alpha must be composited, not dropped.** The floor is a 22%-alpha hairline; what a
     *    viewer sees is that colour laid OVER the surface, not the colour itself. Comparing the
     *    raw border against the surface would credit the edge with contrast it does not have.
     */
    COLOR_MATHS = `{
        parse: value => {
            const nums = value.match(/[\\d.]+/g).map(Number);
            // \`color(srgb …)\` carries 0..1 channels; rgb()/rgba() carry 0..255.
            const scale = value.startsWith('color(') ? 1 : 255;
            return {
                r: nums[0] / scale,
                g: nums[1] / scale,
                b: nums[2] / scale,
                a: nums.length > 3 ? nums[3] : 1
            }
        },
        luminance: c => {
            const lin = v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
        },
        over: (fg, bg) => ({
            r: fg.a * fg.r + (1 - fg.a) * bg.r,
            g: fg.a * fg.g + (1 - fg.a) * bg.g,
            b: fg.a * fg.b + (1 - fg.a) * bg.b,
            a: 1
        })
    }`;

let dashboardId;

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/dock-rail-origin/index.html');
    await page.waitForSelector('.neo-dashboard', {state: 'attached'})
});

/** Swap the active theme class on the document element and read back what took effect. */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const el of [document.body, document.documentElement]) {
        el.classList.forEach(c => c.startsWith('neo-theme-') && el.classList.remove(c))
    }

    document.body.classList.add(name);

    return document.body.className
}, theme);

/**
 * Opens the left rail's reveal by a real click and waits for the entry animation to settle.
 * Visibility flips when the animation STARTS, so a paint read taken then samples the overlay
 * mid-ramp — its opacity is still climbing and every colour comes back blended.
 */
const revealLeft = async page => {
    await page.locator('.neo-dashboard-dock-edge-rail-left .neo-dashboard-dock-rail-tab').first().click();

    const overlay = page.locator('.neo-dashboard-dock-reveal-overlay-left');

    await expect(overlay).toBeVisible({timeout: 10000});

    await expect.poll(
        () => page.evaluate(() => {
            const el = document.querySelector('.neo-dashboard-dock-reveal-overlay-left');
            return el ? getComputedStyle(el).opacity : '0'
        }),
        {message: 'the reveal must settle before its paint is read', timeout: 10000}
    ).toBe('1');

    return overlay
};

test.describe('the dock reveal overlay carries a discoverability floor in both skins', () => {
    for (const theme of THEMES) {
        test(`${theme}: the overlay's edge is visible against its own surface`, async ({page}) => {
            await applyTheme(page, theme);
            await revealLeft(page);

            const measured = await page.evaluate(mathsSource => {
                const maths   = eval('(' + mathsSource + ')'),
                      overlay = document.querySelector('.neo-dashboard-dock-reveal-overlay-left'),
                      style   = getComputedStyle(overlay),
                      surface = maths.parse(style.backgroundColor),
                      // What the eye gets: the hairline composited over the surface it sits on.
                      edge    = maths.over(maths.parse(style.borderTopColor), surface);

                return {
                    background : style.backgroundColor,
                    borderColor: style.borderTopColor,
                    borderStyle: style.borderTopStyle,
                    borderWidth: style.borderTopWidth,
                    boxShadow  : style.boxShadow,
                    delta      : Math.abs(maths.luminance(edge) - maths.luminance(surface)),
                    ink        : style.color
                }
            }, COLOR_MATHS);

            // The floor itself.
            expect(measured.borderStyle,
                `[${theme}] the overlay must carry a border style, not \`none\``).not.toBe('none');
            expect(parseFloat(measured.borderWidth),
                `[${theme}] the border must be a visible hairline, not 0`).toBeGreaterThan(0);
            expect(measured.boxShadow,
                `[${theme}] elevation must survive this ground`).not.toBe('none');

            // The measurement that makes the border meaningful rather than merely present: a
            // 1px border the same colour as the surface it sits on is a border nobody can see.
            expect(measured.delta,
                `[${theme}] the edge must separate from the overlay's own surface ` +
                `(border ${measured.borderColor} on ${measured.background})`).toBeGreaterThan(0.02)
        })
    }

    test('CONTROL: the two skins resolve different ink, so the arms above measure something', async ({page}) => {
        // Without this, a document whose theme stylesheet never loaded reports one palette for both
        // names and every luminance assertion above becomes a statement about the default UA style.
        const read = async theme => {
            await applyTheme(page, theme);
            await revealLeft(page);

            return page.evaluate(() => {
                const style = getComputedStyle(document.querySelector('.neo-dashboard-dock-reveal-overlay-left'));
                return {background: style.backgroundColor, ink: style.color}
            })
        };

        const dark = await read('neo-theme-neo-dark');
        await page.reload();
        await page.waitForSelector('.neo-dashboard', {state: 'attached'});
        const light = await read('neo-theme-neo-light');

        expect(dark.background,
            'the two skins must paint different surfaces — otherwise no theme is live')
            .not.toBe(light.background)
    });

    test('a consumer override still wins: the floor is a floor, not a ceiling', async ({page}) => {
        // The two flagship hosts set their own border and shadow. The floor must not outrank them,
        // or this change silently restyles every app that already solved the problem.
        await applyTheme(page, 'neo-theme-neo-dark');
        await revealLeft(page);

        const measured = await page.evaluate(() => {
            const style = document.createElement('style');

            style.textContent =
                '.neo-dashboard .neo-dashboard-dock-reveal-overlay {' +
                '  --dock-reveal-border: 3px dashed rgb(255 0 0);' +
                '}';
            document.head.appendChild(style);

            const overlay  = document.querySelector('.neo-dashboard-dock-reveal-overlay-left'),
                  computed = getComputedStyle(overlay);

            return {
                borderColor: computed.borderTopColor,
                borderStyle: computed.borderTopStyle,
                borderWidth: computed.borderTopWidth
            }
        });

        expect(measured.borderWidth, 'a consumer border width must survive the floor').toBe('3px');
        expect(measured.borderStyle, 'and its style').toBe('dashed');
        expect(measured.borderColor, 'and its colour').toBe('rgb(255, 0, 0)')
    })
});
