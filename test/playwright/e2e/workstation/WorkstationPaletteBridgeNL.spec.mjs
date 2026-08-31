import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Whitebox E2E witness that Workstation's palette bridge out-ranks the theme it sits under.
 *
 * Workstation maps generic `--grid-*` / `--tab-*` primitives onto its own `--workstation-*` palette
 * (`resources/scss/src/apps/workstation/Viewport.scss`). The engine stamps a skin class onto that
 * same viewport element — and, after a runtime skin switch, onto `.workstation-workspace` too — so
 * the theme's `:root .neo-theme-*` token block competes with the bridge on the very elements the
 * bridge declares on. Uncorrected, the bridge loses that contest for 21 of its 23 contested tokens
 * and the app renders the theme's neutral ramp while every stylesheet, class and token is present.
 *
 * The assertions therefore read COMPUTED values on the CONSUMING elements and compare them to the
 * palette entry each token is supposed to map to — never to a literal colour. A palette retune stays
 * green; a token that resolves to the theme instead of the instrument goes red. A class or selector
 * check cannot substitute: the skin class is never the thing that goes missing here, so a probe
 * that reads class presence stays green for the entire lifetime of the defect.
 *
 * Run: NEO_E2E_PORT=8161 npx playwright test workstation/WorkstationPaletteBridgeNL -c test/playwright/playwright.config.e2e.mjs --workers=1
 */

/**
 * EVERY declaration the bridge makes, paired with what it must resolve to on a real CONSUMER.
 *
 * Reading on the consumer rather than the viewport is the whole point: a viewport-only probe passed
 * while the tab header resolved theme values, because a nearer skin-carrying ancestor shadowed the
 * bridge. The census is exhaustive against the SCSS block on purpose — the PR claims "every bridged
 * token", and a claim wider than its instrument is the defect class this whole spec exists for.
 *
 * `expect` is a function of the live palette rather than a literal, so a palette retune stays green
 * and only a token resolving to the THEME goes red.
 * @type {Object[]}
 */
const bridgedTokens = [
    // Direct palette mappings.
    {token: '--grid-container-border-color',               consumer: '.neo-grid-cell',           expect: p => p.line},
    {token: '--grid-container-cell-background-color',      consumer: '.neo-grid-cell',           expect: p => p.panel},
    {token: '--grid-container-cell-background-color-even', consumer: '.neo-grid-cell',           expect: p => p.panel2},
    {token: '--grid-container-color',                      consumer: '.neo-grid-cell',           expect: p => p.inkDim},
    {token: '--grid-cell-progress-active-color',           consumer: '.neo-grid-cell',           expect: p => p.signal},
    {token: '--grid-cell-progress-track-color',            consumer: '.neo-grid-cell',           expect: p => p.line},
    {token: '--tab-button-glyph-color',                    consumer: '.neo-tab-header-button',   expect: p => p.inkDim},
    {token: '--tab-button-text-color',                     consumer: '.neo-tab-header-button',   expect: p => p.inkDim},
    {token: '--tab-indicator-background-color-active',     consumer: '.neo-tab-header-button',   expect: p => p.signal},
    {token: '--tab-strip-background-color',                consumer: '.neo-tab-header-button',   expect: p => p.panel2},
    {token: '--tab-header-action-glyph-color',             consumer: '.neo-toolbar-action',      expect: p => p.inkDim},
    {token: '--tab-header-action-glyph-color-active',      consumer: '.neo-toolbar-action',      expect: p => p.signal},
    {token: '--tab-header-action-glyph-color-hover',       consumer: '.neo-toolbar-action',      expect: p => p.signal},

    // Composed values. A `color-mix()` or a border shorthand is still a bridged declaration, and
    // omitting them is how a census silently shrinks to the tokens that were easy to assert.
    {token: '--grid-cell-background-color-hover',          consumer: '.neo-grid-cell',           expect: p => `color-mix(in srgb, ${p.signal} 10%, ${p.panel})`},
    {token: '--grid-container-header-cell-border-bottom',  consumer: '.neo-grid-cell',           expect: p => `1px solid ${p.line}`},
    {token: '--tab-button-background-color-active',        consumer: '.neo-tab-header-button',   expect: p => `color-mix(in srgb, ${p.signal} 12%, transparent)`},
    {token: '--tab-button-background-color-hover',         consumer: '.neo-tab-header-button',   expect: p => `color-mix(in srgb, ${p.signal} 8%, transparent)`},
    {token: '--tab-header-action-background-color-active', consumer: '.neo-toolbar-action',      expect: p => `color-mix(in srgb, ${p.signal} 12%, transparent)`},
    {token: '--tab-header-action-background-color-hover',  consumer: '.neo-toolbar-action',      expect: p => `color-mix(in srgb, ${p.signal} 8%, transparent)`},
    {token: '--tab-header-inline-background-image',        consumer: '.neo-tab-header-toolbar',  expect: p => `linear-gradient( 180deg, ${p.panel2}, ${p.panel} )`},

    // A literal, and the one declaration this spec CANNOT discriminate: the app and both neo themes
    // independently arrive at `transparent` here, so deleting the bridge does not move it. Carried in
    // the census with that stated rather than dropped, because an unlisted token reads as an
    // oversight while a listed non-discriminating one reads as a measurement.
    {token: '--tab-button-background-color',               consumer: '.neo-tab-header-button',   expect: () => 'transparent', nonDiscriminating: true}
];

