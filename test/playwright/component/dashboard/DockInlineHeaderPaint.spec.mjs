import {test, expect} from '@playwright/test';

/**
 * The inline tab header's paint, measured on a rendered dock pane header rather than on stylesheet
 * text: in both neo themes the header is a flat semantic surface with a hairline under it, and the
 * public image hook resolves to `none`. Before this contract the themes valued the hook with a
 * gradient from the highlighted to the default neutral surface — a band that read as its own object
 * over any host surface, and that the Workstation had to re-value for itself.
 *
 * **The control is the point.** A standalone (`ui: null`) tab container in the same document, same
 * theme, must keep its established paint — no surface colour, no image, no hairline — so a pass
 * here means the variant selector scoped the tokens, not that a stylesheet leaked them everywhere.
 * Token values are resolved through probe elements, never by string-matching hex literals, so the
 * assertion follows the theme's semantic tokens if their core values move.
 */
const THEMES = ['neo-theme-neo-dark', 'neo-theme-neo-light'];

const INLINE_HEADER = '.neo-tab-container-inline > .neo-tab-header-toolbar';

let controlId;

test.beforeEach(async ({page}) => {
    // `dock-theme-nesting` reuses `dock-lock`'s app with a four-theme config, following the
    // `dock-static-boot` / `-overlap` pattern. The nested arms below need the classic theme
    // stylesheets in the document — a theme class declares nothing if no sheet defines it — and that
    // requirement belongs to THIS spec. Configuring it on the shared `dock-lock` fixture would make
    // every other consumer of it boot two stylesheets it never reads.
    await page.goto('test/playwright/component/apps/dock-theme-nesting/index.html');
    await page.waitForSelector('#dock-lock-workspace', {state: 'attached'});
    await page.waitForSelector(INLINE_HEADER, {state: 'visible'});

    // The control: a free-standing tab container beside the dock, created through the real class
    // system so its stylesheet loads and its header renders exactly as a consumer's would.
    controlId = await page.evaluate(async () => {
        const viewportId = document.querySelector('.neo-viewport').id,
              reply      = await Neo.worker.App.createNeoInstance({
                  importPath: '../tab/Container.mjs',
                  ntype     : 'tab-container',
                  parentId  : viewportId,
                  height    : 120,
                  items     : [
                      {ntype: 'component', header: {text: 'Control A'}, html: 'a'},
                      {ntype: 'component', header: {text: 'Control B'}, html: 'b'}
                  ]
              });

        if (!reply.success) throw new Error(`control tab container: ${reply.error.message}`);

        return reply.id
    });

    await page.waitForSelector(`#${controlId} > .neo-tab-header-toolbar`, {state: 'visible'})
});

test.afterEach(async ({page}) => {
    controlId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), controlId)
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
 * Reads the inline header, the control header, and the two semantic tokens the contract names —
 * each token resolved to the rgb() string a browser computes for it, via a probe element.
 */
const measure = (page, controlId) => page.evaluate(id => {
    const
        inline  = document.querySelector('.neo-tab-container-inline > .neo-tab-header-toolbar'),
        control = document.querySelector(`#${id} > .neo-tab-header-toolbar`),
        resolve = token => {
            const probe = document.createElement('div');

            probe.style.backgroundColor = `var(${token})`;
            document.body.appendChild(probe);

            const value = getComputedStyle(probe).backgroundColor;

            probe.remove();
            return value
        },
        paint = el => el && {
            backgroundColor: getComputedStyle(el).backgroundColor,
            backgroundImage: getComputedStyle(el).backgroundImage,
            boxShadow      : getComputedStyle(el).boxShadow,
            height         : el.getBoundingClientRect().height
        };

    return {
        control     : paint(control),
        inline      : paint(inline),
        surfaceToken: resolve('--sem-color-surface-neutral-highlighted'),
        borderToken : resolve('--sem-color-border-default')
    }
}, controlId);

