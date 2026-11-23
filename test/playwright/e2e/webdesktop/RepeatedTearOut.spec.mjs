import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir}                        from 'node:os';
import path                            from 'node:path';
import {expect, test}                  from '../../fixtures.mjs';

/**
 * @summary Reads the live Mail presentation in each document without refreshing Chrome's user activation.
 * The drag proxy can contain a snapshot of the view; only the real Mail root owns the selected message.
 * @param {Object} source The desktop page.
 * @returns {Promise<Object[]>}
 */
async function mailPresentations(source) {
    const presentations = [];
    for (const page of source.context().pages()) {
        let session;
        try {
            session = await source.context().newCDPSession(page);
            const {result} = await session.send('Runtime.evaluate', {
                expression: `[...document.querySelectorAll('.webdesktop-mail')].filter(mail =>
                    !mail.closest('.neo-dragproxy') && mail.checkVisibility({checkVisibilityCSS: true})
                ).map(mail => ({id: mail.id, subject: mail.querySelector('.webdesktop-mail-message h2')?.textContent}))`,
                returnByValue: true,
                userGesture  : false
            });
            for (const mail of result.value) presentations.push({...mail, location: page === source ? 'desktop' : 'popup'})
        } catch (error) {
            if (!page.isClosed()) throw error
        } finally {
            await session?.detach().catch(() => {})
        }
    }
    return presentations
}

for (const grant of [false, true]) {
    const title = grant ? 'a site popup grant lets Mail tear out twice in one press'
        : 'a refused second exit explains the popup grant and keeps the original Mail';
    test(title, async ({baseURL, channel, headless, launchOptions, playwright}) => {
        const origin  = new URL(baseURL).origin,
              profile = await mkdtemp(path.join(tmpdir(), 'neo-desktop-popup-grant-'));
        let context;

        try {
            if (grant) {
                // Chrome grants popups only to the E2E server's origin in this disposable profile.
                await mkdir(path.join(profile, 'Default'));
                await writeFile(path.join(profile, 'Default', 'Preferences'), JSON.stringify({
                    profile: {content_settings: {exceptions: {popups: {[`${origin},*`]: {setting: 1}}}}}
                }))
            }
            context = await playwright.chromium.launchPersistentContext(profile, {
                ...launchOptions, baseURL, channel, headless, ignoreDefaultArgs: ['--disable-popup-blocking'],
                viewport: {width: 1280, height: 800}
            });

            const page    = context.pages()[0],
                  cdp     = await context.newCDPSession(page),
                  dialog  = page.locator('.neo-desktop-app-window:not(.neo-dragproxy)'),
                  task    = page.locator('.neo-desktop-task-list .neo-list-item'),
                  subject = 'Guest access to the help pages';
            await page.goto('/apps/webdesktop/index.html');
            await page.getByText('Alex Morgan', {exact: true}).click();
            await page.locator('.neo-desktop-launcher .neo-list-item').filter({hasText: 'Mail'}).dblclick();
            await expect.poll(async () => Math.round((await dialog.boundingBox()).width)).toBe(880);
            await dialog.locator('.webdesktop-mail-inbox').getByText('Robin Chen', {exact: true}).click();

            const dialogId = await dialog.getAttribute('id'), taskId = await task.getAttribute('id'),
                  id       = await dialog.locator('.webdesktop-mail').getAttribute('id'),
                  header   = await dialog.locator('.neo-header-toolbar').first().boundingBox(),
                  startX   = header.x + header.width / 2, y = header.y + header.height / 2,
                  outsideX = page.viewportSize().width + 300;
            let x = startX;

            // CDP mouseMoved delivers held-pointer coordinates without granting a new click on the second exit.
            async function moveHeld(to) {
                for (let step = 1; step <= 16; step++) {
                    await cdp.send('Input.dispatchMouseEvent', {
                        type: 'mouseMoved', button: 'left', buttons: 1, force: 0.5, x: x + (to - x) * step / 16, y
                    })
                }
                x = to
            }

            const expectMail = location => expect.poll(() => mailPresentations(page)).toEqual([{id, subject, location}]);
            await expectMail('desktop');
            await page.mouse.move(startX, y);
            await page.mouse.down();
            try {
                await moveHeld(startX + 16);
                await expect(page.locator('.neo-dragproxy')).toBeVisible();
                await moveHeld(outsideX);
                await expectMail('popup');
                await moveHeld(startX);
                await expectMail('desktop');
                const {result} = await cdp.send('Runtime.evaluate', {expression: 'navigator.userActivation.isActive', userGesture: false});
                expect(result.value, 'the second crossing has no fresh activation').toBe(false);
                await moveHeld(outsideX);
                if (grant) {
                    await expectMail('popup')
                } else {
                    const status = page.getByRole('status').filter({hasText: 'Could not open the popup.'});
                    try {
                        await expect(status).toBeInViewport({ratio: 1})
                    } finally {
                        const frame = test.info().outputPath('desktop-after-refused-tear-out.png');
                        await page.screenshot({path: frame});
                        await test.info().attach('desktop-after-refused-tear-out', {path: frame, contentType: 'image/png'})
                    }
                    await expect(status).toHaveText('Could not open the popup. If your browser blocked it, allow pop-ups for this site and try the drag again.');
                    await expect(status).not.toBeFocused();
                    await expect(page.locator('.neo-dragproxy')).toBeVisible();
                    await moveHeld(startX)
                }
            } finally {
                await page.mouse.up()
            }

            await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
            if (grant) {
                await expectMail('popup');
                await expect.poll(() => context.pages().length).toBe(2);
                const popup = context.pages().find(candidate => candidate !== page);
                await popup.getByRole('button', {name: 'Back to desktop'}).click()
            }
            await expect.poll(() => context.pages().length).toBe(1);
            await expectMail('desktop');
            await expect(dialog).toHaveAttribute('id', dialogId);
            await expect(task).toHaveCount(1);
            await expect(task).toHaveAttribute('id', taskId)
        } finally {
            await context?.close();
            await rm(profile, {recursive: true, force: true})
        }
    });
}
