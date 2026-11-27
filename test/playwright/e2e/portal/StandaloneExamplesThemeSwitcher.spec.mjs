import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies `Neo.button.ThemeSwitcher` across the 17 standalone Grid, Table, Dashboard, Desktop,
 * Menu, Tab, Toolbar, List, and Layout examples: 4-theme dropdown + detached menu sync (`menu/context`),
 * 2-theme toggle round-trip, multi-window propagation (`dashboard/crossWindow`,
 * `dashboard/tearOut`, `list/onAir`), and `390 × 844` / `1440 × 900` reachability with zero console/page errors.
 */

const
    THEME_LABELS = {
        'neo-theme-cyberpunk': 'Cyberpunk',
        'neo-theme-dark'     : 'Dark',
        'neo-theme-light'    : 'Light',
        'neo-theme-neo-dark' : 'Neo Dark',
        'neo-theme-neo-light': 'Neo Light'
    },
    CONTEXT_MENU_THEMES = {
        'Neo Dark' : 'neo-theme-neo-dark',
        'Neo Light': 'neo-theme-neo-light',
        Dark       : 'neo-theme-dark',
        Light      : 'neo-theme-light'
    },
    TOGGLE_EXAMPLES = [
        {appName: 'Neo.examples.grid.animatedRowSorting', path: 'grid/animatedRowSorting', themes: ['neo-theme-dark',      'neo-theme-light']},
        {appName: 'DesktopBasic',                         path: 'desktop/basic',           themes: ['neo-theme-neo-dark',  'neo-theme-neo-light']},
        {appName: 'Neo.examples.tableStore',              path: 'tableStore',              themes: ['neo-theme-neo-light', 'neo-theme-neo-dark']},
        {appName: 'Neo.examples.toolbar.breadcrumb',      path: 'toolbar/breadcrumb',      themes: ['neo-theme-neo-light', 'neo-theme-neo-dark']}
    ],
    ALL_SLICE_EXAMPLES = [
        'dashboard/choreography',
        'dashboard/crossWindow',
        'dashboard/desk',
        'dashboard/tearOut',
        'desktop/basic',
        'grid/animatedRowSorting',
        'grid/contentSizedRows',
        'layout/sideBySide',
        'list/animate',
        'list/onAir',
        'list/reorder',
        'menu/context',
        'menu/contextFiles',
        'tab/browser',
        'table/covid',
        'tableStore',
        'toolbar/breadcrumb'
    ];

/**
 * @summary Attaches pageerror and non-favicon console error listeners to `targetPage`.
 * @param {import('@playwright/test').Page} targetPage
 * @param {String[]} bucket
 */
function captureErrors(targetPage, bucket) {
    targetPage.on('pageerror', err => bucket.push(err.message));
    targetPage.on('console', msg => {
        if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) {
            bucket.push(msg.text())
        }
    })
}

