import {test, expect} from '@playwright/test';

import {
    ELEMENT_SET,
    PROPERTIES,
    readElements,
    resolveOwners
} from '../../../../../buildScripts/util/theme-release-compare.mjs';

/**
 * @summary The in-page reads of `buildScripts/util/theme-release-compare.mjs` against a real DOM: what an element
 * paints, what it paints on, and which custom property a differing value is measured to flow through.
 */
test.describe('theme-release-compare — the in-page reads', () => {
    test('measures the variable a label paints through, not an equal-valued role, and the one a font size reads', async ({page}) => {
        await page.setContent(`
            <style>
                :root        {--neo-color-text-muted: rgb(62, 68, 88); --neo-control-font-size: 20px}
                .neo-button  {--neo-button-label-color: var(--neo-color-text-muted); font-size: var(--neo-control-font-size)}
                .neo-button  {& .neo-button-text {color: var(--neo-button-label-color)}}
                .neo-toolbar {background-color: rgb(255, 255, 255)}
            </style>
            <div class="neo-toolbar"><div class="neo-button"><span class="neo-button-text">Save</span></div></div>`);

        const elements = await page.evaluate(readElements, {elementSet: ELEMENT_SET, properties: PROPERTIES, perGroup: 6}),
              button   = elements.find(item => item.group === 'button');

        expect(button.values.color).toBe('rgba(62, 68, 88, 1)');
        expect(button.values['font-size']).toBe('20px');
        expect(button.backdrop.color).toBe('rgba(255, 255, 255, 1)');

        const [color, fontSize] = await page.evaluate(resolveOwners, [
            {group: 'button', index: 0, property: 'color'},
            {group: 'button', index: 0, property: 'font-size'}
        ]);

        expect(color).toEqual({variable: '--neo-button-label-color', declared: 'var(--neo-color-text-muted)'});
        expect(fontSize.variable).toBe('--neo-control-font-size')
    });

    test('a probe restores an inline !important value, and a button two groups sample keeps both markers', async ({page}) => {
        await page.setContent(`
            <style>
                .neo-button {font-size: var(--neo-button-font-size, 12px); color: var(--neo-button-label-color, rgb(1, 2, 3))}
            </style>
            <div class="neo-button neo-tab-header-button" style="--neo-button-font-size: 20px !important"><span class="neo-button-text">Tab</span></div>`);

        const elements = await page.evaluate(readElements, {elementSet: ELEMENT_SET, properties: PROPERTIES, perGroup: 6});

        expect(elements.filter(item => item.values['font-size'] === '20px').map(item => item.group).sort()).toEqual(['button', 'tab']);

        const [buttonSize, tabSize] = await page.evaluate(resolveOwners, [
            {group: 'button', index: 0, property: 'font-size'},
            {group: 'tab',    index: 0, property: 'font-size'}
        ]);

        expect(buttonSize, 'the first group still finds its sample').toEqual({variable: '--neo-button-font-size', declared: '20px'});
        expect(tabSize).toEqual({variable: '--neo-button-font-size', declared: '20px'});

        expect(await page.locator('.neo-button').evaluate(el => [
            el.style.getPropertyValue('--neo-button-font-size'), el.style.getPropertyPriority('--neo-button-font-size'), getComputedStyle(el).fontSize
        ]), 'the inline value, its priority and the size it paints survive the probes').toEqual(['20px', 'important', '20px'])
    });

    test('names a declaration only when it is the one that wins, not one that resolves to the same value', async ({page}) => {
        await page.setContent(`
            <style>
                .neo-button {--neo-button-font-size: 12px; font-size: var(--neo-button-font-size)}
            </style>
            <div class="neo-button" id="tie"  style="--neo-button-font-size: var(--neo-button-min-height) !important; --neo-button-min-height: 12px"><span class="neo-button-text">Tie</span></div>
            <div class="neo-button" id="wins" style="--neo-button-font-size: var(--neo-button-min-height) !important; --neo-button-min-height: 20px"><span class="neo-button-text">Wins</span></div>`);

        await page.evaluate(readElements, {elementSet: ELEMENT_SET, properties: PROPERTIES, perGroup: 6});

        const [tie, wins] = await page.evaluate(resolveOwners, [
            {group: 'button', index: 0, property: 'font-size'},
            {group: 'button', index: 1, property: 'font-size'}
        ]);

        expect(tie,  'the winning and the losing declaration both resolve to 12px').toEqual({variable: '--neo-button-font-size', declared: null});
        expect(wins, 'removing the winner alone moves the value').toEqual({variable: '--neo-button-font-size', declared: 'var(--neo-button-min-height)'});

        expect(await page.locator('#tie').evaluate(el => getComputedStyle(el).fontSize), 'the probes restore what they removed').toBe('12px')
    })
});
