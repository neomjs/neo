import {test, expect} from '@playwright/test';

let componentId;

async function createTextField(page, config) {
    const result = await page.evaluate(async (config) => {
        return Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Text.mjs',
            ntype     : 'textfield',
            parentId  : 'component-test-viewport',
            flex      : 'none',
            labelText : 'My label',
            labelWidth: 80,
            style     : {margin: '20px'},
            width     : 300,
            ...config
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`);
    }

    return result.id;
}

/**
 * @summary Captures the field with room for its floating inline label.
 */
async function captureField(page, field, path) {
    const box = await field.boundingBox();
    await page.screenshot({path, clip: {x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8),
        width: box.width + 16, height: box.height + 16}})
}

test.describe('Neo.form.field.Text', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', { state: 'attached' });
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

    test('Check isTouched on focusLeave', async ({page}) => {
        componentId = await createTextField(page, {value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();
        await input.blur();

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched on focusEnter', async ({page}) => {
        componentId = await createTextField(page, {isTouchedEvent: 'focusEnter', value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).not.toHaveClass(/neo-is-touched/);

        await input.click();

        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Check isTouched set initially', async ({page}) => {
        componentId = await createTextField(page, {isTouched: true, value: 'Hello World!'});
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await expect(input).toHaveValue('Hello World!');
        await expect(field).toHaveClass(/neo-is-touched/);
    });

    test('Label Positions', async ({page}) => {
        componentId = await createTextField(page);
        const field = page.locator(`#${componentId}`);
        const label = field.locator('.neo-textfield-label');

        // left (default)
        await expect(label).toBeVisible();

        // top
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'top'}), componentId);
        await expect(field).toHaveClass(/label-top/);

        // bottom
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'bottom'}), componentId);
        await expect(field).toHaveClass(/label-bottom/);

        // right
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'right'}), componentId);
        await expect(field).toHaveClass(/label-right/);

        // inline
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelPosition: 'inline'}), componentId);
        await expect(field).toHaveClass(/label-inline/);
    });

    // `value` is trimmed, the DOM is not: a render between a typed space and the next character used to write the
    // trimmed value back over the input. The wrapped setter sees every programmatic write, and none of the typing.
    test('a space typed at the end survives a render that lands before the next character', async ({page}) => {
        componentId = await createTextField(page);
        const field = page.locator(`#${componentId}`);
        const input = field.locator('input');

        await input.click();

        await page.evaluate(() => {
            const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

            window.__valueWrites = [];

            Object.defineProperty(HTMLInputElement.prototype, 'value', {
                configurable: true,
                get() {return descriptor.get.call(this)},
                set(value) {
                    window.__valueWrites.push({had: descriptor.get.call(this), wrote: value});
                    descriptor.set.call(this, value)
                }
            });
        });

        await page.keyboard.type('ab ');

        // Any render of the field will do; the label reaching the DOM proves this one has landed
        await page.evaluate(id => Neo.worker.App.setConfigs({id, labelText: 'Rendered'}), componentId);
        await expect(field.locator('.neo-textfield-label')).toHaveText('Rendered');

        await page.keyboard.type('c');

        await expect(input).toHaveValue('ab c');
        expect(await page.evaluate(() => window.__valueWrites), 'no render wrote the input').toEqual([]);
    });

    for (const type of ['Text', 'TextArea']) {
        test(`${type} character counter follows the visible text without rewriting user input`, async ({page}) => {
            componentId = await createTextField(page, {
                importPath   : `../form/field/${type}.mjs`,
                ntype        : type === 'Text' ? 'textfield' : 'textarea',
                labelPosition: 'top', maxLength: 200, showCharacterCount: true, clearable: true
            });
            const field   = page.locator(`#${componentId}`), input = field.locator('input, textarea'),
                  counter = field.locator('.neo-textfield-character-count');
            await expect(counter).toHaveText('0 / 200');
            await expect(input).toHaveAttribute('aria-describedby', `${componentId}__character-count`);

            await input.click();
            await page.evaluate(type => {
                const prototype  = type === 'Text' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
                      descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
                window.__counterValueWrites = [];
                Object.defineProperty(prototype, 'value', {
                    configurable: true,
                    get() {return descriptor.get.call(this)},
                    set(value) {window.__counterValueWrites.push(value); descriptor.set.call(this, value)}
                })
            }, type);
            await page.keyboard.type('ab ');
            await expect(counter).toHaveText('3 / 200');
            await expect(input).toHaveValue('ab ');
            await page.keyboard.type('c');
            await expect(counter).toHaveText('4 / 200');
            expect(await input.evaluate(node => node.selectionStart)).toBe(4);
            expect(await page.evaluate(() => window.__counterValueWrites)).toEqual([]);

            await page.keyboard.type(' ');
            await expect(counter).toHaveText('5 / 200');
            await input.blur();
            await expect(input).toHaveValue('ab c');
            await expect(counter).toHaveText('4 / 200');

            await page.evaluate(id => Neo.worker.App.setConfigs({id, value: 'set in code'}), componentId);
            await expect(counter).toHaveText('11 / 200');
            await page.evaluate(id => Neo.worker.App.setConfigs({id, maxLength: 20}), componentId);
            await expect(counter).toHaveText('11 / 20');
            await page.evaluate(id => Neo.worker.App.setConfigs({id, maxLength: null}), componentId);
            await expect(counter).toHaveText('11');
            await input.fill('pasted');
            await expect(counter).toHaveText('6');
            await field.hover();
            await field.locator('.neo-trigger-clear').click();
            await expect(counter).toHaveText('0');
        });

        for (const labelPosition of ['left', 'right', 'top', 'bottom', 'inline']) {
            test(`${type} counter and errors occupy separate rows with a ${labelPosition} label`, async ({page}, testInfo) => {
                componentId = await createTextField(page, {
                    importPath: `../form/field/${type}.mjs`,
                    ntype     : type === 'Text' ? 'textfield' : 'textarea',
                    labelPosition, maxLength: 200, showCharacterCount: true, value: 'Hello',
                    subLabelText: 'A helpful description', clearable: true
                });
                const field = page.locator(`#${componentId}`), counter = field.locator('.neo-textfield-character-count'),
                      input = field.locator(':scope > .neo-input-wrapper, :scope > .neo-textfield-input'),
                      error = field.locator('.neo-textfield-error');
                await expect(counter).toHaveText('5 / 200');
                await page.evaluate(id => Neo.worker.App.setConfigs({id, error: 'Please check this value'}), componentId);
                await expect(error).toBeVisible();
                const boxes                            = await Promise.all([input, counter, error].map(locator => locator.boundingBox()));
                const [inputBox, counterBox, errorBox] = boxes;
                expect(counterBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
                expect(counterBox.y - inputBox.y - inputBox.height).toBeLessThan(10);
                expect(counterBox.x + counterBox.width).toBeCloseTo(inputBox.x + inputBox.width, -1);
                expect(errorBox.y).toBeGreaterThanOrEqual(counterBox.y + counterBox.height - 1);
                if (labelPosition === 'inline') {
                    const labelBox = await field.locator('.neo-label-wrapper').boundingBox();
                    await captureField(page, field, testInfo.outputPath(`${type}-inline-counter.png`));
                    expect(labelBox.height).toBeCloseTo(inputBox.height, -1);
                }
            });
        }
    }

    test('counter is opt-in and handles zero limits and string length', async ({page}) => {
        componentId = await createTextField(page, {maxLength: 200, value: 'Hello'});
        const field   = page.locator(`#${componentId}`), input = field.locator('input'),
              counter = field.locator('.neo-textfield-character-count');
        await expect(counter).toHaveCount(0);
        await page.evaluate(id => Neo.worker.App.setConfigs({id, showCharacterCount: true}), componentId);
        await expect(counter).toHaveText('5 / 200');
        await expect(input).toHaveAttribute('aria-describedby', `${componentId}__character-count`);
        await page.evaluate(id => Neo.worker.App.setConfigs({id, value: '😀', maxLength: 0}), componentId);
        await expect(counter).toHaveText('2 / 0');
        await page.evaluate(id => Neo.worker.App.setConfigs({id, showCharacterCount: false}), componentId);
        await expect(counter).toHaveCount(0);
        await expect(input).not.toHaveAttribute('aria-describedby');
    });

    for (const example of ['text', 'textarea']) {
        test(`${example} example exposes its live counter control`, async ({page}, testInfo) => {
            await page.goto(`/examples/form/field/${example}/index.html`);
            const field       = page.locator('.neo-example-container .neo-textfield'),
                  counter     = field.locator('.neo-textfield-character-count'),
                  toggleInput = page.getByRole('checkbox', {name: 'showCharacterCount', exact: true}),
                  toggle      = page.locator('label').filter({has: toggleInput});
            await expect(counter).toHaveText('11 / 200');
            await toggle.click();
            await expect(counter).toHaveCount(0);
            await toggle.click();
            await expect(counter).toHaveText('11 / 200');
            await captureField(page, field, testInfo.outputPath(`${example}-counter-example.png`));
        });
    }

    test('TextArea counter stays below auto-growing text', async ({page}) => {
        componentId = await createTextField(page, {importPath: '../form/field/TextArea.mjs', ntype: 'textarea',
            autoGrow: true, rows: 1, labelPosition: 'inline', maxLength: 200, showCharacterCount: true});
        const field   = page.locator(`#${componentId}`), input = field.locator('textarea'),
              counter = field.locator('.neo-textfield-character-count');
        await expect(counter).toHaveText('0 / 200');
        const initialHeight = (await input.boundingBox()).height,
              value         = 'one\ntwo\nthree\nfour\nfive\nsix';
        await input.fill(value);
        await expect(counter).toHaveText(`${value.length} / 200`);
        await expect.poll(async () => (await input.boundingBox()).height).toBeGreaterThan(initialHeight);
        const inputBox = await input.boundingBox(), counterBox = await counter.boundingBox();
        expect(counterBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height - 1);
        expect(counterBox.y - inputBox.y - inputBox.height).toBeLessThan(10);
    });
});
