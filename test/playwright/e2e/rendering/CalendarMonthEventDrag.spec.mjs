import {test, expect} from '../../fixtures.mjs';

/**
 * @summary Verifies real-pointer dragging of an event across days in Neo.calendar.view.month.Component.
 */
test.describe('Neo.calendar.view.month.Component event drag and drop', () => {
    test('dragging a month event with page.mouse moves it into the target day cell', async ({page}) => {
        await page.setViewportSize({width: 1280, height: 720});
        await page.goto('/examples/calendar/basic/index.html');

        await page.getByRole('button', {name: 'Month', exact: true}).click();

        const firstEvent = page.locator('.neo-calendar-monthcomponent .neo-event').first();
        await expect(firstEvent).toBeVisible();
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
