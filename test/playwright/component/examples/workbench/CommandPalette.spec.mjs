import {test, expect} from '@playwright/test';

/**
 * @summary Computes WCAG 2.1 relative luminance and contrast ratio in the browser page context.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{labelRatio: Number, mutedRatio: Number}>}
 */
function measurePaletteContrast(page) {
    return page.evaluate(() => {
        const parseRgba = value => {
            const match = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/);
            return match
                ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])]
                : [0, 0, 0, 1]
        };

        const blend = (fg, bg) => {
            const alpha = fg[3];
            return [
                fg[0] * alpha + bg[0] * (1 - alpha),
                fg[1] * alpha + bg[1] * (1 - alpha),
                fg[2] * alpha + bg[2] * (1 - alpha),
                1
            ]
        };

        const luminance = ([r, g, b]) => {
            const channel = v => {
                const s = v / 255;
                return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
            };
            return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
        };

        const ratio = (a, b) => {
            const l1 = luminance(a),
                  l2 = luminance(b);
            return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
        };

        const surface = document.querySelector('.neo-command-palette-surface'),
              label   = document.querySelector('.neo-command-palette-option:not(.neo-is-unavailable) .neo-command-palette-option-label'),
              muted   = document.querySelector('.neo-command-palette-status'),
              bg      = parseRgba(getComputedStyle(surface).backgroundColor),
              fgLabel = blend(parseRgba(getComputedStyle(label).color), bg),
              fgMuted = blend(parseRgba(getComputedStyle(muted).color), bg);

        return {
            labelRatio: ratio(fgLabel, bg),
            mutedRatio: ratio(fgMuted, bg)
        }
    })
}

test.describe('Neo.examples.workbench.CommandPalette (component)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test('mounts combobox dialog, filters, traps Tab, refuses unavailable items, dispatches actions, restores focus, and meets WCAG AA across themes and 320px viewports', async ({page}) => {
        const appWorker = page.workers().find(worker => worker.url().includes('/worker/App'));
        expect(appWorker).toBeTruthy();

        const ids = await appWorker.evaluate(async () => {
            const [{default: Button}, {default: CommandPalette}] = await Promise.all([
                import('../../../src/button/Base.mjs'),
                import('../../../examples/workbench/CommandPalette.mjs')
            ]);

            const viewport = Neo.getComponent('component-test-viewport'),
                  invoked  = [];

            globalThis.__paletteInvoked = invoked;

            const trigger = Neo.create(Button, {
                appName : viewport.appName,
                parentId: viewport.id,
                text    : 'Open Commands',
                windowId: viewport.windowId
            });

            viewport.add(trigger);

            const palette = Neo.create(CommandPalette, {
                appName        : viewport.appName,
                parentComponent: viewport,
                theme          : 'neo-theme-neo-dark',
                windowId       : viewport.windowId,
                actionProvider : () => [{
                    id               : 'locked-deploy',
                    available        : false,
                    description      : 'Requires release approval.',
                    group            : 'Release',
                    handler          : () => invoked.push('locked-deploy'),
                    label            : 'Publish release',
                    unavailableReason: 'Requires approval'
                }, {
                    id         : 'run-diagnostics',
                    available  : true,
                    description: 'Inspect worker health and queue depth.',
                    group      : 'Diagnostics',
                    handler    : () => invoked.push('run-diagnostics'),
                    keywords   : ['health', 'worker'],
                    label      : 'Run worker diagnostics',
                    shortcut   : 'F8'
                }, {
                    id       : 'toggle-inspector',
                    available: true,
                    group    : 'View',
                    handler  : () => invoked.push('toggle-inspector'),
                    label    : 'Toggle live inspector'
                }]
            });

            return {
                closeButtonId: palette.closeButtonId,
                inputId      : palette.inputId,
                paletteId    : palette.id,
                statusId     : palette.statusId,
                triggerId    : trigger.id
            }
        });

        const trigger = page.locator(`#${ids.triggerId}`);
        await expect(trigger).toBeVisible();
        await trigger.focus();

        await appWorker.evaluate(({paletteId, triggerId}) => {
            return Neo.getComponent(paletteId).open({
                returnFocusId: triggerId,
                theme        : 'neo-theme-neo-dark'
            })
        }, ids);

        const dialog      = page.getByRole('dialog', {name: 'Command Palette'}),
              input       = page.locator(`#${ids.inputId}`),
              closeButton = page.locator(`#${ids.closeButtonId}`),
              status      = page.locator(`#${ids.statusId}`);

        await expect(dialog).toBeVisible();
        await expect(input).toBeFocused();
        await expect(status).toHaveText('3 commands (2 available, 1 unavailable).');

        // Verify dark-theme WCAG AA contrast (>= 4.5:1)
        const darkContrast = await measurePaletteContrast(page);
        expect(darkContrast.labelRatio).toBeGreaterThanOrEqual(4.5);
        expect(darkContrast.mutedRatio).toBeGreaterThanOrEqual(4.5);

        // Verify light-theme WCAG AA contrast (>= 4.5:1)
        await appWorker.evaluate(({paletteId}) => {
            Neo.getComponent(paletteId).theme = 'neo-theme-neo-light'
        }, ids);
        await expect(page.locator(`#${ids.paletteId}`)).toHaveClass(/neo-theme-neo-light/);
        const lightContrast = await measurePaletteContrast(page);
        expect(lightContrast.labelRatio).toBeGreaterThanOrEqual(4.5);
        expect(lightContrast.mutedRatio).toBeGreaterThanOrEqual(4.5);

        // Tab traps focus inside the modal between combobox input and Esc button
        await page.keyboard.press('Tab');
        await expect(closeButton).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(input).toBeFocused();

        // Pointer click on unavailable option refuses execution and announces reason
        const lockedOption = page.getByRole('option', {name: /Publish release/}),
              lockedBox    = await lockedOption.boundingBox();
        await page.mouse.click(lockedBox.x + lockedBox.width / 2, lockedBox.y + lockedBox.height / 2);
        await expect(dialog).toBeVisible();
        await expect(status).toHaveText('Publish release is unavailable: Requires approval.');
        expect(await appWorker.evaluate(() => globalThis.__paletteInvoked)).toEqual([]);

        // Narrow 320x640 viewport check: no horizontal overflow
        await page.setViewportSize({width: 320, height: 640});
        const box = await dialog.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(320);

        // Filter by keyword, press Enter on available match, verify handler dispatch and focus restoration
        await input.fill('worker');
        await expect(page.getByRole('option')).toHaveCount(1);
        await expect(status).toHaveText('1 command matching "worker".');
        await page.keyboard.press('Enter');

        await expect(dialog).toHaveCount(0);
        expect(await appWorker.evaluate(() => globalThis.__paletteInvoked)).toEqual(['run-diagnostics']);
        await expect(trigger).toBeFocused()
    })
});
