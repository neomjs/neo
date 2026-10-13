import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/list/ValuePicker.spec.mjs
 * @summary Real main/worker keyboard routing, checkbox projection and safe buffered label rendering.
 */
const id         = 'value-picker-browser-test';
const focusedKey = page => page.evaluate(() => document.activeElement?.dataset.recordId);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport');
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
        id, importPath: '../list/ValuePicker.mjs', ntype: 'value-picker',
        parentId          : 'component-test-viewport', width: 320, height: 160,
        maxMatchingOptions: 10000,
        store             : {
            ntype: 'store', keyProperty: 'key',
            model: {fields: [{name: 'key', type: 'String'}, {name: 'value'}, {name: 'label', type: 'String'}, {name: 'count', type: 'Number'}]},
            data : Array.from({length: 10001}, (_, index) => ({
                key: 'number:' + index, value: index, label: 'Value ' + index, count: index
            }))
        }
    });
    expect(result.success).toBe(true);
    await expect(page.locator('#' + id + ' .neo-list-item')).toHaveCount(11)
});

test('logical keys cross the pool; Enter does not synthesize a second pointer toggle', async ({page}) => {
    const picker = page.locator('#' + id);
    await page.evaluate(id => {
        const original = Element.prototype.scrollIntoView;
        window.pickerScrollEffects = 0;
        Element.prototype.scrollIntoView = function(...args) {
            if (this.closest('#' + id)) ++window.pickerScrollEffects;
            return original.apply(this, args)
        }
    }, id);
    await picker.locator('[data-record-id="number:0"]').click();
    await expect.poll(() => focusedKey(page)).toBe('number:0');
    await page.keyboard.press('End');
    await expect.poll(() => focusedKey(page)).toBe('number:9999');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => focusedKey(page)).toBe('number:9998');
    await page.keyboard.press('Home');
    await expect.poll(() => focusedKey(page)).toBe('number:0');
    for (let index = 0; index < 14; ++index) await page.keyboard.press('ArrowDown');
    await expect.poll(() => focusedKey(page)).toBe('number:14');
    await expect.poll(() => page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'focusIndex'}), id)).toBe(14);
    expect(await page.evaluate(() => window.pickerScrollEffects)).toBe(0);

    await page.evaluate(id => {
        window.valuePickerClicks = 0;
        document.getElementById(id).addEventListener('click', () => ++window.valuePickerClicks)
    }, id);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.valuePickerClicks)).toBe(0);
    expect(await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'selection'}), id)).toEqual([]);
    await page.evaluate(id => Neo.worker.App.setConfigs({id, selection: ['number:14']}), id);
    await expect(picker.locator('[data-record-id="number:14"]')).toHaveAttribute('aria-checked', 'true');
    await page.evaluate(id => Neo.worker.App.setConfigs({id, searchValue: 'Value 9999'}), id);
    await expect(picker.locator('.neo-list-item')).toHaveCount(2);
    await expect(picker.locator('[data-record-id="number:14"]')).toHaveAttribute('aria-checked', 'true');
    await expect(picker.locator('[data-record-id="number:9999"]')).toHaveAttribute('aria-checked', 'false')
});

test('literal labels, count zero and refine footer render within the fixed-height surface', async ({page}, testInfo) => {
    const picker = page.locator('#' + id);
    await expect(picker.locator('.neo-value-picker-refine')).toHaveText('10,001 values match, narrow the search');
    await expect(picker.locator('[data-record-id="number:0"] .neo-value-picker-count')).toHaveText('0');
    await expect.poll(() => picker.locator('.neo-list-item').evaluateAll(nodes => nodes.every(node =>
        Math.abs(node.getBoundingClientRect().height - 32) < .1
    ))).toBe(true);
    await testInfo.attach('value-picker', {body: await picker.screenshot(), contentType: 'image/png'});
    await page.evaluate(id => Neo.worker.App.setConfigs({id, searchValue: '('}), id);
    await expect(picker.locator('.neo-list-item')).toHaveCount(0);
    await expect(picker.locator('.neo-value-picker-refine')).toHaveCount(0)
});

test('Tab can leave a pending logical jump and wheel scrolling resumes with focus outside', async ({page}) => {
    const picker = page.locator('#' + id);
    await picker.locator('[data-record-id="number:0"]').click();
    await page.evaluate(() => {
        const button = document.createElement('button');
        button.id = 'outside-picker';
        button.textContent = 'Outside';
        document.body.append(button)
    });
    await page.keyboard.press('End');
    await page.keyboard.press('Tab');
    await expect(page.locator('#outside-picker')).toBeFocused();
    await picker.hover();
    const before = await picker.evaluate(node => node.scrollTop);
    await page.mouse.wheel(0, before > 160 ? -96 : 96);
    await expect.poll(() => picker.evaluate(node => node.scrollTop)).not.toBe(before);
    await expect.poll(async () => {
        const actual = await picker.evaluate(node => node.scrollTop),
            model    = await page.evaluate(id => Neo.worker.App.getConfigs({id, keys: 'scrollTop'}), id);
        return Math.abs(actual - model)
    }).toBeLessThan(1);
    await expect(page.locator('#outside-picker')).toBeFocused()
});
