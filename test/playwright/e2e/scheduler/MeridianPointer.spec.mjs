import {expect, test} from '../../fixtures.mjs';

const board     = '.meridian-desk .meridian-board',
      scheduler = '.meridian-scheduler',
      gantt     = '.meridian-gantt',
      request   = board + ' .neo-board-card[id$="__arc17"]',
      proxy     = '.neo-dragproxy.meridian-request-proxy';

/** @summary Reads committed records independently of the Gantt's visible proposal.
 * @param {Object} page
 * @param {Object} neuralLink
 * @returns {Promise<Object>}
 */
async function openDesk(page, neuralLink) {
    await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}));
    await page.goto('/examples/scheduler/meridian/index.html');
    await expect(page.locator(request)).toBeVisible();
    await expect(page.locator(scheduler + ' .neo-timeline-bar[data-event-id="mosaic"]')).toBeVisible();
    const app = await neuralLink.connectToApp('MeridianObservatory'),
          id  = await page.locator('.meridian-desk').getAttribute('id');
    return {app, read: () => app.callMethod(id, 'getNightState')}
}

/** @summary Starts a native Board card drag, past the pointer sensor's threshold. @param {Object} page */
async function lift(page) {
    const card = page.locator(request);
    await card.scrollIntoViewIfNeeded();
    const r = await card.boundingBox(), x = r.x + r.width / 2, y = r.y + r.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 18, y, {steps: 5});
    await expect(page.locator(proxy)).toBeVisible()
}

/** @summary Moves the still-held pointer to a time relative to the row's actual 22:08–22:36 track.
 * @param {Object} page
 * @param {String} scope
 * @param {Number} minute
 */
async function hoverSlot(page, scope, minute) {
    const recordId = await page.locator(scheduler + ' .neo-grid-row').filter({hasText: scope + ' ·'}).getAttribute('data-record-id'),
          track    = page.locator(`${scheduler} .neo-grid-row[data-record-id="${recordId}"] .neo-timeline-track`),
          r        = await track.boundingBox();
    await page.mouse.move(r.x + (minute - 8) * r.width / 28, r.y + r.height / 2, {steps: 18})
}

/** @summary The start painted on the native Gantt, measured in CSS pixels from the time axis origin. */
const startPx = (page, id) => page.locator(`${gantt} .neo-timeline-bar[data-event-id="${id}"]`)
    .evaluate(el => parseFloat(el.style.left));