test.describe('Neo.tab.Container — the CLASSIC families give the inline header its own ground', () => {
    // The themes previously stated `transparent` here, deliberately: an omitted custom property inherits the
    // enclosing theme's value instead of resetting, so the token had to be SAID. What it said turned
    // out to be wrong — flat is not groundless, and beside white pane content a transparent header
    // read as undefined grey. Every consumer then re-declared the token at the SAME (0,2,0) weight
    // as the theme's own line, a race decided by sheet fetch order rather than by intent.
    //
    // Measured on the rendered element, because the sheet cannot answer which declaration won.
    const GROUND = {'neo-theme-dark': 'rgb(60, 63, 65)', 'neo-theme-light': 'rgb(242, 242, 242)'};

    for (const [theme, expected] of Object.entries(GROUND)) {
        test(`${theme}: the header paints its family's own header grey, and stays flat`, async ({page}) => {
            await applyTheme(page, theme);

            const measured = await measure(page, controlId);

            expect(measured.inline, 'an inline dock header must be rendered').toBeTruthy();

            // AC-1 / AC-2 — the ground itself.
            expect(measured.inline.backgroundColor, `${theme} states its own header grey`).toBe(expected);

            // The classic families stay FLAT: this ticket gives them a ground, not chrome. Asserting
            // it here is what stops a later "make it look like neo" from arriving unnoticed.
            expect(measured.inline.backgroundImage, 'no gradient band').toBe('none');
            expect(measured.inline.boxShadow, 'no hairline — separation stays the content border').toBe('none');

            // AC-4 — the contrast that actually carries the bar is header-vs-ACTIVE-TAB, not
            // header-vs-page: in classic light the active tab is white. Read as a computed
            // difference so the arm cannot pass on two shades nobody can tell apart.
            const activeTab = await page.evaluate(() => {
                const button = document.querySelector('.neo-tab-container-inline .neo-tab-header-button.pressed')
                    || document.querySelector('.neo-tab-container-inline .neo-tab-header-button');

                return button && getComputedStyle(button).backgroundColor
            });

            expect(activeTab, 'an active tab button must be rendered').toBeTruthy();
            expect(measured.inline.backgroundColor,
                'the header must not be the same colour as the tab it frames').not.toBe(activeTab)
        })
    }

    test('AC-3 the neo families are untouched — they still resolve their semantic surface', async ({page}) => {
        // The regression this ticket could plausibly cause: editing the classic pair while reaching
        // for a shared token would move the neo pair too. Cheap to assert, and it is the only arm
        // here that would notice.
        for (const theme of ['neo-theme-neo-light', 'neo-theme-neo-dark']) {
            await applyTheme(page, theme);

            const measured = await measure(page, controlId);

            expect(measured.surfaceToken, `${theme} still values the highlighted neutral surface`).toMatch(/^rgb/);
            expect(measured.inline.backgroundColor, `${theme} still paints that surface`).toBe(measured.surfaceToken)
        }
    })
});

