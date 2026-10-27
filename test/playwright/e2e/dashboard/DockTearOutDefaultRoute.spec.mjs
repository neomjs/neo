import {test, expect} from '../../fixtures.mjs';

/**
 * E2e: the dock's DEFAULT tear-out route, end to end, on `examples/dashboard/tearOut`.
 *
 * `Neo.dashboard.dock.Workspace#openTearOutVessel` reopens the host's own page with `?tearout=<itemId>`;
 * the app boots an empty viewport there, and the workspace moves the live pane in. Nothing else drives
 * this route: the Workstation overrides the opener, and the unit and component fixtures stub it.
 *
 * The witness is a draft typed into the Notes pane before it leaves. A pane's id cannot carry that
 * proof: the declaration keeps its generated id, so a pane re-created from it would match by id and
 * lose the draft. Brain-free on purpose (no Neural Link fixture), so hosted CI selects it; worker truth comes
 * over CDP.
 *
 * Run: npm run test-e2e -- e2e/dashboard/DockTearOutDefaultRoute --workers=1
 */
const DRAFT = 'half-written note',
      PAGE  = '/examples/dashboard/tearOut/index.html';

/**
 * Evaluates an expression inside the App SharedWorker, through the browser's CDP target for it.
 * @param {import('@playwright/test').Browser} browser
 * @param {String} expression
 * @returns {Promise<*>} The expression's value, or null while the worker is not a target yet
 */
async function evaluateInAppWorker(browser, expression) {
    const cdp           = await browser.newBrowserCDPSession(),
          {targetInfos} = await cdp.send('Target.getTargets'),
          worker        = targetInfos.find(info => info.type === 'shared_worker' && /worker\/App\.mjs/.test(info.url));

    if (!worker) {
        await cdp.detach();
        return null
    }

    const {sessionId} = await cdp.send('Target.attachToTarget', {targetId: worker.targetId, flatten: false}),
          reply       = new Promise(resolve => cdp.on('Target.receivedMessageFromTarget', ({message}) => {
              const data = JSON.parse(message);
              data.id === 1 && resolve(data.result)
          }));

    await cdp.send('Target.sendMessageToTarget', {sessionId, message: JSON.stringify({
        id: 1, method: 'Runtime.evaluate', params: {expression, returnByValue: true}
    })});

    const {result} = await reply;

    await cdp.detach();

    return result.value
}

/**
 * Types the draft into Notes, pops Notes out and returns its vessel once the live pane arrived there.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<{notesTab: import('@playwright/test').Locator, vessel: import('@playwright/test').Page}>}
 */
async function popOutNotes(page, context) {
    const notesTab = page.locator('.neo-tab-header-button', {hasText: 'Notes'});

    await expect(notesTab).toBeVisible();
    await notesTab.click();
    await page.locator('input').first().fill(DRAFT);

    // The header's middle actions are gated on focus.
    await notesTab.click();

    const popOut = page.locator('.neo-toolbar-action:has(.fa-window-restore)').filter({visible: true});

    await expect(popOut).toHaveCount(1);

    const [vessel] = await Promise.all([context.waitForEvent('page'), popOut.click()]);

    await vessel.waitForURL(/[?&]tearout=notes\b/);

    // The window's viewport has decided to stay an empty target: it mounts no workspace of its own.
    await expect(vessel.locator('.tear-out-target')).toHaveCount(1);
    await expect(vessel.locator('.neo-dock-workspace')).toHaveCount(0);
    await expect(vessel.locator('input'), 'the live pane arrives with its draft').toHaveValue(DRAFT);
    await expect(notesTab).toHaveCount(0);

    return {notesTab, vessel}
}

test.describe('examples/dashboard/tearOut — the default tear-out route', () => {
    test.setTimeout(120000);
    test.use({viewport: {width: 1200, height: 800}});

    test('a popped-out pane keeps its live state in its own window, and comes home with it', async ({page, context}) => {
        await page.goto(PAGE);

        const {notesTab, vessel} = await popOutNotes(page, context);

        // A user's close runs the page's unload path, which is how the App Worker learns the window is gone.
        await vessel.close({runBeforeUnload: true});

        await expect(notesTab).toBeVisible();
        await notesTab.click();
        await expect(page.locator('input').first(), 'the same pane comes home with its draft').toHaveValue(DRAFT)
    });

    // A reload releases the window exactly as a close does; only the opener's handle tells them apart.
    test('a reloaded vessel keeps its pane, and its close still brings the pane home', async ({page, context}) => {
        await page.goto(PAGE);

        const {notesTab, vessel} = await popOutNotes(page, context);

        await vessel.reload();

        await expect(vessel.locator('input'), 'the reloaded window re-embodies the same live pane').toHaveValue(DRAFT);
        await expect(notesTab, 'the reload does not send the pane home').toHaveCount(0);

        await vessel.close({runBeforeUnload: true});

        await expect(notesTab).toBeVisible();
        await notesTab.click();
        await expect(page.locator('input').first(), 'the same pane comes home with its draft').toHaveValue(DRAFT)
    });

    // A closed vessel's application leaves the App worker one task after its disconnect.
    test('three pop-out round trips leave the main window\'s application as the only one', async ({browser, context, page}) => {
        await page.goto(PAGE);

        const countApps = () => evaluateInAppWorker(browser, 'Object.keys(Neo.apps).length');

        await expect(page.locator('.neo-tab-header-button', {hasText: 'Notes'})).toBeVisible();
        await expect.poll(countApps, {message: 'the main window boots one application'}).toBe(1);

        for (let trip = 0; trip < 3; trip++) {
            const {notesTab, vessel} = await popOutNotes(page, context);

            await vessel.close({runBeforeUnload: true});
            await expect(notesTab).toBeVisible()
        }

        await expect.poll(countApps, {message: 'only the open main window keeps an application', timeout: 10000}).toBe(1)
    })
});
