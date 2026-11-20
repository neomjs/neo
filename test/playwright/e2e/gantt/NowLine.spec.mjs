import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Pins the timeline family's now line as one straight line, measured from rendered rects: the header's mark
 * and the body's line share one x, no row border breaks the body line, and the header's ticks and shading bands stand
 * where the body draws the same offsets. Unit specs only see the `left` values, which always agreed. The line stops at
 * the header's bottom border, which spans every column.
 */
const
    CASES  = [
        {family: 'Gantt chart', url: '/examples/gantt/basic/index.html',     now: '2026-11-14T12:00:00Z'},
        {family: 'scheduler',   url: '/examples/scheduler/basic/index.html', now: '2026-11-09T13:00:00Z', band: '2026-11-10'}
    ],
    THEMES = ['neo-theme-neo-light', 'neo-theme-neo-dark'];

/**
 * @summary Sets the axis instant, the theme and, for a band case, one non-working date in the App Worker. `locked`
 * moves the timeline column into that lock region through its own `locked` config.
 * @param {Object} page
 * @param {Object} options
 * @param {String} options.now
 * @param {String} options.theme
 * @param {String} [options.band]
 * @param {String} [options.locked]
 */
async function arrange(page, {now, theme, band, locked}) {
    await expect.poll(() => page.workers().some(worker => worker.url().includes('worker/App'))).toBe(true);

    await page.workers().find(worker => worker.url().includes('worker/App')).evaluate(({now, theme, band, locked}) => {
        const items = [...globalThis.Neo.manager.Instance.items.values()];

        items.filter(item => item.className === 'Neo.timeline.TimeAxis').forEach(axis => {
            axis.set(band ? {now, nonWorkingDates: [band]} : {now})
        });
        band && items.filter(item => 'showNonWorkingTime' in item && item.timeAxis).forEach(owner => { owner.showNonWorkingTime = true });
        locked && items.filter(item => item.timelineColumn).forEach(owner => { owner.timelineColumn.locked = locked });
        items.filter(item => /Viewport$/.test(item.className)).forEach(viewport => { viewport.theme = theme })
    }, {now, theme, band: band ?? null, locked: locked ?? null})
}

/**
 * @summary Reads the now line, the first minor tick and an optional band from the DOM. Rows count only in a body with
 * a width: a body that a lock change emptied keeps its old cells at zero width, where no visitor sees them.
 * @param {Object} page
 * @param {String|null} band The day key of a band drawn in header and rows
 * @returns {Promise<Object>}
 */
function measure(page, band) {
    return page.evaluate(band => {
        const
            rect     = element => element.getBoundingClientRect(),
            center   = box => box.left + box.width / 2,
            bodies   = [...document.querySelectorAll('.neo-grid-body')].filter(body => rect(body).width > 0),
            inRows   = selector => bodies.flatMap(body => [...body.querySelectorAll(`.neo-timeline-track ${selector}`)]),
            header   = rect(document.querySelector('.neo-timeline-header .neo-timeline-now')),
            lines    = inRows('.neo-timeline-now'),
            segments = lines.map(rect).sort((a, b) => a.top - b.top),
            track    = rect(lines[0].closest('.neo-timeline-track')),
            tick     = document.querySelector('.neo-timeline-header .neo-timeline-tick-minor'),
            bands    = band && {
                header: document.querySelector(`.neo-timeline-header .neo-timeline-non-working[data-day-key="${band}"]`),
                row   : inRows(`.neo-timeline-non-working[data-day-key="${band}"]`)[0]
            },
            bar      = inRows('.neo-timeline-bar').map(rect)
                .find(box => box.left < center(header) - 4 && box.right > center(header) + 4);

        let barOnTop = null;

        if (bar) {
            // The line ignores the pointer, so it takes hits for this one read: the topmost of bar and line answers
            lines.forEach(line => { line.style.pointerEvents = 'auto' });
            const hit = document.elementFromPoint(center(header), bar.top + bar.height / 2);
            lines.forEach(line => { line.style.pointerEvents = '' });

            barOnTop = Boolean(hit?.closest('.neo-timeline-bar'))
        }

        return {
            headerX  : center(header),
            bodyX    : segments.map(center),
            segments : segments.length,
            maxGap   : Math.max(0, ...segments.slice(1).map((segment, i) => segment.top - segments[i].bottom)),
            tickDelta: rect(tick).left - (track.left + parseFloat(tick.style.left)),
            bandDelta: bands ? rect(bands.header).left - rect(bands.row).left : null,
            barOnTop
        }
    }, band ?? null)
}

for (const {family, url, now, band} of CASES) {
    for (const theme of THEMES) {
        test(`${family}: the now line runs straight from the header through every row (${theme})`, async ({page}) => {
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));

            await page.setViewportSize({width: 1440, height: 900});
            await page.goto(url);
            await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

            await arrange(page, {now, theme, band});
            await expect(page.locator('.neo-timeline-track .neo-timeline-now').first()).toBeVisible();
            await expect(page.locator('.neo-timeline-header .neo-timeline-now')).toBeVisible();
            band && await expect(page.locator(`.neo-timeline-track .neo-timeline-non-working[data-day-key="${band}"]`).first()).toBeVisible();

            const result = await measure(page, band);

            expect(result.segments, 'one segment per rendered row').toBeGreaterThan(2);
            result.bodyX.forEach(x => expect(Math.abs(x - result.headerX), 'body line under the header mark').toBeLessThanOrEqual(0.5));
            expect(result.maxGap, 'no row border breaks the body line').toBeLessThanOrEqual(0.5);
            expect(Math.abs(result.tickDelta), 'a header tick stands where the body draws its offset').toBeLessThanOrEqual(0.5);
            band && expect(Math.abs(result.bandDelta), 'a header band stands over its row band').toBeLessThanOrEqual(0.5);
            result.barOnTop !== null && expect(result.barOnTop, 'a bar crossing the line stays above it').toBe(true);
            expect(errors).toEqual([])
        })
    }
}

// The locked end opens on a 1px seam its first column's cells draw (grid/Body.css); its header must keep the same inset
test('scheduler: a timeline that opens the locked end keeps its header mark over the body line', async ({page}) => {
    const
        {url, now} = CASES[1],
        errors     = [];

    page.on('pageerror', error => errors.push(error.message));

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(url);
    await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

    await arrange(page, {now, theme: THEMES[0], locked: 'end'});
    await expect(page.locator('.neo-timeline-header.neo-locked-end')).toBeVisible();
    await expect(page.locator('.neo-timeline-cell.neo-locked-end-first-column').first()).toBeVisible();
    await expect(page.locator('.neo-timeline-track .neo-timeline-now').first()).toBeVisible();

    const result = await measure(page, null);

    expect(result.segments, 'one segment per rendered row').toBeGreaterThan(2);
    result.bodyX.forEach(x => expect(Math.abs(x - result.headerX), 'body line under the header mark').toBeLessThanOrEqual(0.5));
    expect(Math.abs(result.tickDelta), 'a header tick stands where the body draws its offset').toBeLessThanOrEqual(0.5);
    expect(errors).toEqual([])
});
