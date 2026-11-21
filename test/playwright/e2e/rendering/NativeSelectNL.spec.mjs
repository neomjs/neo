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
    // The live field is named 'fruit'; the field's states below it carry names of their own
    await expect.poll(async () => {
        fields = await app.queryComponent({ntype: 'selectfield', name: 'fruit'}, ['id', 'store.id']);
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
        // The live field starts filled with Strawberry ('0'): one step up is Lemon, the number 0
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
        await expect.poll(async () => (await app.getComponent(id, ['value'])).value).toBe(0);
        expect(await page.evaluate(() => window.selectKeyDefaults.filter(event => event.key === 'ArrowUp')))
            .toEqual([{key: 'ArrowUp', prevented: false}]);

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
    await app.setProperties(id, {customizable: false, required: true, value: null});
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

test('aligns closed chrome, ComboBox-style trigger, and open picker across all five themes without an icon font', async ({page, neuralLink}) => {
    const allThemes = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-dark',
        'neo-theme-light',
        'neo-theme-cyberpunk'
    ];

    await neuralLink.routeConfig(page, config => ({
        ...config,
        themes        : allThemes,
        useAiClient   : true,
        useFontAwesome: false
    }));
    await page.goto('/examples/form/field/select/index.html');
    const app = await neuralLink.connectToApp('Neo.examples.form.field.select');

    let viewports, selectFields, textFields;
    await expect.poll(async () => {
        viewports    = await app.queryComponent({ntype: 'configuration-viewport'}, ['id']);
        selectFields = await app.queryComponent({ntype: 'selectfield', name: 'fruit'}, ['id']);
        textFields   = await app.queryComponent({ntype: 'textfield', labelText: 'labelText'}, ['id']);
        return viewports.length && selectFields.length && textFields.length
    }).toBeTruthy();

    const viewportId  = viewports[0].id,
          selectId    = selectFields[0].id,
          textInputEl = page.locator(`#${textFields[0].id} .neo-textfield-input`),
          selectEl    = page.locator(`#${selectId} .neo-selectfield-input`),
          invalidEl   = page.locator('.neo-selectfield.neo-invalid .neo-selectfield-input'),
          disabledBox = page.locator('.neo-selectfield.neo-disabled');

    for (const theme of allThemes) {
        await app.setProperties(viewportId, {theme});
        await expect(page.locator(`#${viewportId}`)).toHaveClass(new RegExp(`\\b${theme}\\b`));

        // Blur and move pointer to (0, 0) so resting border settles after the 250ms transition
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.activeElement?.blur?.());

        const expectedHeight = theme === 'neo-theme-cyberpunk' ? 28 : 27;
        await expect.poll(async () => Math.round((await selectEl.boundingBox()).height)).toBe(expectedHeight);

        await expect.poll(() => page.evaluate(({selId, txtRootId}) => {
            const selRoot = document.getElementById(selId),
                  txtRoot = document.getElementById(txtRootId),
                  sel     = selRoot?.querySelector('.neo-selectfield-input'),
                  txt     = txtRoot?.querySelector('.neo-textfield-input'),
                  txtBox  = txt?.closest('.neo-input-wrapper') || txt,
                  settled = el => el && el.getAnimations().every(a => a.playState !== 'running');

            return !selRoot.classList.contains('neo-focus')
                && !txtRoot.classList.contains('neo-focus')
                && settled(sel)
                && settled(txtBox)
                && getComputedStyle(sel).borderTopColor === getComputedStyle(txtBox).borderTopColor
        }, {selId: selectId, txtRootId: textFields[0].id})).toBe(true);

        const closed = await page.evaluate(({selId, txtSel}) => {
            const sel    = document.querySelector(`#${selId} .neo-selectfield-input`),
                  txt    = document.querySelector(txtSel),
                  txtBox = txt.closest('.neo-input-wrapper') || txt,
                  cs     = getComputedStyle(sel),
                  tcs    = getComputedStyle(txt),
                  tbcs   = getComputedStyle(txtBox),
                  icon   = getComputedStyle(sel, '::picker-icon');

            return {
                appearance : cs.appearance,
                bg         : cs.backgroundColor,
                bgImage    : cs.backgroundImage,
                bgSize     : cs.backgroundSize,
                border     : cs.borderTopColor,
                color      : cs.color,
                radius     : cs.borderTopLeftRadius,
                textBg     : tbcs.backgroundColor,
                textBorder : tbcs.borderTopColor,
                textColor  : tcs.color,
                textRadius : tbcs.borderTopLeftRadius,
                iconContent: icon.content,
                iconWidth  : icon.width,
                iconBorderR: icon.borderRightWidth
            }
        }, {selId: selectId, txtSel: `#${textFields[0].id} .neo-textfield-input`});

        expect(closed.appearance).toBe('base-select');
        expect(closed.bg).toBe(closed.textBg);
        expect(closed.border).toBe(closed.textBorder);
        expect(closed.color).toBe(closed.textColor);
        expect(closed.radius).toBe(closed.textRadius);
        expect(closed.bgImage).toContain('linear-gradient');
        expect(closed.bgSize).toBe('22px 100%');
        expect(closed.iconContent).toBe('""');
        expect(closed.iconWidth).toBe('6px');
        expect(parseFloat(closed.iconBorderR)).toBeGreaterThanOrEqual(1);

        // Focus, invalid, and disabled state parity
        await textInputEl.focus();
        let textFocusBorder;
        await expect.poll(async () => {
            textFocusBorder = await page.evaluate(({txtRootId, closedBorder}) => {
                const txtRoot = document.getElementById(txtRootId),
                      txt     = txtRoot?.querySelector('.neo-textfield-input'),
                      txtBox  = txt?.closest('.neo-input-wrapper') || txt;

                if (!txtRoot?.classList.contains('neo-focus') || !txtBox?.getAnimations().every(a => a.playState !== 'running')) {
                    return null
                }

                const border = getComputedStyle(txtBox).borderTopColor;
                return border !== closedBorder ? border : null
            }, {txtRootId: textFields[0].id, closedBorder: closed.textBorder});
            return textFocusBorder
        }).not.toBeNull();
        await selectEl.focus();
        await expect.poll(() => selectEl.evaluate(el => {
            return el.getAnimations().every(a => a.playState !== 'running') ? getComputedStyle(el).borderTopColor : null
        })).toBe(textFocusBorder);

        const invalidBorder = await invalidEl.evaluate(el => getComputedStyle(el).borderTopColor);
        expect(invalidBorder).not.toBe(closed.border);
        await expect.poll(() => disabledBox.evaluate(el => parseFloat(getComputedStyle(el).opacity))).toBeLessThan(1);

        // Open customizable picker follows active theme surface, text, and selected option
        await selectEl.click();
        await expect.poll(() => selectEl.evaluate(el => el.matches(':open'))).toBe(true);
        const picker = await selectEl.evaluate(el => {
            const p       = getComputedStyle(el, '::picker(select)'),
                  checked = getComputedStyle(el.querySelector('option:checked')),
                  uncheck = getComputedStyle(el.querySelector('option:not(:checked):not([value=""])'));

            return {
                pickerBg    : p.backgroundColor,
                pickerBorder: p.borderTopColor,
                optColor    : uncheck.color,
                checkedBg   : checked.backgroundColor,
                checkedColor: checked.color
            }
        });

        if (theme.includes('dark') || theme.includes('cyberpunk')) {
            expect(picker.pickerBg).not.toBe('rgb(255, 255, 255)');
            expect(picker.optColor).not.toBe('rgb(0, 0, 0)');
        } else {
            expect(picker.pickerBg).toBe('rgb(255, 255, 255)');
        }
        expect(picker.checkedBg).not.toBe('rgba(0, 0, 0, 0)');
        await page.keyboard.press('Escape');
        await expect.poll(() => selectEl.evaluate(el => el.matches(':open'))).toBe(false);
    }

    // Classic native fallback removes base-select and the custom 22px divider so only one native arrow renders
    await app.setProperties(selectId, {customizable: false});
    await expect.poll(() => selectEl.evaluate(el => {
        const cs = getComputedStyle(el);
        return cs.appearance !== 'base-select' && cs.backgroundImage === 'none'
    })).toBe(true);
});
