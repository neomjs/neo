import {test, expect} from '@playwright/test';

let formId;

/**
 * @summary Waits until every named theme stylesheet `<link>` is inserted and parsed.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} names
 * @returns {Promise<void>}
 */
async function stylesheetsLoaded(page, names) {
    await page.waitForFunction(names => {
        const links = [...document.querySelectorAll('link[rel="stylesheet"]')];

        return names.every(name => links.some(link => link.href.includes(name))) &&
            links.every(link => link.sheet !== null)
    }, names)
}

/**
 * @summary Mounts a `Neo.form.Container` configured with `layout-form` inside `empty-viewport`.
 * @param {import('@playwright/test').Page} page
 * @param {Object} config
 * @returns {Promise<import('@playwright/test').Locator>}
 */
async function mountForm(page, config) {
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance({
        ntype   : 'form-container',
        parentId: 'component-test-viewport',
        layout  : {ntype: 'layout-form', gap: '0 .5rem'},
        style   : {padding: '20px'},
        ...config
    }), config);

    expect(result.success, JSON.stringify(result)).toBe(true);
    formId = result.id;

    const locator = page.locator(`#${formId}`);
    await expect(locator).toBeVisible();
    await stylesheetsLoaded(page, ['layout/Form.css', 'form/field/Text.css']);

    return locator
}

test.describe('Neo.layout.Form', () => {
    test.beforeEach(async ({page}) => {
        formId = null;
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await page.evaluate(async () => {
            await Neo.worker.App.loadModule({path: '../form/Container.mjs'});
            await Neo.worker.App.loadModule({path: '../form/Fieldset.mjs'});
            await Neo.worker.App.loadModule({path: '../form/field/Text.mjs'});
            await Neo.worker.App.loadModule({path: '../component/Legend.mjs'});
            await Neo.worker.App.loadModule({path: '../layout/Form.mjs'})
        })
    });

    test.afterEach(async ({page}) => {
        if (formId) {
            const result = await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), formId);
            expect(result.success, JSON.stringify(result)).toBe(true);
            await expect(page.locator(`#${formId}`)).toHaveCount(0)
        }
    });

    test('preserves >= 120 px input widths and wraps wide labels without row overlap inside a 320 px narrow form', async ({page}) => {
        const form = await mountForm(page, {
            width       : 320,
            itemDefaults: {ntype: 'textfield', clearable: true, value: 'Layout Demo'},
            items       : [
                {id: 'form-wide-field',  labelText: 'This is a wide Label inside Form'},
                {id: 'form-short-field', labelText: 'Small Label'},
                {
                    ntype       : 'fieldset',
                    id          : 'form-nested-fieldset',
                    title       : 'Fieldset with Layout',
                    layout      : {ntype: 'layout-form', gap: '0 .5rem'},
                    itemDefaults: {ntype: 'textfield', clearable: true, value: 'Layout Demo'},
                    items       : [
                        {id: 'form-fs-field-1', labelText: 'I am inside a fieldset'},
                        {id: 'form-fs-field-2', labelText: 'Fieldset with layout-form'}
                    ]
                }
            ]
        });

        await stylesheetsLoaded(page, ['form/Fieldset.css']);

        const metrics = await form.evaluate(el => {
            const formBox = el.getBoundingClientRect();
            const rows    = [...el.querySelectorAll('.neo-textfield')].map(field => {
                const box     = field.getBoundingClientRect(),
                      label   = field.querySelector('.neo-textfield-label').getBoundingClientRect(),
                      wrapper = field.querySelector('.neo-input-wrapper').getBoundingClientRect();

                return {
                    id         : field.id,
                    top        : box.top,
                    bottom     : box.bottom,
                    right      : box.right,
                    labelBottom: label.bottom,
                    wrapperW   : wrapper.width
                }
            });

            return {
                formRight: formBox.right,
                overflow : el.scrollWidth - el.clientWidth,
                rows
            }
        });

        expect(metrics.overflow).toBe(0);
        for (const row of metrics.rows) {
            expect(row.wrapperW, row.id).toBeGreaterThanOrEqual(120);
            expect(row.labelBottom, `${row.id} label stays inside field box`).toBeLessThanOrEqual(row.bottom + 1);
            expect(row.right, `${row.id} fits inside form`).toBeLessThanOrEqual(metrics.formRight + 1)
        }
        expect(metrics.rows[0].bottom).toBeLessThanOrEqual(metrics.rows[1].top + 1)
    });

    test('places a triggerless hidden-label input in column 2 and spans a legend across both columns', async ({page}) => {
        const form = await mountForm(page, {
            width: 380,
            items: [
                {ntype: 'legend', id: 'form-top-legend', text: 'Contact section'},
                {ntype: 'textfield', id: 'form-labeled',   clearable: false, labelText: 'Department', value: 'Core'},
                {ntype: 'textfield', id: 'form-unlabeled', clearable: false, hideLabel: true, value: 'Platform'}
            ]
        });

        const geometry = await form.evaluate(el => {
            const formBox      = el.getBoundingClientRect(),
                  legendBox    = document.getElementById('form-top-legend').getBoundingClientRect(),
                  labeledInput = document.querySelector('#form-labeled .neo-textfield-input').getBoundingClientRect(),
                  hiddenInput  = document.querySelector('#form-unlabeled .neo-textfield-input').getBoundingClientRect();

            return {
                contentWidth: formBox.width - 40,
                legendWidth : legendBox.width,
                labeledLeft : Math.round(labeledInput.left),
                hiddenLeft  : Math.round(hiddenInput.left),
                labeledRight: Math.round(labeledInput.right),
                hiddenRight : Math.round(hiddenInput.right)
            }
        });

        expect(geometry.legendWidth).toBeCloseTo(geometry.contentWidth, 0);
        expect(geometry.hiddenLeft).toBe(geometry.labeledLeft);
        expect(geometry.hiddenRight).toBe(geometry.labeledRight)
    })
});
