import { test, expect } from '@playwright/test';
import { setup }        from '../../setup.mjs';

test.describe('Neo.calendar.view.week.Component - Issue #19930', () => {
    test.beforeAll(async () => {
        await import('../../../../src/Neo.mjs');
        await setup();
        await import('../../../../src/core/_export.mjs');
        await import('../../../../src/calendar/store/Calendars.mjs');
        await import('../../../../src/calendar/store/Events.mjs');
        await import('../../../../src/calendar/view/week/Component.mjs');
    });

    test('Constructs cleanly when currentDate is null and updates header when set', async () => {
        let component;

        expect(() => {
            component = Neo.create({
                className    : 'Neo.calendar.view.week.Component',
                appName      : 'TestApp',
                calendarStore: Neo.create('Neo.calendar.store.Calendars'),
                currentDate  : null,
                eventStore   : Neo.create('Neo.calendar.store.Events')
            });
        }).not.toThrow();

        expect(component).toBeDefined();

        expect(() => {
            component.currentDate = new Date();
        }).not.toThrow();

        const cells = component.getHeaderContainer().cn.filter(cell => cell.cls?.includes('neo-header-row-item'));
        expect(cells.length).toBe(component.totalColumns);
    });
});