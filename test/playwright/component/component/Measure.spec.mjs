import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.main.DomAccess#measure()` turns a CSS length into px, and `getBoundingClientRect()` reports a node's
 * computed `min-width` / `min-height` through it, which is what `Neo.util.Rectangle#constrainTo()` reads.
 *
 * Which node's computed style gets read is the whole question, so every arm runs on a real DOM: a probe with a known
 * font size and a width far from any answer, so reading the probe instead of the measurement cannot pass.
 */
test.describe('Neo.main.DomAccess measuring lengths', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'});

        await page.evaluate(() => {
            const probe = document.createElement('div');

            probe.id = 'measure-probe';
            Object.assign(probe.style, {fontSize: '20px', minHeight: '0.9em', minWidth: '0.9em', position: 'fixed', width: '300px'});
            document.body.appendChild(probe)
        })
    });

    test('a font-relative length answers its own px, as a Number', async ({page}) => {
        expect(await page.evaluate(() => Neo.main.DomAccess.measure({id: 'measure-probe', value: '2em'}))).toBe(40)
    });

    test('a fractional computed min-width and min-height reach the rect', async ({page}) => {
        // 0.9em at 20px computes to 18px; a fraction needs a font size it does not divide
        await page.evaluate(() => {document.getElementById('measure-probe').style.fontSize = '16px'});

        const {minHeight, minWidth} = await page.evaluate(() => Neo.main.DomAccess.getBoundingClientRect({id: 'measure-probe'}));

        expect({minHeight, minWidth}).toEqual({minHeight: 14.4, minWidth: 14.4})
    });

    test('a percentage comes back unchanged: it has no px value without an axis and a containing block', async ({page}) => {
        expect(await page.evaluate(() => Neo.main.DomAccess.measure({id: 'measure-probe', value: '50%'}))).toBe('50%')
    })
});
