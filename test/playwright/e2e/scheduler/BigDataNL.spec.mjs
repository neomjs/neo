import {expect, test} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/bigData/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

function trackErrors(page) {
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));
    page.on('response', res => {
        if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
            errors.push(`${res.status()} ${res.url()}`)
        }
    });
    page.on('console', msg => {
        if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico') && !msg.text().includes('favicon.ico')) {
            errors.push(msg.text())
        }
    });
    return errors
}

test('renders 300 resources and 15,600 seeded bookings with bounded DOM bars across vertical and 3-month horizontal scrolls', async ({page, neuralLink}) => {
    const errors = trackErrors(page);

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(EXAMPLE_URL);

    await expect(page.locator('.year-plan-counts')).toHaveText('300 people · 15,600 bookings');
    await expect(page.locator('.year-plan-zoom-last')).toHaveText('3 Weeks');
    const firstBar = page.locator('.neo-scheduler .neo-timeline-bar').first();
    await expect(firstBar).toBeVisible();

    const app         = await neuralLink.connectToApp('SchedulerBigData');
    const [scheduler] = await app.findInstances({className: 'Neo.scheduler.Container'}, ['id']);
    const stores      = await app.getComponent(scheduler.id, ['store', 'eventStore']);

    expect(stores.store.count).toBe(300);
    expect(stores.eventStore.count).toBe(15600);

    const initialBars = await page.locator('.neo-scheduler .neo-timeline-bar').count();
    expect(initialBars).toBeGreaterThan(0);
    expect(initialBars).toBeLessThanOrEqual(300);

    const seededFirstBar = {
        eventId  : await firstBar.getAttribute('data-event-id'),
        ariaLabel: await firstBar.getAttribute('aria-label')
    };

    // Scroll vertically to the bottom of the 300-resource list.
    await page.evaluate(() => {
        const targets = [...document.querySelectorAll('.neo-scheduler *')].filter(el => el.scrollHeight > el.clientHeight + 50 && el.clientHeight > 100);
        for (const el of targets) {
            el.scrollTop = el.scrollHeight - el.clientHeight
        }
    });
    await expect(page.locator('.neo-scheduler .neo-grid-row').filter({hasText: 'Soren Patel'}).first()).toBeVisible();

    const afterVerticalBars = await page.locator('.neo-scheduler .neo-timeline-bar').count();
    expect(afterVerticalBars).toBeGreaterThan(0);
    expect(afterVerticalBars).toBeLessThanOrEqual(300);

    // Scroll horizontally across ~3 months (90 days at 64.8 px/day = 5,832 px).
    await page.evaluate(() => {
        const targets = [...document.querySelectorAll('.neo-scheduler *')].filter(el => el.scrollWidth > el.clientWidth + 50 && el.clientWidth > 100);
        for (const el of targets) {
            el.scrollLeft = 5832
        }
    });
    await expect.poll(async () => (await page.locator('.neo-timeline-header-major').innerText())).toContain('Apr');
    // A bar's accessible name reads its dates in the locale, e.g. "Design review (Apr 6 – 8)".
    await expect(page.locator('.neo-scheduler .neo-timeline-bar[aria-label*="Apr "]').first()).toBeVisible();
    await expect(page.locator('.neo-scheduler .neo-timeline-bar[aria-label*="Jan "]')).toHaveCount(0);

    const afterHorizontalBars = await page.locator('.neo-scheduler .neo-timeline-bar').count();
    expect(afterHorizontalBars).toBeGreaterThan(0);
    expect(afterHorizontalBars).toBeLessThanOrEqual(300);

    // Reloading reproduces the identical seeded initial frame.
    await page.reload();
    await expect(page.locator('.neo-scheduler .neo-timeline-bar').first()).toBeVisible();
    const reloadedFirstBar = {
        eventId  : await page.locator('.neo-scheduler .neo-timeline-bar').first().getAttribute('data-event-id'),
        ariaLabel: await page.locator('.neo-scheduler .neo-timeline-bar').first().getAttribute('aria-label')
    };
    expect(reloadedFirstBar).toEqual(seededFirstBar);
    expect(errors).toEqual([])
});

test('fits 390x844 mobile without horizontal overflow and renders cleanly across all five themes', async ({page}) => {
    const errors = trackErrors(page);

    await page.setViewportSize({width: 390, height: 844});
    await page.goto(EXAMPLE_URL);
    await expect(page.locator('.year-plan-counts')).toHaveText('300 people · 15,600 bookings');
    await expect(page.locator('.neo-scheduler .neo-timeline-bar').first()).toBeVisible();

    const mobileMetrics = await page.evaluate(() => {
        const bar = document.querySelector('.neo-scheduler .neo-timeline-bar')?.getBoundingClientRect();
        return {
            overflowX: document.documentElement.scrollWidth > window.innerWidth,
            barWidth : bar?.width || 0
        }
    });
    expect(mobileMetrics.overflowX).toBe(false);
    expect(mobileMetrics.barWidth).toBeGreaterThan(0);

    await page.setViewportSize({width: 1440, height: 900});
    for (const theme of THEMES) {
        await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
        await expect(page.locator('.neo-scheduler .neo-timeline-bar').first()).toBeVisible();
        await expect.poll(() => page.locator('.neo-scheduler').first().evaluate((el, cls) => Boolean(el.closest(`.${cls}`)), theme)).toBe(true)
    }

    expect(errors).toEqual([])
});
