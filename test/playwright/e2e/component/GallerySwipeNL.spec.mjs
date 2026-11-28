import {expect, test} from '../../fixtures.mjs';

const GALLERY_ID = 'neo-gallery-1';

test.use({hasTouch: true, isMobile: true, viewport: {width: 390, height: 844}});

/**
 * @summary Opens the stock example and observes the selection event from its own App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>}
 */
async function bootGallery(page, neuralLink) {
    await neuralLink.routeConfig(page.context(), config => ({...config, useAiClient: true}));
    await page.goto('/examples/component/gallery/index.html');

    const gallery      = page.locator(`#${GALLERY_ID}`),
          selectedItem = gallery.locator('.neo-gallery-item.neo-selected');

    await expect(selectedItem).toHaveCount(1);

    const app       = await neuralLink.connectToApp('Neo.examples.component.gallery'),
          [target]  = await app.queryComponent({id: GALLERY_ID}, ['swipeNavigation', 'windowId']),
          appWorker = page.workers().find(worker => worker.url().includes('/worker/App.mjs'));

    expect(target.properties.swipeNavigation).toBe(true);
    expect(appWorker).toBeDefined();

    await expect.poll(() => page.evaluate(() => Boolean(Neo.main?.addon?.Gesture))).toBe(true);
    await appWorker.evaluate(async id => {
        const view = Neo.getComponent(id);

        // Main's round trip follows the demand-loaded listener's registration on the same window port.
        await Neo.currentWorker.getAddon('Gesture', view.windowId);
        await Neo.main.DomAccess.getBoundingClientRect({id, windowId: view.windowId});

        view.swipeSelections = [];
        view.on('select', ({record}) => view.swipeSelections.push(view.getRecordId(record)), view)
    }, GALLERY_ID);

    const read = () => appWorker.evaluate(id => {
        const view      = Neo.getComponent(id),
              {store}   = view,
              selected  = view.selectionModel.items[0],
              selection = store.get(selected);

        return {
            amountRows: view.amountRows,
            count     : Math.min(view.maxItems, store.getCount()),
            events    : [...view.swipeSelections],
            index     : selection ? store.indexOf(selection) : -1,
            selected
        }
    }, GALLERY_ID);

    return {
        appWorker, gallery, read, selectedItem,
        replay: (provider, frames) => app.driveGesture({
            frames, provider, target: GALLERY_ID, windowId: String(target.properties.windowId)
        }),
        seed: async index => {
            const id = await appWorker.evaluate(({galleryId, index}) => {
                const view     = Neo.getComponent(galleryId),
                      recordId = view.getRecordId(view.store.getAt(index));

                view.selectionModel.select(recordId);
                return recordId
            }, {galleryId: GALLERY_ID, index});

            await expect(selectedItem).toHaveAttribute('id', `${GALLERY_ID}__${id}`);
            return id
        }
    }
}

/**
 * @summary Builds the same one-contact stroke for Engine and browser replay, in target-relative CSS pixels.
 * @param {Object} box
 * @param {Object} options
 * @returns {Object[]}
 */
function stroke(box, {compact=false, direction='left', duration=64, terminal='up'}={}) {
    const vertical = direction === 'up',
          fromX    = vertical ? 0.5 : direction === 'left' ? 0.8 : 0.2,
          toX      = vertical ? 0.5 : 1 - fromX,
          fromY    = vertical ? 0.77 : 0.55,
          toY      = vertical ? 0.24 : fromY,
          samples  = compact
              ? [[0, 0], [16, 1], [16, 1]]
              : [[0, 0], [duration / 4, 0.33], [duration / 2, 0.67], [duration * 3 / 4, 1], [duration, 1]];

    return samples.map(([t, progress], index) => ({
        t,
        contacts: [{
            id   : 'gallery-contact',
            state: index === 0 ? 'down' : index === samples.length - 1 ? terminal : 'move',
            x    : Math.round(box.width * (fromX + (toX - fromX) * progress)),
            y    : Math.round(box.height * (fromY + (toY - fromY) * progress))
        }]
    }))
}

