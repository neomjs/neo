import {expect, test} from '@playwright/test';

test.use({hasTouch: true, viewport: {width: 390, height: 844}});

const targetKey  = '4',
      shortSwipe = [-24, -43, -62],
      longSwipe  = [-29, -60, -91, -124];

/** @summary Opens the real Buffered list with its gesture policy and App Worker Store. */
async function openFeed(page) {
    await page.goto('/examples/list/swipeActions/index.html');

    const feed  = page.locator('#swipe-feed'),
          count = page.locator('#swipe-count'),
          row   = key => feed.locator(`.neo-list-item[data-record-id="${key}"]`),
          toast = page.locator('.neo-toast'),
          undo  = toast.getByRole('button', {name: 'Undo', exact: true});

    await expect(count).toHaveText('500 items');
    await expect(row(targetKey).getByText(`Reading item ${targetKey}`, {exact: true})).toBeVisible();
    await expect(row(targetKey)).toHaveCSS('touch-action', /\bpan-y\b/);
    await expect.poll(() => page.evaluate(() => Boolean(Neo.main.addon.Gesture))).toBe(true);

    const worker = page.workers().find(item => item.url().includes('/worker/App'));
    expect(worker).toBeDefined();

    const storeState = key => worker.evaluate(id => {
        const {store} = Neo.get('swipe-feed');

        return {count: store.getCount(), index: store.indexOf(id)}
    }, key);

    return {count, feed, row, storeState, toast, undo}
}

/** @summary Sends native touch through Chromium and keeps an independent record of trusted input. */
async function openTouch(page, feed) {
    const cdp      = await page.context().newCDPSession(page),
          observed = await feed.evaluateHandle(node => {
              const events     = [],
                    pan        = [],
                    gesture    = Neo.main.addon.Gesture,
                    observePan = ({claim, kind, trusted}) => {
                        if (claim.node === node && claim.family === 'pan') {
                            const row = claim.sequence.path.find(entry => entry.data?.slotBinding != null);

                            pan.push({kind, trusted, key: row?.data.recordId, stamp: String(row?.data.slotBinding)})
                        }
                    };

              gesture.on('contact', observePan, gesture);

              for (const type of ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointercancel']) {
                  node.addEventListener(type, event => {
                      if (event.isTrusted && (type !== 'pointercancel' || event.pointerType === 'touch')) {
                          events.push({type, key: event.target.closest('.neo-list-item')?.dataset.recordId})
                      }
                  }, {capture: true, passive: true})
              }

              return {events, pan, disconnect: () => gesture.un('contact', observePan, gesture)}
          });
    let x, y;

    const send = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints}),
          step = (type, dx, dy) => send(type, [{id: 17, x: x + dx, y: y + dy}]);

    return {
        events: () => observed.evaluate(({events}) => events),
        pan   : () => observed.evaluate(({pan}) => pan),
        down  : async row => {
            const box = await row.boundingBox();

            x = Math.round(box.x + box.width * 0.65);
            y = Math.round(box.y + box.height / 2);
            await step('touchStart', 0, 0)
        },
        move : (dx, dy) => step('touchMove', dx, dy),
        up   : () => send('touchEnd', []),
        close: async () => {
            await observed.evaluate(({disconnect}) => disconnect());
            await observed.dispose();
            await cdp.detach()
        }
    }
}

/** @summary Checks that exactly the expected Store record was archived and exposes a native Undo. */
async function expectArchive(app) {
    await expect(app.count).toHaveText('499 items');
    await expect(app.row(targetKey)).toHaveCount(0);
    await expect.poll(() => app.storeState(targetKey)).toEqual({count: 499, index: -1});
    await expect(app.toast).toHaveCount(1);
    await expect(app.toast.getByText(`Archived Reading item ${targetKey}`, {exact: true})).toBeVisible();
    await expect(app.undo).toBeVisible();
    expect(await app.undo.evaluate(node => ({tag: node.tagName, tabIndex: node.tabIndex})))
        .toEqual({tag: 'BUTTON', tabIndex: 0})
}

/** @summary Verifies actual restoration of the key and its original Store position after Undo. */
async function expectRestore(app) {
    await expect(app.count).toHaveText('500 items');
    await expect(app.row(targetKey)).toHaveCount(1);
    await expect(app.row(targetKey)).toContainText(`Reading item ${targetKey}`);
    await expect.poll(() => app.storeState(targetKey)).toEqual({count: 500, index: 3});
    await expect(app.undo).toBeHidden()
}

