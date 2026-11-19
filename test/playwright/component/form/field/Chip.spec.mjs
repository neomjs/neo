import {test, expect} from '@playwright/test';

let componentId, componentSequence = 0;

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
    const id     = `chip-field-component-${++componentSequence}`,
          result = await page.evaluate(id => Neo.worker.App.createNeoInstance({
        importPath   : '../form/field/Chip.mjs',
        id,
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
    }), id);

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
            const destroyedId = componentId;

            await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), destroyedId);
            await expect(page.locator(`#${destroyedId}`)).toHaveCount(0);
            componentId = null
        }
    });

    test('native chip button removes by keyboard', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['alpha']
        }), componentId);

        const
            field       = page.locator(`#${componentId}`),
            chips       = field.locator('.neo-chip-field-values .neo-chip'),
            removeAlpha = field.getByRole('button', {name: 'Remove Alpha'});

        const getValueLength = () => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'value'
        }), componentId).then(value => value.length);

        await expect(chips).toHaveCount(1);
        await expect.poll(getValueLength).toBe(1);

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
        await expect(chips).toHaveCount(0);
        await expect(removeAlpha).toHaveCount(0);
        await expect.poll(getValueLength).toBe(0)
    });

    test('native chip button removes by pointer', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['beta']
        }), componentId);

        const
            field          = page.locator(`#${componentId}`),
            chips          = field.locator('.neo-chip-field-values .neo-chip'),
            removeBeta     = field.getByRole('button', {name: 'Remove Beta'}),
            getValueLength = () => page.evaluate(id => Neo.worker.App.getConfigs({
                id,
                keys: 'value'
            }), componentId).then(value => value.length);

        await expect(chips).toHaveCount(1);
        await expect.poll(getValueLength).toBe(1);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        await removeBeta.click();
        await expect(chips).toHaveCount(0);
        await expect.poll(getValueLength).toBe(0)
    });

    test('removing one chip updates and activates the recycled survivor', async ({page}) => {
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            value: ['alpha', 'beta']
        }), componentId);

        const
            field       = page.locator(`#${componentId}`),
            chips       = field.locator('.neo-chip-field-values .neo-chip'),
            removeAlpha = field.getByRole('button', {name: 'Remove Alpha'});

        await expect(chips).toHaveCount(2);

        const
            valueListId     = await field.locator('.neo-chip-field-values').getAttribute('id'),
            getSelectedKeys = () => page.evaluate(id => Neo.worker.App.getConfigs({
                id,
                keys: 'selectedKeys'
            }), valueListId);

        await expect.poll(getSelectedKeys).toEqual(['alpha', 'beta']);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        await removeAlpha.click();
        await expect(chips).toHaveCount(1);
        await expect.poll(getSelectedKeys).toEqual(['beta']);

        const removeBeta = field.getByRole('button', {name: 'Remove Beta'});

        await expect(removeBeta).toBeVisible();

        const survivorId = await removeBeta.locator('..').getAttribute('id');

        await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: 'value'
        }), survivorId)).toBe('beta');
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
        await removeBeta.click();
        await expect(chips).toHaveCount(0);
        await expect.poll(getSelectedKeys).toEqual([])
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
            '/dist/development/css/theme-neo-light/Global.css',
            '/dist/development/css/theme-neo-light/component/Chip.css',
            '/dist/development/css/theme-neo-light/form/field/Text.css',
            '/dist/development/css/theme-neo-dark/Global.css',
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
                    flow       = element.querySelector('.neo-chipfield-flow'),
                    valueList  = element.querySelector('.neo-chip-field-values'),
                    wrapper    = element.querySelector('.neo-input-wrapper');

                return {
                    chipTextColor: fieldStyle.getPropertyValue('--chip-text-color').trim(),
                    flowWrap     : getComputedStyle(flow).flexWrap,
                    listDisplay  : getComputedStyle(valueList).display,
                    textHeight   : fieldStyle.getPropertyValue('--textfield-input-height').trim(),
                    textPadding  : fieldStyle.getPropertyValue('--textfield-input-padding').trim(),
                    wrapperWrap  : getComputedStyle(wrapper).flexWrap
                }
            });

            expect(tokens[theme].listDisplay).toBe('flex');
            expect(tokens[theme].textHeight).not.toBe('');
            expect(tokens[theme].textPadding).not.toBe('');
            expect(tokens[theme].flowWrap).toBe('wrap');
            expect(tokens[theme].wrapperWrap).toBe('nowrap')
        }

        expect(tokens['neo-theme-neo-light'].chipTextColor)
            .not.toBe(tokens['neo-theme-neo-dark'].chipTextColor)
    });

    test('once the chips and the input fill the row, the triggers stay at its end rather than wrap', async ({page}) => {
        await loadStylesheets(page, [
            '/dist/development/css/theme-neo-light/Global.css',
            '/dist/development/css/theme-neo-light/component/Chip.css',
            '/dist/development/css/theme-neo-light/form/field/Text.css'
        ]);

        await page.evaluate(id => Neo.worker.App.setConfigs({id, theme: 'neo-theme-neo-light', value: ['alpha', 'beta']}), componentId);

        const
            field  = page.locator(`#${componentId}`),
            layout = () => field.evaluate(element => {
                const
                    rect     = node => node.getBoundingClientRect(),
                    wrapper  = element.querySelector('.neo-input-wrapper'),
                    triggers = [...wrapper.querySelectorAll('.neo-field-trigger')],
                    flowEnd  = Math.max(...[...element.querySelectorAll('.neo-chip, .neo-textfield-input')].map(node => rect(node).right));

                return {
                    flowEnd,
                    listWidth : rect(element.querySelector('.neo-chip-field-values')).width,
                    trigger   : rect(triggers.at(-1)).toJSON(),
                    wrapper   : rect(wrapper).toJSON(),
                    wrapperEnd: rect(wrapper).right - parseFloat(getComputedStyle(wrapper).paddingInlineEnd) - parseFloat(getComputedStyle(wrapper).borderInlineEndWidth)
                }
            });

        await expect(field.locator('.neo-chip')).toHaveCount(2);

        // Room for the chips, a gap and the input's 80 px basis, but not for the triggers as well
        const {listWidth, wrapper} = await layout(),
              fullRow              = listWidth + 4 + 80 + 10;

        await page.evaluate(({id, width}) => Neo.worker.App.setConfigs({id, width}), {id: componentId, width: Math.ceil(420 - wrapper.width + fullRow + 8 + 2)});
        await expect.poll(async () => (await layout()).wrapper.width).toBeLessThan(wrapper.width);

        const narrow = await layout();

        expect(narrow.trigger.left).toBeGreaterThanOrEqual(narrow.flowEnd);
        expect(narrow.wrapperEnd - narrow.trigger.right).toBeLessThan(1)
    });

    test('narrower than the input\'s 80 px, the input shrinks and stays clear of the triggers', async ({page}) => {
        await loadStylesheets(page, [
            '/dist/development/css/theme-neo-light/Global.css',
            '/dist/development/css/theme-neo-light/component/Chip.css',
            '/dist/development/css/theme-neo-light/form/field/Text.css'
        ]);

        const
            field = page.locator(`#${componentId}`),
            boxes = () => field.evaluate(element => {
                const
                    input    = element.querySelector('.neo-textfield-input').getBoundingClientRect(),
                    triggers = [...element.querySelectorAll('.neo-chipfield-flow ~ .neo-field-trigger')]
                        .map(node => node.getBoundingClientRect()).filter(rect => rect.width > 0);

                return {
                    fieldWidth: element.getBoundingClientRect().width,
                    inputWidth: input.width,
                    overlap   : input.right - Math.min(...triggers.map(rect => rect.left)),
                    triggers  : triggers.length
                }
            });

        // 100 px is inside the example's width inspector (50 to 300 px), with no chip and with one
        for (const value of [[], ['alpha']]) {
            await page.evaluate(({id, value}) => Neo.worker.App.setConfigs({id, theme: 'neo-theme-neo-light', value, width: 100}), {id: componentId, value});
            await expect(field.locator('.neo-chip')).toHaveCount(value.length);
            await expect.poll(async () => (await boxes()).fieldWidth).toBe(100);

            const {inputWidth, overlap, triggers} = await boxes();

            expect(triggers).toBeGreaterThan(0);
            expect(overlap, `chips: ${value.length}`).toBeLessThanOrEqual(0);
            expect(inputWidth, `chips: ${value.length}`).toBeGreaterThan(0)
        }
    });

    test('a trigger change rebuilds the input wrapper and keeps the chips and the input in one flow', async ({page}) => {
        const
            field    = page.locator(`#${componentId}`),
            grouping = () => field.evaluate(element => ({
                flowChildren: [...element.querySelector('.neo-chipfield-flow')?.children || []].map(node => node.classList[0]),
                triggers    : element.querySelectorAll('.neo-input-wrapper > .neo-field-trigger').length
            }));

        await page.evaluate(id => Neo.worker.App.setConfigs({id, value: ['alpha']}), componentId);
        await expect(field.locator('.neo-chip')).toHaveCount(1);

        const before = await grouping();

        await page.evaluate(id => Neo.worker.App.setConfigs({id, clearable: false}), componentId);
        await expect.poll(async () => (await grouping()).triggers).toBe(before.triggers - 1);

        expect(before.flowChildren).toEqual(['neo-chip-field-values', 'neo-textfield-input']);
        expect((await grouping()).flowChildren).toEqual(before.flowChildren);
        await expect(field.locator('.neo-chip')).toHaveCount(1)
    })
});
