import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Resolves the example's native field from its live worker, then waits for the matching DOM.
 * @param {Object} page
 * @param {Object} neuralLink
 * @param {Boolean} useDomApiRenderer
 * @returns {Promise<Object>}
 */
async function openExample(page, neuralLink, useDomApiRenderer=true) {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true, useDomApiRenderer}));
    await page.goto('/examples/form/field/select/index.html');
    const app = await neuralLink.connectToApp('Neo.examples.form.field.select');
    let fields;
    await expect.poll(async () => {
        fields = await app.queryComponent({ntype: 'selectfield'}, ['id', 'store.id']);
        return fields.length
    }).toBe(1);
    const id = fields[0].id, input = page.locator(`#${id} select`);
    await expect(input).toBeVisible();
    await expect.poll(() => input.evaluate(node => getComputedStyle(node).appearance)).toBe('base-select');
    return {app, id, input, storeId: fields[0].properties['store.id']}
}

for (const useDomApiRenderer of [true, false]) {
    test(`native choice, reset and rich option edits agree through ${useDomApiRenderer ? 'DOM' : 'string'} rendering`, async ({page, neuralLink}) => {
        const {app, id, input, storeId} = await openExample(page, neuralLink, useDomApiRenderer);
        const errors                    = [];
        page.on('pageerror', error => errors.push(error.message));
        await expect(input).toHaveAccessibleName('Fruit');
        await expect(input.getByRole('option', {name: 'Lemon', exact: true})).toHaveCount(1);
        await input.evaluate(node => {
            node.closest('.neo-selectfield').classList.add('neo-selection');
            window.selectKeyDefaults = [];
            document.addEventListener('keydown', event => {
                if (node.contains(event.target)) window.selectKeyDefaults.push({key: event.key, prevented: event.defaultPrevented})
            })
        });
        await input.click();
        await expect(input.locator('option strong').first()).toBeVisible();
        await page.screenshot({path: test.info().outputPath('rich-options.png')});
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await app.getComponent(id, ['value'])).value).toBe(0);
        expect(await page.evaluate(() => window.selectKeyDefaults.filter(event => event.key === 'ArrowDown')))
            .toEqual([{key: 'ArrowDown', prevented: false}]);

        await input.selectOption('string:0');
        await expect.poll(async () => (await app.getComponent(id, ['value'])).value).toBe('0');
        await app.callMethod(id, 'reset', [false]);
        await expect(input).toHaveValue('boolean:false');
        await app.setProperties(id, {labelText: 'Choose fruit', width: 320});
        await expect(input).toHaveAccessibleName('Choose fruit');
        await expect(input).toHaveValue('boolean:false');
        expect(await app.callMethod(id, 'getSubmitValue')).toBe(false);

        await app.setProperties(storeId, {filters: [{property: 'id', operator: '===', value: 0}]});
        await expect(input).toHaveValue('boolean:false');
        await expect(input.locator('option:checked')).toContainText('Apple');
        expect(await app.callMethod(id, 'isValid')).toBe(true);
        await app.setProperties(storeId, {filters: []});
        await app.setProperties(id, {options: [{id: false, name: 'New apple', icon: '🍏'}, {id: 'new', name: 'New fruit', icon: '🍑'}]});
        await expect(input.locator('option:checked')).toContainText('New apple');
        await expect(input).toHaveValue('boolean:false');
        await input.selectOption('string:new');
        await expect.poll(async () => (await app.getComponent(id, ['value'])).value).toBe('new');
        expect(errors).toEqual([])
    })
}

test('classic presentation, required placeholder and disabled native input keep the same field contract', async ({page, neuralLink}) => {
    const {app, id, input} = await openExample(page, neuralLink);
    await app.setProperties(id, {customizable: false, required: true});
    await expect.poll(() => input.evaluate(node => getComputedStyle(node).appearance)).not.toBe('base-select');
    await expect(input).toHaveValue('');
    expect(await input.evaluate(node => node.checkValidity())).toBe(false);
    await input.selectOption('string:');
    await expect.poll(async () => (await app.getComponent(id, ['value'])).value).toBe('');
    expect(await input.evaluate(node => node.checkValidity())).toBe(true);
    expect(await app.callMethod(id, 'getSubmitValue')).toBe('');
    await app.setProperties(id, {value: 'absent'});
    await expect(input).toHaveValue('');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(await app.callMethod(id, 'getSubmitValue')).toBeNull();
    await app.setProperties(id, {disabled: true});
    await expect(input).toBeDisabled();
    expect(await app.callMethod(id, 'isValid')).toBe(true)
});
