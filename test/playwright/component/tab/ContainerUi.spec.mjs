import {test, expect} from '@playwright/test';

const THEMES = [
    'neo-theme-light',
    'neo-theme-dark',
    'neo-theme-neo-light',
    'neo-theme-neo-dark'
];

const EXPECTED = {
    'neo-theme-light': {
        actionSize: '20px',
        gradient  : false,
        inline    : {height: '25px', padding: '7px 10px 6px', radius: '0px'},
        null      : {height: '25px', padding: '7px 12px 6px', radius: '0px'},
        standalone: {height: '40px', padding: '7px 16px 6px', radius: '8px'},
        textColor : 'rgb(43, 43, 43)'
    },
    'neo-theme-dark': {
        actionSize: '20px',
        gradient  : false,
        inline    : {height: '25px', padding: '7px 10px 6px', radius: '0px'},
        null      : {height: '25px', padding: '7px 12px 6px', radius: '0px'},
        standalone: {height: '40px', padding: '7px 16px 6px', radius: '8px'},
        textColor : 'rgb(187, 187, 187)'
    },
    'neo-theme-neo-light': {
        actionSize: '24px',
        gradient  : true,
        inline    : {height: '32px', padding: '4px 12px 3px', radius: '0px'},
        null      : {height: '48px', padding: '7px 16px 6px', radius: '8px'},
        standalone: {height: '48px', padding: '7px 16px 6px', radius: '8px'},
        textColor : 'rgb(69, 75, 66)'
    },
    'neo-theme-neo-dark': {
        actionSize: '24px',
        gradient  : true,
        inline    : {height: '32px', padding: '4px 12px 3px', radius: '0px'},
        null      : {height: '48px', padding: '7px 16px 6px', radius: '8px'},
        standalone: {height: '48px', padding: '7px 16px 6px', radius: '8px'},
        textColor : 'rgb(153, 162, 149)'
    }
};

let componentIds = [];

/** Links the four tab value layers into the persistent component-test document. */
async function loadThemeStylesheets(page) {
    const hrefs = THEMES.flatMap(theme => {
        const directory = theme.replace('neo-theme-', 'theme-'),
              files     = [
                  `/dist/development/css/${directory}/button/Base.css`,
                  `/dist/development/css/${directory}/tab/Container.css`,
                  `/dist/development/css/${directory}/tab/Strip.css`,
                  `/dist/development/css/${directory}/tab/header/Button.css`,
                  `/dist/development/css/${directory}/toolbar/Base.css`
              ];

        if (theme.includes('neo-light') || theme.includes('neo-dark')) {
            files.unshift(
                `/dist/development/css/${directory}/design-tokens/Core.css`,
                `/dist/development/css/${directory}/design-tokens/Semantic.css`,
                `/dist/development/css/${directory}/design-tokens/Component.css`
            )
        }

        return files
    });

    await page.evaluate(async hrefs => {
        for (const href of hrefs) {
            const link = document.createElement('link');

            link.rel  = 'stylesheet';
            link.href = href;

            await new Promise((resolve, reject) => {
                link.onload  = resolve;
                link.onerror = () => reject(new Error(`stylesheet did not load: ${href}`));
                document.head.appendChild(link)
            })
        }
    }, hrefs)
}

