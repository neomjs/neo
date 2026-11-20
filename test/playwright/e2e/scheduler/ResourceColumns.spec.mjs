import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/resourceColumns/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Collects page errors and console errors for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {String[]}
 */
function trackErrors(page) {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => msg.type() === 'error' && errors.push(msg.text()));

    return errors
}

/**
 * @summary Reads the header texts per region, the timeline body's width, and the rendered rows in visual order: each
 * row's name, booked hours and the event ids of its visible bars.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
function readBoard(page) {
    return page.evaluate(() => {
        const
            rect     = el => el.getBoundingClientRect(),
            visible  = el => rect(el).width > 0 && rect(el).height > 0,
            rowAt    = (selector, top) => [...document.querySelectorAll(selector)].filter(visible).filter(el => Math.abs(rect(el).top - top) < 2),
            regions  = [...document.querySelectorAll('.neo-grid-header-toolbar')].map(toolbar =>
                [...toolbar.querySelectorAll('.neo-grid-header-button:not(.neo-timeline-header) .neo-button-text')].map(text => text.textContent.trim())),
            timeline = [...document.querySelectorAll('.neo-grid-body')].find(body => body.querySelector('.neo-timeline-track')),
            names    = [...document.querySelectorAll('.neo-grid-cell[data-field="name"]')].filter(visible).sort((a, b) => rect(a).top - rect(b).top);

        return {
            regions,
            timelineWidth: rect(timeline).width,
            rows         : names.map(cell => {
                const
                    top   = rect(cell).top,
                    track = rowAt('.neo-timeline-cell', top)[0];

                return {
                    bars  : track ? [...track.querySelectorAll('.neo-timeline-bar')].filter(visible).map(bar => bar.dataset.eventId) : [],
                    hours : parseFloat(rowAt('.neo-grid-cell[data-field="hours"]', top)[0]?.textContent),
                    name  : cell.textContent.trim(),
                    region: rowAt('.neo-grid-cell[data-field="region"]', top)[0]?.textContent.trim(),
                    skill : rowAt('.neo-grid-cell[data-field="skill"]', top)[0]?.textContent.trim()
                }
            })
        }
    })
}

/**
 * @summary Reads how far the plan's header is scrolled; the bodies follow the same scrollbar.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Number>}
 */
function planScroll(page) {
    return page.evaluate(() => Math.round(document.querySelector('.neo-timeline-header').closest('.neo-grid-header-toolbar').scrollLeft))
}

test.describe('Scheduler resource columns example (#21619)', () => {
    test('four locked columns stand beside the timeline, and a sort keeps every row with its own bars', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();
        // The plan opens at Monday 08:00: 8 hours at 0.3 px per minute
        await expect.poll(() => planScroll(page)).toBe(144);

        const before = await readBoard(page);

        expect(before.regions[0], 'the four columns are locked at the start').toEqual(['Technician', 'Skill', 'Region', 'Booked']);
        expect(before.timelineWidth, 'the timeline keeps at least half of the width').toBeGreaterThanOrEqual(720);
        await expect(page.locator('.neo-grid-cell[data-field="hours"]').first()).toHaveClass(/neo-right/);

        const elif = before.rows.find(row => row.name === 'Elif Yilmaz');

        expect(elif.bars.length, 'Elif has bars in view').toBeGreaterThan(0);
        elif.bars.forEach(id => expect(id, 'a bar in Elif\'s row is Elif\'s job').toMatch(/^job-5-/));

        const booked = page.locator('.neo-grid-header-button', {hasText: 'Booked'});

        // First click: ascending, the least booked first
        await booked.click();
        await expect(booked).toHaveClass(/neo-sort-asc/);
        await expect.poll(async () => (await readBoard(page)).rows[0]?.name).toBe('Rosa Lindgren');

        let rows = (await readBoard(page)).rows;

        rows.slice(1).forEach((row, i) => expect(row.hours, 'ascending by booked hours').toBeGreaterThanOrEqual(rows[i].hours));

        // Second click: descending, the most booked first
        await booked.click();
        await expect(booked).toHaveClass(/neo-sort-desc/);
        await expect.poll(async () => (await readBoard(page)).rows[0]?.hours).toBe(40);

        rows = (await readBoard(page)).rows;
        rows.slice(1).forEach((row, i) => expect(row.hours, 'descending by booked hours').toBeLessThanOrEqual(rows[i].hours));

        const elifAfter = rows.find(row => row.name === 'Elif Yilmaz');

        expect(rows.indexOf(elifAfter), 'Elif moved up the list').toBeLessThan(before.rows.indexOf(elif));
        expect(elifAfter.bars, 'Elif\'s row keeps the same bars after the sort').toEqual(elif.bars);

        // Every other column sorts its rows too, and Elif's row still carries Elif's jobs
        for (const [text, field] of [['Skill', 'skill'], ['Region', 'region'], ['Technician', 'name']]) {
            const header = page.locator('.neo-grid-header-button', {hasText: text});

            // A header that lost its sort keeps its direction class beside neo-sort-hidden, so wait on the rows
            await header.click();
            await expect.poll(async () => {
                const values = (await readBoard(page)).rows.map(row => row[field]),
                      steps  = values.slice(1).map((value, i) => values[i].localeCompare(value));

                return steps.every(step => step <= 0) || steps.every(step => step >= 0)
            }, {message: `${text} sorts the rows`}).toBe(true);

            (await readBoard(page)).rows.find(row => row.name === 'Elif Yilmaz')?.bars.forEach(id => expect(id).toMatch(/^job-5-/))
        }

        expect(errors).toEqual([])
    });

    test('at 390 x 844 the name column alone stays locked, and the plan opens beside it', async ({page}) => {
        const errors = trackErrors(page);

        await page.setViewportSize({width: 390, height: 844});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-timeline-bar').first()).toBeAttached();

        await expect.poll(async () => (await readBoard(page)).regions[0]).toEqual(['Technician']);
        expect((await readBoard(page)).regions[1], 'the other three scroll with the timeline').toEqual(['Skill', 'Region', 'Booked']);

        // Past skill, region and hours (302px), then to Monday 08:00 (144px)
        await expect.poll(() => planScroll(page)).toBe(446);

        const jobsInSight = await page.evaluate(() => {
            const nameEdge = document.querySelector('.neo-grid-cell[data-field="name"]').getBoundingClientRect().right;

            return [...document.querySelectorAll('.neo-timeline-track .neo-timeline-bar')].filter(bar => {
                const box = bar.getBoundingClientRect();
                return box.width > 0 && box.left >= nameEdge && box.left < innerWidth
            }).length
        });

        expect(jobsInSight, 'jobs stand beside the names on the first frame').toBeGreaterThan(5);
        expect(errors).toEqual([])
    });

    test('renders without errors in every theme at both sizes', async ({page}) => {
        const errors = trackErrors(page);

        for (const size of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
                await expect(page.locator('.neo-viewport')).toHaveClass(new RegExp(theme));
                await expect(page.locator('.neo-timeline-bar').first()).toBeAttached()
            }
        }

        expect(errors).toEqual([])
    });
});
