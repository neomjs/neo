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
            const opened = page.waitForEvent('popup');
            await windowOf(page, app).getByRole('button', {name: 'Pop out window'}).click();
            const popup = await opened;
            await expect(popup.getByRole('button', {name: 'Back to desktop'})).toBeVisible();
            return popup
        };
        const palette = target => target.locator('.neo-viewport').evaluate(view => {
            const content = view.querySelector('.webdesktop-settings, .webdesktop-mail-message, .neo-desktop-taskbar') || view;
            return {
                body: [...document.body.classList].find(name => name.startsWith('neo-theme-')),
                ink : getComputedStyle(content).getPropertyValue('--webdesktop-ink-dim').trim()
            }
        });
        const mail = await popOut('Mail'), settings = await popOut('Settings'),
              dark = await palette(independent);

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
        await expect.poll(() => Promise.all([page, mail, independent].map(palette))).toEqual([dark, dark, dark])
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
