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

test.describe('Neo.dialog.CommandPalette (component)', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test('mounts public Engine dialog, cancels native defaults on opt-in shortcuts while preserving body F8, scopes focus/owner teardown, and meets WCAG AA', async ({page}) => {
        const appWorker = page.workers().find(worker => worker.url().includes('/worker/App'));
        expect(appWorker).toBeTruthy();

        await page.evaluate(() => {
            window.__keyDefaultLog = [];
            window.addEventListener('keydown', event => {
                if (event.key === 'F1' || event.key === 'F8' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
                    window.__keyDefaultLog.push({
                        ctrlKey         : event.ctrlKey,
                        defaultPrevented: event.defaultPrevented,
                        key             : event.key,
                        metaKey         : event.metaKey,
                        targetId        : event.target?.id || null
                    })
                }
            }, false)
        });

        const ids = await appWorker.evaluate(async () => {
            const [{default: Button}, {default: Container}, {default: CommandPalette}] = await Promise.all([
                import('../../../src/button/Base.mjs'),
                import('../../../src/container/Base.mjs'),
                import('../../../src/dialog/CommandPalette.mjs')
            ]);

            const viewport = Neo.getComponent('component-test-viewport'),
                  invoked  = [];

            globalThis.__paletteInvoked = invoked;

            // Existing body-level F8 reservation that CommandPalette must never overwrite or delete
            Neo.main.DomEvents.registerPreventDefaultKeys({
                id      : 'document.body',
                keys    : ['F8'],
                windowId: viewport.windowId
            });

            // Default CommandPalette (enableShortcuts defaults to false) leaves shortcuts unbound and F8 intact
            const defaultPalette = Neo.create(CommandPalette, {
                commands: [{id: 'noop', label: 'Noop', handler: () => {}}],
                owner   : viewport
            });

            const triggerA = Neo.create(Button, {
                appName : viewport.appName,
                parentId: viewport.id,
                text    : 'Launcher A',
                windowId: viewport.windowId
            });

            let palette;

            const triggerB = Neo.create(Button, {
                appName : viewport.appName,
                handler : () => palette.show(),
                parentId: viewport.id,
                text    : 'Launcher B',
                windowId: viewport.windowId
            });

            const removableOwner = Neo.create(Container, {
                appName : viewport.appName,
                parentId: viewport.id,
                windowId: viewport.windowId
            });

            viewport.add([triggerA, triggerB, removableOwner]);

            palette = Neo.create(CommandPalette, {
                enableShortcuts: true,
                owner          : viewport,
                theme          : 'neo-theme-neo-dark',
                commandProvider: () => [{
                    id               : 'locked-deploy',
                    available        : false,
                    description      : 'Requires release approval.',
                    group            : 'Release',
                    handler          : () => invoked.push('locked-deploy'),
                    label            : 'Publish release',
                    unavailableReason: 'Requires approval'
                }, {
                    id     : 'slow-save',
                    group  : 'File',
                    handler: () => new Promise(resolve => {
                        globalThis.__finishSlowSave = resolve
                    }),
                    label: 'Slow save'
                }, {
                    id         : 'run-diagnostics',
                    available  : true,
                    description: 'Inspect worker health and queue depth.',
                    group      : 'Diagnostics',
                    handler    : () => invoked.push('run-diagnostics'),
                    keywords   : ['health', 'worker'],
                    label      : 'Run worker diagnostics',
                    shortcut   : 'F8'
                }]
            });

            palette.on('select', ({record}) => {
                if (record?.id === 'slow-save') {
                    globalThis.__slowSaveCompleted = true
                }
            });

            const childPalette = Neo.create(CommandPalette, {
                commands: [{id: 'child-cmd', label: 'Child command', handler: () => {}}],
                owner   : removableOwner,
                title   : 'Removable Owner Palette'
            });

            // Destroy defaultPalette and toggle shortcuts off/on to verify body F8 stays intact
            defaultPalette.destroy();
            palette.enableShortcuts = false;
            palette.enableShortcuts = true;

            return {
                childPaletteId: childPalette.id,
                closeButtonId : palette.closeButtonId,
                inputId       : palette.inputId,
                ownerId       : removableOwner.id,
                paletteId     : palette.id,
                statusId      : palette.statusId,
                triggerAId    : triggerA.id,
                triggerBId    : triggerB.id
            }
        });

        // Body F8 reservation remains active after default palette creation/teardown and shortcut toggles
        await page.evaluate(() => document.body.focus());
        await page.keyboard.press('F8');
        expect(await page.evaluate(() => window.__keyDefaultLog.at(-1))).toMatchObject({
            defaultPrevented: true,
            key             : 'F8'
        });

        const triggerA = page.locator(`#${ids.triggerAId}`),
              triggerB = page.locator(`#${ids.triggerBId}`);

        await expect(triggerA).toBeVisible();
        await expect(triggerB).toBeVisible();

        // From a focused button, Control+k, Meta+k, and F1 each cancel their native browser default
        const dialog      = page.getByRole('dialog', {name: 'Command Palette'}),
              input       = page.locator(`#${ids.inputId}`),
              closeButton = page.locator(`#${ids.closeButtonId}`),
              status      = page.locator(`#${ids.statusId}`);

        for (const chord of ['Control+k', 'Meta+k', 'F1']) {
            await triggerA.focus();
            await expect(triggerA).toBeFocused();
            await page.evaluate(() => { window.__keyDefaultLog.length = 0 });

            await page.keyboard.press(chord);
            await expect(dialog).toBeVisible();
            await expect(input).toBeFocused();

            const logged = await page.evaluate(() => window.__keyDefaultLog[0]);
            expect(logged?.defaultPrevented, `${chord} from focused button must prevent native default`).toBe(true);
            expect(logged?.targetId).toBe(ids.triggerAId);

            await page.keyboard.press('Escape');
            await expect(dialog).toHaveCount(0);
            await expect(triggerA).toBeFocused()
        }

        // Opening via show() from Launcher B after an earlier shortcut open from Launcher A returns Escape focus to B
        await triggerB.focus();
        await triggerB.click();
        await expect(dialog).toBeVisible();
        await expect(input).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(triggerB, 'Escape after show() from Launcher B returns to B, not A').toBeFocused();

        // Pending async Save finishing after palette reopened must NOT move focus out of the reopened dialog
        await triggerA.focus();
        await page.keyboard.press('Control+k');
        await expect(dialog).toBeVisible();
        await input.fill('Slow save');
        await page.keyboard.press('Enter');
        await expect(dialog).toHaveCount(0);

        await triggerB.focus();
        await triggerB.click();
        await expect(dialog).toBeVisible();
        await expect(input).toBeFocused();

        await appWorker.evaluate(() => globalThis.__finishSlowSave?.('done'));
        await expect.poll(() => appWorker.evaluate(() => Boolean(globalThis.__slowSaveCompleted))).toBe(true);
        await expect(dialog).toBeVisible();
        await expect(input, 'completed Slow save must keep focus inside reopened dialog').toBeFocused();

        // Verify dark-theme & light-theme WCAG AA contrast (>= 4.5:1)
        const darkContrast = await measurePaletteContrast(page);
        expect(darkContrast.labelRatio).toBeGreaterThanOrEqual(4.5);
        expect(darkContrast.mutedRatio).toBeGreaterThanOrEqual(4.5);

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
        await expect(triggerB).toBeFocused();

        // Removing an owner while its palette is open unmounts and destroys the modal cleanly
        const childDialog = page.getByRole('dialog', {name: 'Removable Owner Palette'});
        await appWorker.evaluate(({childPaletteId}) => {
            Neo.getComponent(childPaletteId).show()
        }, ids);
        await expect(childDialog).toBeVisible();

        const childDestroyed = await appWorker.evaluate(({childPaletteId, ownerId}) => {
            const viewport = Neo.getComponent('component-test-viewport'),
                  owner    = Neo.getComponent(ownerId),
                  child    = Neo.getComponent(childPaletteId);

            viewport.remove(owner);
            return Boolean(child.isDestroyed && !child.owner)
        }, ids);

        expect(childDestroyed).toBe(true);
        await expect(childDialog).toHaveCount(0)
    })
});
