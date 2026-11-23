import {expect, test}              from '../../fixtures.mjs';
import {attachPageSharedAppWorker} from '../../sharedWorkerAppWorker.mjs';

const entry  = '/examples/desktop/basic/index.html',
      dialog = '.neo-desktop-app-window',
      notes  = '.desktop-basic-notes',
      tasks  = '.neo-desktop-task-list .neo-list-item',
      marker = 'One note across both windows';

/**
 * @summary Arms the actual title-bar gesture in the source document. The caller owns its single release.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{x: Number, y: Number}>} The title's press point in the source viewport.
 */
async function pressTitle(page) {
    const title = page.locator(dialog + ' .neo-header-toolbar.neo-draggable');
    await title.hover();
    const box = await title.boundingBox(),
          x   = box.x + box.width / 2,
          y   = box.y + box.height / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 16, y, {steps: 4});
    await expect(page.locator('.neo-dragproxy')).toBeVisible();
    return {x, y}
}

/**
 * @summary Opens and edits Notes and remembers the original managed dialog, content and task in the App worker.
 * @param {Object} browser
 * @param {Object} page
 * @param {Boolean} [shared=true] The worker type expected on this browser.
 * @returns {Promise<Object>} A test-scoped observer of the owning App worker.
 */
async function openNotes(browser, page, shared=true) {
    await page.goto(entry);
    await page.locator('.neo-desktop-launcher .neo-list-item').filter({hasText: 'Notes'}).dblclick();
    await expect(page.locator(notes + ' textarea')).toBeVisible();
    await expect(page.locator(tasks)).toHaveCount(1);

    const dedicated = page.workers().find(worker => /\/App\.mjs$/.test(worker.url())),
          worker    = dedicated ?? (shared ? await attachPageSharedAppWorker({browser, page}) : null),
          ids       = await page.evaluate(({notes}) => ({
              desktop: document.querySelector('.neo-desktop').id,
              content: document.querySelector(notes).id
          }), {notes});

    expect(worker, 'the expected App worker serves this desktop').toBeTruthy();
    await worker.evaluate(async ({desktop, content}) => {
        const owner  = Neo.getComponent(desktop),
              dialog = owner.windowManager.getWindow('notes');
        await dialog.mountFlight;
        globalThis.desktopTearOutWitness = {
            owner, content: Neo.getComponent(content), dialog,
            task: owner.taskStore.get('notes')
        }
    }, ids);
    await page.locator(notes + ' textarea').fill(marker);
    await page.locator(notes + ' textarea').press('Tab');
    return worker
}

/**
 * @summary A stable id in a second DOM tree is insufficient: the desktop must still own these exact objects.
 * @param {Object} worker
 * @param {Boolean} [sameTask=true] A close followed by a fresh launch creates a new task for the retained window.
 */
async function expectOriginalOwnership(worker, sameTask=true) {
    expect(await worker.evaluate(() => {
        const {owner, content, dialog, task} = globalThis.desktopTearOutWitness;
        return {
            content : Neo.getComponent(content.id) === content && !content.isDestroyed,
            dialog  : owner.windowManager.getWindow('notes') === dialog && !dialog.isDestroyed,
            task    : Boolean(owner.taskStore.get('notes')),
            sameTask: owner.taskStore.get('notes') === task
        }
    })).toEqual({content: true, dialog: true, task: true, sameTask})
}

/**
 * @summary Observes two moves of the real popup handle while the source still owns the physical button.
 * The platform is free to clamp the requested native coordinates.
 * @param {Object} page
 * @param {Object} popup
 * @param {Number} y The held pointer's source y coordinate
 */
async function expectPopupToFollow(page, popup, y) {
    await popup.evaluate(() => {
        const move = window.moveTo;
        window.desktopNativeMoves = [];
        window.moveTo = function(x, y) {
            window.desktopNativeMoves.push({x, y});
            return move.call(this, x, y)
        }
    });

    const x = page.viewportSize().width + 310;
    await page.mouse.move(x, y + 5);
    await expect.poll(() => popup.evaluate(() => window.desktopNativeMoves.length)).toBeGreaterThan(0);
    const first = await popup.evaluate(() => window.desktopNativeMoves.at(-1));
    await page.mouse.move(x + 35, y + 25);
    await expect.poll(() => popup.evaluate(() => window.desktopNativeMoves.at(-1))).toEqual({x: first.x + 35, y: first.y + 20})
}

