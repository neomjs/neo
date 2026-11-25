import {expect, test}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

const DESKTOP = '/apps/webdesktop/index.html',
      ICON    = '.neo-desktop-launcher .neo-list-item:not(.neo-list-header)',
      WINDOW  = '.neo-dialog.neo-desktop-app-window',
      TASKBAR = '.neo-desktop-taskbar';

/**
 * Each app, the root of the view its window shows, and the window's width at 1440 × 900
 * (`WebDesktop.view.Viewport#appWindowConfigs`)
 * @type {Array[]}
 */
const apps = [
    ['Mail',        '.webdesktop-mail',              880],
    ['Messages',    '.webdesktop-messages',          720],
    ['Calendar',    '.neo-calendar-maincontainer',   920],
    ['Photos',      '.webdesktop-photos',            760],
    ['Music',       '.webdesktop-music',             720],
    ['Documents',   '.webdesktop-documents',         800],
    ['Recycle Bin', '.webdesktop-recycle-bin',       680],
    ['Settings',    '.webdesktop-settings',          480],
    ['Reports',     '.webdesktop-reports',           760],
    ['Help',        '.webdesktop-help',              640]
];

/**
 * @summary Every app of the web desktop opens a working view in a window of its own size, its module and stylesheet
 * loading on its first open, and no app logs an error.
 */

/**
 * A console error carries its source's URL, which names the resource of a failed load. The browser's own
 * `/favicon.ico` request is not the app's: the demo's page declares no icon.
 * @param {Object} page
 * @returns {String[]} The page errors and console errors, filled as they happen
 */
function trackErrors(page) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));

    page.on('console', msg => {
        let url = msg.location()?.url || '';

        msg.type() === 'error' && !url.endsWith('/favicon.ico') && errors.push(`${msg.text()} ${url}`.trim())
    });

    return errors
}

/**
 * @param {Object} page
 */
async function signIn(page) {
    await page.goto(DESKTOP);
    await page.getByText('Alex Morgan', {exact: true}).click();
    await expect(page.locator(ICON).first()).toBeVisible()
}

/**
 * @param {Object} page
 * @param {String} app
 * @returns {Object} The visible window of the app
 */
const windowOf = (page, app) => page.locator(WINDOW).filter({hasText: app}).filter({visible: true});

/**
 * @summary Opens the actual desktop dialog in a native window and waits for its return action.
 * @param {Object} page
 * @param {Object} dialog
 * @returns {Promise<Object>}
 */
async function detachWindow(page, dialog) {
    const [popup] = await Promise.all([
        page.waitForEvent('popup'), dialog.getByRole('button', {name: 'Pop out window'}).click()
    ]);
    await expect(popup.getByRole('button', {name: 'Back to desktop'})).toBeVisible();
    return popup
}

/**
 * Waits for the window's opening flight to land in the App worker. A window shows while it still grows out of
 * its icon, so its Close button moves until `Neo.dialog.Base#show`'s mount flight settles, and a click aimed at
 * it earlier can lift elsewhere. `PhoneAndTouch.spec.mjs` waits the same way.
 * @param {Object} page
 * @param {Object} window
 * @param {String} app
 */
async function expectOpened(browser, page, window, app) {
    const id        = await window.getAttribute('id'),
          appWorker = await attachPageSharedAppWorker({browser, page});

    try {
        await expect.poll(() => appWorker.evaluate(id => {
            const dialog = Neo.get(id);

            return dialog?.mounted && !dialog.hidden && dialog.mountFlight === null
        }, id), {message: `${app} has finished opening`}).toBe(true)
    } finally {
        await appWorker.close()
    }
}

/**
 * @param {Object} page
 * @param {Object} window
 */
async function expectInsideWorkspace(page, window) {
    const box      = await window.boundingBox(),
          taskbar  = await page.locator(TASKBAR).boundingBox(),
          viewport = page.viewportSize();

    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    expect(box.y + box.height).toBeLessThanOrEqual(taskbar.y + 1)
}

