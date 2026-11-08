import {test, expect} from '@playwright/test';

/**
 * The Workstation projects its own palette into the dock's preview aliases, and that projection must outrank the
 * engine's `:where()` value sheets by weight. The engine appends its per-class theme sheets after the app's, so an
 * equal-weight projection loses on load order: the light DEFAULT accent then paints the engine's `#0d9488`
 * instead of the Workstation's `#0f766e`. In dark both values agree, so only the light skin can witness it.
 */

const APP       = 'apps/workstation/index.html';
const DOCK_HOST = '.workstation-dock-host';

test.describe('Workstation theme projection', () => {
    test('the light dock accent is the Workstation\'s own pigment, not the engine default', async ({page}) => {
        await page.goto(APP);
        await page.waitForSelector(DOCK_HOST, {state: 'attached', timeout: 60000});

        await page.locator('button, .neo-button').filter({hasText: /light mode/i}).first().click();

        // The swap is done when the app palette computes to the daylight ground on the dock host
        await page.waitForFunction(host =>
            getComputedStyle(document.querySelector(host)).getPropertyValue('--workstation-ground').trim() === '#f2f5f9'
        , DOCK_HOST, {timeout: 15000});

        const read = await page.evaluate(() => {
            const style = getComputedStyle(document.querySelector('.workstation-workspace .neo-dashboard'));

            return {
                accent: style.getPropertyValue('--agent-dock-preview-accept').trim(),
                fill  : style.getPropertyValue('--agent-dock-preview-accept-fill').trim(),
                signal: style.getPropertyValue('--workstation-signal').trim()
            }
        });

        expect(read.signal, 'non-vacuity: the Workstation light palette is applied').toBe('#0f766e');
        expect(read.accent, 'the app projection outranks the engine value sheet').toBe('#0f766e');
        expect(read.fill).toBe('rgba(15, 118, 110, 0.14)')
    })
});