/** Creates the three contract variants as side-by-side real browser components. */
async function createVariants(page) {
    componentIds = await page.evaluate(async () => {
        const variants = [
            {id: 'tab-ui-default',       label: 'Theme default', left: 0},
            {id: 'tab-ui-null',          label: 'Theme default', left: 290, setUi: true, ui: null},
            {id: 'tab-ui-inline',        label: 'Inline',        left: 580, setUi: true, ui: 'inline'},
            {id: 'tab-ui-standalone',    label: 'Standalone',    left: 870, setUi: true, ui: 'standalone'}
        ];

        const ids = [];

        for (const variant of variants) {
            const bodyItem = variant.ui === 'inline' ? {
                activeIndex: 0,
                header     : {text: variant.label},
                id         : 'tab-ui-nested-null',
                items      : [{
                    header: {text: 'Nested theme default'},
                    ntype : 'component',
                    text  : 'Nested theme default body'
                }],
                ntype: 'tab-container'
            } : {
                header: {text: variant.label},
                ntype : 'component',
                text  : `${variant.label} body`
            };

            const config = {
                activeIndex: 0,
                height     : 170,
                id         : variant.id,
                importPath : '../tab/Container.mjs',
                items      : [bodyItem],
                ntype      : 'tab-container',
                parentId   : 'component-test-viewport',
                style      : {
                    left    : `${variant.left}px`,
                    position: 'absolute',
                    top     : '0px'
                },
                width: 280
            };

            variant.setUi && (config.ui = variant.ui);

            if (variant.ui === 'inline') {
                config.headerActions = [{
                    action : 'pin',
                    iconCls: 'fa fa-thumbtack'
                }, {
                    action     : 'close',
                    iconCls    : 'fa fa-times',
                    showOnFocus: false
                }]
            }

            const result = await Neo.worker.App.createNeoInstance(config);

            if (!result.success) {
                throw new Error(`TabContainer creation failed: ${result.error.message}`)
            }

            ids.push(result.id)
        }

        // CSS-scope negative control. This is deliberately page-realm DOM: the property under test
        // is whether the tab-header ancestor selector leaks onto an otherwise ordinary action root,
        // not another Toolbar construction path.
        const ordinaryToolbar = document.createElement('div');

        ordinaryToolbar.id        = 'tab-ui-ordinary-toolbar';
        ordinaryToolbar.className = 'neo-toolbar';
        ordinaryToolbar.innerHTML = '<button aria-label="ordinary action" ' +
            'class="neo-button neo-toolbar-action"><span class="fa fa-star neo-button-glyph"></span></button>';
        document.body.appendChild(ordinaryToolbar);

        return ids
    });

    await Promise.all(componentIds.map(id => page.waitForSelector(`#${id}`, {state: 'attached'})))
}

/** Replaces the active document theme without retaining a competing theme ancestor. */
const applyTheme = (page, theme) => page.evaluate(name => {
    for (const element of [document.body, document.documentElement]) {
        element.classList.forEach(cls => cls.startsWith('neo-theme-') && element.classList.remove(cls))
    }

    document.body.classList.add(name);

    return document.body.className
}, theme);

/** Reads the concrete header paint rather than accepting a loaded stylesheet as evidence. */
const readVariant = (page, id) => page.evaluate(componentId => {
    const root    = document.getElementById(componentId),
          button  = root.querySelector('.neo-tab-header-button'),
          toolbar = root.querySelector('.neo-tab-header-toolbar'),
          style   = getComputedStyle(button);

    return {
        backgroundImage: getComputedStyle(toolbar).backgroundImage,
        cls            : [...root.classList],
        height         : style.height,
        padding        : style.padding,
        radius         : style.borderRadius,
        textColor      : getComputedStyle(button.querySelector('.neo-button-text')).color
    }
}, id);

/** @summary Reads concrete action paint and geometry rather than treating selector presence as evidence. */
const readActionChrome = action => action.evaluate(node => {
    const
        glyph = node.querySelector('.neo-button-glyph'),
        style = getComputedStyle(node);

    return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        border         : style.border,
        glyphColor     : getComputedStyle(glyph).color,
        height         : style.height,
        padding        : style.padding,
        radius         : style.borderRadius,
        visibility     : style.visibility,
        width          : style.width
    }
});

/** A generated-id-independent DOM signature for the omitted-vs-explicit-null regression control. */
const readDomSignature = (page, id) => page.evaluate(componentId => {
    const visit = element => ({
        children: [...element.children].map(visit),
        cls     : [...element.classList].filter(cls => !cls.startsWith('neo-theme-')).sort(),
        tag     : element.tagName
    });

    return visit(document.getElementById(componentId))
}, id);