for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
    test.describe(`taskbar at ${viewport.width}px`, () => {
        const mobile = viewport.width === 390;
        test.use({hasTouch: mobile, isMobile: mobile, viewport});

        test('running indicators fit their task and a minimized task keeps a centered mark', async ({page}) => {
            const task = name => page.locator('.neo-desktop-task-list .neo-list-item').filter({hasText: name}),
                  mail = task('Mail'), messages = task('Messages');

            async function open(app) {
                const icon = page.locator(ICON).filter({hasText: app});
                mobile ? await icon.tap() : await icon.dblclick();
                await expect(windowOf(page, app)).toBeVisible()
            }

            async function expectMarker(item, minimized = false) {
                await expect.poll(() => item.evaluate((node, minimized) => {
                    const marker = getComputedStyle(node, '::after'),
                          width  = node.getBoundingClientRect().width,
                          scale  = new DOMMatrixReadOnly(marker.transform === 'none' ? undefined : marker.transform).a,
                          mark   = parseFloat(marker.width) * scale,
                          inset  = parseFloat(marker.insetInlineStart) + (parseFloat(marker.width) - mark) / 2;

                    return Math.max(Math.abs(mark - (minimized ? 6 : width - 16)), Math.abs(inset - (width - mark) / 2))
                }, minimized)).toBeLessThan(0.5)
            }

            await signIn(page);
            await open('Mail');
            await expectMarker(mail);
            await windowOf(page, 'Mail').getByRole('button', {name: 'minimize', exact: true}).click();
            await expect(mail).toHaveClass(/neo-desktop-task-minimized/);
            await expectMarker(mail, true);
            await open('Messages');
            await expectMarker(messages);

            await mail.click();
            await expect(windowOf(page, 'Mail')).toBeVisible();
            await expectMarker(mail);
            await mail.focus();
            await page.keyboard.press('ArrowRight');
            await expect(messages).toBeFocused();
            await expect(messages).toHaveCSS('outline-width', '2px')
        })
    })
}