test.describe('Standalone Examples ThemeSwitcher Rollout', () => {
    test('menu/context switches across all 4 configured themes via dropdown and syncs its detached context menu', async ({page, neuralLink}) => {
        const errors = [];
        captureErrors(page, errors);

        await page.setViewportSize({width: 1440, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.goto('/examples/menu/context/index.html');

        const
            switcher = page.locator('.neo-themeswitcher').first(),
            menu     = page.locator('.neo-themeswitcher-menu');

        await expect(switcher).toBeVisible();

        const
            app        = await neuralLink.connectToApp('Neo.examples.menu.context'),
            viewportId = await page.locator('.neo-viewport').first().getAttribute('id');

        // Materialize the detached context menu via a real right-click, then dismiss it cleanly.
        await page.mouse.click(240, 240, {button: 'right'});
        await expect.poll(async () => {
            const res = await app.getComponent(viewportId, ['contextMenuId', 'openCount']);
            return res?.openCount === 1 ? res.contextMenuId : null
        }).toBeTruthy();

        const {contextMenuId} = await app.getComponent(viewportId, ['contextMenuId']);
        await page.keyboard.press('Escape');

        await switcher.click();
        await expect(menu.getByRole('menuitemradio')).toHaveCount(4);
        await page.keyboard.press('Escape');
        await expect(menu).toBeHidden();

        for (const [label, theme] of Object.entries(CONTEXT_MENU_THEMES)) {
            const current = await app.callMethod(viewportId, 'getTheme', []);
            if (current === theme) continue;

            await switcher.click();
            await menu.getByRole('menuitemradio', {name: label, exact: true}).click();

            await expect.poll(() => app.callMethod(viewportId, 'getTheme', []), `worker theme ${theme}`).toBe(theme);
            await expect.poll(async () => (await app.getComponent(contextMenuId, ['theme']))?.theme, `detached contextMenu theme ${theme}`).toBe(theme);
            await expect(page.locator(`#${viewportId}`)).toHaveClass(new RegExp(`\\b${theme}\\b`));
            await expect.poll(() => page.evaluate(cls => document.body.classList.contains(cls), theme), `body class ${theme}`).toBe(true)
        }

        expect(errors).toEqual([])
    });

    for (const {appName, path, themes} of TOGGLE_EXAMPLES) {
        test(`${path} toggles theme state in the App Worker and syncs document.body`, async ({page, neuralLink}) => {
            const errors = [];
            captureErrors(page, errors);

            await page.setViewportSize({width: 1440, height: 900});
            await page.emulateMedia({reducedMotion: 'reduce'});
            await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));

            await page.goto(`/examples/${path}/index.html`);

            const switcher = page.locator('.neo-themeswitcher').first();
            await expect(switcher).toBeVisible();

            const
                app        = await neuralLink.connectToApp(appName),
                viewportId = await page.locator('.neo-viewport').first().getAttribute('id'),
                startTheme = await app.callMethod(viewportId, 'getTheme', []),
                nextTheme  = themes.find(t => t !== startTheme);

            expect(themes).toContain(startTheme);
            await expect.poll(() => page.evaluate(cls => document.body.classList.contains(cls), startTheme)).toBe(true);

            const selectTheme = async targetTheme => {
                const hasMenu = (await switcher.getAttribute('aria-haspopup')) === 'menu';
                await switcher.click();
                if (hasMenu) {
                    const menu = page.locator('.neo-themeswitcher-menu');
                    await expect(menu).toBeVisible();
                    await menu.getByRole('menuitemradio', {name: THEME_LABELS[targetTheme], exact: true}).click()
                }
            };

            await selectTheme(nextTheme);
            await expect.poll(() => app.callMethod(viewportId, 'getTheme', []), `${path}: switch to ${nextTheme}`).toBe(nextTheme);
            await expect.poll(() => page.evaluate(cls => document.body.classList.contains(cls), nextTheme)).toBe(true);

            await selectTheme(startTheme);
            await expect.poll(() => app.callMethod(viewportId, 'getTheme', []), `${path}: switch back to ${startTheme}`).toBe(startTheme);
            await expect.poll(() => page.evaluate(cls => document.body.classList.contains(cls), startTheme)).toBe(true);

            if (path === 'toolbar/breadcrumb') {
                await expect(page.locator('.neo-breadcrumb-folders-name')).toHaveText('src')
            }

            expect(errors).toEqual([])
        })
    }

    test('multi-window examples (dashboard/crossWindow, dashboard/tearOut, list/onAir) propagate theme switches to secondary windows', async ({page, context, neuralLink}) => {
        test.setTimeout(120000);
        const errors = [];
        captureErrors(page, errors);
        await page.setViewportSize({width: 1440, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});

        // 1. dashboard/crossWindow
        await page.goto('/examples/dashboard/crossWindow/index.html');
        await page.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        const
            cwApp      = await neuralLink.connectToApp('Neo.examples.dashboard.crossWindow'),
            workspaces = await cwApp.findInstances({className: 'Neo.examples.dashboard.crossWindow.DemoBWorkspace'}, ['id']),
            wsId       = (Array.isArray(workspaces) ? workspaces[0] : workspaces)?.id,
            cwPopupP   = page.waitForEvent('popup', {timeout: 30000});

        expect(await cwApp.callMethod(wsId, 'popOutPane', ['workbench'])).toEqual({detached: true, errors: []});
        const cwPopup = await cwPopupP;
        captureErrors(cwPopup, errors);
        await cwPopup.locator('.agentos-dockdemo-counter-pane').waitFor({timeout: 30000});

        await page.locator('.neo-themeswitcher').first().click();
        await expect.poll(() => page.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await expect.poll(() => cwPopup.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await cwPopup.close({runBeforeUnload: true});

        // 2. dashboard/tearOut
        await page.goto('/examples/dashboard/tearOut/index.html');
        const notesTab = page.locator('.neo-tab-header-button', {hasText: 'Notes'});
        await expect(notesTab).toBeVisible();
        await notesTab.click();

        const
            popOutBtn = page.locator('.neo-toolbar-action:has(.fa-window-restore)').filter({visible: true}),
            [vessel]  = await Promise.all([context.waitForEvent('page'), popOutBtn.click()]);

        captureErrors(vessel, errors);
        await expect(vessel.locator('.tear-out-target')).toHaveCount(1);

        await page.locator('.neo-themeswitcher').first().click();
        await expect.poll(() => page.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await expect.poll(() => vessel.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await vessel.close({runBeforeUnload: true});

        // 3. list/onAir
        await page.goto('/examples/list/onAir/index.html');
        await expect(page.locator('.air-list .neo-list-item')).toHaveCount(2);

        const [presenter] = await Promise.all([
            page.waitForEvent('popup'),
            page.getByRole('button', {name: 'Open presenter window'}).click()
        ]);
        captureErrors(presenter, errors);
        await expect(presenter.locator('.air-cue')).toBeVisible();

        await page.locator('.neo-themeswitcher').first().click();
        await expect.poll(() => page.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await expect.poll(() => presenter.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);
        await presenter.close({runBeforeUnload: true});

        expect(errors).toEqual([])
    });

    test('keeps ThemeSwitcher visible, in-bounds, and hit-testable across all 17 standalone examples at 390 × 844 and 1440 × 900', async ({page}) => {
        test.setTimeout(180000);
        const errors = [];
        captureErrors(page, errors);

        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.context().route('https://disease.sh/**', route => route.fulfill({
            json: [{
                active  : 1, cases: 10, casesPerOneMillion: 1, country: 'USA', countryInfo: {},
                critical: 1, deaths: 1, recovered: 9, tests: 100, testsPerOneMillion: 10, todayCases: 0, todayDeaths: 0
            }]
        }));
        await page.context().route('https://raw.githubusercontent.com/**', route => route.fulfill({
            body: '', contentType: 'image/png', status: 200
        }));

        for (const [width, height] of [[390, 844], [1440, 900]]) {
            await page.setViewportSize({width, height});

            for (const path of ALL_SLICE_EXAMPLES) {
                await page.goto(`/examples/${path}/index.html`);

                const switcher = page.locator('.neo-themeswitcher').first();
                await expect(switcher, `${path} @ ${width}x${height}`).toBeVisible();

                const check = await page.evaluate(vw => {
                    const sw = document.querySelector('.neo-themeswitcher');
                    if (!sw) return {ok: false, reason: 'missing .neo-themeswitcher'};

                    const r   = sw.getBoundingClientRect(),
                          hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.neo-themeswitcher') === sw;

                    return {
                        hit,
                        inBounds: r.left >= -0.5 && r.right <= vw + 0.5 && r.width > 0 && r.height > 0,
                        ok      : hit && r.left >= -0.5 && r.right <= vw + 0.5 && r.width > 0 && r.height > 0,
                        rect    : {height: Math.round(r.height), left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width)}
                    }
                }, width);

                expect(check.ok, `${path} @ ${width}x${height}: ${JSON.stringify(check)}`).toBe(true)
            }
        }

        expect(errors, `console/page errors across all 17 examples`).toEqual([])
    })
});
