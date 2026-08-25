import {test, expect} from '@playwright/test';

let componentId;

async function loadStylesheets(page, hrefs) {
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

async function createChipField(page) {
    const result = await page.evaluate(() => Neo.worker.App.createNeoInstance({
        importPath   : '../form/field/Chip.mjs',
        ntype        : 'chipfield',
        parentId     : 'component-test-viewport',
        displayField : 'name',
        labelPosition: 'top',
        labelText    : 'Tags',
        valueField   : 'id',
        width        : 420,
        store        : {
            keyProperty: 'id',
            model      : {
                fields: [
                    {name: 'id',   type: 'String'},
                    {name: 'name', type: 'String'}
                ]
            },
            data: [
                {id: 'alpha', name: 'Alpha'},
                {id: 'beta',  name: 'Beta'},
                {id: 'gamma', name: 'Gamma'}
            ]
        }
    }));

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    return result.id
}

test.describe('Neo.form.field.Chip', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        componentId = await createChipField(page)
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), componentId);
            componentId = null
        }
    });

    test('native chip buttons remove by pointer and keyboard', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['alpha', 'beta']
        }), componentId);

        const
            field       = page.locator(`#${componentId}`),
            chips       = field.locator('.neo-chip-field-values .neo-chip'),
            removeAlpha = field.getByRole('button', {name: 'Remove Alpha'}),
            removeBeta  = field.getByRole('button', {name: 'Remove Beta'});

        const getValueLength = () => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'value'
        }), componentId).then(value => value.length);

        await expect(chips).toHaveCount(2);
        await expect.poll(getValueLength).toBe(2);

        const closeGlyphStyle = await removeAlpha.evaluate(element => ({
            content   : getComputedStyle(element, '::before').content,
            fontFamily: getComputedStyle(element).fontFamily
        }));

        expect(closeGlyphStyle.fontFamily).toContain('Font Awesome');
        expect(closeGlyphStyle.content).not.toBe('none');
        expect(closeGlyphStyle.content).not.toBe('normal');

        await removeAlpha.focus();
        await expect(removeAlpha).toBeFocused();
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        await page.keyboard.press('Space');
        await expect(chips).toHaveCount(1);
        await expect(removeAlpha).toHaveCount(0);
        await expect.poll(getValueLength).toBe(1);

        await removeBeta.click();
        await expect(chips).toHaveCount(0);
        await expect.poll(getValueLength).toBe(0)
    });

    test('Tab traverses chip buttons in value order before the input', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['alpha', 'beta']
        }), componentId);

        const
            field       = page.locator(`#${componentId}`),
            input       = field.locator('input.neo-textfield-input'),
            removeAlpha = field.getByRole('button', {name: 'Remove Alpha'}),
            removeBeta  = field.getByRole('button', {name: 'Remove Beta'});

        await removeAlpha.focus();
        await page.keyboard.press('Tab');
        await expect(removeBeta).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(input).toBeFocused()
    });

    test('picker toggles several values, filters, and Backspace removes the last chip', async ({page}) => {
        const
            field = page.locator(`#${componentId}`),
            input = field.locator('input.neo-textfield-input'),
            chips = field.locator('.neo-chip-field-values .neo-chip');

        await input.focus();
        await page.keyboard.press('ArrowDown');

        const picker = page.locator('.neo-picker-container');

        await expect(picker).toBeVisible();
        await expect(picker.locator('.neo-list-item')).toHaveCount(3);
        await expect(picker.locator('.neo-list')).toHaveAttribute('aria-multiselectable', 'true');

        const alpha = picker.locator('.neo-list-item', {hasText: 'Alpha'});

        await expect(input).toHaveAttribute('aria-activedescendant', /.+/);
        await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'activeRecordId'
        }), componentId)).toBe('alpha');
        await page.keyboard.press('Enter');
        await expect(picker).toBeVisible();
        await expect(chips).toHaveCount(1);
        await expect(alpha).toHaveAttribute('aria-selected', 'true');

        await page.keyboard.press('Enter');
        await expect(chips).toHaveCount(0);
        await expect(alpha).not.toHaveAttribute('aria-selected');

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'activeRecordId'
        }), componentId)).toBe('beta');
        await page.keyboard.press('Enter');
        await expect(chips).toHaveCount(1);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'activeRecordId'
        }), componentId)).toBe('gamma');
        await page.keyboard.press('Enter');
        await expect(picker).toBeVisible();
        await expect(chips).toHaveCount(2);

        await input.fill('Gam');
        await expect(picker.locator('.neo-list-item')).toHaveCount(1);
        await expect(picker.locator('.neo-list-item', {hasText: 'Gamma'})).toBeVisible();
        await expect(chips).toHaveCount(2);

        await input.fill('');
        await page.keyboard.press('Backspace');
        await expect(chips).toHaveCount(1);
        await expect(field.getByRole('button', {name: 'Remove Beta'})).toBeVisible()
    });

    test('neo-light and neo-dark both resolve chip tokens through the field layout', async ({page}) => {
        await loadStylesheets(page, [
            '/dist/development/css/theme-neo-light/design-tokens/Core.css',
            '/dist/development/css/theme-neo-light/design-tokens/Semantic.css',
            '/dist/development/css/theme-neo-light/component/Chip.css',
            '/dist/development/css/theme-neo-light/form/field/Text.css',
            '/dist/development/css/theme-neo-dark/design-tokens/Core.css',
            '/dist/development/css/theme-neo-dark/design-tokens/Semantic.css',
            '/dist/development/css/theme-neo-dark/component/Chip.css',
            '/dist/development/css/theme-neo-dark/form/field/Text.css'
        ]);

        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['alpha']
        }), componentId);

        const
            field  = page.locator(`#${componentId}`),
            themes = ['neo-theme-neo-light', 'neo-theme-neo-dark'],
            tokens = {};

        for (const theme of themes) {
            await page.evaluate(({id, theme}) => Neo.worker.App.setConfigs({id, theme}), {
                id: componentId,
                theme
            });

            await expect(field).toHaveClass(new RegExp(theme));
            await expect.poll(() => field.evaluate(element =>
                getComputedStyle(element).getPropertyValue('--chip-text-color').trim()
            )).not.toBe('');

            tokens[theme] = await field.evaluate(element => {
                const
                    fieldStyle = getComputedStyle(element),
                    valueList  = element.querySelector('.neo-chip-field-values'),
                    wrapper    = element.querySelector('.neo-input-wrapper');

                return {
                    chipTextColor: fieldStyle.getPropertyValue('--chip-text-color').trim(),
                    listDisplay  : getComputedStyle(valueList).display,
                    textHeight   : fieldStyle.getPropertyValue('--textfield-input-height').trim(),
                    textPadding  : fieldStyle.getPropertyValue('--textfield-input-padding').trim(),
                    wrapperWrap  : getComputedStyle(wrapper).flexWrap
                }
            });

            expect(tokens[theme].listDisplay).toBe('flex');
            expect(tokens[theme].textHeight).not.toBe('');
            expect(tokens[theme].textPadding).not.toBe('');
            expect(tokens[theme].wrapperWrap).toBe('wrap')
        }

        expect(tokens['neo-theme-neo-light'].chipTextColor)
            .not.toBe(tokens['neo-theme-neo-dark'].chipTextColor)
    })
});
