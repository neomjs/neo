import {expect, test} from '../../fixtures.mjs';

/**
 * @summary An example opens on the theme of the catalog that launched it. Each launch link carries the
 * Portal's theme as `?theme=`, the opened example starts in that theme, and the links follow a theme switch without
 * a reload. The browser prefers light here, so a dark start can only come from the link.
 */
const
    PORTAL   = '/apps/portal/index.html',
    SIDEBAR  = '.portal-examples-sidebar:visible nav.portal-examples-group-index-list',
    PAGE     = '.portal-examples-group-page:visible',
    CARDS    = `${PAGE} .portal-examples-list:not(.portal-examples-tiles)`,
    FEATURED = '.portal-examples-overview:visible .portal-examples-overview-cards',
    DARK     = 'neo-theme-neo-dark',
    LIGHT    = 'neo-theme-neo-light',
    THEMES   = [DARK, LIGHT];

/**
 * @summary Boots the Portal's examples section on a stored theme, with its links set to open the local devmode
 * build.
 * @param {Object} page
 * @param {Object} neuralLink
 * @param {String} theme
 * @returns {Promise<Object>} The bound Neural Link app.
 */
async function bootCatalog(page, neuralLink, theme) {
    await page.addInitScript(value => window.localStorage.setItem('portalTheme', value), theme);
    await page.goto(`${PORTAL}#/examples/devmode`);

    const app = await neuralLink.connectToApp('Portal');

    await expect(page.locator('.neo-viewport').first()).toHaveClass(new RegExp(`\\b${theme}\\b`));
    return app
}

/**
 * @summary Opens a group through the left rail.
 * @param {Object} page
 * @param {String} name The group's title
 * @returns {Promise<void>}
 */
async function openGroup(page, name) {
    await page.locator(SIDEBAR).getByRole('link', {name: new RegExp(`^${name}, `)}).click();
    await expect(page.locator(PAGE).filter({has: page.getByRole('heading', {level: 1, name, exact: true})})).toBeVisible()
}

/**
 * @summary Opens a card's link in a page of its own and reads the theme its viewport starts in. The link names
 * neomjs.com; its path, query and hash open on this test server.
 * @param {Object} context
 * @param {String} href
 * @returns {Promise<String|undefined>}
 */
async function startThemeOf(context, href) {
    const {hash, pathname, search} = new URL(href),
          example                  = await context.newPage(),
          viewport                 = example.locator('.neo-viewport').first(),
          response                 = await example.goto(pathname + search + hash);

    expect(response?.status(), href).toBe(200);
    await expect(viewport).toHaveClass(/\bneo-theme-/);

    const theme = (await viewport.getAttribute('class')).split(/\s+/).find(cls => THEMES.includes(cls));

    await example.close();
    return theme
}

