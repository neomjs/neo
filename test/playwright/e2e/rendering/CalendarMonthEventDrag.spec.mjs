import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies real-pointer dragging of an event across days in Neo.calendar.view.month.Component.
 *
 * The month view scrolls its container to the active month after it mounts (`updateHeaderHeight(true)`:
 * a timeout, a DOM-rect round trip, then `scrollTo`). An event measured before that scroll lands has moved
 * by the time the pointer presses, so the spec measures only after it, and checks the press point first.
 */
test.describe('Neo.calendar.view.month.Component event drag and drop', () => {
    test('dragging a month event with page.mouse moves it into the target day cell', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto('/examples/calendar/basic/index.html');

        await page.getByRole('button', {name: 'Month', exact: true}).click();

        const firstEvent = page.locator('.neo-calendar-monthcomponent .neo-event').first();
        await expect(firstEvent).toBeVisible();

        // The view's mount scroll targets the scroll container's height minus the days header's height
        await expect.poll(() => page.evaluate(() => {
            const month    = document.querySelector('.neo-calendar-monthcomponent'),
                  scroller = month.querySelector('.neo-c-m-scrollcontainer'),
                  header   = month.querySelector('.neo-days-header');

            return Math.abs(scroller.scrollTop - (scroller.getBoundingClientRect().height - header.getBoundingClientRect().height)) < 1
        }), {message: 'the month view scrolled to its active month'}).toBe(true);

        await firstEvent.scrollIntoViewIfNeeded();

        const dragTargets = await firstEvent.evaluate(el => {
            const monthCmp  = el.closest('.neo-calendar-monthcomponent'),
                  sourceDay = el.closest('.neo-day'),
                  weekRow   = el.closest('.neo-week'),
                  days      = [...weekRow.querySelectorAll(':scope > .neo-day')],
                  sourceIdx = days.indexOf(sourceDay),
                  targetDay = days[sourceIdx + 2] || days[sourceIdx - 2],
                  eventRect = el.getBoundingClientRect(),
                  dayRect   = targetDay.getBoundingClientRect();

            return {
                eventId    : el.id,
                monthId    : monthCmp.id,
                sourceDayId: sourceDay.id,
                targetDayId: targetDay.id,
                startX     : eventRect.left + eventRect.width / 2,
                startY     : eventRect.top + eventRect.height / 2,
                endX       : dayRect.left + dayRect.width / 2,
                endY       : dayRect.top + dayRect.height / 2
            };
        });

        expect(dragTargets.sourceDayId).not.toBe(dragTargets.targetDayId);
        expect(await page.evaluate(({startX, startY}) => document.elementFromPoint(startX, startY)?.closest('.neo-event')?.id, dragTargets),
            'the press point hits the measured event').toBe(dragTargets.eventId);

        const appWorker = page.workers().find(w => w.url().includes('worker/App'));
        await expect.poll(() => appWorker?.evaluate(monthId => {
            return (globalThis.Neo?.manager?.DomEvent?.items?.[monthId]?.['drag:start']?.length ?? 0) > 0;
        }, dragTargets.monthId)).toBe(true);

        await page.mouse.move(dragTargets.startX, dragTargets.startY);
        await page.mouse.down();
        await page.mouse.move(dragTargets.endX, dragTargets.endY, {steps: 15});

        await expect(page.locator('body')).toHaveClass(/neo-drag-active/);
        await expect(page.locator('body')).toHaveClass(/neo-cursor-move/);
        await expect(page.locator('.neo-dragproxy')).toHaveCount(1);

        await page.mouse.up();

        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveClass(/neo-cursor-move/);
        await expect(page.locator(`#${dragTargets.targetDayId} #${dragTargets.eventId}`)).toHaveCount(1);
        await expect(page.locator(`#${dragTargets.sourceDayId} #${dragTargets.eventId}`)).toHaveCount(0);
    });
});
