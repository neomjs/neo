import { test, expect } from '@playwright/test';

test.describe('Neo.calendar.view.week.Component - Issue #19930', () => {
    test('Loads calendar weekview page without component construction errors', async ({ page }) => {
        const componentErrors = [];

        // Catch uncaught JS runtime and component construction exceptions
        page.on('pageerror', err => {
            const msg = err.message || String(err);
            // Ignore missing static stylesheet notices
            if (!msg.includes('Stylesheet failed to load')) {
                componentErrors.push(msg);
            }
        });

        // Navigate to the weekview example page
        await page.goto('http://localhost:8081/examples/calendar/weekview/index.html');

        // wall-clock-under-test: waits for application worker initialization and initial VDOM render
        await page.waitForTimeout(2000);

        // Verify zero JS runtime or null-pointer construction crashes occur
        expect(componentErrors).toEqual([]);
    });
});