test.describe('Meridian observing night — physical card to telescope', () => {
    test.use({viewport: {width: 1600, height: 1000}, reducedMotion: 'reduce'});

    test('a single hold compares costs and a missed ingress; refusing or escaping preserves the night', async ({page, neuralLink}) => {
        const {read}  = await openDesk(page, neuralLink), initial = await read(),
              mosaic  = await startPx(page, 'mosaic'), stack = await startPx(page, 'stack'),
              slot    = page.locator(scheduler + ' .meridian-slot-preview'),
              caption = page.locator(proxy + ' .meridian-drag-caption');
        await lift(page);
        await hoverSlot(page, 'North', 13);
        await expect(caption).toContainText('600 samples');
        await expect(caption).toContainText('22:13–22:17 UTC');
        await expect(caption).toContainText('Mosaic +8 min');
        await expect(slot).toHaveAttribute('data-resource', 'north');
        await expect(slot).toHaveAttribute('data-verdict', 'accepted');
        await expect(page.locator(board + ' [id$="__col__cleared"] .neo-board-card-slot[id$="__arc17"]')).toBeAttached();
        await expect(page.locator(board + ' [id$="__col__booked"] .neo-board-card-slot')).toHaveCount(0);
        await expect(page.locator(board + ' [id$="__col__booked"] .neo-board-card[id$="__standard"]')).toBeVisible();
        await expect.poll(() => startPx(page, 'mosaic')).toBeGreaterThan(mosaic);
        await expect.poll(() => startPx(page, 'stack')).toBeGreaterThan(stack);
        await expect.poll(read).toEqual({...initial, proposed: true});

        await hoverSlot(page, 'South', 13);
        await expect(caption).toContainText('240 samples');
        await expect(caption).toContainText('Mosaic unchanged');
        await expect(slot).toHaveAttribute('data-resource', 'south');
        await expect.poll(() => startPx(page, 'mosaic')).toBe(mosaic);
        await expect.poll(read).toEqual({...initial, proposed: true});
        await expect(page.locator(scheduler + ' .neo-timeline-bar[data-event-id="arc17"]')).toHaveCount(0);

        await hoverSlot(page, 'South', 17);
        await expect(caption).toContainText('Misses ingress');
        await expect(slot).toHaveAttribute('data-verdict', 'denied');
        await page.mouse.up();
        await expect(slot).toHaveCount(0);
        await expect(page.locator(proxy)).toHaveCount(0);
        await expect.poll(read).toEqual(initial);

        await lift(page);
        await hoverSlot(page, 'North', 13);
        await expect(slot).toHaveAttribute('data-verdict', 'accepted');
        await page.keyboard.press('Escape');
        await page.mouse.up();
        await expect(slot).toHaveCount(0);
        await expect(page.locator(proxy)).toHaveCount(0);
        await expect.poll(read).toEqual(initial);

        // Coming back before release is still a native change of crew clearance.
        await lift(page);
        await hoverSlot(page, 'South', 13);
        await expect(slot).toHaveAttribute('data-verdict', 'accepted');
        const queue = await page.locator(board + ' [id$="__col__queue"]').boundingBox();
        await page.mouse.move(queue.x + queue.width / 2, queue.y + queue.height / 2, {steps: 18});
        await page.mouse.up();
        await expect(page.locator(proxy)).toHaveCount(0);
        await expect(slot).toHaveCount(0);
        await expect.poll(read).toMatchObject({stage: 'queue', booked: false, proposed: false})
    });

    test('an accepted release publishes one allocation; a clearance withdrawal invalidates a held slot', async ({page, neuralLink}) => {
        const {app, read} = await openDesk(page, neuralLink), initial = await read(),
              slot        = page.locator(scheduler + ' .meridian-slot-preview'),
              bar         = page.locator(scheduler + ' .neo-timeline-bar[data-event-id="arc17"]'),
              boardId     = await page.locator(board).getAttribute('id');
        await lift(page);
        await hoverSlot(page, 'North', 13);
        await expect(slot).toHaveAttribute('data-verdict', 'accepted');
        await page.mouse.up();
        await expect(slot).toHaveCount(0);
        await expect(bar).toBeVisible();
        await expect.poll(read).toMatchObject({revision: initial.revision + 1, stage: 'booked', resource: 'north',
            start: 13, mosaicStart: 21, stackStart: 29, booked: true, proposed: false});
        await expect(page.locator(board + ' [id$="__col__booked"] .neo-board-card[id$="__arc17"]')).toHaveCount(1);

        await page.getByRole('button', {name: 'Reset night', exact: true}).click();
        await expect(bar).toHaveCount(0);
        await lift(page);
        await hoverSlot(page, 'South', 13);
        await expect(slot).toHaveAttribute('data-verdict', 'accepted');
        // A second actor withdraws clearance while the pointer stays on the otherwise usable slot.
        await app.callMethod(boardId, 'moveCard', [{key: 'arc17', status: 'queue'}]);
        await expect.poll(read).toMatchObject({stage: 'queue', booked: false, proposed: false});
        await expect(page.locator(proxy + ' .meridian-drag-caption')).toContainText('Plan changed');
        await expect(page.locator(proxy)).toHaveAttribute('data-verdict', 'neutral');
        const withdrawn = await read();
        await page.mouse.up();
        await expect(page.locator(proxy)).toHaveCount(0);
        await expect(slot).toHaveCount(0);
        await expect(bar).toHaveCount(0);
        await expect(page.locator(board + ' [id$="__col__queue"] .neo-board-card[id$="__arc17"]')).toBeVisible();
        await expect.poll(read).toEqual(withdrawn)
    });

    test('the focused request can withdraw and restore clearance, then compare and book with the keyboard', async ({page, neuralLink}) => {
        const {read} = await openDesk(page, neuralLink), card = page.locator(request);
        await expect(page.locator(board).getByRole('button', {name: 'Edit card'})).toHaveCount(0);
        await card.click();
        await page.keyboard.press('Control+ArrowRight');
        await expect(page.locator('.meridian-verdict-title')).toContainText('Drop ARC-17 on a telescope');
        await expect.poll(read).toMatchObject({stage: 'cleared', booked: false});
        await page.keyboard.press('Control+ArrowLeft');
        await expect.poll(read).toMatchObject({stage: 'queue', booked: false});
        await card.press('Enter');
        await expect(page.getByRole('button', {name: 'Book this slot'})).toBeDisabled();
        await page.keyboard.press('Escape');
        await card.click();
        await page.keyboard.press('Control+ArrowRight');
        await expect.poll(read).toMatchObject({stage: 'cleared', booked: false});
        await card.press('Enter');
        const book = page.getByRole('button', {name: 'Book this slot'});
        await expect(book).toBeEnabled();
        await book.focus();
        await page.keyboard.press('Enter');
        await expect.poll(read).toMatchObject({stage: 'booked', resource: 'north', booked: true})
    })
});