test.describe('web desktop apps', () => {
    test.use({viewport: {width: 1440, height: 900}});

    test('every app opens its own view at its own size, its stylesheet arriving with its first open', async ({browser, page}) => {
        const errors   = trackErrors(page),
              requests = [];

        page.on('request', request => requests.push(request.url()));

        await signIn(page);

        // No app's view has loaded before its first open
        expect(requests.filter(url => url.includes('/apps/webdesktop/apps/'))).toEqual([]);

        for (const [app, view, width] of apps) {
            await page.locator(ICON).filter({hasText: app}).dblclick();

            const window = windowOf(page, app);

            await expect(window.locator(view)).toBeVisible();
            await expectOpened(browser, page, window, app);

            // The boundary fit runs after the flight lands, so the box may still move once
            await expect(async () => {
                expect(Math.round((await window.boundingBox()).width)).toBe(width);
                await expectInsideWorkspace(page, window)
            }).toPass();

            await window.getByRole('button', {name: 'close'}).click();
            await expect(window).toHaveCount(0)
        }

        expect(requests.some(url => url.endsWith('/apps/webdesktop/apps/Mail.css'))).toBe(true);
        expect(errors).toEqual([])
    });

    test('detached Settings changes the theme of its desktop and companion windows', async ({context, page}) => {
        const independent = await context.newPage();
        await signIn(page);
        await signIn(independent);

        const popOut = async app => {
            await page.locator(ICON).filter({hasText: app}).dblclick();
            return detachWindow(page, windowOf(page, app))
        };
        const palette = target => target.locator('.neo-viewport').evaluate(view => {
            const content = view.querySelector('.webdesktop-settings, .webdesktop-mail-message, .neo-desktop-taskbar') || view;
            return {
                body: [...document.body.classList].find(name => name.startsWith('neo-theme-')),
                ink : getComputedStyle(content).getPropertyValue('--webdesktop-ink-dim').trim()
            }
        });
        const dark = await palette(independent);
        await page.getByRole('button', {name: 'Switch theme', exact: true}).click();
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        const mail = await popOut('Mail'), settings = await popOut('Settings');

        await settings.getByRole('button', {name: 'Dark', exact: true}).click();
        await expect.poll(() => Promise.all([page, mail, settings].map(palette))).toEqual([dark, dark, dark]);
        expect(dark.body).toBe('neo-theme-neo-dark');
        expect(dark.ink).not.toBe('');
        await settings.getByRole('button', {name: 'Light', exact: true}).click();
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await expect.poll(async () => (await palette(page)).ink).not.toBe(dark.ink);
        const light = await palette(page);
        expect(light.ink).not.toBe('');
        await expect.poll(() => Promise.all([mail, settings, independent].map(palette))).toEqual([light, light, dark]);

        await mail.reload();
        await expect(mail.getByRole('button', {name: 'Back to desktop'})).toBeVisible();
        await expect.poll(() => palette(mail)).toEqual(light);
        await settings.getByRole('button', {name: 'Dark', exact: true}).click();
        await expect.poll(() => Promise.all([page, mail, settings, independent].map(palette))).toEqual([dark, dark, dark, dark]);

        await settings.getByRole('button', {name: 'Light', exact: true}).click();
        await expect.poll(() => palette(settings)).toEqual(light);
        const closed = settings.waitForEvent('close');
        await settings.getByRole('button', {name: 'Back to desktop'}).click();
        await closed;
        const returned = windowOf(page, 'Settings').locator('.webdesktop-settings');
        await expect(returned).toBeVisible();
        await expect.poll(() => returned.evaluate(el => getComputedStyle(el).getPropertyValue('--webdesktop-ink-dim').trim())).toBe(light.ink);
        await page.getByRole('button', {name: 'Switch theme', exact: true}).click();
        await expect.poll(() => Promise.all([page, mail, independent].map(palette))).toEqual([dark, dark, dark]);
        await expect.poll(() => returned.evaluate(el => getComputedStyle(el).getPropertyValue('--webdesktop-ink-dim').trim())).toBe(dark.ink)
    });

    test('a detached window follows its logical desktop and restores local body overrides', async ({browser, page}) => {
        await signIn(page);
        const light = 'neo-theme-neo-light', dark = 'neo-theme-neo-dark';
        await page.getByRole('button', {name: 'Switch theme', exact: true}).click();
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await page.locator(ICON).filter({hasText: 'Mail'}).dblclick();
        const dialog = windowOf(page, 'Mail'), id = await dialog.getAttribute('id'),
              worker = await attachPageSharedAppWorker({browser, page});
        const restore = async popup => {
            await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', {name: 'Back to desktop'}).click()]);
            await expect(dialog.locator('.webdesktop-mail-message')).toBeVisible()
        };
        const bodyTheme = () => worker.evaluate(id => Neo.get(id).getItem('bodyContainer').theme, id),
              mailInk   = target => target.locator('.webdesktop-mail-message').evaluate(node => getComputedStyle(node).getPropertyValue('--webdesktop-ink-dim').trim());
        try {
            // A floating AppWindow can inherit from a themed desktop without being among its items.
            let popup = await detachWindow(page, dialog);
            await worker.evaluate(id => { Neo.get(id).parent.theme = 'neo-theme-neo-dark' }, id);
            await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-dark/);
            await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
            await restore(popup);

            // An owner theme propagated to the body before pop-out must continue to follow its owner on return.
            await worker.evaluate(id => { Neo.get(id).theme = 'neo-theme-neo-light' }, id);
            expect(await bodyTheme()).toBe(light);
            popup = await detachWindow(page, dialog);
            await worker.evaluate(id => { Neo.get(id).theme = 'neo-theme-neo-dark' }, id);
            await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-dark/);
            await restore(popup);
            expect(await bodyTheme()).toBe(dark);
            await worker.evaluate(id => { Neo.get(id).theme = 'neo-theme-neo-light' }, id);
            expect(await bodyTheme()).toBe(light);

            // A body carrying a different theme keeps its own scope through a round trip.
            const lightInk = await page.locator('.neo-viewport').evaluate(node => getComputedStyle(node).getPropertyValue('--webdesktop-ink-dim').trim());
            await expect.poll(() => mailInk(dialog)).toBe(lightInk);
            await worker.evaluate(id => { Neo.get(id).getItem('bodyContainer').theme = 'neo-theme-neo-dark' }, id);
            await expect.poll(() => mailInk(dialog)).not.toBe(lightInk);
            const darkInk = await mailInk(dialog);
            popup = await detachWindow(page, dialog);
            await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-light/);
            await expect.poll(() => mailInk(popup)).toBe(darkInk);
            await restore(popup);
            expect(await bodyTheme()).toBe(dark);
            await expect.poll(() => mailInk(dialog)).toBe(darkInk)
        } finally {
            await worker.close()
        }
    });

    test('the calendar opens on the week of today with its meetings in view', async ({page}) => {
        const errors = trackErrors(page);

        await signIn(page);
        await page.locator(ICON).filter({hasText: 'Calendar'}).dblclick();

        const window = windowOf(page, 'Calendar');

        // A meeting of this week sits inside the visible hours, which a calendar measured mid-animation misses
        await expect(window.locator('.neo-calendar-maincontainer')).toBeVisible();
        await expect(window.getByText('Design review').first()).toBeInViewport();
        expect(errors).toEqual([])
    });

    test('an early keyboard pop out opens Mail at its settled size', async ({browser, page}) => {
        await signIn(page);
        const worker   = await attachPageSharedAppWorker({browser, page}),
              launcher = page.locator(ICON).filter({hasText: 'Mail'}),
              mail     = windowOf(page, 'Mail'),
              button   = mail.getByRole('button', {name: 'Pop out window'}),
              task     = page.locator('.neo-desktop-task-list .neo-list-item');

        try {
            // Hold the real expansion delta after animateShow has applied the launcher's rectangle.
            // The dialog's own headerAction releases it after the keyboard command reaches the App worker.
            await worker.evaluate(() => {
                const gate = globalThis.mailExpansion = {apply: Neo.applyDeltas};
                Neo.applyDeltas = (windowId, delta) => {
                    const dialog = delta.cls?.add?.includes('animated-hiding-showing') && Neo.get(delta.id);
                    if (dialog?.record?.id !== 'mail') return gate.apply(windowId, delta);
                    Neo.applyDeltas = gate.apply;
                    return new Promise(resolve => {
                        gate.release = () => {
                            dialog.un('headerAction', gate.release, dialog);
                            delete gate.release;
                            resolve()
                        };
                        dialog.on('headerAction', gate.release, dialog)
                    }).then(() => gate.apply(windowId, delta))
                }
            });
            const icon = await launcher.boundingBox();
            await launcher.dblclick();
            await expect.poll(() => worker.evaluate(() => Boolean(globalThis.mailExpansion.release))).toBe(true);

            const taskId = await task.getAttribute('id');
            await button.evaluate(el => el.addEventListener('click', event => {
                const {width, height} = el.closest('.neo-dialog').getBoundingClientRect();
                globalThis.earlyMailActivation = {trusted: event.isTrusted, width: Math.round(width), height: Math.round(height)}
            }, {once: true}));
            const [popup] = await Promise.all([page.waitForEvent('popup'), button.press('Enter')]);
            expect(await page.evaluate(() => globalThis.earlyMailActivation)).toEqual({
                trusted: true, width: Math.round(icon.width), height: Math.round(icon.height)
            });
            await expect(popup.locator('.webdesktop-mail-message h2')).toHaveText('Launch checklist for Monday');
            expect(await popup.evaluate(() => [innerWidth, innerHeight])).toEqual([880, 520]);
            await popup.locator('.webdesktop-mail-inbox').getByText('Robin Chen', {exact: true}).click();
            await Promise.all([popup.waitForEvent('close'), popup.getByRole('button', {name: 'Back to desktop'}).click()]);
            await expect(mail.locator('.webdesktop-mail-message h2')).toHaveText('Guest access to the help pages');
            await expect(task).toHaveCount(1);
            await expect(task).toHaveAttribute('id', taskId);
            expect(page.context().pages()).toHaveLength(1)
        } finally {
            await worker.evaluate(() => {
                const gate = globalThis.mailExpansion;
                if (!gate) return;
                Neo.applyDeltas = gate.apply;
                gate.release?.();
                delete globalThis.mailExpansion
            });
            await worker.close()
        }
    });

    test('revoking a permission closes its committed popup and removes its task', async ({page}) => {
        await signIn(page);
        await page.getByRole('button', {name: 'Switch theme'}).click();
        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await page.locator(ICON).filter({hasText: 'Mail'}).dblclick();

        const mail = windowOf(page, 'Mail');
        await expect(async () => {
            expect(Math.round((await mail.boundingBox()).width)).toBe(880);
            await expectInsideWorkspace(page, mail)
        }).toPass();

        const readColors = element => {
            const style = getComputedStyle(element);
            return ['--desktop-app-window-color', '--webdesktop-ink-dim'].map(name => style.getPropertyValue(name).trim())
        };
        const sourceColors = await mail.locator('.webdesktop-mail').evaluate(readColors);
        expect(sourceColors.every(Boolean)).toBe(true);

        const header = mail.locator('.neo-header-toolbar').first();
        await header.hover();
        const box = await header.boundingBox(),
              x   = box.x + box.width / 2,
              y   = box.y + box.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + 20, y, {steps: 5});
        await expect(page.locator('.neo-dragproxy')).toBeVisible();
        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            page.mouse.move(page.viewportSize().width + 300, y, {steps: 35})
        ]);
        await expect(popup.locator('.webdesktop-mail')).toBeVisible();
        await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await expect.poll(() => popup.locator('.webdesktop-mail').evaluate(readColors)).toEqual(sourceColors);
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator('.neo-desktop-task-list .neo-list-item')).toHaveCount(1);

        await page.getByRole('button', {name: 'Permissions'}).click();
        await Promise.all([
            popup.waitForEvent('close'),
            page.getByRole('option').filter({hasText: 'view-mail'}).click()
        ]);
        await expect(page.locator(ICON).filter({hasText: 'Mail'})).toHaveCount(0);
        await expect(page.locator('.neo-desktop-task-list .neo-list-item')).toHaveCount(0)
    });

    test('Restore in the Recycle Bin puts the file back in Documents', async ({page}) => {
        await signIn(page);

        await page.locator(ICON).filter({hasText: 'Recycle Bin'}).dblclick();

        const bin = windowOf(page, 'Recycle Bin');

        await bin.getByText('Old logo.png').click();
        await bin.getByRole('button', {name: 'Restore'}).click();
        await expect(bin.getByText('Old logo.png')).toHaveCount(0);

        await bin.getByRole('button', {name: 'close'}).click();
        await page.locator(ICON).filter({hasText: 'Documents'}).dblclick();
        await expect(windowOf(page, 'Documents').getByText('Old logo.png')).toBeVisible()
    });

    test('a popped-out app window keeps the desktop glass surface, app header identity, and transparent containers across theme switches', async ({page}) => {
        await signIn(page);

        await page.locator(ICON).filter({hasText: 'Reports'}).dblclick();
        const reports = windowOf(page, 'Reports');
        await expect(reports.locator('.webdesktop-reports')).toBeVisible();

        const readWindowTone = element => {
            const style = getComputedStyle(element);
            return {
                color   : style.color,
                winBgVar: style.getPropertyValue('--desktop-app-window-background-color').trim()
            }
        };
        const darkDesktopTone = await reports.evaluate(readWindowTone);

        const [popup] = await Promise.all([
            page.waitForEvent('popup'),
            reports.getByRole('button', {name: 'Pop out window'}).click()
        ]);
        await expect(popup.locator('.webdesktop-reports')).toBeVisible();
        await expect(popup.locator('.neo-desktop-popup-title')).toHaveText('Reports');
        await expect(popup.locator('.neo-desktop-app-window-icon')).toBeVisible();

        const readPopupSurface = () => popup.evaluate(() => {
            const vp       = document.querySelector('.neo-viewport.neo-desktop-popup-viewport'),
                  tb       = vp?.querySelector('.neo-desktop-popup-toolbar'),
                  bodyWrap = vp?.children[1],
                  vs       = vp && getComputedStyle(vp),
                  ts       = tb && getComputedStyle(tb),
                  bs       = bodyWrap && getComputedStyle(bodyWrap);
            return vp ? {
                bgImage   : vs.backgroundImage,
                bodyWrapBg: bs.backgroundColor,
                color     : vs.color,
                tbBg      : ts.backgroundColor,
                tbBorder  : ts.borderBottomStyle,
                wallpaper : vs.getPropertyValue('--desktop-wallpaper').trim(),
                winBgVar  : vs.getPropertyValue('--desktop-app-window-background-color').trim()
            } : null
        });

        await expect.poll(readPopupSurface).toEqual(expect.objectContaining({
            bgImage   : expect.stringContaining('radial-gradient'),
            bodyWrapBg: 'rgba(0, 0, 0, 0)',
            color     : darkDesktopTone.color,
            tbBg      : 'rgba(0, 0, 0, 0)',
            tbBorder  : 'solid',
            wallpaper : expect.stringContaining('radial-gradient'),
            winBgVar  : darkDesktopTone.winBgVar
        }));

        await page.getByRole('button', {name: 'Switch theme'}).click();
        await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await expect.poll(readPopupSurface).toEqual(expect.objectContaining({
            bgImage   : expect.stringContaining('rgba(255, 255, 255, 0.78)'),
            bodyWrapBg: 'rgba(0, 0, 0, 0)',
            color     : 'rgb(15, 23, 42)',
            tbBg      : 'rgba(0, 0, 0, 0)',
            tbBorder  : 'solid',
            wallpaper : expect.stringContaining('radial-gradient')
        }));

        await page.getByRole('button', {name: 'Switch theme'}).click();
        await expect(popup.locator('body')).toHaveClass(/neo-theme-neo-dark/);
        await expect.poll(readPopupSurface).toEqual(expect.objectContaining({
            bodyWrapBg: 'rgba(0, 0, 0, 0)',
            color     : darkDesktopTone.color,
            tbBg      : 'rgba(0, 0, 0, 0)'
        }));

        await Promise.all([
            popup.waitForEvent('close'),
            popup.getByRole('button', {name: 'Back to desktop', exact: true}).click()
        ]);
        await expect(reports.locator('.webdesktop-reports')).toBeVisible()
    })
});

test.describe('web desktop apps on a phone', () => {
    test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

    test('an app window stays inside the area above the taskbar', async ({page}) => {
        const errors = trackErrors(page);

        await signIn(page);

        for (const app of ['Mail', 'Calendar']) {
            await page.locator(ICON).filter({hasText: app}).tap();

            const window = windowOf(page, app);

            await expect(window).toBeVisible();
            await expectInsideWorkspace(page, window);

            await window.getByRole('button', {name: 'close'}).tap();
            await expect(window).toHaveCount(0)
        }

        expect(errors).toEqual([])
    })
});
