import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies real-pointer dragging and Escape cancellation of events in the calendar week and month views.
 *
 * Both views scroll their container after mount: the week view scrolls horizontally to the active week
 * (`afterSetMounted`: a 100ms timeout, a DOM-rect round trip, then `scrollBy`), while the month view scrolls
 * vertically to the active month (`updateHeaderHeight(true)`: a timeout, a DOM-rect round trip, then `scrollTo`).
 * The spec waits for each mount scroll and `drag:start` listener registration before measuring coordinates.
 */
test.describe('Neo.calendar event drag, drop, and Escape cancel', () => {
    test('Escape mid-drag aborts the move in week and month views while a completed drop moves the event', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto('/examples/calendar/basic/index.html');

        const getAppWorker = () => page.workers().find(w => w.url().includes('worker/App'));

        const readRecordDates = (viewId, eventId) => getAppWorker().evaluate(({viewId, eventId}) => {
            const view   = globalThis.Neo.get(viewId),
                  record = view.eventStore.get(globalThis.Neo.util.VDom.find(view.vdom, eventId).vdom.flag);

            return {
                endDate  : record.endDate.toISOString(),
                startDate: record.startDate.toISOString()
            };
        }, {viewId, eventId});

        // 1. Week view: wait for horizontal mount scroll and drag:start registration
        const weekFirstEvent = page.locator('.neo-calendar-weekcomponent .neo-event').first();
        await expect(weekFirstEvent).toBeVisible();

        await expect.poll(() => page.evaluate(() => {
            const week     = document.querySelector('.neo-calendar-weekcomponent'),
                  scroller = week?.querySelector('.neo-c-w-scrollcontainer'),
                  colCnt   = week?.querySelector('.neo-c-w-column-container');

            if (!scroller || !colCnt) return false;

            const expectedScrollLeft = colCnt.getBoundingClientRect().width / 3;
            return expectedScrollLeft > 0 && Math.abs(scroller.scrollLeft - expectedScrollLeft) < 2;
        }), {message: 'the week view scrolled to its active week'}).toBe(true);

        const weekTargets = await page.evaluate(() => {
            const weekCmp       = document.querySelector('.neo-calendar-weekcomponent'),
                  allColumns    = [...weekCmp.querySelectorAll('.neo-c-w-column')],
                  activeColumns = allColumns.slice(7, 14),
                  sourceCol     = activeColumns.find(col => col.querySelector('.neo-event')),
                  sourceIdx     = activeColumns.indexOf(sourceCol),
                  eventEl       = sourceCol.querySelector('.neo-event'),
                  targetCol     = activeColumns[sourceIdx + 1] || activeColumns[sourceIdx - 1],
                  eventRect     = eventEl.getBoundingClientRect(),
                  targetRect    = targetCol.getBoundingClientRect();

            return {
                endX       : targetRect.left + targetRect.width / 2,
                endY       : eventRect.top + eventRect.height / 2,
                eventId    : eventEl.id,
                sourceDayId: sourceCol.id,
                startX     : eventRect.left + eventRect.width / 2,
                startY     : eventRect.top + eventRect.height / 2,
                targetDayId: targetCol.id,
                weekId     : weekCmp.id
            };
        });

        expect(weekTargets.sourceDayId).not.toBe(weekTargets.targetDayId);
        expect(await page.evaluate(({startX, startY}) => document.elementFromPoint(startX, startY)?.closest('.neo-event')?.id, weekTargets),
            'the week press point hits the measured event').toBe(weekTargets.eventId);

        await expect.poll(() => getAppWorker()?.evaluate(weekId => {
            return (globalThis.Neo?.manager?.DomEvent?.items?.[weekId]?.['drag:start']?.length ?? 0) > 0;
        }, weekTargets.weekId)).toBe(true);

        const initialWeekDates = await readRecordDates(weekTargets.weekId, weekTargets.eventId);

        // 1a. Week view Escape mid-drag: record dates and DOM day remain unchanged
        await page.mouse.move(weekTargets.startX, weekTargets.startY);
        await page.mouse.down();
        await page.mouse.move(weekTargets.endX, weekTargets.endY, {steps: 15});

        await expect(page.locator('.neo-dragproxy')).toHaveCount(1);

        await page.keyboard.press('Escape');
        await page.mouse.up();

        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveClass(/neo-cursor-move/);
        expect(await readRecordDates(weekTargets.weekId, weekTargets.eventId)).toEqual(initialWeekDates);
        await expect(page.locator(`#${weekTargets.sourceDayId} #${weekTargets.eventId}`)).toHaveCount(1);
        await expect(page.locator(`#${weekTargets.targetDayId} #${weekTargets.eventId}`)).toHaveCount(0);

        // 1b. Week view completed drop: moves the event to the target column and updates record dates
        await page.mouse.move(weekTargets.startX, weekTargets.startY);
        await page.mouse.down();
        await page.mouse.move(weekTargets.endX, weekTargets.endY, {steps: 15});

        await expect(page.locator('.neo-dragproxy')).toHaveCount(1);

        await page.mouse.up();

        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveClass(/neo-cursor-move/);
        await expect(page.locator(`#${weekTargets.targetDayId} #${weekTargets.eventId}`)).toHaveCount(1);
        await expect(page.locator(`#${weekTargets.sourceDayId} #${weekTargets.eventId}`)).toHaveCount(0);
        expect(await readRecordDates(weekTargets.weekId, weekTargets.eventId)).not.toEqual(initialWeekDates);

        // 2. Month view: switch to Month and wait for vertical mount scroll
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

        await expect.poll(() => getAppWorker()?.evaluate(monthId => {
            return (globalThis.Neo?.manager?.DomEvent?.items?.[monthId]?.['drag:start']?.length ?? 0) > 0;
        }, dragTargets.monthId)).toBe(true);

        const initialMonthDates = await readRecordDates(dragTargets.monthId, dragTargets.eventId);

        // 2a. Month view Escape mid-drag: record dates and DOM day remain unchanged
        await page.mouse.move(dragTargets.startX, dragTargets.startY);
        await page.mouse.down();
        await page.mouse.move(dragTargets.endX, dragTargets.endY, {steps: 15});

        await expect(page.locator('body')).toHaveClass(/neo-drag-active/);
        await expect(page.locator('body')).toHaveClass(/neo-cursor-move/);
        await expect(page.locator('.neo-dragproxy')).toHaveCount(1);

        await page.keyboard.press('Escape');
        await page.mouse.up();

        await expect(page.locator('.neo-dragproxy')).toHaveCount(0);
        await expect(page.locator('body')).not.toHaveClass(/neo-cursor-move/);
        expect(await readRecordDates(dragTargets.monthId, dragTargets.eventId)).toEqual(initialMonthDates);
        await expect(page.locator(`#${dragTargets.sourceDayId} #${dragTargets.eventId}`)).toHaveCount(1);
        await expect(page.locator(`#${dragTargets.targetDayId} #${dragTargets.eventId}`)).toHaveCount(0);

        // 2b. Month view completed drop: moves the event into the target day cell and updates record dates
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
        expect(await readRecordDates(dragTargets.monthId, dragTargets.eventId)).not.toEqual(initialMonthDates);
    });
});