/**
 * Boots the workstation workspace and waits for a grid, a tab header and a projected action to exist,
 * since those are the three consumer families the bridge has to reach.
 * @param {Object} page Playwright page
 * @returns {Promise<void>}
 */
async function bootWorkstation(page) {
    await page.goto('/apps/workstation/index.html');
    await page.waitForSelector('.workstation-workspace',   {timeout: 60000});
    await page.waitForSelector('.neo-grid-cell',           {timeout: 60000});
    await page.waitForSelector('.neo-tab-header-button',   {timeout: 60000});
    // `attached`, not the default `visible`: the engine set is focus-gated, so `pin` and `maximize`
    // rest at `visibility: hidden` with their geometry preserved. They still consume the bridged
    // tokens, and a colour that resolves to the theme is just as wrong while the action is quiet.
    await page.waitForSelector('.neo-toolbar-action', {state: 'attached', timeout: 60000})
}

/**
 * Resolves each bridged token on its consuming element alongside the palette entry it must equal.
 * @param {Object} page Playwright page
 * @param {Object[]} spec bridgedTokens, or a subset
 * @returns {Promise<Object[]>}
 */
function readPalette(page) {
    return page.evaluate(() => {
        const style = getComputedStyle(document.querySelector('.workstation-viewport')),
              read  = name => style.getPropertyValue(name).trim();

        return {
            inkDim: read('--workstation-ink-dim'),
            line  : read('--workstation-line'),
            panel : read('--workstation-panel'),
            panel2: read('--workstation-panel-2'),
            signal: read('--workstation-signal')
        }
    })
}

/**
 * Resolves each declaration on its consuming element. Only serialisable fields cross into the page —
 * the expectation is computed in Node from the live palette, so a retune cannot make it stale.
 * @param {Object} page Playwright page
 * @param {Object[]} spec bridgedTokens, or a subset
 * @returns {Promise<Object[]>}
 */
function readBridge(page, spec) {
    return page.evaluate(rows => rows.map(row => {
        const consumer = document.querySelector(row.consumer);

        return {
            ...row,
            found   : !!consumer,
            resolved: consumer ? getComputedStyle(consumer).getPropertyValue(row.token).trim() : null
        }
    }), spec.map(({consumer, token}) => ({consumer, token})));
}

/**
 * A custom property resolves as substituted TOKENS, not as a computed colour, so the only difference
 * a browser introduces is whitespace around the substitutions.
 * @param {String} value
 * @returns {String}
 */
const squash = value => (value ?? '').replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')').trim().toLowerCase();

