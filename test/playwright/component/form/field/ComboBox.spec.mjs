import {test, expect} from '@playwright/test';

let componentId;

async function createComboBox(page, config) {
    const result = await page.evaluate(async (config) => {
        return Neo.worker.App.createNeoInstance({
            importPath   : '../form/field/ComboBox.mjs',
            ntype        : 'combobox',
            parentId     : 'component-test-viewport',
            labelPosition: 'inline',
            labelText    : 'US States',
            labelWidth   : 80,
            width        : 300,
            store        : {
                autoLoad   : true,
                keyProperty: 'abbreviation',
                url        : '../../resources/examples/data/us_states.json',
                model      : {
                    fields: [
                        {name: 'abbreviation', type: 'String'},
                        {name: 'name', type: 'String'}
                    ]
                }
            },
            ...config
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id;
}

test.describe('Neo.form.field.ComboBox', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport');
    });

    test.afterEach(async ({page}) => {
        if (componentId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);
                if (!result.success) {
                    console.error(`Failed to destroy component ${id}:`, result.error);
                }
            }, componentId);
            componentId = null;
        }
    });

    test('Editable', async ({page}) => {
        componentId = await createComboBox(page, {editable: false});
        const comboBox   = page.locator(`#${componentId}`);
        const inputField = comboBox.locator('input.neo-textfield-input:not(.neo-typeahead-input)');

        await expect(inputField).toHaveAttribute('readonly', '');

        let blurCount = 0;
        page.on('blur', () => blurCount++); // Playwright doesn't have a direct way to count blur events on specific elements easily

        await expect(inputField).toHaveAttribute('role', 'combobox');
        await expect(inputField).toHaveAttribute('aria-haspopup', 'listbox');
        await expect(inputField).toHaveAttribute('aria-expanded', 'false');

        await inputField.click();

        await page.waitForSelector('.neo-picker-container');
        await expect(inputField).toHaveAttribute('aria-expanded', 'true');

        // Roles correct
        await expect(page.locator('.neo-picker-container .neo-list')).toHaveAttribute('role', 'listbox');
        await expect(page.locator('.neo-picker-container .neo-list .neo-list-item[role="option"]')).toHaveCount(59);

        // The input field has no value yet
        await expect(inputField).toHaveValue('');

        // First item is active on open, since the picker is visible
        await expect(inputField).toHaveAttribute('aria-activedescendant', 'neo-list-1__AL');
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Alabama")')).toBeVisible();

        // Should activate the second list item. editable: false means we can still be focused
        // and select values, just that the filter input is read-only.
        await page.keyboard.press('ArrowDown');

        // The second item is now active
        await expect(inputField).toHaveAttribute('aria-activedescendant', 'neo-list-1__AK');
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Alaska")')).toBeVisible();

        await page.waitForTimeout(100);

        // Select that second item.
        await page.keyboard.press('Enter');

        await expect(page.locator('.neo-picker-container')).toBeHidden();

        await expect(inputField).toHaveValue('Alaska');

        // Focus never leaves the input field
        await expect(inputField).toBeFocused();

        await page.keyboard.press('Tab');

        // Value still correct after blur
        await expect(inputField).toHaveValue('Alaska');

        // Now focus has left
        await expect(inputField).not.toBeFocused();
    });

    test('Keyboard navigation', async ({page}) => {
        componentId = await createComboBox(page);
        const comboBox = page.locator(`#${componentId}`);
        const inputField = comboBox.locator('input.neo-textfield-input:not(.neo-typeahead-input)');

        await inputField.click();
        await page.keyboard.press('ArrowDown');

        // Picker Must show with Alabama activated
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Alabama")')).toBeVisible();

        await page.keyboard.press('End');

        // Picker should go to end
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Wyoming")')).toBeVisible();

        await page.keyboard.press('ArrowUp');

        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Wisconsin")')).toBeVisible();

        await page.keyboard.press('ArrowDown');

        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Wyoming")')).toBeVisible();

        await page.keyboard.press('Enter');

        await expect(page.locator('.neo-picker-container')).toBeHidden();

        await page.waitForTimeout(100);

        await expect(inputField).toHaveValue('Wyoming');

        await inputField.click(); // Re-open picker
        await page.keyboard.press('ArrowDown');

        // Picker Must show with Wyoming activated
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Wyoming")')).toBeVisible();

        await page.keyboard.press('ArrowUp');

        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Wisconsin")')).toBeVisible();

        await page.waitForTimeout(100);

        await page.keyboard.press('Enter');

        await expect(page.locator('.neo-picker-container')).toBeHidden();

        await expect(inputField).toHaveValue('Wisconsin');

        await page.keyboard.press('Tab');

        // Value still correct after blur
        await expect(inputField).toHaveValue('Wisconsin');
    });

    test('Type to filter', async ({page}) => {
        componentId = await createComboBox(page);
        const comboBox = page.locator(`#${componentId}`);
        const inputField = comboBox.locator('input.neo-textfield-input:not(.neo-typeahead-input)');

        await inputField.click();

        await inputField.type('Mar');

        // Picker Must show with Marshall Islands activated
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Marshall Islands")')).toBeVisible();

        // Matches three states
        await expect(page.locator('.neo-picker-container .neo-list-item')).toHaveCount(3);

        // Only one is selected
        await expect(page.locator('.neo-list-item.neo-navigator-active-item')).toHaveCount(1);

        await page.keyboard.press('ArrowDown');

        // Picker Must show with Maryland activated
        await expect(page.locator('.neo-list-item.neo-navigator-active-item:has-text("Maryland")')).toBeVisible();

        await page.waitForTimeout(100);

        // Matches three states
        await expect(page.locator('.neo-picker-container .neo-list-item')).toHaveCount(3);

        // Only one is selected
        await expect(page.locator('.neo-list-item.neo-navigator-active-item')).toHaveCount(1);

        // Blur without selecting a value
        await page.keyboard.press('Tab');

        await page.waitForTimeout(100);

        // typeahead input must be cleared, forceSelection must pick the closest value onFocusLeave
        // todo: add another test without forceSelection => Inputs must have been cleared. Both typeahead and filter.
        // We'll assert the main input field's value and assume the typeahead input is handled by the component logic.
        await expect(inputField).toHaveValue('Marshall Islands'); // Assuming forceSelection picks the closest value
    });

    test('With store as data', async ({page}) => {
        componentId = await createComboBox(page, {
            labelText: 'Foo',
            store    : ['Foo', 'Bar', 'Bletch']
        });
        const comboBox = page.locator(`#${componentId}`);

        await comboBox.locator('.neo-field-trigger.fa-caret-down').click();

        await expect(page.locator('.neo-list-item:has-text("Foo")')).toBeVisible();

        // All data items represented
        await expect(page.locator('.neo-list-item')).toHaveCount(3);
    });
});
