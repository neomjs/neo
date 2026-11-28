import {expect, test} from '@playwright/test';

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

const notesRoute  = '**/examples/list/pullToRefresh/resources/notes.json',
      scrollStart = 'data-neo-pan-at-scroll-start';

/** @summary Opens the example and waits for the real Buffered scroller and its touch policy. */
async function openFeed(page) {
    await page.goto('/examples/list/pullToRefresh/index.html');

    const count     = page.locator('#pull-refresh-count'),
          feed      = page.locator('#pull-refresh-feed'),
          indicator = page.locator('#pull-refresh-indicator'),
          refresh   = page.getByRole('button', {name: 'Refresh', exact: true});

    await expect(refresh).toBeVisible();
    expect(await refresh.evaluate(node => node.tagName)).toBe('BUTTON');
    await expect(count).toHaveText('Refreshed 0 times');
    await expect(feed.locator('.neo-list-item').first()).toBeVisible();
    await expect(feed).toHaveAttribute(scrollStart, '');

    return {count, feed, indicator, refresh}
}

/** @summary Drives a real Chromium contact and records the feed's independent native input receipts. */
async function openTouch(page, feed) {
    const cdp      = await page.context().newCDPSession(page),
          box      = await feed.boundingBox(),
          x        = Math.round(box.x + box.width / 2),
          y        = Math.round(box.y + box.height / 4),
          observed = await feed.evaluateHandle(node => {
              const events = [];

              for (const type of ['touchstart', 'touchend', 'touchcancel', 'pointercancel']) {
                  node.addEventListener(type, event => {
                      if (event.isTrusted && (type !== 'pointercancel' || event.pointerType === 'touch')) {
                          events.push(type)
                      }
                  }, {capture: true, passive: true})
              }

              return events
          }),
          send = (type, offset) => cdp.send('Input.dispatchTouchEvent', {
              type,
              touchPoints: offset === undefined ? [] : [{id: 17, x, y: y + offset}]
          }),
          move = async (...offsets) => {
              for (const offset of offsets) {
                  await send('touchMove', offset)
              }
          };

    return {
        events: () => observed.jsonValue(),
        move,
        start : async (...offsets) => {
            await send('touchStart', 0);
            await move(...offsets)
        },
        end   : () => send('touchEnd'),
        cancel: () => send('touchCancel'),
        close : async () => {
            await observed.dispose();
            await cdp.detach()
        }
    }
}

test('a trusted pull refreshes once from the native list boundary', async ({context, page}, testInfo) => {
    const release = Promise.withResolvers(),
          note    = {id: 'new-note', title: 'Field note from the refresh response'};
    let requests = 0, navigations = 0;

    page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) {
            navigations++
        }
    });

    await context.route(notesRoute, async route => {
        requests++;
        await release.promise;
        await route.fulfill({json: [note]})
    });

    const {count, feed, indicator, refresh} = await openFeed(page),
          touch                             = await openTouch(page, feed);

    try {
        expect(requests).toBe(0);
        await expect(indicator).toBeHidden();
        await expect(feed).toHaveCSS('touch-action', /\bpan-down\b/);
        await expect(feed).toHaveCSS('overscroll-behavior-y', 'contain');

        await touch.start(24);
        await expect(indicator).toBeVisible();
        await expect(indicator).toHaveText('Pull to refresh');
        await touch.end();
        await expect(indicator).toBeHidden();
        expect(await touch.events()).toEqual(['touchstart', 'touchend']);
        expect(requests).toBe(0);

        await touch.start(24, 54, 86, 120);
        await expect(indicator).toBeVisible();
        await expect(indicator).toHaveText('Release to refresh');
        await touch.cancel();
        await expect(indicator).toBeHidden();
        expect(await touch.events()).toContain('touchcancel');
        expect(requests).toBe(0);

        await feed.evaluate(node => {node.scrollTop = 180});
        await expect.poll(() => feed.evaluate(node => node.scrollTop)).toBe(180);
        await expect(feed).not.toHaveAttribute(scrollStart, '');
        await expect(feed).not.toHaveCSS('touch-action', /\bpan-down\b/);

        const nativeStart = (await touch.events()).length;

        await touch.start(24, 54, 86, 120);
        await expect.poll(() => feed.evaluate(node => node.scrollTop)).toBeLessThan(180);
        await expect.poll(async () => (await touch.events()).slice(nativeStart)).toContain('pointercancel');
        await touch.end();
        await expect(indicator).toBeHidden();
        await expect(count).toHaveText('Refreshed 0 times');
        expect(requests).toBe(0);

        await feed.evaluate(node => {node.scrollTop = 0});
        await expect(feed).toHaveAttribute(scrollStart, '');
        await expect(feed).toHaveCSS('touch-action', /\bpan-down\b/);

        const pullStart = (await touch.events()).length;

        await touch.start(24);
        await expect(indicator).toBeVisible();
        const previewY = (await indicator.boundingBox()).y;
        await touch.move(54, 86, 120);
        await expect.poll(async () => (await indicator.boundingBox()).y).toBeGreaterThan(previewY);
        await expect(indicator).toBeVisible();
        await expect(indicator).toHaveText('Release to refresh');
        expect(requests).toBe(0);
        await page.screenshot({path: testInfo.outputPath('pull-to-refresh-armed-390x844.png')});
        await touch.end();
        expect((await touch.events()).slice(pullStart)).toEqual(['touchstart', 'touchend']);
        await expect.poll(() => requests).toBe(1);
        await expect(indicator).toHaveText('Refreshing…');
        await expect(indicator).toBeVisible();
        await expect(refresh).toBeDisabled();
        await expect(count).toHaveText('Refreshed 0 times');
        await page.screenshot({path: testInfo.outputPath('pull-to-refresh-pending-390x844.png')});

        await touch.start(24, 54, 86, 120);
        await touch.end();
        await expect(indicator).toHaveText('Refreshing…');
        expect(requests).toBe(1);

        release.resolve();
        await expect(count).toHaveText('Refreshed 1 time');
        await expect(feed.getByText(note.title, {exact: true})).toBeVisible();
        await expect(indicator).toBeHidden();
        await expect(refresh).toBeEnabled();
        expect(requests).toBe(1);
        expect(navigations).toBe(1)
    } finally {
        release.resolve();
        await touch.close()
    }
});

test('keyboard and button activation load the same feed', async ({context, page}) => {
    let requests = 0;

    await context.route(notesRoute, route => route.fulfill({
        json: [{id: 'replacement-note', title: `Field note from request ${++requests}`}]
    }));

    const {count, feed, indicator, refresh} = await openFeed(page);

    expect(requests).toBe(0);
    await refresh.focus();
    await expect(refresh).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(count).toHaveText('Refreshed 1 time');
    await expect(feed.getByText('Field note from request 1', {exact: true})).toBeVisible();
    await expect(refresh).toBeEnabled();
    expect(requests).toBe(1);

    await refresh.click();
    await expect(count).toHaveText('Refreshed 2 times');
    await expect(feed.getByText('Field note from request 2', {exact: true})).toBeVisible();
    await expect(indicator).toBeHidden();
    expect(requests).toBe(2)
});
