import {test, expect} from '@playwright/test';

let rootIds = [];

/**
 * @summary Mounts a Neo component blueprint inside `#component-test-viewport` for geometry inspection.
 * @param {import('@playwright/test').Page} page
 * @param {Object} config
 * @returns {Promise<String>} Created component id.
 */
async function mountField(page, config) {
    const result = await page.evaluate(async (cfg) => {
        return Neo.worker.App.createNeoInstance({
            importPath: '../form/field/Text.mjs',
            ntype     : 'textfield',
            parentId  : 'component-test-viewport',
            flex      : 'none',
            labelText : 'Field label',
            labelWidth: 90,
            style     : {margin: '12px'},
            width     : 320,
            ...cfg
        });
    }, config);

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error?.message || result.error}`);
    }

    await page.locator(`#${result.id}`).waitFor({state: 'attached'});
    rootIds.push(result.id);
    return result.id;
}

/**
 * @summary Reads outer, inner-wrapper, input, label, and trigger DOM geometry for a mounted field.
 * @param {import('@playwright/test').Page} page
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function readFieldGeometry(page, id) {
    return page.evaluate((fieldId) => {
        const field        = document.getElementById(fieldId),
              wrapper      = field.querySelector(':scope > .neo-input-wrapper') || field.querySelector('.neo-input-wrapper'),
              input        = field.querySelector('.neo-textfield-input'),
              label        = field.querySelector('.neo-textfield-label'),
              labelWrapper = field.querySelector(':scope > .neo-label-wrapper'),
              triggers     = [...field.querySelectorAll('.neo-field-trigger')],
              spins        = [...field.querySelectorAll('.neo-spin-button')],
              boxOf        = el => {
                  if (!el) return null;
                  const r = el.getBoundingClientRect(),
                        s = getComputedStyle(el);
                  return {
                      x           : r.x,
                      y           : r.y,
                      width       : r.width,
                      height      : r.height,
                      clientHeight: el.clientHeight,
                      borderTop   : parseFloat(s.borderTopWidth)    || 0,
                      borderBottom: parseFloat(s.borderBottomWidth) || 0,
                      borderLeft  : parseFloat(s.borderLeftWidth)   || 0,
                      borderRight : parseFloat(s.borderRightWidth)  || 0,
                      bg          : s.backgroundColor
                  };
              };

        return {
            field       : boxOf(field),
            wrapper     : boxOf(wrapper),
            input       : boxOf(input),
            label       : boxOf(label),
            labelWrapper: boxOf(labelWrapper),
            triggers    : triggers.map(el => ({
                cls   : el.className,
                ...boxOf(el),
                before: (() => {
                    const b = getComputedStyle(el, '::before');
                    return {lineHeight: b.lineHeight, fontSize: b.fontSize};
                })()
            })),
            spins       : spins.map(el => ({cls: el.className, ...boxOf(el)}))
        };
    }, id);
}

test.describe('Neo.form.field trigger and input-box height stretching (#22505)', () => {
    test.beforeEach(async ({page}) => {
        rootIds = [];
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});
    });

    test.afterEach(async ({page}) => {
        for (const id of rootIds.reverse()) {
            await page.evaluate(async ( targetId ) => {
                await Neo.worker.App.destroyNeoInstance(targetId);
            }, id);
        }
        rootIds = [];
    });

    for (const labelPosition of ['left', 'right', 'top', 'bottom', 'inline']) {
        test(`stretches start/end triggers and input box to explicit taller height (${labelPosition})`, async ({page}) => {
            const targetHeight = (labelPosition === 'top' || labelPosition === 'bottom') ? 76 : 52,
                  id           = await mountField(page, {
                      clearable: true,
                      height   : targetHeight,
                      labelPosition,
                      triggers : [{ntype: 'trigger', align: 'start', iconCls: 'fa fa-magnifying-glass', type: 'lead'}],
                      value    : 'Taller value'
                  });

            const field = page.locator(`#${id}`);
            await expect(field.locator('.neo-trigger-clear')).toBeVisible();

            const g = await readFieldGeometry(page, id);

            expect(g.field.height).toBeCloseTo(targetHeight, 0);
            expect(g.wrapper).not.toBeNull();

            if (labelPosition === 'left' || labelPosition === 'right' || labelPosition === 'inline') {
                expect(g.wrapper.height).toBeCloseTo(targetHeight, 0);
            } else {
                expect(g.wrapper.height).toBeGreaterThanOrEqual(46);
            }

            if (labelPosition === 'left' || labelPosition === 'right') {
                const labelMidY   = g.label.y + g.label.height / 2,
                      wrapperMidY = g.wrapper.y + g.wrapper.height / 2;
                expect(Math.abs(labelMidY - wrapperMidY)).toBeLessThan(2);
            }

            if (labelPosition === 'inline') {
                expect(g.labelWrapper).not.toBeNull();
                expect(g.labelWrapper.height).toBeCloseTo(targetHeight, 0);
            }

            expect(g.input.height).toBeCloseTo(g.wrapper.clientHeight, 0);
            expect(g.triggers).toHaveLength(2);

            for (const trigger of g.triggers) {
                expect(trigger.height).toBeCloseTo(g.wrapper.clientHeight, 0);
                const wrapperInnerTop    = g.wrapper.y + g.wrapper.borderTop,
                      wrapperInnerBottom = g.wrapper.y + g.wrapper.height - g.wrapper.borderBottom;
                expect(Math.abs(trigger.y - wrapperInnerTop)).toBeLessThan(1);
                expect(Math.abs((trigger.y + trigger.height) - wrapperInnerBottom)).toBeLessThan(1);
            }

            // Hover fill covers the full stretched trigger box
            const clearTrigger = field.locator('.neo-trigger-clear');
            await clearTrigger.hover();
            const hovered = await readFieldGeometry(page, id),
                  clearG  = hovered.triggers.find(t => t.cls.includes('neo-trigger-clear'));
            expect(clearG.height).toBeCloseTo(hovered.wrapper.clientHeight, 0);
            expect(clearG.bg).not.toBe('rgba(0, 0, 0, 0)');
        });

        test(`stretches direct triggerless input to explicit taller height (${labelPosition})`, async ({page}) => {
            const targetHeight = (labelPosition === 'top' || labelPosition === 'bottom') ? 76 : 52,
                  id           = await mountField(page, {
                      clearable: false,
                      height   : targetHeight,
                      labelPosition,
                      value    : 'Plain input'
                  });

            await expect(page.locator(`#${id} input`)).toBeVisible();
            const g = await readFieldGeometry(page, id);

            expect(g.wrapper).toBeNull();
            expect(g.field.height).toBeCloseTo(targetHeight, 0);

            if (labelPosition === 'left' || labelPosition === 'right' || labelPosition === 'inline') {
                expect(g.input.height).toBeCloseTo(targetHeight, 0);
            } else {
                expect(g.input.height).toBeGreaterThanOrEqual(46);
            }
        });
    }

    test('stretches NumberField 50%/50% spin buttons, ComboBox, PickerField, flex-stretched TextField, and TextArea triggers', async ({page}) => {
        const numId = await mountField(page, {
            importPath   : '../form/field/Number.mjs',
            ntype        : 'numberfield',
            clearable    : true,
            height       : 58,
            labelPosition: 'left',
            value        : 42
        });
        const numTopDefaultId = await mountField(page, {
            importPath   : '../form/field/Number.mjs',
            ntype        : 'numberfield',
            clearable    : true,
            labelPosition: 'top',
            value        : 7
        });
        const comboId = await mountField(page, {
            importPath   : '../form/field/ComboBox.mjs',
            ntype        : 'combobox',
            height       : 50,
            labelPosition: 'left',
            store        : {data: [{id: '1', name: 'Alpha'}]},
            value        : '1'
        });
        const pickerId = await mountField(page, {
            importPath   : '../form/field/Picker.mjs',
            ntype        : 'pickerfield',
            height       : 50,
            labelPosition: 'inline',
            value        : 'Picked'
        });
        const areaId = await mountField(page, {
            importPath   : '../form/field/TextArea.mjs',
            ntype        : 'textarea',
            clearable    : true,
            height       : 104,
            labelPosition: 'inline',
            value        : 'Multi-line\ncontent'
        });

        // Flex-stretched TextField inside a fixed-height hbox container with align: 'stretch'
        const hostRes = await page.evaluate(async () => {
            const res = await Neo.worker.App.createNeoInstance({
                importPath: '../container/Base.mjs',
                ntype     : 'container',
                parentId  : 'component-test-viewport',
                flex      : 'none',
                height    : 64,
                width     : 320,
                layout    : {ntype: 'hbox', align: 'stretch'},
                items     : [{
                    ntype    : 'textfield',
                    clearable: true,
                    flex     : 1,
                    hideLabel: true,
                    style    : {margin: 0},
                    value    : 'Flex stretched'
                }]
            });
            return res;
        });
        expect(hostRes.success).toBe(true);
        rootIds.push(hostRes.id);
        const flexFieldId = await page.locator(`#${hostRes.id} .neo-textfield`).getAttribute('id');

        const numG = await readFieldGeometry(page, numId);
        expect(numG.wrapper.height).toBeCloseTo(58, 0);
        for (const trigger of numG.triggers) {
            expect(trigger.height).toBeCloseTo(numG.wrapper.clientHeight, 0);
        }
        expect(numG.spins).toHaveLength(2);
        const [upSpin, downSpin] = numG.spins;
        expect(upSpin.height + downSpin.height).toBeCloseTo(numG.wrapper.clientHeight, 0);
        expect(Math.abs(upSpin.height - numG.wrapper.clientHeight / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs(downSpin.height - numG.wrapper.clientHeight / 2)).toBeLessThanOrEqual(1);
        expect(Math.abs((downSpin.y + downSpin.height) - (numG.wrapper.y + numG.wrapper.height - numG.wrapper.borderBottom))).toBeLessThan(1);

        const numTopDefaultG = await readFieldGeometry(page, numTopDefaultId);
        expect(numTopDefaultG.wrapper.height).toBeCloseTo(25, 0);
        expect(numTopDefaultG.wrapper.clientHeight).toBeCloseTo(23, 0);
        expect(numTopDefaultG.spins).toHaveLength(2);
        expect(numTopDefaultG.spins[0].height + numTopDefaultG.spins[1].height).toBeCloseTo(numTopDefaultG.wrapper.clientHeight, 0);
        expect(numTopDefaultG.spins[0].height).toBeGreaterThanOrEqual(11);
        expect(numTopDefaultG.spins[1].height).toBeGreaterThanOrEqual(11);

        for (const targetId of [comboId, pickerId, areaId, flexFieldId]) {
            const g = await readFieldGeometry(page, targetId);
            expect(g.triggers.length).toBeGreaterThan(0);
            for (const trigger of g.triggers) {
                expect(trigger.height).toBeCloseTo(g.wrapper.clientHeight, 0);
            }
        }
    });

    test('preserves default heights, in-flow counter/error rows, and Material asymmetric focus-border geometry', async ({page}) => {
        const defaultLeftId   = await mountField(page, {labelPosition: 'left', value: 'Default'}),
              defaultBottomId = await mountField(page, {labelPosition: 'bottom', value: 'Bottom'}),
              chipId          = await mountField(page, {
                  importPath: '../form/field/Chip.mjs',
                  ntype     : 'chipfield',
                  labelText : 'Tags'
              }),
              gridInlineId    = await mountField(page, {
                  clearable         : true,
                  error             : 'Check value',
                  height            : 96,
                  labelPosition     : 'inline',
                  maxLength         : 40,
                  showCharacterCount: true,
                  value             : 'Counted'
              }),
              materialSimId   = await mountField(page, {
                  clearable    : true,
                  labelPosition: 'left',
                  style        : {
                      margin                                      : '12px',
                      '--neo-textfield-input-height'              : '56px',
                      '--neo-textfield-border-top-width'          : '0px',
                      '--neo-textfield-border-bottom-width'       : '1px',
                      '--neo-textfield-border-bottom-width-active': '2px',
                      height                                      : '56px'
                  },
                  value        : 'Material control'
              });

        const defLeft   = await readFieldGeometry(page, defaultLeftId),
              defBottom = await readFieldGeometry(page, defaultBottomId),
              chipG     = await readFieldGeometry(page, chipId);

        expect(defLeft.field.height).toBeCloseTo(27, 0);
        expect(defLeft.wrapper.clientHeight).toBeCloseTo(25, 0);
        expect(defLeft.triggers[0].height).toBeCloseTo(25, 0);

        // ChipField preserves its 31px padded wrapper height rather than clamping to 27px
        expect(chipG.wrapper.height).toBeCloseTo(31, 0);

        // Bottom-labelled default field contains both its 25px outer input wrapper and its bottom label without clipping
        expect(defBottom.wrapper.height).toBeCloseTo(25, 0);
        expect(defBottom.triggers[0].height).toBeCloseTo(defBottom.wrapper.clientHeight, 0);
        expect(defBottom.field.height).toBeGreaterThanOrEqual(defBottom.wrapper.height + defBottom.label.height);

        // Grid inline field with counter + error keeps labelWrapper and trigger confined to the 1fr input row
        await page.evaluate(id => Neo.worker.App.setConfigs({id, clean: false, error: 'Check value'}), gridInlineId);
        const counter = page.locator(`#${gridInlineId} .neo-textfield-character-count`);
        await expect(counter).toBeVisible();
        const gridG      = await readFieldGeometry(page, gridInlineId),
              counterBox = await counter.boundingBox();
        expect(gridG.labelWrapper.height).toBeCloseTo(gridG.wrapper.height, 0);
        expect(gridG.triggers[0].height).toBeCloseTo(gridG.wrapper.clientHeight, 0);
        expect(counterBox.y).toBeGreaterThanOrEqual(gridG.wrapper.y + gridG.wrapper.height - 1);

        // Material-style 56px outer box: 55px inner unfocused -> 54px inner focused (2px bottom border)
        const matUnfocused = await readFieldGeometry(page, materialSimId);
        expect(matUnfocused.wrapper.height).toBeCloseTo(56, 0);
        expect(matUnfocused.wrapper.clientHeight).toBeCloseTo(55, 0);
        expect(matUnfocused.triggers[0].height).toBeCloseTo(55, 0);

        await page.locator(`#${materialSimId} input`).focus();
        await expect(page.locator(`#${materialSimId}`)).toHaveClass(/neo-focus/);
        const matFocused = await readFieldGeometry(page, materialSimId);
        expect(matFocused.wrapper.height).toBeCloseTo(56, 0);
        expect(matFocused.wrapper.clientHeight).toBeCloseTo(54, 0);
        expect(matFocused.triggers[0].height).toBeCloseTo(54, 0);
    });

    test('keeps the ChipField picker trigger at its token height, centred, with no chips and with chips that wrap', async ({page}) => {
        const
            store   = {data: Array.from({length: 8}, (_, i) => ({id: String(i + 1), name: `Tag ${i + 1}`}))},
            emptyId = await mountField(page, {importPath: '../form/field/Chip.mjs', ntype: 'chipfield', labelText: 'Tags', store}),
            wrapId  = await mountField(page, {
                importPath: '../form/field/Chip.mjs',
                ntype     : 'chipfield',
                labelText : 'Tags',
                store,
                value     : ['1', '2', '3', '4', '5', '6', '7', '8']
            }),
            token   = await page.evaluate(id => parseFloat(getComputedStyle(document.getElementById(id)).getPropertyValue('--neo-textfield-input-height')), emptyId);

        for (const id of [emptyId, wrapId]) {
            const g       = await readFieldGeometry(page, id),
                  trigger = g.triggers.at(-1);

            // The hit area keeps the token height, centred on the wrapper, whatever the chips do to the wrapper
            expect(trigger.height).toBeCloseTo(token, 0);
            expect(Math.abs((trigger.y + trigger.height / 2) - (g.wrapper.y + g.wrapper.height / 2))).toBeLessThanOrEqual(1)
        }

        // The control arm: the chips did wrap, so the wrapper is taller than one row
        expect((await readFieldGeometry(page, wrapId)).wrapper.height).toBeGreaterThan(token * 1.5)
    });

    test('theme-equality stage cells disable vbox flex-1 vertical stretching', async ({page}) => {
        await page.goto('/test/playwright/component/apps/theme-equality/index.html');
        await page.waitForSelector('#theme-equality-viewport[data-ready="true"]', {timeout: 30000});

        const stageMetrics = await page.evaluate(() => {
            const tfInline = document.querySelector('#eq-cell-textfield-inline .neo-textfield'),
                  btnCell  = document.querySelector('#eq-cell-button-default'),
                  btn      = btnCell.querySelector('.neo-button');

            return {
                tfInlineFlex : tfInline.style.flex,
                btnFlex      : btn.style.flex,
                btnCellHeight: btnCell.getBoundingClientRect().height,
                btnHeight    : btn.getBoundingClientRect().height
            };
        });

        expect(stageMetrics.tfInlineFlex).toBe('0 0 auto');
        expect(stageMetrics.btnFlex).toBe('0 0 auto');
        expect(stageMetrics.btnCellHeight).toBeGreaterThanOrEqual(160);
        expect(stageMetrics.btnHeight).toBeLessThan(60);
    });
});
