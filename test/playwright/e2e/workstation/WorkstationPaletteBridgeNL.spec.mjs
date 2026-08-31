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
 * Every bridged token, paired with the `--workstation-*` entry it must resolve to, and the selector
 * of a real element that CONSUMES it. Reading on the consumer rather than the viewport is the whole
 * point: a viewport-only probe passed while the tab header resolved theme values, because a nearer
 * skin-carrying ancestor shadowed the bridge.
 * @type {Object[]}
 */
const bridgedTokens = [
    {token: '--grid-container-border-color',               palette: '--workstation-line',     consumer: '.neo-grid-cell'},
    {token: '--grid-container-cell-background-color',      palette: '--workstation-panel',    consumer: '.neo-grid-cell'},
    {token: '--grid-container-cell-background-color-even', palette: '--workstation-panel-2',  consumer: '.neo-grid-cell'},
    {token: '--grid-container-color',                      palette: '--workstation-ink-dim',  consumer: '.neo-grid-cell'},
    {token: '--grid-cell-progress-active-color',           palette: '--workstation-signal',   consumer: '.neo-grid-cell'},
    {token: '--grid-cell-progress-track-color',            palette: '--workstation-line',     consumer: '.neo-grid-cell'},
    {token: '--tab-button-glyph-color',                    palette: '--workstation-ink-dim',  consumer: '.neo-tab-header-button'},
    {token: '--tab-button-text-color',                     palette: '--workstation-ink-dim',  consumer: '.neo-tab-header-button'},
    {token: '--tab-indicator-background-color-active',     palette: '--workstation-signal',   consumer: '.neo-tab-header-button'},
    {token: '--tab-strip-background-color',                palette: '--workstation-panel-2',  consumer: '.neo-tab-header-button'},
    {token: '--tab-header-action-glyph-color',             palette: '--workstation-ink-dim',  consumer: '.neo-toolbar-action'},
    {token: '--tab-header-action-glyph-color-active',      palette: '--workstation-signal',   consumer: '.neo-toolbar-action'},
    {token: '--tab-header-action-glyph-color-hover',       palette: '--workstation-signal',   consumer: '.neo-toolbar-action'}
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
function readBridge(page, spec) {
    return page.evaluate(rows => {
        const viewport = document.querySelector('.workstation-viewport'),
              palette  = getComputedStyle(viewport);

        return rows.map(row => {
            const consumer = document.querySelector(row.consumer);

            return {
                ...row,
                resolved: consumer ? getComputedStyle(consumer).getPropertyValue(row.token).trim() : null,
                expected: palette.getPropertyValue(row.palette).trim(),
                found   : !!consumer
            }
        })
    }, spec)
}

/**
 * Every token resolves to the palette entry it maps to, case-insensitively — values, not literals.
 * @param {Object[]} readings
 * @param {String} label
 */
function assertBridgeHolds(readings, label) {
    for (const reading of readings) {
        expect(reading.found, `${label}: a consumer for ${reading.token} must exist`).toBe(true);
        expect(reading.expected, `${label}: ${reading.palette} must be defined`).not.toBe('');
        expect(reading.resolved.toLowerCase(),
            `${label}: ${reading.token} must resolve to ${reading.palette}, not the theme`)
            .toBe(reading.expected.toLowerCase())
    }
}

test.describe('Workstation — the palette bridge out-ranks the theme', () => {
    test('every bridged token resolves to the instrument palette in both skins', async ({page}) => {
        await bootWorkstation(page);

        assertBridgeHolds(await readBridge(page, bridgedTokens), 'boot skin');

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
        assertBridgeHolds(await readBridge(page, bridgedTokens), 'switched skin')
    });

    test('the bridge, not the theme, is what holds those values', async ({page}) => {
        await bootWorkstation(page);

        const before = await readBridge(page, bridgedTokens);

        assertBridgeHolds(before, 'pre-mutation');

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

        const after = await readBridge(page, bridgedTokens),
              moved = after.filter((row, index) => row.resolved !== before[index].resolved);

        expect(moved.length, 'every bridged token must move once the bridge is deleted')
            .toBe(bridgedTokens.length)
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
            const viewport = document.querySelector('.workstation-viewport'),
                  style    = getComputedStyle(viewport);

            return rows.map(row => ({
                token   : row.token,
                palette : row.palette,
                resolved: style.getPropertyValue(row.token).trim(),
                expected: style.getPropertyValue(row.palette).trim(),
                found   : true
            }))
        }, bridgedTokens);

        assertBridgeHolds(readings, 'pop-out vessel')
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