test.describe('Neo.tab.Container — the inline header paints a flat surface with a hairline', () => {
    for (const theme of THEMES) {
        test(`${theme}: flat semantic surface, hairline, no gradient — and the standalone control keeps its paint`, async ({page}) => {
            await applyTheme(page, theme);

            const measured = await measure(page, controlId);

            expect(measured.inline, 'an inline dock header must be rendered').toBeTruthy();
            expect(measured.control, 'the standalone control header must be rendered').toBeTruthy();

            // The tokens must resolve to real colours in this theme, or the arm below is vacuous.
            expect(measured.surfaceToken, `${theme} values the highlighted neutral surface`).toMatch(/^rgb/);
            expect(measured.borderToken, `${theme} values the default border`).toMatch(/^rgb/);

            // The measurement: no band, the theme's surface, the theme's hairline.
            expect(measured.inline.backgroundImage, 'the inline header paints no gradient band').toBe('none');
            expect(measured.inline.backgroundColor, 'the inline header is the highlighted neutral surface').toBe(measured.surfaceToken);
            expect(measured.inline.boxShadow, 'the hairline is an inset shadow in the border colour').toContain('inset');
            expect(measured.inline.boxShadow).toContain(measured.borderToken);

            // The control: same theme, same document, none of it — the variant selector scoped the tokens.
            expect(measured.control.backgroundImage, 'a standalone header paints no image').toBe('none');
            expect(measured.control.backgroundColor, 'a standalone header stays transparent').toBe('rgba(0, 0, 0, 0)');
            expect(measured.control.boxShadow, 'a standalone header carries no hairline').toBe('none')
        })
    }

    test('the hairline costs no layout: the inline header keeps its density-tier height', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-dark');

        const measured = await measure(page, controlId),
              tier     = await page.evaluate(() => {
                  const probe = document.createElement('div');

                  probe.style.height = 'var(--sem-height-large)';
                  document.body.appendChild(probe);

                  const value = probe.getBoundingClientRect().height;

                  probe.remove();
                  return value
              });

        expect(tier, 'the semantic large height must resolve').toBeGreaterThan(0);
        // An inset shadow paints inside the box; a border-bottom would have added a pixel here.
        expect(Math.abs(measured.inline.height - tier), 'the inline header is exactly the density tier tall').toBeLessThanOrEqual(1)
    });

    for (const classic of ['neo-theme-light', 'neo-theme-dark']) {
        test(`${classic} nested inside a neo scope resets the surface rather than inheriting it`, async ({page}) => {
            // The discriminating arm, and the nesting is what makes it one. A classic theme applied
            // to the document ALONE would read transparent even while broken, because no ancestor
            // declares the token and the structural fallback covers it — so a non-nested arm cannot
            // fail on this defect. Custom properties inherit, so only an outer scope that DOES value
            // the token proves the inner one resets it. `component.Base#getTheme` walks the component
            // chain to support exactly this shape, and theme classes land on several elements at once
            // in a live app, so a nested scope is ordinary rather than contrived.
            await applyTheme(page, 'neo-theme-neo-dark');

            const nested = await page.evaluate(name => {
                const container = document.querySelector('.neo-tab-container-inline');

                if (!container) throw new Error('no inline tab container to nest a theme on');

                container.classList.add(name);
                return container.className
            }, classic);

            expect(nested, `the inline container carries the nested ${classic} scope`).toContain(classic);

            const measured = await measure(page, controlId);

            // The outer scope must genuinely value the token, or the arm proves nothing: without
            // this, an inner reset and an inner nothing are indistinguishable.
            expect(measured.surfaceToken, 'the outer neo scope still values the highlighted surface').toMatch(/^rgb/);

            // The property under test is the RESET, not the value: an inner classic scope must stop
            // showing the outer neo surface. It used to reset to `transparent` because that is what
            // the classic families stated; they now state their own header grey, so the reset lands
            // on that instead. The assertion follows the value rather than pinning the old one —
            // what would break this arm is the inner scope rendering the OUTER surface, which is
            // still exactly what it fails on.
            const CLASSIC_GROUND = {'neo-theme-dark': 'rgb(60, 63, 65)', 'neo-theme-light': 'rgb(242, 242, 242)'};

            expect(measured.inline.backgroundColor, `${classic} paints its OWN ground inside a neo scope`)
                .toBe(CLASSIC_GROUND[classic]);
            expect(measured.inline.backgroundColor, `${classic} does not inherit the outer neo surface`)
                .not.toBe(measured.surfaceToken);
            expect(measured.inline.backgroundImage, `${classic} paints no image inside a neo scope`).toBe('none');
            expect(measured.inline.boxShadow, `${classic} carries no hairline inside a neo scope`).toBe('none')
        })
    }
});