/**
 * @summary Checks the observed provider and termination separately from Gallery selection.
 * @param {Object} receipt
 * @param {String} provider
 * @param {Number} frameCount Number of planned contact frames.
 * @param {String} [terminal='end']
 */
function expectReplay(receipt, provider, frameCount, terminal='end') {
    expect(receipt, JSON.stringify(receipt)).toMatchObject({
        provider, sequences: [terminal], success: true, terminal, trusted: provider === 'browser'
    });
    expect(receipt.observed.map(({active, changed}) => [active, changed])).toEqual([
        ...Array.from({length: frameCount - 1}, () => [['gallery-contact'], ['gallery-contact']]),
        [[], ['gallery-contact']]
    ])
}

/**
 * @summary Pins each selection to the logical record, its one emitted event, and its rendered item.
 * @param {Object} fixture
 * @param {Number} index
 * @param {Number} eventCount
 * @returns {Promise<Object>}
 */
async function expectSelection({read, selectedItem}, index, eventCount) {
    await expect.poll(read).toMatchObject({index, events: new Array(eventCount).fill(expect.anything())});

    const state = await read();

    expect(state.events.at(-1)).toBe(state.selected);
    await expect(selectedItem).toHaveAttribute('id', `${GALLERY_ID}__${state.selected}`);
    return state
}

for (const provider of ['engine', 'browser']) {
    test(`${provider} horizontal swipes select one spatial neighbor and preserve keyboard wrapping`, async ({page, neuralLink}) => {
        const fixture                       = await bootGallery(page, neuralLink),
              {gallery, read, replay, seed} = fixture,
              {amountRows, count}           = await read(),
              middle                        = Math.floor(count / 2),
              box                           = await gallery.boundingBox(),
              sweep                         = async direction => {
                  const frames = stroke(box, {compact: true, direction});

                  expectReplay(await replay(provider, frames), provider, frames.length)
              };

        await seed(middle);
        await sweep('left');
        await expectSelection(fixture, middle + amountRows, 1);
        await sweep('right');
        await expectSelection(fixture, middle, 2);

        for (const [index, key, direction] of [[0, 'ArrowLeft', 'right'], [count - 1, 'ArrowRight', 'left']]) {
            const original = await seed(index),
                  before   = (await read()).events.length;

            await gallery.focus();
            await expect(gallery).toBeFocused();
            await page.keyboard.press(key);
            await expect.poll(async () => (await read()).events.length).toBe(before + 1);

            const reference = await read();

            expect(reference.selected).not.toBe(original);
            expect(index === 0 ? reference.index > middle : reference.index < middle).toBe(true);

            await seed(index);
            await sweep(direction);
            const actual = await expectSelection(fixture, reference.index, before + 2);

            expect(actual.selected).toBe(reference.selected)
        }
    })
}

test('slow, vertical, and canceled Engine gestures leave Gallery selection intact', async ({page, neuralLink}) => {
    const {gallery, read, replay, selectedItem} = await bootGallery(page, neuralLink),
          before                                = await read(),
          box                                   = await gallery.boundingBox();

    for (const options of [{duration: 1200}, {direction: 'up'}, {terminal: 'cancel'}]) {
        const frames  = stroke(box, options),
              receipt = await replay('engine', frames);

        expectReplay(receipt, 'engine', frames.length, options.terminal === 'cancel' ? 'cancel' : 'end');
        expect(await read()).toEqual(before);
        await expect(selectedItem).toHaveAttribute('id', `${GALLERY_ID}__${before.selected}`)
    }
});