/**
 * Every declaration resolves to what the palette composes, never to a literal.
 * @param {Object[]} readings
 * @param {Object[]} spec
 * @param {Object} palette
 * @param {String} label
 */
function assertBridgeHolds(readings, spec, palette, label) {
    readings.forEach((reading, index) => {
        const row = spec[index];

        expect(reading.found, `${label}: a consumer for ${row.token} must exist`).toBe(true);
        expect(squash(reading.resolved), `${label}: ${row.token} must resolve to the instrument palette, not the theme`)
            .toBe(squash(row.expect(palette)))
    })
}

test.describe('Workstation — the palette bridge out-ranks the theme', () => {
    test('every bridged token resolves to the instrument palette in both skins', async ({page}) => {
        await bootWorkstation(page);

        let palette = await readPalette(page);

        assertBridgeHolds(await readBridge(page, bridgedTokens), bridgedTokens, palette, 'boot skin');

        // The inline header band is the one bridged value that is a function of two palette entries,
        // so it is asserted against a composed expectation rather than a single lookup.
        const band = await page.evaluate(() => {
            const toolbar  = document.querySelector('.neo-tab-header-toolbar'),
                  viewport = document.querySelector('.workstation-viewport'),
                  palette  = getComputedStyle(viewport),
                  squash   = value => value.replace(/\s+/g, ' ').trim().toLowerCase();

            return {
                resolved: squash(getComputedStyle(toolbar).getPropertyValue('--tab-header-inline-background-image')),
                expected: squash(`linear-gradient( 180deg, ${palette.getPropertyValue('--workstation-panel-2')}, ${palette.getPropertyValue('--workstation-panel')} )`)
            }
        });

        expect(band.resolved, 'the inline header band is composed from the instrument palette')
            .toBe(band.expected);

        // A RUNTIME skin switch is the case a boot-only probe misses: the engine stamps the new skin
        // class onto `.workstation-workspace`, which then sits NEARER every tab consumer than the
        // viewport does. For an inherited custom property the nearest declaring ancestor wins
        // outright, so a bridge pinned to one element silently loses here even at high specificity.
        const themeToggle = page.locator('.workstation-theme-button');

        await expect(themeToggle).toHaveCount(1);
        await themeToggle.click();
        await page.waitForFunction(
            () => document.querySelector('.workstation-viewport')?.classList.contains('neo-theme-neo-light'),
            {timeout: 30000}
        );

        const switchedSkin = await page.evaluate(() =>
            [...document.querySelector('.workstation-viewport').classList].find(value => value.startsWith('neo-theme-')));

        expect(switchedSkin, 'the toggle really changed the live skin').toBe('neo-theme-neo-light');
        palette = await readPalette(page);

        assertBridgeHolds(await readBridge(page, bridgedTokens), bridgedTokens, palette, 'switched skin')
    });

    test('the bridge, not the theme, is what holds those values', async ({page}) => {
        await bootWorkstation(page);

        const before = await readBridge(page, bridgedTokens);

        assertBridgeHolds(before, bridgedTokens, await readPalette(page), 'pre-mutation');

        // Mutation control. Delete the bridge rules from the live stylesheet: if the readings above
        // survive that, they were observing the theme and this spec proves nothing.
        const removed = await page.evaluate(() => {
            let count = 0;

            for (const sheet of document.styleSheets) {
                let rules;

                try {rules = sheet.cssRules} catch (error) {continue}

                for (let i = (rules?.length ?? 0) - 1; i > -1; i--) {
                    const selector = rules[i].selectorText;

                    if (selector?.includes('.workstation-viewport') && selector.includes('[class*="neo-theme-"]')) {
                        sheet.deleteRule(i);
                        count++
                    }
                }
            }

            return count
        });

        expect(removed, 'the bridge rule must be findable and removable').toBeGreaterThan(0);

        const after       = await readBridge(page, bridgedTokens),
              movedTokens = bridgedTokens
                  .filter((row, index) => after[index].resolved !== before[index].resolved)
                  .map(row => row.token),
              expectedToMove = bridgedTokens.filter(row => !row.nonDiscriminating).map(row => row.token),
              expectedToHold = bridgedTokens.filter(row =>  row.nonDiscriminating).map(row => row.token);

        // Exactly the discriminating declarations move — asserted as a SET, not a count. A count
        // tolerates one token going quiet while another unexpectedly moves; naming them means the
        // failure message says which declaration changed character.
        expect(movedTokens.sort(), 'exactly the discriminating declarations move when the bridge is deleted')
            .toEqual(expectedToMove.sort());

        // And the one that does not is pinned rather than excused. The app and both neo themes
        // independently arrive at `transparent` for it, so no mutation of the bridge can move it —
        // measured here rather than asserted in prose. If a theme ever changes that value this arm
        // reds and the census gains a discriminating member, which is the outcome we want.
        expect(expectedToHold, 'the census names its non-discriminating member').toEqual(['--tab-button-background-color']);
        expect(movedTokens, 'and that member genuinely does not move').not.toContain('--tab-button-background-color')
    });

    test('the pop-out vessel keeps the bridge it has no workspace to inherit it from', async ({page}) => {
        // The vessel is a viewport WITHOUT a workspace, so a bridge scoped to the workspace never
        // reaches it and every token falls back to a stock default. That reachability is why the
        // bridge lives at the viewport at all, and the specificity repair must not cost it.
        await page.goto('/apps/workstation/index.html?popout=probe');
        await page.waitForSelector('.workstation-popout-host', {timeout: 60000});

        const shape = await page.evaluate(() => ({
            isHost      : !!document.querySelector('.workstation-popout-host'),
            hasWorkspace: !!document.querySelector('.workstation-workspace')
        }));

        expect(shape.isHost,       'the probe really booted the vessel').toBe(true);
        expect(shape.hasWorkspace, 'the vessel carries no workspace').toBe(false);

        // The vessel hosts no grid or tab of its own until a pane lands, so the bridge is asserted on
        // the viewport itself here — the element every future consumer will inherit from.
        const readings = await page.evaluate(rows => {
            const style = getComputedStyle(document.querySelector('.workstation-viewport'));

            return rows.map(row => ({
                found   : true,
                resolved: style.getPropertyValue(row.token).trim(),
                token   : row.token
            }))
        }, bridgedTokens.map(({token}) => ({token})));

        assertBridgeHolds(readings, bridgedTokens, await readPalette(page), 'pop-out vessel')
    });

    test('the grid header button block keeps winning on the element it declares on', async ({page}) => {
        // A separate block declares `--grid-header-button-*` on the consuming element itself, which
        // beats any ancestor by construction, so it never needed the specificity repair and did not
        // get one. This pins that, so a later tidy-up folding it into the ancestor bridge has to
        // answer for the change rather than make it silently.
        await bootWorkstation(page);
        await page.waitForSelector('.neo-grid-header-button', {timeout: 60000});

        const reading = await page.evaluate(() => {
            const button   = document.querySelector('.neo-grid-header-button'),
                  viewport = document.querySelector('.workstation-viewport'),
                  palette  = getComputedStyle(viewport),
                  style    = getComputedStyle(button);

            return {
                background: style.getPropertyValue('--grid-header-button-background-color').trim(),
                panel2    : palette.getPropertyValue('--workstation-panel-2').trim(),
                glyph     : style.getPropertyValue('--grid-header-button-glyph-color').trim(),
                inkDim    : palette.getPropertyValue('--workstation-ink-dim').trim(),
                // Sort glyphs sit after the label under row-reverse, so `flex-end` is the physical
                // start alignment. The theme's `start` was one of the values the bridge used to lose.
                justifyContent : style.justifyContent
            }
        });

        expect(reading.background.toLowerCase(), 'header button background stays instrument panel-2')
            .toBe(reading.panel2.toLowerCase());
        expect(reading.glyph.toLowerCase(), 'header button glyph stays instrument ink-dim')
            .toBe(reading.inkDim.toLowerCase());
        expect(reading.justifyContent, 'header button keeps its label/glyph group alignment')
            .toBe('flex-end')
    })
});