test.describe('Neo.tab.Container — ui variants', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
        await loadThemeStylesheets(page);
        await createVariants(page)
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(async ids => {
            for (const id of ids) {
                await Neo.worker.App.destroyNeoInstance(id)
            }

            document.getElementById('tab-ui-ordinary-toolbar')?.remove()
        }, componentIds);

        componentIds = []
    });

    for (const theme of THEMES) {
        test(`${theme}: null stays current while inline and standalone are intentional`, async ({page}, testInfo) => {
            await applyTheme(page, theme);
            expect(await page.evaluate(name => document.body.classList.contains(name), theme)).toBe(true);

            const
                inlineToolbar = page.locator('#tab-ui-inline > .neo-tab-header-toolbar'),
                // Role locators deliberately exclude the aria-hidden gated action. The concrete
                // action root is the geometry carrier this assertion needs to observe while quiet.
                gatedAction   = inlineToolbar.locator('.neo-toolbar-action[aria-label="pin"]'),
                closeAction   = inlineToolbar.locator('.neo-toolbar-action[aria-label="close"]'),
                ordinary     = page.locator('#tab-ui-ordinary-toolbar .neo-toolbar-action');

            await expect(gatedAction).toHaveClass(/neo-toolbar-action-context-inactive/);

            const gatedBox = await gatedAction.boundingBox();

            await inlineToolbar.locator('.neo-tab-header-button').first().focus();
            await expect(gatedAction).not.toHaveClass(/neo-toolbar-action-context-inactive/);
            await expect(gatedAction).toBeVisible();
            await expect(closeAction).toBeVisible();

            const exposedBox = await gatedAction.boundingBox();

            // A gated action is collapsed OUT of the layout, so while quiet it has no box at all.
            // The superseded contract preserved the box and left a hole in the rail between the
            // actions actually on offer; revealing an action now grows the cluster instead of
            // filling a slot that was already paid for.
            expect(gatedBox,   'a gated action occupies no space').toBeNull();
            expect(exposedBox, 'revealing it gives it a box').not.toBeNull();

            const measured = {
                default   : await readVariant(page, 'tab-ui-default'),
                inline    : await readVariant(page, 'tab-ui-inline'),
                null      : await readVariant(page, 'tab-ui-null'),
                standalone: await readVariant(page, 'tab-ui-standalone')
            };

            const expectedDefaultClasses = [
                'neo-flex-align-stretch',
                'neo-flex-container',
                'neo-flex-direction-column',
                'neo-flex-pack-start',
                'neo-flex-wrap-nowrap',
                'neo-tab-container',
                'neo-tab-container-plain',
                'neo-top'
            ];

            expect(measured.default.cls.filter(cls => !cls.startsWith('neo-theme-')).sort())
                .toEqual(expectedDefaultClasses);
            expect(measured.null.cls.filter(cls => !cls.startsWith('neo-theme-')).sort())
                .toEqual(expectedDefaultClasses);
            expect(measured.null.cls).not.toContain('neo-tab-container-inline');
            expect(measured.null.cls).not.toContain('neo-tab-container-standalone');
            expect(measured.inline.cls).toContain('neo-tab-container-inline');
            expect(measured.standalone.cls).toContain('neo-tab-container-standalone');

            for (const variant of ['inline', 'null', 'standalone']) {
                expect(measured[variant]).toMatchObject({
                    ...EXPECTED[theme][variant],
                    textColor: EXPECTED[theme].textColor
                })
            }

            expect(measured.default).toMatchObject({
                ...EXPECTED[theme].null,
                textColor: EXPECTED[theme].textColor
            });
            expect(await readDomSignature(page, 'tab-ui-null'))
                .toEqual(await readDomSignature(page, 'tab-ui-default'));

            expect(measured.inline.height).not.toBe(measured.standalone.height);
            expect(measured.inline.radius).not.toBe(measured.standalone.radius);

            const
                restChrome     = await readActionChrome(closeAction),
                ordinaryChrome = await readActionChrome(ordinary);

            expect(restChrome).toMatchObject({
                backgroundColor: 'rgba(0, 0, 0, 0)',
                backgroundImage: 'none',
                height         : EXPECTED[theme].actionSize,
                padding        : '0px',
                width          : EXPECTED[theme].actionSize
            });
            expect(ordinaryChrome.padding, 'ordinary toolbar actions keep stock button chrome')
                .not.toBe('0px');

            EXPECTED[theme].gradient
                ? expect(measured.inline.backgroundImage).toContain('linear-gradient')
                : expect(measured.inline.backgroundImage).toBe('none');

            await closeAction.hover();
            expect((await readActionChrome(closeAction)).backgroundColor)
                .not.toBe('rgba(0, 0, 0, 0)');

            await testInfo.attach(`${theme}-tab-ui-comparison.json`, {
                body       : Buffer.from(JSON.stringify({measured, ordinaryChrome, restChrome}, null, 2)),
                contentType: 'application/json'
            });
            await testInfo.attach(`${theme}-tab-ui-comparison.png`, {
                body       : await page.screenshot({clip: {height: 260, width: 1180, x: 0, y: 0}}),
                contentType: 'image/png'
            })
        })
    }

    test('the inline gradient hook is theme-valued, overridable and cannot leak to ui:null', async ({page}) => {
        await applyTheme(page, 'neo-theme-neo-light');

        const before = {
            default: await readVariant(page, 'tab-ui-default'),
            inline : await readVariant(page, 'tab-ui-inline'),
            nested : await readVariant(page, 'tab-ui-nested-null'),
            null   : await readVariant(page, 'tab-ui-null')
        };

        expect(before.default.backgroundImage).toBe('none');
        expect(before.inline.backgroundImage).toContain('linear-gradient');
        expect(before.nested).toMatchObject({
            backgroundImage: 'none',
            height         : '48px',
            radius         : '8px'
        });
        expect(before.null.backgroundImage).toBe('none');

        const after = await page.evaluate(() => {
            const gradient = 'linear-gradient(rgb(1, 2, 3), rgb(4, 5, 6))';

            // A consumer root is the broadest supported owner. The direct-child selector must paint
            // the inline header but neither a sibling nor a nested ui:null header.
            document.body.style.setProperty('--tab-header-inline-background-image', gradient);

            return {
                default: getComputedStyle(document.querySelector('#tab-ui-default > .neo-tab-header-toolbar')).backgroundImage,
                inline : getComputedStyle(document.querySelector('#tab-ui-inline > .neo-tab-header-toolbar')).backgroundImage,
                nested : getComputedStyle(document.querySelector('#tab-ui-nested-null > .neo-tab-header-toolbar')).backgroundImage,
                null   : getComputedStyle(document.querySelector('#tab-ui-null > .neo-tab-header-toolbar')).backgroundImage
            }
        });

        expect(after.default).toBe('none');
        expect(after.inline).toContain('linear-gradient');
        expect(after.nested).toBe('none');
        expect(after.null).toBe('none')
    });

    test('a runtime ui change replaces the previous modifier class', async ({page}) => {
        const root = page.locator('#tab-ui-inline');

        await expect(root).toHaveClass(/neo-tab-container-inline/);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, ui: 'standalone'}), 'tab-ui-inline');

        await expect(root).toHaveClass(/neo-tab-container-standalone/);
        await expect(root).not.toHaveClass(/neo-tab-container-inline/);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, ui: null}), 'tab-ui-inline');

        await expect(root).not.toHaveClass(/neo-tab-container-inline|neo-tab-container-standalone/)
    })
});