test('a short swipe reveals an action and vertical touch keeps native scrolling', async ({page}, testInfo) => {
    const app     = await openFeed(page),
          row     = app.row(targetKey),
          archive = row.getByRole('button', {name: 'Archive', exact: true}),
          touch   = await openTouch(page, app.feed);

    try {
        await expect(archive).toBeHidden();
        await touch.down(row);

        for (const dx of shortSwipe) await touch.move(dx, 0);

        await touch.up();
        const horizontal = await touch.events();

        expect(horizontal[0]).toEqual({type: 'touchstart', key: targetKey});
        expect(horizontal.at(-1)?.type).toBe('touchend');
        expect(horizontal.map(({type}) => type)).not.toContain('pointercancel');
        await expect(archive).toBeVisible();
        await expect(app.count).toHaveText('500 items');
        await expect(app.toast).toHaveCount(0);
        await page.screenshot({path: testInfo.outputPath('short-swipe-revealed-390x844.png')});

        await archive.click();
        await expectArchive(app);
        await page.screenshot({path: testInfo.outputPath('archive-undo-390x844.png')});
        await app.undo.click();
        await expectRestore(app);

        await touch.down(row);

        for (const dy of [-26, -57, -89, -120]) await touch.move(0, dy);

        await expect.poll(() => app.feed.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
        await expect.poll(async () => (await touch.events()).slice(horizontal.length).map(({type}) => type))
            .toContain('pointercancel');
        await touch.up();
        await expect(archive).toBeHidden();
        await expect(app.count).toHaveText('500 items');
        await expect.poll(() => app.storeState(targetKey)).toEqual({count: 500, index: 3})
    } finally {
        await touch.close()
    }
});

test('a trusted contact cannot archive through a recycled row binding', async ({page}) => {
    const app     = await openFeed(page),
          row     = app.row(targetKey),
          element = await row.elementHandle(),
          touch   = await openTouch(page, app.feed),
          binding = () => element.evaluate(node => ({
              connected: node.isConnected,
              key      : node.dataset.recordId,
              stamp    : node.dataset.slotBinding
          }));

    try {
        const original = await binding();

        expect(original).toMatchObject({connected: true, key: targetKey, stamp: expect.stringMatching(/^\d+$/)});
        await touch.down(row);
        expect(await touch.events()).toEqual([{type: 'touchstart', key: targetKey}]);

        // Recycle before the first move so preview cleanup cannot hide a stale touchstart binding.
        await app.feed.evaluate(node => {node.scrollTop = node.clientHeight * 2});
        await expect.poll(async () => (await binding()).key).not.toBe(targetKey);
        const rebound = await binding();

        expect(rebound.connected).toBe(true);
        expect(rebound.key).toBeTruthy();
        expect(rebound.stamp).not.toBe(original.stamp);

        await app.feed.evaluate(node => {node.scrollTop = 0});
        await expect.poll(binding).toMatchObject({connected: true, key: targetKey});
        expect((await binding()).stamp).not.toBe(original.stamp);

        for (const dx of longSwipe) await touch.move(dx, 0);

        await touch.up();
        const staleTypes = (await touch.events()).map(({type}) => type);

        expect(staleTypes).toContain('touchmove');
        expect(staleTypes.at(-1)).toBe('touchend');
        expect(staleTypes).not.toContain('pointercancel');
        expect((await touch.pan()).at(-1)).toEqual({kind: 'end', trusted: true, key: targetKey, stamp: original.stamp});
        await expect(app.count).toHaveText('500 items');
        await expect(app.toast).toHaveCount(0);
        await expect.poll(() => app.storeState(targetKey)).toEqual({count: 500, index: 3});

        await touch.down(row);

        for (const dx of longSwipe) await touch.move(dx, 0);

        await expect(app.count).toHaveText('500 items');
        await touch.up();
        await expectArchive(app);
        await app.undo.focus();
        await expect(app.undo).toBeFocused();
        await page.keyboard.press('Enter');
        await expectRestore(app)
    } finally {
        await element.dispose();
        await touch.close()
    }
});

test('the visible row actions menu can archive with the keyboard', async ({page}) => {
    const app     = await openFeed(page),
          actions = app.row(targetKey).getByRole('button', {name: 'Actions', exact: true}),
          archive = page.getByRole('menuitem', {name: 'Archive', exact: true});

    await expect(actions).toBeVisible();
    expect(await actions.evaluate(node => node.tagName)).toBe('BUTTON');
    await actions.focus();
    await expect(actions).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(archive).toBeVisible();
    await expect(archive).toBeFocused();
    await page.keyboard.press('Enter');
    await expectArchive(app)
});
