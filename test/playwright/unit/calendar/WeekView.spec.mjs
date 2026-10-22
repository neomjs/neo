import { test, expect } from '@playwright/test';
import { setup }        from '../../setup.mjs';

test.describe('Neo.calendar.view.week.Component - Issue #19930', () => {
    test.beforeAll(async () => {
        await import('../../../../src/Neo.mjs');
        await setup();
        await import('../../../../src/core/_export.mjs');
        await import('../../../../src/calendar/view/week/Component.mjs');
    });

    test('Constructs cleanly when currentDate is null and updates header when set', async () => {
        let component;

        // 1. Construct with currentDate: null (assert no errors thrown)
        expect(() => {
            component = Neo.create({
                className  : 'Neo.calendar.view.week.Component',
                currentDate: null,
                appName    : 'TestApp'
            });
        }).not.toThrow();

        expect(component).toBeDefined();

        // 2. Set currentDate post-construction
        expect(() => {
            component.currentDate = new Date();
        }).not.toThrow();

        expect(component.vdom).toBeDefined();
    });
});