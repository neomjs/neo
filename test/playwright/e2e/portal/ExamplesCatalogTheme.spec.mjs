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
                ? page.locator('.neo-button, .neo-theme-switcher').filter({hasText: control.text}).first()
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
