import {test, expect} from '@playwright/test';

/**
 * @summary A select with its label left: the label stands beside the select, and an error under the select. A unit
 * spec cannot see this, since `Select.css` lays out the columns.
 */
test.describe('Neo.form.field.Select', () => {
    let componentId = null;

    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        componentId && await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
        componentId = null
    });

    test('with its label left, the label stands beside the select and an error under the select', async ({page}) => {
        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath   : '../form/field/Select.mjs',
            ntype        : 'selectfield',
            parentId     : 'component-test-viewport',
            error        : 'Pick a room',
            labelPosition: 'left',
            labelText    : 'Room',
            options      : ['Hygiene 1', 'Hygiene 2'],
            width        : 400
        }));

        expect(result.success).toBe(true);
        componentId = result.id;

        const field = page.locator(`#${componentId}`);

        await expect(field.locator('.neo-selectfield-error')).toHaveText('Pick a room');

        const [label, select, error] = await Promise.all(
            ['.neo-selectfield-label', '.neo-selectfield-input', '.neo-selectfield-error'].map(selector => field.locator(selector).boundingBox())
        );

        expect(Math.round(label.width), 'the label is labelWidth wide').toBe(150);
        expect(Math.abs(select.x - (label.x + label.width)), 'the select starts after the label').toBeLessThanOrEqual(1);
        expect(Math.abs(error.x - select.x), 'the error starts under the select').toBeLessThanOrEqual(1);
        expect(error.y, 'the error is below the select').toBeGreaterThanOrEqual(select.y + select.height - 1)
    });

    test('a percentage labelWidth resolves against the field, and a hidden label leaves no column', async ({page}) => {
        const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
            importPath   : '../form/field/Select.mjs',
            ntype        : 'selectfield',
            parentId     : 'component-test-viewport',
            labelPosition: 'left',
            labelText    : 'Room',
            labelWidth   : '37.5%',
            options      : ['Hygiene 1', 'Hygiene 2'],
            width        : 400
        }));

        expect(result.success).toBe(true);
        componentId = result.id;

        const field  = page.locator(`#${componentId}`),
              label  = await field.locator('.neo-selectfield-label').boundingBox(),
              select = await field.locator('.neo-selectfield-input').boundingBox(),
              box    = await field.boundingBox();

        expect(Math.round(label.width), '37.5% of a 400 px field').toBe(150);
        expect(Math.abs(select.x - (label.x + label.width)), 'the select starts after the label').toBeLessThanOrEqual(1);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, hideLabel: true}), componentId);
        await expect.poll(async () => Math.round((await field.locator('.neo-selectfield-input').boundingBox()).x - box.x), 'the select takes the whole field').toBe(0)
    });

    test('role scopes keep the active Select shape, including the Material focus indicator', async ({page}) => {
        const cases = [
            ['neo-theme-light',          '3px'],
            ['neo-theme-dark',           '0px'],
            ['neo-theme-cyberpunk',      '2px'],
            ['neo-theme-material-light', '23px 23px 0px 0px'],
            ['neo-theme-material-dark',  '23px 23px 0px 0px']
        ];
        await page.route('**/empty-viewport/neo-config.json', async route => {
            const config = await (await route.fetch()).json();
            await route.fulfill({json: {...config, themes: cases.map(([theme]) => theme)}})
        });
        await page.reload();
        await expect(page.locator('#component-test-viewport')).toBeAttached();

        for (const [theme, radius] of cases) {
            const id = await page.evaluate(async theme => {
                const create = async config => {
                    const result = await Neo.worker.App.createNeoInstance(config);
                    if (!result.success) throw new Error(result.error.message);
                    return result.id
                };
                const owner = await create({importPath: '../container/Base.mjs', ntype: 'container', parentId: 'component-test-viewport', theme});
                const scope = await create({importPath: '../container/Base.mjs', ntype: 'container', parentId: owner,
                    cls: ['neo-theme-scope'], style: {'--neo-radius-small': '23px'}});
                return create({importPath: '../form/field/Select.mjs', ntype: 'selectfield', parentId: scope,
                    labelText: 'Room', options: ['One', 'Two'], width: 280})
            }, theme);

            const input = page.locator(`#${id} select`);
            await expect(input, theme).toHaveCSS('border-radius', radius);
            if (theme.startsWith('neo-theme-material-')) {
                await expect(input).toHaveCSS('height', '56px');
                await expect(input).toHaveCSS('border-width', '0px 0px 1px');
                await expect(input).toHaveCSS('background-color', theme.endsWith('dark') ? /^oklch\(0\.33 / : /^oklch\(0\.916 /);
                await input.focus();
                await expect(input).toHaveCSS('border-width', '0px 0px 2px');
                await expect(input).toHaveCSS('height', '56px')
            }
        }

        // The legacy owner is `:root .neo-theme-light`. The document element itself has only the base binding.
        await page.locator('html').evaluate(el => {
            el.classList.add('neo-theme-light');
            el.style.setProperty('--neo-radius-small', '29px')
        });
        await expect(page.locator('html')).toHaveCSS('--neo-selectfield-border-radius', '29px')
    })
});
