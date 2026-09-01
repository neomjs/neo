import {test, expect} from '@playwright/test';

/**
 * @summary The tab drag proxy must render at the density of the header the tab came from.
 *
 * Reported by @tobiu against the Workstation: a dragged tab's label is no longer centred for the
 * whole gesture. The proxy is a detached toolbar rooted at `document.body`, and every theme expresses
 * `ui: 'inline'` as a DESCENDANT rule — `.neo-tab-container-inline > .neo-tab-header-toolbar` — so the
 * proxy has no ancestor that can match it and falls back to the theme's `ui: null` treatment.
 *
 * Three deliberate choices:
 *
 * - **Measured while the gesture is open.** The proxy does not exist before `mouse.down` or after
 *   `mouse.up`, so a static fixture cannot witness this at all.
 * - **Each proxy is compared to its OWN source, never to a literal.** The contract is "the proxy
 *   inherits its owner's variant", not "the proxy is always inline" — the `ui: null` arm is what stops
 *   the fix from being written as the latter. An earlier draft asserted a literal `32px` and was wrong:
 *   that figure is the `neo-*` themes' inline tier, while `theme-light`/`theme-dark` express `inline`
 *   as padding only, so the header measured 25px and the precondition failed for the right reason.
 * - **The variants are compared to each other for non-vacuity.** If `inline` and `ui: null` rendered
 *   identically, "proxy matches source" would pass on both arms while proving nothing. The
 *   discriminator asserts they differ, without naming which property carries the difference — the
 *   `neo-*` themes vary height and padding, the base themes vary padding alone.
 *
 * Run: npx playwright test component/tab/DragProxyDensity -c test/playwright/playwright.config.component.mjs --workers=1
 */

const
    INLINE_ID     = 'drag-proxy-density-inline',
    PLAIN_ID      = 'drag-proxy-density-plain',
    STANDALONE_ID = 'drag-proxy-density-standalone',
    VARIANT_IDS   = [INLINE_ID, PLAIN_ID, STANDALONE_ID],
    THEMES        = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-light', 'neo-theme-dark'];

/**
 * Links every theme's tab value layers into the persistent component-test document.
 *
 * The harness boots one theme's stylesheets; measuring another without linking its CSS reads the
 * booted cascade under a renamed class and calls the result a variant. `ContainerUi.spec.mjs` uses
 * this same idiom against the same empty-viewport harness, which is why all four themes are
 * reachable here — an earlier revision of this file claimed otherwise and was wrong.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function loadThemeStylesheets(page) {
    const hrefs = THEMES.flatMap(theme => {
        const directory = theme.replace('neo-theme-', 'theme-'),
              files     = [
                  `/dist/development/css/${directory}/button/Base.css`,
                  `/dist/development/css/${directory}/tab/Container.css`,
                  `/dist/development/css/${directory}/tab/header/Button.css`,
                  `/dist/development/css/${directory}/toolbar/Base.css`
              ];

        if (directory.startsWith('theme-neo-')) {
            files.unshift(
                `/dist/development/css/${directory}/design-tokens/Core.css`,
                `/dist/development/css/${directory}/design-tokens/Semantic.css`,
                `/dist/development/css/${directory}/design-tokens/Component.css`
            )
        }

        return files
    });

    await page.evaluate(async list => {
        await Promise.all(list.map(href => new Promise(resolve => {
            if (document.querySelector(`link[href="${href}"]`)) return resolve();

            const link = document.createElement('link');

            link.rel    = 'stylesheet';
            link.href   = href;
            link.onload = link.onerror = resolve;
            document.head.appendChild(link)
        })))
    }, hrefs)
}

/**
 * Themes the VIEWPORT through the engine, which is the only placement both halves of this measurement
 * agree on. `component.Base#getTheme()` checks a component's own `cls` and then jumps to the app's
 * mainView — it does not walk the parent chain — and `DragZone#createDragProxy` themes the proxy from
 * that same call. So a theme set per-container reaches the rendered header but NOT its proxy, and a
 * class poked onto `document.body` reaches neither: both make the arm compare two different cascades
 * and call the difference a defect. Setting it on the mainView is what makes source and proxy comparable.
 * @param {Object} page
 * @param {String} theme
 * @returns {Promise<void>}
 */
const viewportCls = page => page.evaluate(() =>
    Neo.worker.App.getConfigs({id: 'component-test-viewport', keys: 'cls'}));

const setViewportCls = (page, cls) => page.evaluate(value =>
    Neo.worker.App.setConfigs({cls: value, id: 'component-test-viewport'}), cls);