test.describe('desktop window tear-out', () => {
    test.use({viewport: {width: 1280, height: 800}});

    for (const terminal of ['return before release', 'Escape in source', 'Escape in popup', 'release outside']) {
        test(terminal, async ({browser, page}) => {
            const worker = await openNotes(browser, page);
            try {
                const press     = await pressTitle(page),
                      birth     = page.waitForEvent('popup', {timeout: 10000}),
                      [, popup] = await Promise.all([
                          page.mouse.move(page.viewportSize().width + 300, press.y, {steps: 35}), birth
                      ]);

                await expect(popup.locator(notes + ' textarea')).toHaveValue(marker);
                await expect(popup.locator('.neo-desktop')).toHaveCount(0);
                await expect(page.locator(tasks)).toHaveCount(1);
                await expectOriginalOwnership(worker);
                if (terminal === 'return before release') await expectPopupToFollow(page, popup, press.y);

                if (terminal !== 'release outside') {
                    const closing       = popup.waitForEvent('close', {timeout: 10000});
                    const keyTarget     = terminal === 'Escape in popup' ? popup : page;
                    const returnGesture = terminal === 'return before release'
                        ? page.mouse.move(press.x, press.y, {steps: 35})
                        : keyTarget.keyboard.press('Escape');

                    await Promise.all([returnGesture, closing]);
                    await page.mouse.up()
                } else {
                    await page.mouse.up();
                    await expect.poll(() => worker.evaluate(() => desktopTearOutWitness.dialog.tearOut.committed)).toBe(true);
                    await popup.locator(notes + ' textarea').fill(marker + ' after release');
                    await popup.locator(notes + ' textarea').press('Tab');
                    await expectOriginalOwnership(worker);

                    const popupName = new URL(popup.url()).searchParams.get('desktopPopup'),
                          readEntry = () => page.evaluate(name => {
                              const entry = globalThis.Neo.Main.openWindows[name];
                              return entry ? {nativeHandleKey: entry.nativeHandleKey, open: !entry.win.closed} : null
                          }, popupName),
                          placement = () => popup.evaluate(() => ({x: window.screenX, y: window.screenY})),
                          admitted  = await readEntry(),
                          before    = await placement();

                    expect(popupName).toBeTruthy();
                    expect(admitted).toEqual({nativeHandleKey: expect.any(String), open: true});

                    await popup.reload();
                    await expect(popup.locator(notes + ' textarea')).toHaveValue(marker + ' after release');
                    await expect(page.locator(notes + ' textarea')).toHaveCount(0);
                    await expect(page.locator(tasks)).toHaveCount(1);
                    await expectOriginalOwnership(worker);
                    expect(await placement()).toEqual(before);
                    await expect.poll(readEntry).toEqual(admitted);

                    await popup.close({runBeforeUnload: true});
                    await expect(page.locator(tasks)).toHaveCount(0);
                    await expect.poll(readEntry, {message: 'a physical close removes the admitted popup from the opener registry'}).toBeNull();
                    await page.locator('.neo-desktop-launcher .neo-list-item').filter({hasText: 'Notes'}).dblclick()
                }

                const value = terminal === 'release outside' ? marker + ' after release' : marker;
                await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
                await expect(page.locator(notes + ' textarea')).toHaveValue(value);
                await expect(page.locator(dialog)).toHaveCount(1);
                await expect(page.locator(tasks)).toHaveCount(1);
                await expectOriginalOwnership(worker, terminal !== 'release outside');
                await page.locator(dialog).getByRole('button', {name: 'minimize'}).click();
                await expect(page.locator(dialog)).toBeHidden();
                await page.locator(tasks).click();
                await expect(page.locator(notes + ' textarea')).toBeVisible();
                await expect(page.locator(notes + ' textarea')).toHaveValue(value)
            } finally {
                await worker.close?.()
            }
        })
    }

    test('a second exit during the same press acquires a fresh popup', async ({browser, context, page}) => {
        const worker = await openNotes(browser, page);
        try {
            const press  = await pressTitle(page),
                  exitX  = page.viewportSize().width + 300,
                  popups = [];

            try {
                for (let exit = 0; exit < 2; exit++) {
                    const birth     = page.waitForEvent('popup', {timeout: 10000}),
                          [, popup] = await Promise.all([page.mouse.move(exitX, press.y, {steps: 35}), birth]);

                    popups.push(popup);
                    await expect(popup.locator(notes + ' textarea')).toHaveValue(marker);
                    await expectOriginalOwnership(worker);
                    const closing = popup.waitForEvent('close', {timeout: 10000});

                    await Promise.all([page.mouse.move(press.x, press.y, {steps: 35}), closing]);
                    await expect(page.locator(`${dialog}:not(.neo-dragproxy) ${notes} textarea`)).toHaveValue(marker)
                }
            } finally {
                await page.mouse.up()
            }

            expect(popups[0]).not.toBe(popups[1]);
            await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
            await expect(page.locator(tasks)).toHaveCount(1);
            expect(context.pages()).toHaveLength(1);
            await expectOriginalOwnership(worker)
        } finally {
            await worker.close()
        }
    });

    test('keyboard activation of the popout and return controls preserves the live app', async ({browser, context, page}) => {
        const worker = await openNotes(browser, page);
        try {
            const popout = page.locator(dialog).getByRole('button', {name: 'Pop out window', exact: true});
            await expect(popout).toBeVisible();
            const birth = page.waitForEvent('popup', {timeout: 10000});

            await popout.press('Enter');
            const popup = await birth;
            await expect(popup.locator(notes + ' textarea')).toHaveValue(marker);
            await expect(page.locator(notes + ' textarea')).toHaveCount(0);
            await expect(page.locator(tasks)).toHaveCount(1);
            await expectOriginalOwnership(worker);

            const back = popup.getByRole('button', {name: 'Back to desktop', exact: true});
            await expect(back).toBeVisible();
            const closing = popup.waitForEvent('close', {timeout: 10000});

            await back.press('Enter');
            await closing;
            await expect(page.locator(notes + ' textarea')).toHaveValue(marker);
            await expect(page.locator(tasks)).toHaveCount(1);
            expect(context.pages()).toHaveLength(1);
            await expectOriginalOwnership(worker)
        } finally {
            await worker.close()
        }
    });

    test('closing a popup before its route connects lets the same window pop out again', async ({browser, context, page}) => {
        const worker  = await openNotes(browser, page),
              note    = page.locator(notes + ' textarea'),
              popout  = page.locator(dialog).getByRole('button', {name: 'Pop out window', exact: true}),
              release = Promise.withResolvers(),
              matches = url => url.pathname === entry && url.searchParams.has('desktopPopup');
        let popupName;

        try {
            const holdNavigation = async route => {
                popupName = new URL(route.request().url()).searchParams.get('desktopPopup');
                await release.promise;
                await route.abort().catch(() => {})
            };

            await context.route(matches, holdNavigation);
            try {
                await popout.click();
                await expect.poll(() => popupName, {message: 'the initial popup navigation is held'}).toBeTruthy();
                await expect(note).toBeHidden();

                const closed = await page.evaluate(name => {
                    const popup = Neo.Main.openWindows[name]?.win;
                    if (!popup || popup.closed) return false;
                    popup.close();
                    return true
                }, popupName);

                expect(closed, 'the opener had a live popup to close').toBe(true);
                await expect(note).toBeVisible({timeout: 15000});
                await expect(note).toHaveValue(marker);
                await expect(page.locator(tasks)).toHaveCount(1);
                await expectOriginalOwnership(worker)
            } finally {
                release.resolve();
                await context.unroute(matches, holdNavigation)
            }

            const birth   = page.waitForEvent('popup', {timeout: 10000}),
                  [popup] = await Promise.all([birth, popout.click()]);

            await expect(popup.locator(notes + ' textarea')).toHaveValue(marker);
            expect(new URL(popup.url()).searchParams.get('desktopPopup')).not.toBe(popupName);
            await expectOriginalOwnership(worker)
        } finally {
            await worker.close()
        }
    });

    test('a refused popup leaves the same task and note in the source', async ({browser, context, page}) => {
        const worker = await openNotes(browser, page);
        try {
            await page.evaluate(() => {
                window.desktopOpenAttempts = 0;
                window.open = () => {window.desktopOpenAttempts++; return null}
            });
            const press = await pressTitle(page);
            await page.mouse.move(page.viewportSize().width + 300, press.y, {steps: 35});
            await expect.poll(() => page.evaluate(() => window.desktopOpenAttempts)).toBe(1);
            await page.mouse.move(press.x, press.y, {steps: 35});
            await page.mouse.up();

            expect(context.pages()).toHaveLength(1);
            await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
            await expect(page.locator(notes + ' textarea')).toBeVisible();
            await expect(page.locator(notes + ' textarea')).toHaveValue(marker);
            await expect(page.locator(tasks)).toHaveCount(1);
            await expectOriginalOwnership(worker)
        } finally {
            await worker.close()
        }
    });

    test('a browser without shared workers keeps the window in the desktop', async ({browser, context, page}) => {
        await context.addInitScript(() => {delete window.SharedWorker});
        const worker = await openNotes(browser, page, false),
              press  = await pressTitle(page);

        await page.mouse.move(page.viewportSize().width + 300, press.y, {steps: 35});
        await page.mouse.up();
        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator(notes + ' textarea')).toHaveValue(marker);
        await expectOriginalOwnership(worker);
        expect(context.pages()).toHaveLength(1);
        const title = await page.locator(dialog + ' .neo-panel-header-text').boundingBox();
        expect(title.x + title.width / 2, 'the title remains reachable').toBeLessThan(page.viewportSize().width)
    })
});
