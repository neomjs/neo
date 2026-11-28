import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Pins the timeline family's now line as one straight, unbroken line from the header through every row,
 * measured from rendered rects: the header's mark and the body's line share one x, the header mark meets the first
 * body segment across the header's bottom edge without a gap, no row border breaks the body line, the header's bottom
 * edge stays visible at one y across timeline, plain and tree columns without moving any toolbar or body, and grids
 * without a timeline column keep their toolbar bottom border.
 */
const
    CASES  = [
        {family: 'Gantt chart', url: '/examples/gantt/basic/index.html',     now: '2026-11-14T12:00:00Z', headerBottom: 121},
        {family: 'scheduler',   url: '/examples/scheduler/basic/index.html', now: '2026-11-09T13:00:00Z', band: '2026-11-10', headerBottom: 133}
    ],
    THEMES = ['neo-theme-neo-light', 'neo-theme-neo-dark'];

/**
 * @summary Sets the axis instant, theme and optional non-working date, then waits for the markers to show that instant. `locked`
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

    const nowOffset = await page.workers().find(worker => worker.url().includes('worker/App')).evaluate(({now, theme, band, locked}) => {
        const
            items = [...globalThis.Neo.manager.Instance.items.values()],
            axis  = items.find(item => item.timelineColumn?.timeAxis)?.timelineColumn.timeAxis;

        items.filter(item => item.className === 'Neo.timeline.TimeAxis').forEach(axis => {
            axis.set(band ? {now, nonWorkingDates: [band]} : {now})
        });
        band && items.filter(item => 'showNonWorkingTime' in item && item.timeAxis).forEach(owner => { owner.showNonWorkingTime = true });
        locked && items.filter(item => item.timelineColumn).forEach(owner => { owner.timelineColumn.locked = locked });
        items.filter(item => /Viewport$/.test(item.className)).forEach(viewport => { viewport.theme = theme });

        return axis?.getNowOffset()
    }, {now, theme, band: band ?? null, locked: locked ?? null});

    expect(Number.isFinite(nowOffset), 'the active axis contains the requested instant').toBe(true);

    // Visible markers can still carry the preceding offset while the App Worker updates the header and rows.
    await expect.poll(() => page.evaluate(expected => {
        const
            header = document.querySelector('.neo-timeline-header .neo-timeline-now'),
            bodies = [...document.querySelectorAll('.neo-grid-body')].filter(body => body.getBoundingClientRect().width > 0),
            rows   = bodies.flatMap(body => [...body.querySelectorAll('.neo-timeline-track .neo-timeline-now')]);

        return !!header && rows.length > 2 && [header, ...rows].every(marker => Math.abs(parseFloat(marker.style.left) - expected) < 0.01)
    }, nowOffset), {message: 'the header and all visible rows draw the requested instant'}).toBe(true)
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
            rect           = element => element.getBoundingClientRect(),
            center         = box => box.left + box.width / 2,
            isVisibleColor = color => Boolean(color && color !== 'transparent' && color !== 'rgba(0, 0, 0, 0)'),
            hasBottomInset = shadow => Boolean(shadow && shadow !== 'none' && shadow.includes('inset') && /0px -1px(?:\s|$)/.test(shadow)),
            toolbars       = [...document.querySelectorAll('.neo-grid-header-toolbar')].filter(toolbar => rect(toolbar).width > 0),
            bodies         = [...document.querySelectorAll('.neo-grid-body')].filter(body => rect(body).width > 0),
            inRows         = selector => bodies.flatMap(body => [...body.querySelectorAll(`.neo-timeline-track ${selector}`)]),
            timelineHeader = document.querySelector('.neo-timeline-header'),
            timelineStyle  = getComputedStyle(timelineHeader),
            plainHeaders   = toolbars.flatMap(toolbar => [...toolbar.querySelectorAll('.neo-grid-header-button:not(.neo-timeline-header)')]),
            header         = rect(document.querySelector('.neo-timeline-header .neo-timeline-now')),
            rowLines       = inRows('.neo-timeline-now'),
            segments       = rowLines.map(rect).sort((a, b) => a.top - b.top),
            track          = rect(rowLines[0].closest('.neo-timeline-track')),
            tick           = document.querySelector('.neo-timeline-header .neo-timeline-tick-minor'),
            bands          = band && {
                header: document.querySelector(`.neo-timeline-header .neo-timeline-non-working[data-day-key="${band}"]`),
                row   : inRows(`.neo-timeline-non-working[data-day-key="${band}"]`)[0]
            },
            bar             = inRows('.neo-timeline-bar').map(rect)
                .find(box => box.left < center(header) - 4 && box.right > center(header) + 4);

        let barOnTop = null;

        if (bar) {
            // The line ignores the pointer, so it takes hits for this one read: the topmost of bar and line answers
            rowLines.forEach(line => { line.style.pointerEvents = 'auto' });
            const hit = document.elementFromPoint(center(header), bar.top + bar.height / 2);
            rowLines.forEach(line => { line.style.pointerEvents = '' });

            barOnTop = Boolean(hit?.closest('.neo-timeline-bar'))
        }

        return {
            headerX       : center(header),
            bodyX         : segments.map(center),
            segments      : segments.length,
            seamGap       : segments[0].top - header.bottom,
            maxGap        : Math.max(0, ...segments.slice(1).map((segment, i) => segment.top - segments[i].bottom)),
            toolbarBottoms: toolbars.map(toolbar => rect(toolbar).bottom),
            toolbarBorders: toolbars.map(toolbar => parseFloat(getComputedStyle(toolbar).borderBottomWidth)),
            bodyTops      : bodies.map(body => rect(body).top),
            timelineEdge  : {
                bottom     : rect(timelineHeader).bottom,
                borderWidth: parseFloat(timelineStyle.borderBottomWidth),
                color      : timelineStyle.boxShadow.match(/(?:rgba?|oklch)\([^)]*\)/)?.[0] ?? null,
                insetEdge  : hasBottomInset(timelineStyle.boxShadow)
            },
            plainEdges     : plainHeaders.map(button => {
                const style = getComputedStyle(button);

                return {
                    bottom     : rect(button).bottom,
                    borderWidth: parseFloat(style.borderBottomWidth),
                    color      : style.borderBottomColor,
                    visible    : style.borderBottomStyle === 'solid' && isVisibleColor(style.borderBottomColor)
                }
            }),
            tickDelta: rect(tick).left - (track.left + parseFloat(tick.style.left)),
            bandDelta: bands ? rect(bands.header).left - rect(bands.row).left : null,
            barOnTop
        }
    }, band ?? null)
}

for (const {family, url, now, band, headerBottom} of CASES) {
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
            expect(Math.abs(result.seamGap), 'header mark meets the first body segment across the header edge').toBeLessThanOrEqual(0.5);
            expect(result.maxGap, 'no row border breaks the body line').toBeLessThanOrEqual(0.5);
            expect(result.toolbarBorders, 'timeline grid header toolbars draw no outer bottom border').toEqual([0, 0]);
            result.toolbarBottoms.forEach(y => expect(Math.abs(y - headerBottom), 'no header toolbar bottom moves').toBeLessThanOrEqual(0.5));
            result.bodyTops.forEach(y => expect(Math.abs(y - headerBottom), 'no grid body top moves').toBeLessThanOrEqual(0.5));
            expect(result.timelineEdge.borderWidth, 'timeline header replaces border-bottom with inset shadow').toBe(0);
            expect(result.timelineEdge.insetEdge, 'timeline header bottom inset edge is visible').toBe(true);
            expect(Math.abs(result.timelineEdge.bottom - headerBottom), 'timeline header bottom edge sits on the seam y').toBeLessThanOrEqual(0.5);
            expect(result.plainEdges.length, 'locked plain or tree column is present').toBeGreaterThan(0);
            result.plainEdges.forEach(edge => {
                expect(edge.borderWidth, 'plain/tree header button carries a 1px bottom border').toBe(1);
                expect(edge.visible, 'plain/tree header button bottom border is coloured').toBe(true);
                expect(Math.abs(edge.bottom - result.timelineEdge.bottom), 'plain/tree and timeline bottom edges share one y').toBeLessThanOrEqual(0.5);
                expect(edge.color, 'plain/tree and timeline bottom edges share one colour').toBe(result.timelineEdge.color)
            });

            // Hovering either header item must keep its bottom edge visible at the same y, in the same colour
            await page.locator('.neo-timeline-header').hover();
            const hoveredTimeline = await measure(page, null);
            expect(hoveredTimeline.timelineEdge.insetEdge, 'hovering timeline header preserves its bottom inset edge').toBe(true);
            hoveredTimeline.plainEdges.forEach(edge => expect(hoveredTimeline.timelineEdge.color, 'a hovered timeline header keeps the edge colour').toBe(edge.color));

            await page.locator('.neo-grid-header-toolbar .neo-grid-header-button:not(.neo-timeline-header)').first().hover();
            const hoveredPlain = await measure(page, null);
            hoveredPlain.plainEdges.forEach(edge => {
                expect(edge.visible, 'hovering plain/tree header preserves its bottom border').toBe(true);
                expect(edge.color, 'a hovered plain/tree header keeps the edge colour').toBe(hoveredPlain.timelineEdge.color)
            });

            expect(Math.abs(result.tickDelta), 'a header tick stands where the body draws its offset').toBeLessThanOrEqual(0.5);
            band && expect(Math.abs(result.bandDelta), 'a header band stands over its row band').toBeLessThanOrEqual(0.5);
            result.barOnTop !== null && expect(result.barOnTop, 'a bar crossing the line stays above it').toBe(true);
            expect(errors).toEqual([])
        })
    }
}

test('grid without a timeline column keeps its toolbar bottom border and transparent button bottom border', async ({page}) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.setViewportSize({width: 1440, height: 900});
    await page.goto('/examples/grid/lockedColumns/index.html');
    await expect(page.locator('.neo-grid-header-button').first()).toBeVisible();

    const headerEdge = await page.evaluate(() => {
        const
            rect        = element => element.getBoundingClientRect(),
            toolbars    = [...document.querySelectorAll('.neo-grid-header-toolbar')].filter(toolbar => rect(toolbar).width > 0),
            firstButton = toolbars[0].querySelector('.neo-grid-header-button'),
            buttonStyle = getComputedStyle(firstButton);

        return {
            hasTimelineHeader: Boolean(document.querySelector('.neo-timeline-header')),
            toolbarCount     : toolbars.length,
            toolbarBorders   : toolbars.map(toolbar => {
                const style = getComputedStyle(toolbar);

                return {
                    width  : parseFloat(style.borderBottomWidth),
                    visible: style.borderBottomStyle === 'solid' && style.borderBottomColor !== 'rgba(0, 0, 0, 0)'
                }
            }),
            buttonBottomColor: buttonStyle.borderBottomColor
        }
    });

    expect(headerEdge.hasTimelineHeader).toBe(false);
    expect(headerEdge.toolbarCount).toBeGreaterThan(0);
    headerEdge.toolbarBorders.forEach(border => {
        expect(border.width).toBe(1);
        expect(border.visible).toBe(true)
    });
    expect(headerEdge.buttonBottomColor).toBe('rgba(0, 0, 0, 0)');
    expect(errors).toEqual([])
});

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
