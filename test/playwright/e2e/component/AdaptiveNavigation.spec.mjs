import {expect, test} from '../../fixtures.mjs';

const example = '/examples/toolbar/navigation/index.html',
      phone   = {width: 390, height: 844},
      wide    = {width: 1200, height: 844};

test.use({viewport: phone});

/**
 * @summary Reads the example's native destination links and its separate content field.
 * @param {import('@playwright/test').Page} page
 * @returns {Object}
 */
function navigation(page) {
    const bar = page.getByRole('navigation', {name: 'Destinations', exact: true});

    return {
        bar,
        account : bar.getByRole('link', {name: /^Account\b/}),
        draft   : page.getByRole('main').getByRole('textbox', {name: 'Draft', exact: true}),
        inbox   : bar.getByRole('link', {name: /^Inbox\b/}),
        schedule: bar.getByRole('link', {name: /^Schedule\b/})
    }
}

/**
 * @summary Waits for both the browser route and the one current link painted by the App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {Object} destinations
 * @param {String} destination
 */
async function expectCurrent(page, destinations, destination) {
    const heading = destination[0].toUpperCase() + destination.slice(1);

    await expect(page).toHaveURL(url => url.pathname === example && url.hash === `#/${destination}`);
    await expect(destinations.bar.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(destinations[destination]).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('main').getByRole('heading', {name: heading, exact: true})).toBeVisible()
}

test('the compact route bar becomes a rail without remounting links or the Schedule draft', async ({page}, testInfo) => {
    await page.goto(`${example}#/schedule`);

    const destinations                           = navigation(page),
          {account, bar, draft, inbox, schedule} = destinations,
          draftText                              = 'Confirm Monday’s review agenda';

    await expect(bar).toHaveClass(/\bneo-toolbar-navigation\b/);
    await expect(bar).toHaveCSS('flex-direction', 'row');
    await expect(schedule).toHaveCSS('flex-grow', '1');
    await expect(bar.getByRole('link')).toHaveCount(3);
    for (const destination of ['inbox', 'schedule', 'account']) {
        await expect(destinations[destination]).toHaveAttribute('href', `#/${destination}`)
    }

    await expectCurrent(page, destinations, 'schedule');
    await expect(draft).toBeVisible();
    await inbox.click();
    await expectCurrent(page, destinations, 'inbox');
    await page.goBack();
    await expectCurrent(page, destinations, 'schedule');
    await page.reload();
    await expectCurrent(page, destinations, 'schedule');

    await draft.fill(draftText);
    await inbox.focus();
    await page.keyboard.press('ArrowRight');
    await expect(schedule).toBeFocused();
    await expectCurrent(page, destinations, 'schedule');

    const linkNodes = await bar.getByRole('link').elementHandles(),
          draftNode = await draft.elementHandle();

    await testInfo.attach('compact navigation at 390px', {
        body: await page.screenshot({animations: 'disabled'}), contentType: 'image/png'
    });

    await page.setViewportSize(wide);
    await expect(bar).toHaveCSS('flex-direction', 'column');
    await expect(schedule).toHaveCSS('flex-grow', '0');
    await expectCurrent(page, destinations, 'schedule');
    await expect(schedule).toBeFocused();
    await expect(draft).toHaveValue(draftText);
    expect(await bar.getByRole('link').evaluateAll((nodes, previous) =>
        nodes.length === previous.length && nodes.every((node, index) => node === previous[index]), linkNodes)).toBe(true);
    expect(await draft.evaluate((node, previous) => node === previous, draftNode)).toBe(true);

    await testInfo.attach('wide navigation rail', {
        body: await page.screenshot({animations: 'disabled'}), contentType: 'image/png'
    });

    await page.keyboard.press('ArrowDown');
    await expect(account).toBeFocused();
    await expectCurrent(page, destinations, 'schedule');

    // Native keyboard activation fires a trusted click with no mouse button click count.
    const activations = await account.evaluateHandle(node => {
        const seen = [];
        node.addEventListener('click', event => seen.push({detail: event.detail, trusted: event.isTrusted}));
        return seen
    });

    await page.keyboard.press('Enter');
    await expectCurrent(page, destinations, 'account');
    expect(await activations.jsonValue()).toEqual([{detail: 0, trusted: true}]);

    await page.goBack();
    await expectCurrent(page, destinations, 'schedule');
    await expect(draft).toHaveValue(draftText);
    expect(await draft.evaluate((node, previous) => node === previous, draftNode)).toBe(true)
});

test('a cold wide deep link and native Back use the same destination URLs', async ({page}) => {
    await page.setViewportSize(wide);
    await page.goto(`${example}#/account`);

    const destinations = navigation(page);

    await expect(destinations.bar).toHaveCSS('flex-direction', 'column');
    await expectCurrent(page, destinations, 'account');
    await destinations.inbox.click();
    await expectCurrent(page, destinations, 'inbox');
    await page.goBack();
    await expectCurrent(page, destinations, 'account');
    await page.reload();
    await expectCurrent(page, destinations, 'account')
});

test('the compact links clear a nonzero safe area and the floating action clears the bar', async ({page}, testInfo) => {
    await page.goto(`${example}#/inbox`);

    const destinations = navigation(page),
          {bar}        = destinations,
          fab          = page.locator('.neo-floating-action-button'),
          inset        = 34,
          measure      = () => bar.evaluate(node => {
              const probe = document.createElement('div');
              probe.style.cssText = 'position: fixed; visibility: hidden; padding-bottom: env(safe-area-inset-bottom, 0px)';
              document.body.append(probe);

              const safeArea = parseFloat(getComputedStyle(probe).paddingBottom);
              probe.remove();

              const barRect    = node.getBoundingClientRect(),
                    linkBottom = Math.max(...Array.from(node.querySelectorAll('a'), link => link.getBoundingClientRect().bottom));

              return {
                  barBottom     : barRect.bottom,
                  barTop        : barRect.top,
                  fabBottom     : document.querySelector('.neo-floating-action-button').getBoundingClientRect().bottom,
                  linkBottom,
                  safeArea,
                  viewportBottom: innerHeight
              }
          });

    await expectCurrent(page, destinations, 'inbox');
    await expect(bar).toHaveCSS('flex-direction', 'row');
    await expect(fab).toBeVisible();

    const baseline = await measure(),
          cdp      = await page.context().newCDPSession(page);

    try {
        expect(baseline.safeArea).toBe(0);
        expect(baseline.fabBottom).toBeLessThan(baseline.barTop);

        await cdp.send('Emulation.setSafeAreaInsetsOverride', {insets: {bottom: inset, bottomMax: inset}});
        await expect.poll(async () => (await measure()).safeArea).toBe(inset);

        const adjusted = await measure();
        expect(adjusted.linkBottom).toBeLessThan(baseline.linkBottom);
        expect(adjusted.linkBottom).toBeLessThanOrEqual(adjusted.viewportBottom - inset + 1);
        expect(adjusted.barBottom).toBeCloseTo(adjusted.viewportBottom, 0);
        expect(adjusted.fabBottom).toBeLessThan(adjusted.barTop);

        await testInfo.attach('compact safe-area geometry', {
            body: JSON.stringify({baseline, adjusted}, null, 2), contentType: 'application/json'
        })
    } finally {
        await cdp.detach()
    }
});