test('a vertical stroke starting on Gallery scrolls the mobile example natively', async ({page, neuralLink}) => {
    const {gallery, read, replay} = await bootGallery(page, neuralLink),
          viewport                = page.locator('.neo-examples-gallery'),
          before                  = await read();

    await expect(gallery).toHaveCSS('touch-action', 'pan-y pinch-zoom');
    await expect.poll(() => viewport.evaluate(node => node.scrollHeight - node.clientHeight)).toBeGreaterThan(60);

    await gallery.evaluate(node => {
        window.galleryNativeScroll = {start: false, cancel: false};

        for (const [type, key] of [['pointerdown', 'start'], ['pointercancel', 'cancel']]) {
            document.addEventListener(type, event => {
                if (event.isTrusted && event.pointerType === 'touch' && node.contains(event.target)) {
                    window.galleryNativeScroll[key] = true
                }
            }, {capture: true, passive: true})
        }
    });

    const originalScroll = await viewport.evaluate(node => node.scrollTop),
          receipt        = await replay('browser', stroke(await gallery.boundingBox(), {direction: 'up'}));

    expect(receipt).toMatchObject({provider: 'browser', trusted: true});
    await expect.poll(() => page.evaluate(() => window.galleryNativeScroll)).toEqual({start: true, cancel: true});
    await expect.poll(() => viewport.evaluate(node => node.scrollTop)).toBeGreaterThan(originalScroll + 20);
    expect(await read()).toEqual(before)
});

test('a trusted tap selects once and the visible controls work with keyboard activation', async ({page, neuralLink}) => {
    const fixture                                  = await bootGallery(page, neuralLink),
          {appWorker, gallery, read, selectedItem} = fixture,
          before                                   = await read();

    await gallery.evaluate(async node => {
        // The selection class arrives before the camera and selected item finish moving.
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const animations = node.getAnimations({subtree: true}).filter(animation =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime));

        await Promise.allSettled(animations.map(animation => animation.finished))
    });

    const target = await gallery.evaluate(node => {
        const rect = node.getBoundingClientRect();

        for (let y = Math.max(24, rect.top + 24); y < Math.min(rect.bottom - 24, innerHeight); y += 12) {
            for (let x = Math.max(24, rect.left + 24); x < Math.min(rect.right - 24, innerWidth); x += 12) {
                const item = document.elementFromPoint(x, y)?.closest('.neo-gallery-item:not(.neo-selected)');

                if (item && node.contains(item)) return item.id
            }
        }

        return null
    });

    expect(target, 'an unselected Gallery record is visible and hittable on mobile').toBeTruthy();
    await gallery.evaluate(node => {
        window.galleryTrustedClicks = [];
        node.addEventListener('click', event => {
            const item = event.target.closest('.neo-gallery-item');

            if (event.isTrusted && item) window.galleryTrustedClicks.push(item.id)
        }, {capture: true, passive: true})
    });
    await gallery.locator(`[id="${target}"]`).tap();
    await expect.poll(() => page.evaluate(() => window.galleryTrustedClicks.length)).toBe(1);

    const [clickedId]  = await page.evaluate(() => window.galleryTrustedClicks),
          clickedIndex = await appWorker.evaluate(({galleryId, itemNodeId}) => {
              const view = Neo.getComponent(galleryId);

              return view.store.indexOf(view.store.get(view.getItemId(itemNodeId)))
          }, {galleryId: GALLERY_ID, itemNodeId: clickedId});

    expect(clickedIndex).toBeGreaterThanOrEqual(0);
    expect(clickedIndex).not.toBe(before.index);
    await expectSelection(fixture, clickedIndex, 1);
    await expect(selectedItem).toHaveAttribute('id', clickedId);
    expect(await page.evaluate(() => window.galleryTrustedClicks)).toEqual([clickedId]);

    const {amountRows, count} = await read(),
          middle              = Math.floor(count / 2),
          left                = page.getByRole('button', {name: 'Move left', exact: true}),
          right               = page.getByRole('button', {name: 'Move right', exact: true});

    await fixture.seed(middle);
    await expect(left).toBeVisible();
    await expect(right).toBeVisible();
    await gallery.focus();
    await page.keyboard.press('Tab');
    await expect(left).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(right).toBeFocused();
    await page.keyboard.press('Enter');
    await expectSelection(fixture, middle + amountRows, 2);
    await page.keyboard.press('Shift+Tab');
    await expect(left).toBeFocused();
    await page.keyboard.press('Space');
    await expectSelection(fixture, middle, 3)
});
