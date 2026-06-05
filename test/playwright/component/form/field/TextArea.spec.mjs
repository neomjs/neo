import {test, expect} from '@playwright/test';

let fieldsetId;

async function createFieldsetWithTextArea(page, config={}) {
    const result = await page.evaluate(async (config) => {
        return Neo.worker.App.createNeoInstance({
            importPath: '../form/Fieldset.mjs',
            ntype     : 'fieldset',
            parentId  : 'component-test-viewport',
            title     : 'Details',
            width     : 420,
            items     : [{
                importPath: '../form/field/TextArea.mjs',
                ntype     : 'textarea',
                labelText : 'Notes',
                labelWidth: 80,
                rows      : 5,
                width     : 360,
                ...config
            }]
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id;
}

test.describe('Neo.form.field.TextArea', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', { state: 'attached' });
        await page.evaluate(async () => Neo.worker.App.loadModule({path: '../form/field/TextArea.mjs'}));
    });

    test.afterEach(async ({page}) => {
        if (fieldsetId) {
            await page.evaluate(async (id) => {
                const result = await Neo.worker.App.destroyNeoInstance(id);

                if (!result.success) {
                    console.error(`Failed to destroy component ${id}:`, result.error);
                }
            }, fieldsetId);
            fieldsetId = null;
        }
    });

    test('Fieldset grows to fit TextArea rows', async ({page}) => {
        fieldsetId = await createFieldsetWithTextArea(page);

        const fieldset = page.locator(`#${fieldsetId}`);
        const textArea = fieldset.locator('.neo-textarea');
        const input    = textArea.locator('textarea.neo-textfield-input');

        await expect(input).toHaveAttribute('rows', '5');

        const sizes = await page.evaluate(id => {
            const fieldset = document.getElementById(id),
                  textArea = fieldset.querySelector('.neo-textarea'),
                  input    = fieldset.querySelector('textarea.neo-textfield-input');

            return {
                fieldsetHeight: fieldset.getBoundingClientRect().height,
                inputHeight   : input.getBoundingClientRect().height,
                textAreaHeight: textArea.getBoundingClientRect().height
            };
        }, fieldsetId);

        expect(sizes.textAreaHeight).toBeGreaterThan(sizes.inputHeight);
        expect(sizes.fieldsetHeight).toBeGreaterThan(sizes.textAreaHeight);
        expect(sizes.textAreaHeight).toBeGreaterThan(60);
    });
});