const applyTheme = async (page, theme) => {
    const cls = (await viewportCls(page) || []).filter(item => !item.startsWith('neo-theme-'));

    await setViewportCls(page, [...cls, theme])
};

/**
 * Creates a real, drag-resortable TabContainer at the requested ui variant.
 * @param {Object} page
 * @param {String} id
 * @param {String|null} ui
 * @returns {Promise<String>}
 */
async function createTabContainer(page, id, ui) {
    const result = await page.evaluate(async ({id, ui}) => Neo.worker.App.createNeoInstance({
        activeIndex   : 0,
        dragResortable: true,
        height        : 200,
        id,
        importPath    : '../tab/Container.mjs',
        items         : Array.from({length: 4}, (_, index) => ({
            header: {text: `Tab ${index + 1}`},
            ntype : 'component',
            text  : `Content ${index + 1}`
        })),
        ntype   : 'tab-container',
        parentId: 'component-test-viewport',
        ui,
        width   : 560
    }), {id, ui});

    if (!result.success) {
        throw new Error(`TabContainer ${id} creation failed: ${result.error.message}`)
    }

    await page.waitForSelector(`#${id}`, {state: 'attached'});

    return result.id
}

/** The density contract a tab button renders under, as the cascade resolves it. */
const density = root => root.locator('.neo-tab-header-button').first().evaluate(node => {
    const style = getComputedStyle(node);

    return {height: style.height, padding: style.padding}
});

test.describe('Neo.draggable.tab.header.toolbar.SortZone — the drag proxy inherits its owner density', () => {
    let originalCls = null;

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadThemeStylesheets(page);

        // The viewport is an App Worker instance SHARED across every spec file — `page.goto()` gives a
        // fresh document, not a fresh component. Re-theming it is therefore a mutation that outlives
        // this file, so the pre-existing value is captured here and restored below. Without that, every
        // later spec silently renders under whichever theme this file happened to leave behind.
        originalCls = await viewportCls(page)
    });

    test.afterEach(async ({page}) => {
        // Release any gesture an arm left open BEFORE tearing the containers down: a live pointer
        // capture outlives the instance and would arm the next spec's first click.
        await page.mouse.up().catch(() => {});

        for (const id of VARIANT_IDS) {
            await page.evaluate(componentId => Neo.worker.App.destroyNeoInstance(componentId), id).catch(() => {});
            await page.waitForSelector(`#${id}`, {state: 'detached'}).catch(() => {})
        }

        originalCls && await setViewportCls(page, originalCls)
    });

    for (const theme of THEMES) {
        test(`the proxy carries the source header's density, per variant — ${theme}`, async ({page}) => {
            await applyTheme(page, theme);
            await createTabContainer(page, INLINE_ID,     'inline');
            await createTabContainer(page, PLAIN_ID,      null);
            await createTabContainer(page, STANDALONE_ID, 'standalone');

            const
                inlineRoot     = page.locator(`#${INLINE_ID}`),
                plainRoot      = page.locator(`#${PLAIN_ID}`),
                standaloneRoot = page.locator(`#${STANDALONE_ID}`),
                inlineSrc      = await density(inlineRoot),
                plainSrc       = await density(plainRoot),
                standaloneSrc  = await density(standaloneRoot);

            // Non-vacuity: with identical variants, "proxy matches source" would hold on both arms
            // while proving nothing about the variant reaching the proxy at all.
            expect(inlineSrc, `precondition: ${theme} must render inline and ui:null differently`)
                .not.toEqual(plainSrc);

            for (const [label, root, expected] of [
                ['inline',     inlineRoot,     inlineSrc],
                ['ui:null',    plainRoot,      plainSrc],
                ['standalone', standaloneRoot, standaloneSrc]
            ]) {
                const
                    tab = root.locator('.neo-tab-header-button').first(),
                    box = await tab.boundingBox();

                expect(box, `${label}: the tab button must be rendered before the gesture`).toBeTruthy();

                // A real pointer, not a synthetic click: the sort zone arms on the main thread's drag
                // sensor, and a dispatched click never produces a proxy at all — which would read as a
                // green assertion against an element that was never created. The move is stepped past
                // the threshold, because one jump can coalesce into a single event below start distance.
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                await page.mouse.down();
                await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2, {steps: 12});

                const proxy = page.locator('.neo-dragproxy');

                await expect(proxy, `${label}: the gesture must produce exactly one live proxy`)
                    .toHaveCount(1, {timeout: 5000});

                expect(await density(proxy), `${label}: the proxy must render at its own source header's density`)
                    .toEqual(expected);

                await page.mouse.up();
                await expect(proxy, `${label}: the proxy is released with the gesture`)
                    .toHaveCount(0, {timeout: 5000})
            }
        })
    }
});