test.describe('Examples catalog: an example opens on the catalog\'s theme', () => {
    for (const theme of THEMES) {
        test(`Overview and SearchResults lists keep overflow visible so bottom rings and shadows stay unclipped in ${theme}`, async ({page, neuralLink}) => {
            await page.setViewportSize({width: 1440, height: 900});
            await bootCatalog(page, neuralLink, theme);

            const overviewCards = page.locator(`${FEATURED} > ul.portal-examples-list`);
            await expect(overviewCards.locator('.neo-list-item').last()).toBeVisible();

            const overviewStyle = await page.locator(FEATURED).evaluate(wrapper => {
                const ul = wrapper.querySelector(':scope > ul.portal-examples-list'),
                      ws = getComputedStyle(wrapper),
                      us = getComputedStyle(ul);

                return {
                    ulOverflow     : `${us.overflowX}/${us.overflowY}`,
                    ulPadding      : us.padding,
                    wrapperOverflow: `${ws.overflowX}/${ws.overflowY}`
                }
            });

            expect(overviewStyle).toEqual({
                ulOverflow     : 'visible/visible',
                ulPadding      : '0px',
                wrapperOverflow: 'visible/visible'
            });

            const find = page.locator('.portal-examples-sidebar:visible .portal-examples-find-field input');
            await find.fill('date');
            await expect(page.locator('.portal-examples-search-cards .neo-list-item').first()).toBeVisible();
            await expect(page.locator('.portal-examples-search-tiles .neo-list-item').first()).toBeVisible();

            for (const selector of ['.portal-examples-search-cards', '.portal-examples-search-tiles']) {
                const searchStyle = await page.locator(selector).first().evaluate(wrapper => {
                    const ul = wrapper.querySelector(':scope > ul.portal-examples-list'),
                          ws = getComputedStyle(wrapper),
                          us = getComputedStyle(ul);

                    return {
                        ulOverflow     : `${us.overflowX}/${us.overflowY}`,
                        ulPadding      : us.padding,
                        wrapperOverflow: `${ws.overflowX}/${ws.overflowY}`
                    }
                });

                expect(searchStyle, selector).toEqual({
                    ulOverflow     : 'visible/visible',
                    ulPadding      : '4px 0px 0px',
                    wrapperOverflow: 'visible/visible'
                })
            }
        });

        test(`Grid & Table cards open their examples on ${theme}`, async ({page, neuralLink, context}) => {
            await bootCatalog(page, neuralLink, theme);
            await openGroup(page, 'Grid & Table');

            for (const record of ['grid-countries', 'grid-issues', 'table-filtering']) {
                const link = page.locator(`${CARDS} [data-record-id="${record}"] a.neo-title`);

                await expect(link, record).toHaveAttribute('href', new RegExp(`[?&]theme=${theme}(#|$)`));
                expect(await startThemeOf(context, await link.getAttribute('href')), record).toBe(theme)
            }
        })
    }

    test('a record that pins Neo Dark opens on Neo Light from the light catalog', async ({page, neuralLink, context}) => {
        await bootCatalog(page, neuralLink, LIGHT);
        await openGroup(page, 'Scheduler');

        const href = await page.locator(`${CARDS} [data-record-id="scheduler-basic"] a.neo-title`).getAttribute('href');

        expect(new URL(href).searchParams.getAll('theme'), 'the pin is replaced, never doubled').toEqual([LIGHT]);
        expect(await startThemeOf(context, href)).toBe(LIGHT)
    });

    test('the overview\'s actions and cards follow a theme switch without a reload', async ({page, neuralLink}) => {
        const app      = await bootCatalog(page, neuralLink, DARK),
              action   = page.locator('.portal-examples-overview-actions a').first(),
              card     = page.locator(`${FEATURED} [data-record-id="grid-big-data"] a.neo-title`),
              [toggle] = await app.queryComponent({reference: 'theme-switch-button'}, ['id']);

        await page.goto(`${PORTAL}#/examples`);
        await expect(action).toHaveAttribute('href', new RegExp(`[?&]theme=${DARK}$`));
        await expect(card).toHaveAttribute('href', new RegExp(`[?&]theme=${DARK}$`));

        await page.locator(`#${toggle.id}`).click();

        await expect(page.locator('.neo-viewport').first()).toHaveClass(new RegExp(`\\b${LIGHT}\\b`));
        await expect(action).toHaveAttribute('href', new RegExp(`[?&]theme=${LIGHT}$`));
        await expect(card).toHaveAttribute('href', new RegExp(`[?&]theme=${LIGHT}$`));

        const [list] = await app.queryComponent({reference: 'overview-list'}, ['exampleTheme']);

        expect(list.properties.exampleTheme, 'the list holds the Portal\'s theme').toBe(LIGHT)
    });

    test('a card below the first six keeps its loaded cover when the theme switches', async ({page, neuralLink}) => {
        const app      = await bootCatalog(page, neuralLink, DARK),
              [toggle] = await app.queryComponent({reference: 'theme-switch-button'}, ['id']);

        await openGroup(page, 'Grid & Table');

        // The first six cards get their covers at once; the rest load theirs as they scroll into view
        const card  = page.locator(`${CARDS} .neo-list-item`).nth(7),
              cover = () => card.locator('.preview-image').evaluate(node => getComputedStyle(node).backgroundImage);

        await card.scrollIntoViewIfNeeded();
        await expect.poll(cover).toMatch(/^url\(/);

        await page.locator(`#${toggle.id}`).click();

        await expect(page.locator('.neo-viewport').first()).toHaveClass(new RegExp(`\\b${LIGHT}\\b`));
        await expect(card.locator('a.neo-title')).toHaveAttribute('href', new RegExp(`[?&]theme=${LIGHT}(#|$)`));
        expect(await cover(), 'the switch re-points the links and leaves the loaded cover alone').toMatch(/^url\(/)
    })
});

test.describe('Examples that start through resolveStartTheme', () => {
    const examples = [
        {path: 'grid/issues',               control: {selector: '.issues-theme-button i, .issues-theme-button .neo-button-glyph', icon: 'fa-sun'}},
        {path: 'grid/countries',            control: {text: 'Light theme'}},
        {path: 'grid/filtering',            control: {text: 'Light theme'}},
        {path: 'grid/export',               control: {text: 'Light theme'}},
        {path: 'grid/serverSide',           control: {text: 'Light theme'}},
        {path: 'grid/headerGroups',         control: {text: 'Light theme'}},
        {path: 'grid/cellTypes',            control: {text: 'Light theme'}},
        {path: 'grid/pinnedColumns',        control: {text: 'Light theme'}},
        {path: 'grid/streaming',            control: {text: 'Light theme'}},
        {path: 'tableFiltering',            control: {text: 'Light theme'}},
        {path: 'list/reorder',              control: {text: 'Neo Light'}},
        {path: 'code/livePreview',          control: {text: 'Light theme'}},
        {path: 'component/sparkline',       control: {text: 'Neo Light'}},
        {path: 'component/wrapper/mermaid', control: {text: 'Neo Light'}}
    ];

    for (const {path, control} of examples) {
        test(`${path} starts on the theme its link names, offers the other one, and starts light without one`, async ({page}) => {
            const viewport = page.locator('.neo-viewport').first();

            await page.goto(`/examples/${path}/index.html?theme=${DARK}`);
            await expect(viewport).toHaveClass(new RegExp(`\\b${DARK}\\b`));

            const button = control.text
                ? page.locator('.neo-button, .neo-themeswitcher').filter({hasText: control.text}).first()
                : page.locator('.issues-theme-button');

            await expect(button, 'a dark start offers the light theme').toBeVisible();
            control.icon && await expect(page.locator(control.selector).first()).toHaveClass(new RegExp(control.icon));

            await button.click();
            await expect(viewport, 'one click still switches').toHaveClass(new RegExp(`\\b${LIGHT}\\b`));

            await page.goto(`/examples/${path}/index.html`);
            await expect(viewport, 'no parameter, a light system: the start of today').toHaveClass(new RegExp(`\\b${LIGHT}\\b`))
        })
    }
});

test.describe('Dual-theme examples that list Neo Dark first', () => {
    const paths = [
        'examples/toolbar/breadcrumb',
        'examples/menu/contextFiles',
        'apps/form',
        'examples/dashboard/crossWindow',
        'examples/dashboard/tearOut'
    ];

    for (const path of paths) {
        test(`${path} starts on Neo Light from a light link and on Neo Dark from a dark one`, async ({page}) => {
            const viewport = page.locator('.neo-viewport').first();

            await page.goto(`/${path}/index.html?theme=${LIGHT}`);
            await expect(viewport, 'a light link opens light, not on the first configured theme').toHaveClass(new RegExp(`\\b${LIGHT}\\b`));

            // The same context loads again with the opposite request; a SharedWorker example must follow its own link
            await page.goto(`/${path}/index.html?theme=${DARK}`);
            await expect(viewport, 'a dark link opens dark').toHaveClass(new RegExp(`\\b${DARK}\\b`))
        })
    }
});

/**
 * @summary Stubs external network assets used by `apps/covid` so tests stay deterministic and offline-safe.
 * @param {import('@playwright/test').Page} page
 */
async function stubExternalCovidAssets(page) {
    await page.context().route('https://disease.sh/**', route => route.fulfill({
        json: [{
            active  : 1, cases: 10, casesPerOneMillion: 1, country: 'USA', countryInfo: {iso3: 'USA', lat: 38, long: -97},
            critical: 1, deaths: 1, recovered: 9, tests: 100, testsPerOneMillion: 10, todayCases: 0, todayDeaths: 0,
            updated : 1700000000000
        }]
    }));
    await page.context().route('https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static/all.json', route => route.fulfill({
        json: {active: 1, cases: 10, deaths: 1, recovered: 9, updated: 1700000000000}
    }));
    await page.context().route('https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/data/cvid_static_countries.json', route => route.fulfill({
        json: [{
            active  : 1, cases: 10, casesPerOneMillion: 1, country: 'USA', countryInfo: {iso3: 'USA', lat: 38, long: -97},
            critical: 1, deaths: 1, recovered: 9, tests: 100, testsPerOneMillion: 10, todayCases: 0, todayDeaths: 0
        }]
    }));
    await page.context().route('https://raw.githubusercontent.com/neomjs/pages/main/resources_pub/images/**', route => route.fulfill({
        body: '', contentType: 'image/jpeg', status: 200
    }));
    await page.context().route('https://buttons.github.io/**', route => route.fulfill({
        body: '', contentType: 'application/javascript', status: 200
    }));
    await page.context().route('https://api.mapbox.com/mapbox-gl-js/**/*.css', route => route.fulfill({
        body: '', contentType: 'text/css', status: 200
    }));
    await page.context().route('https://api.mapbox.com/mapbox-gl-js/**/*.js', route => route.fulfill({
        body       : 'window.mapboxgl={accessToken:"",Map:class{addLayer(){}addSource(){}flyTo(){}getSource(){return null}getStyle(){return{layers:[]}}loaded(){return true}on(){}once(){}remove(){}resize(){}setCenter(){}setFilter(){}setLayoutProperty(){}setPaintProperty(){}setZoom(){}}};',
        contentType: 'application/javascript',
        status     : 200
    }));
    await page.context().route('https://api.mapbox.com/styles/**', route => route.fulfill({
        json: {layers: []}
    }))
}

/**
 * @summary Polls `app.queryComponent` until the first matching component exists and returns its serialized `properties`.
 * @param {Object} app
 * @param {Object} selector
 * @param {String[]} properties
 * @returns {Promise<Object>}
 */
async function queryProps(app, selector, properties) {
    let props = null;

    await expect.poll(async () => {
        const matches = await app.queryComponent(selector, properties);

        props = Array.isArray(matches) ? matches[0]?.properties : null;
        return Boolean(props)
    }).toBe(true);

    return props
}

/**
 * @summary Asserts that the App Worker viewport `getTheme()`, `.neo-viewport`, and `document.body` carry `expectedTheme`
 * with no competing `neo-theme-*` class.
 * @param {import('@playwright/test').Page} page
 * @param {Object} app
 * @param {String} viewportId
 * @param {String} expectedTheme
 * @param {String} label
 */
async function expectAlignedTheme(page, app, viewportId, expectedTheme, label) {
    await expect.poll(() => app.callMethod(viewportId, 'getTheme', []), `${label}: worker getTheme()`).toBe(expectedTheme);

    await expect.poll(() => page.evaluate(id => {
        const vpEl       = document.getElementById(id),
              bodyThemes = [...document.body.classList].filter(c => c.startsWith('neo-theme-')),
              vpThemes   = [...(vpEl?.classList || [])].filter(c => c.startsWith('neo-theme-'));

        return {bodyThemes, vpThemes}
    }, viewportId), `${label}: body and viewport theme classes`).toEqual({
        bodyThemes: [expectedTheme],
        vpThemes  : [expectedTheme]
    })
}

const CUSTOM_TOGGLE_EXAMPLES = [{
    appName      : 'Neo.examples.calendar.basic',
    darkTheme    : 'neo-theme-dark',
    lightTheme   : 'neo-theme-light',
    name         : 'calendar/basic',
    url          : '/examples/calendar/basic/index.html',
    assertControl: async (page, app, expectedTheme) => {
        const isDark = expectedTheme === 'neo-theme-dark',
              btn    = await queryProps(app, {reference: 'theme-button'}, ['iconCls', 'text']),
              bar    = await queryProps(app, {reference: 'headerToolbar'}, ['style']);

        expect(btn.text).toBe(isDark ? 'Theme Light' : 'Theme Dark');
        expect(btn.iconCls).toBe(isDark ? 'fa fa-sun' : 'fa fa-moon');
        expect(bar.style.backgroundColor).toBe(isDark ? '#33343d' : '#f2f2f2')
    },
    triggerSwitch: async page => {
        await page.locator('.neo-button', {hasText: /Theme (Light|Dark)/}).click()
    }
}, {
    appName      : 'Neo.examples.dialog',
    darkTheme    : DARK,
    lightTheme   : LIGHT,
    name         : 'dialog',
    url          : '/examples/dialog/index.html',
    assertControl: async (page, app, expectedTheme, {expectOpenDialog = false} = {}) => {
        const expectedLabel = expectedTheme === DARK ? 'Neo Dark' : 'Neo Light',
              switcher      = await queryProps(app, {ntype: 'theme-switcher'}, ['ariaLabel', 'text']);

        expect(switcher.text).toBe(expectedLabel);
        expect(switcher.ariaLabel).toBe(`Theme: ${expectedLabel}`);

        if (expectOpenDialog) {
            const dialog = page.locator('.neo-dialog');

            await expect(dialog).toBeVisible();
            await expect(dialog).toHaveClass(new RegExp(`\\b${expectedTheme}\\b`))
        }
    },
    triggerSwitch: async (page, targetTheme) => {
        if (await page.locator('.neo-dialog-modal-mask').isVisible()) {
            await expect(page.locator('.neo-dialog input[name="name"]')).toBeFocused();
            await page.keyboard.press('Escape');
            await expect(page.locator('.neo-dialog')).toHaveCount(0)
        }

        const label = targetTheme === DARK ? 'Neo Dark' : 'Neo Light',
              menu  = page.locator('.neo-themeswitcher-menu');

        await page.locator('.neo-themeswitcher').first().click();
        await expect(menu).toBeVisible();
        await menu.getByRole('menuitemradio', {name: label, exact: true}).click()
    }
}, {
    appName      : 'Covid',
    darkTheme    : 'neo-theme-dark',
    hash         : '#mainview=mapboxglmap',
    lightTheme   : 'neo-theme-light',
    name         : 'apps/covid',
    url          : '/apps/covid/index.html',
    assertControl: async (page, app, expectedTheme) => {
        const isLight = expectedTheme === 'neo-theme-light',
              btn     = await queryProps(app, {reference: 'theme-button'}, ['iconCls', 'text']),
              map     = await queryProps(app, {reference: 'mapboxglmap'}, ['mapboxStyle', 'mapboxStyleDark', 'mapboxStyleLight']);

        expect(btn.text).toBe(isLight ? 'Theme Dark' : 'Theme Light');
        expect(btn.iconCls).toBe(isLight ? 'fa fa-moon' : 'fa fa-sun');
        expect(map.mapboxStyle).toBe(isLight ? map.mapboxStyleLight : map.mapboxStyleDark);
        await expect(page.locator('.covid-header-container img')).toHaveAttribute(
            'src',
            new RegExp(isLight ? 'covid_logo_light\\.jpg$' : 'covid_logo_dark\\.jpg$')
        )
    },
    triggerSwitch: async page => {
        await page.locator('.neo-button', {hasText: /Theme (Light|Dark)/}).click()
    }
}, {
    appName      : 'Neo.examples.grid.bigData',
    darkTheme    : 'neo-theme-dark',
    lightTheme   : 'neo-theme-light',
    name         : 'grid/bigData',
    url          : '/examples/grid/bigData/index.html',
    assertControl: async (page, app, expectedTheme) => {
        const isLight    = expectedTheme === 'neo-theme-light',
              darkRadio  = await queryProps(app, {reference: 'theme-dark-radio'},  ['checked']),
              lightRadio = await queryProps(app, {reference: 'theme-light-radio'}, ['checked']);

        expect(darkRadio.checked).toBe(!isLight);
        expect(lightRadio.checked).toBe(isLight)
    },
    triggerSwitch: async (page, targetTheme) => {
        const controls = page.locator('.neo-examples-bigdata-controls-container');

        if (!(await controls.evaluate(el => el.classList.contains('neo-expanded')))) {
            await page.locator('.controls-container-button').click();
            await expect(page.locator('.neo-viewport')).toHaveClass(/\bneo-controls-expanded\b/)
        }

        const label = targetTheme === 'neo-theme-light' ? 'Light' : 'Dark';

        await controls.locator('.neo-radiofield').filter({hasText: label}).click()
    }
}, {
    appName      : 'Neo.examples.grid.treeBigData',
    darkTheme    : 'neo-theme-dark',
    lightTheme   : 'neo-theme-light',
    name         : 'grid/treeBigData',
    url          : '/examples/grid/treeBigData/index.html',
    assertControl: async (page, app, expectedTheme) => {
        const isLight    = expectedTheme === 'neo-theme-light',
              darkRadio  = await queryProps(app, {reference: 'theme-dark-radio'},  ['checked']),
              lightRadio = await queryProps(app, {reference: 'theme-light-radio'}, ['checked']);

        expect(darkRadio.checked).toBe(!isLight);
        expect(lightRadio.checked).toBe(isLight)
    },
    triggerSwitch: async (page, targetTheme) => {
        const controls = page.locator('.neo-examples-treebigdata-controls-container');

        if (!(await controls.evaluate(el => el.classList.contains('neo-expanded')))) {
            await page.locator('.controls-container-button').click();
            await expect(page.locator('.neo-viewport')).toHaveClass(/\bneo-controls-expanded\b/)
        }

        const label = targetTheme === 'neo-theme-light' ? 'Light' : 'Dark';

        await controls.locator('.neo-radiofield').filter({hasText: label}).click()
    }
}, {
    appName      : 'Neo.examples.grid.nestedRecordFields',
    darkTheme    : 'neo-theme-dark',
    lightTheme   : 'neo-theme-light',
    name         : 'grid/nestedRecordFields',
    url          : '/examples/grid/nestedRecordFields/index.html',
    assertControl: async (page, app, expectedTheme) => {
        const isLight = expectedTheme === 'neo-theme-light',
              btn     = await queryProps(app, {reference: 'theme-button'}, ['iconCls', 'text']);

        expect(btn.text).toBe(isLight ? 'Dark Theme' : 'Light Theme');
        expect(btn.iconCls).toBe(isLight ? 'fa fa-moon' : 'fas fa-sun')
    },
    triggerSwitch: async page => {
        await page.locator('.neo-button', {hasText: /(Light|Dark) Theme/}).click()
    }
}];

test.describe('Examples with custom theme toggles (#21973)', () => {
    test.beforeEach(async ({page, neuralLink}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.emulateMedia({reducedMotion: 'reduce'});
        await stubExternalCovidAssets(page);
        await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}))
    });

    for (const example of CUSTOM_TOGGLE_EXAMPLES) {
        test(`${example.name} honors dark and light catalog launches and switches cleanly on the first action`, async ({page, neuralLink}) => {
            const hash     = example.hash || '',
                  isDialog = example.name === 'dialog';

            // 1. Dark catalog launch (?theme=neo-theme-neo-dark) -> first switch to light
            await page.goto(`${example.url}?theme=${DARK}${hash}`);
            const darkViewportId = await page.locator('.neo-viewport').first().getAttribute('id');
            expect(darkViewportId).toBeTruthy();

            const darkApp = await neuralLink.connectToApp(example.appName);
            await expectAlignedTheme(page, darkApp, darkViewportId, example.darkTheme, `${example.name} dark launch`);
            await example.assertControl(page, darkApp, example.darkTheme, {expectOpenDialog: isDialog});

            await example.triggerSwitch(page, example.lightTheme);
            await expectAlignedTheme(page, darkApp, darkViewportId, example.lightTheme, `${example.name} dark->light first switch`);
            await example.assertControl(page, darkApp, example.lightTheme);

            // 2. Light catalog launch (?theme=neo-theme-neo-light) -> first switch to dark
            await page.goto(`${example.url}?theme=${LIGHT}${hash}`);
            const lightViewportId = await page.locator('.neo-viewport').first().getAttribute('id');
            expect(lightViewportId).toBeTruthy();

            const lightApp = await neuralLink.connectToApp(example.appName);
            await expectAlignedTheme(page, lightApp, lightViewportId, example.lightTheme, `${example.name} light launch`);
            await example.assertControl(page, lightApp, example.lightTheme, {expectOpenDialog: isDialog});

            await example.triggerSwitch(page, example.darkTheme);
            await expectAlignedTheme(page, lightApp, lightViewportId, example.darkTheme, `${example.name} light->dark first switch`);
            await example.assertControl(page, lightApp, example.darkTheme)
        })
    }

    test('examples/dialog default launch switches viewport, document.body, and an open editor on the first selection', async ({page, neuralLink}) => {
        await page.goto('/examples/dialog/index.html');
        await expect(page.locator('.neo-dialog input[name="name"]')).toBeFocused();

        const viewportId = await page.locator('.neo-viewport').first().getAttribute('id'),
              app        = await neuralLink.connectToApp('Neo.examples.dialog'),
              startTheme = await app.callMethod(viewportId, 'getTheme', []),
              nextTheme  = startTheme === DARK ? LIGHT : DARK,
              nextLabel  = nextTheme === DARK ? 'Neo Dark' : 'Neo Light';

        await expectAlignedTheme(page, app, viewportId, startTheme, 'dialog default launch');
        await expect(page.locator('.neo-dialog')).toHaveClass(new RegExp(`\\b${startTheme}\\b`));

        // Re-open the editor with Modal unchecked so the open dialog stays mounted while switching theme
        await page.keyboard.press('Escape');
        await expect(page.locator('.neo-dialog')).toHaveCount(0);
        await page.locator('.neo-checkboxfield').filter({hasText: 'Modal'}).click();
        await page.getByRole('button', {name: 'Edit selected contact', exact: true}).click();
        await expect(page.locator('.neo-dialog')).toBeVisible();
        await expect(page.locator('.neo-dialog')).toHaveClass(new RegExp(`\\b${startTheme}\\b`));

        const menu = page.locator('.neo-themeswitcher-menu');
        await page.locator('.neo-themeswitcher').first().click();
        await expect(menu).toBeVisible();
        await menu.getByRole('menuitemradio', {name: nextLabel, exact: true}).click();

        await expectAlignedTheme(page, app, viewportId, nextTheme, 'dialog default first switch');
        await expect(page.locator('.neo-dialog')).toHaveClass(new RegExp(`\\b${nextTheme}\\b`))
    })
});
