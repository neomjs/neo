import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Shared-state multi-window example: the primary window opens its companion via `Neo.Main.windowOpen`,
 * only the provider-owning primary window offers the opener button, and editing user fields synchronizes both
 * windows across the App SharedWorker.
 *
 * Uses Playwright DOM assertions plus direct CDP SharedWorker inspection so the spec runs in both hosted CI and
 * local environments without a Brain bridge.
 *
 * Run: npm run test-e2e -- e2e/core/SharedStateMultiWindow.spec.mjs
 */
const ENTRY            = process.env.NEO_TEST_ENTRY || '/examples/stateProvider/multiWindow/index.html',
      COMPANION_SUFFIX = ENTRY.replace('/multiWindow/index.html', '/multiWindow2/index.html');

/**
 * @summary Evaluates an expression inside the App SharedWorker through the browser CDP target.
 * @param {import('@playwright/test').Browser} browser
 * @param {String} expression
 * @returns {Promise<*>} Serialized evaluation value, or null while no App SharedWorker target exists
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

    await cdp.send('Target.sendMessageToTarget', {
        sessionId,
        message: JSON.stringify({
            id    : 1,
            method: 'Runtime.evaluate',
            params: {expression, returnByValue: true}
        })
    });

    const {result} = await reply;

    await cdp.detach();

    return result.value
}

test.describe('examples/stateProvider/multiWindow: shared state across opened companion windows', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 900, height: 600}});

    test('primary opens the companion without offering a third window button, and Edit user syncs both headers', async ({browser, context, page}) => {
        await page.goto(ENTRY);

        const openButton        = page.getByRole('button', {name: 'Open second window'}),
              editButton        = page.getByRole('button', {name: 'Edit user'}),
              primaryHeaderText = page.locator('.neo-panel-header-text', {hasText: /^Current user:/});

        await expect(primaryHeaderText).toHaveText('Current user: Tobias Uhlig');
        await expect(openButton).toBeVisible();
        await expect(editButton).toBeVisible();
        await expect(page.locator('.neo-panel .neo-label').last()).toContainText('Open second window');

        const [companion] = await Promise.all([
            context.waitForEvent('page'),
            openButton.click()
        ]);

        await companion.waitForURL(url => url.pathname.endsWith(COMPANION_SUFFIX));

        const companionHeaderText = companion.locator('.neo-panel-header-text', {hasText: /^Current user:/}),
              companionEditButton = companion.getByRole('button', {name: 'Edit user'});

        await expect(companionHeaderText).toHaveText('Current user: Tobias Uhlig');
        await expect(companionEditButton).toBeVisible();
        await expect(companion.getByRole('button', {name: 'Open second window'})).toHaveCount(0);

        await expect.poll(() => evaluateInAppWorker(browser, `(() => {
            const apps      = [...new Set(Object.values(Neo.apps || {}))],
                  primary   = apps.find(app => app.name === 'Neo.examples.stateProvider.multiWindow'),
                  companion = apps.find(app => app.name === 'Neo.examples.stateProvider.multiWindow2'),
                  pPanel    = primary?.mainView?.items?.[0],
                  cPanel    = companion?.mainView?.items?.[0];

            return {
                appCount        : apps.length,
                primaryOwns     : pPanel ? pPanel.stateProvider?.parent === null : false,
                companionChildOf: cPanel && pPanel ? cPanel.stateProvider?.parent === pPanel.stateProvider : false
            }
        })()`)).toEqual({
            appCount        : 2,
            primaryOwns     : true,
            companionChildOf: true
        });

        await editButton.click();

        const firstnameInput = page.locator('.neo-dialog input').first();

        await expect(firstnameInput).toBeVisible();
        await firstnameInput.fill('Julia');
        await firstnameInput.press('Tab');

        await expect(primaryHeaderText).toHaveText('Current user: Julia Uhlig');
        await expect(companionHeaderText).toHaveText('Current user: Julia Uhlig');

        await companionEditButton.click();

        const lastnameInput = companion.locator('.neo-dialog input').nth(1);

        await expect(lastnameInput).toBeVisible();
        await lastnameInput.fill('Morgan');
        await lastnameInput.press('Tab');

        await expect(primaryHeaderText).toHaveText('Current user: Julia Morgan');
        await expect(companionHeaderText).toHaveText('Current user: Julia Morgan');

        await companion.close({runBeforeUnload: true});

        await expect.poll(() => evaluateInAppWorker(browser, '[...new Set(Object.values(Neo.apps || {}))].length')).toBe(1)
    })
});
