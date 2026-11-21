import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL              = '/examples/scheduler/liveUpdates/index.html',
    PARKED_INTERVAL_MS       = 600_000,
    PAUSE_FEED_INTERVAL_MS   = 200,
    PAUSE_HOLD_VERIFY_MS     = 1_000,
    RUN_WALL_CLOCK_SOAK      = process.env.NEO_LIVE_UPDATES_SOAK === '1',
    SOAK_MIN_TICKS           = 120,
    CI_DRAG_INTERVAL_MS      = 350,
    CI_SOAK_INTERVAL_MS      = 50,
    TWO_MINUTES_FEED_SOAK_MS = 120_500,
    THEMES                   = [
        'neo-theme-neo-light',
        'neo-theme-neo-dark',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Resolves the dedicated App Worker for a given Playwright page.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Worker}
 */
function getAppWorker(page) {
    const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

    if (!worker) {
        throw new Error('App Worker not found for SchedulerLiveUpdates')
    }

    return worker
}

/**
 * @summary Reads live `StateProvider`, `Scheduler`, scroll, and named-flight record state from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @param {String[]} [flightIds=[]]
 * @returns {Promise<Object>}
 */
async function readWorkerSnapshot(page, flightIds=[]) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    return getAppWorker(page).evaluate(ids => {
        const
            instances = [...globalThis.Neo.manager.Instance.items.values()],
            viewport  = instances.find(inst => inst.className === 'Neo.examples.scheduler.liveUpdates.Viewport'),
            scheduler = instances.find(inst => inst.className === 'Neo.scheduler.Container'),
            provider  = viewport?.getStateProvider?.(),
            flights   = {};

        for (const id of ids) {
            const rec = scheduler?.resolveEventRecord(id);
            flights[id] = rec ? {
                deltaText : rec.deltaText,
                endDate   : rec.endDate?.toISOString() ?? null,
                feedMark  : rec.feedMark,
                flightCode: rec.flightCode,
                resourceId: rec.resourceId,
                startDate : rec.startDate?.toISOString() ?? null,
                status    : rec.status,
                title     : rec.title
            } : null
        }

        return {
            changeCount: provider?.data?.changeCount ?? 0,
            flightCount: scheduler?.eventStore?.getCount() ?? 0,
            flights,
            gateCount  : scheduler?.store?.getCount() ?? 0,
            paused     : Boolean(provider?.data?.paused),
            scrollLeft : scheduler?.scrollManager?.scrollLeft ?? 0,
            scrollTop  : scheduler?.scrollManager?.scrollTop ?? 0
        }
    }, flightIds)
}

/**
 * @summary Executes one deterministic `Viewport#stepFeed()` mutation inside the App Worker.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<void>}
 */
function stepWorkerFeed(page) {
    return getAppWorker(page).evaluate(() => {
        const viewport = [...globalThis.Neo.manager.Instance.items.values()]
            .find(inst => inst.className === 'Neo.examples.scheduler.liveUpdates.Viewport');
        viewport?.stepFeed()
    })
}

test.describe('Scheduler liveUpdates example', () => {
    test('steps seeded simulated feed deterministically for named flight times and fresh/fading marks, and pauses a running feed cleanly', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?seed=19257&interval=${PARKED_INTERVAL_MS}&theme=neo-theme-neo-dark`);

        // Simulated feed label stays visible on screen and 14 gates mount with the timer parked at 0 changes
        const simBadge = page.locator('.gate-sim-badge');
        await expect(simBadge).toBeVisible();
        await expect(simBadge).toHaveText('Simulated feed');
        await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(14);

        const initial = await readWorkerSnapshot(page, ['fl-101', 'fl-116']);
        expect(initial.changeCount).toBe(0);
        expect(initial.gateCount).toBe(14);
        expect(initial.flightCount).toBe(60);
        expect(initial.flights['fl-101']).toMatchObject({
            endDate   : '2026-11-09T06:45:00.000Z',
            flightCode: 'NX 101',
            resourceId: 'g-01',
            startDate : '2026-11-09T06:05:00.000Z',
            status    : 'scheduled'
        });
        expect(initial.flights['fl-116']).not.toBeNull();

        // Pause button uses custom pill styling and native pressed / aria-pressed semantics
        const pauseBtn = page.locator('.gate-pause-btn');
        await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
        await expect(pauseBtn).not.toHaveAttribute('aria-checked');
        await expect(pauseBtn).not.toHaveAttribute('role');
        expect(await pauseBtn.evaluate(el => getComputedStyle(el).borderRadius)).toBe('999px');

        // Step 1: NX 101 (fl-101) slips +10m to 06:15–06:55 UTC and renders the at-rest fresh mark (.is-feed-fresh)
        await stepWorkerFeed(page);
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount).toBe(1);

        const
            step1    = await readWorkerSnapshot(page, ['fl-101']),
            fl101Bar = page.locator('.neo-timeline-bar[data-event-id="fl-101"]');

        expect(step1.flights['fl-101']).toMatchObject({
            endDate   : '2026-11-09T06:55:00.000Z',
            feedMark  : 'fresh',
            flightCode: 'NX 101',
            resourceId: 'g-01',
            startDate : '2026-11-09T06:15:00.000Z',
            status    : 'delayed'
        });
        await expect(fl101Bar).toHaveClass(/\bis-feed-fresh\b/);
        expect(await fl101Bar.evaluate(el => ({
            borderTopStyle: getComputedStyle(el).borderTopStyle,
            zIndex        : getComputedStyle(el).zIndex
        }))).toEqual({borderTopStyle: 'solid', zIndex: '3'});

        // Step 2: arrival fl-live-2 lands at 06:10–06:50 UTC on Gate A2 as fresh, while fl-101 transitions to fading
        await stepWorkerFeed(page);
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount).toBe(2);

        const
            step2    = await readWorkerSnapshot(page, ['fl-101', 'fl-live-2']),
            live2Bar = page.locator('.neo-timeline-bar[data-event-id="fl-live-2"]');

        expect(step2.flights['fl-live-2']).toMatchObject({
            endDate   : '2026-11-09T06:50:00.000Z',
            feedMark  : 'fresh',
            resourceId: 'g-02',
            startDate : '2026-11-09T06:10:00.000Z',
            status    : 'arrived'
        });
        expect(step2.flights['fl-101'].feedMark).toBe('fading');
        await expect(live2Bar).toHaveClass(/\bis-feed-fresh\b/);
        await expect(fl101Bar).toHaveClass(/\bis-feed-fading\b/);
        expect(await live2Bar.evaluate(el => ({
            borderTopStyle: getComputedStyle(el).borderTopStyle,
            zIndex        : getComputedStyle(el).zIndex
        }))).toEqual({borderTopStyle: 'solid', zIndex: '3'});
        expect(await fl101Bar.evaluate(el => ({
            borderTopStyle: getComputedStyle(el).borderTopStyle,
            zIndex        : getComputedStyle(el).zIndex
        }))).toEqual({borderTopStyle: 'dashed', zIndex: '2'});

        // Step 3: Gate A4 departure removes fl-116 while fl-live-2 transitions to fading and fl-101 clears its mark
        await stepWorkerFeed(page);
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount).toBe(3);

        const step3 = await readWorkerSnapshot(page, ['fl-101', 'fl-live-2', 'fl-116']);
        expect(step3.flights['fl-116']).toBeNull();
        expect(step3.flights['fl-live-2'].feedMark).toBe('fading');
        expect(step3.flights['fl-101'].feedMark).toBe('');
        await expect(page.locator('.neo-timeline-bar[data-event-id="fl-116"]')).toHaveCount(0);
        await expect(live2Bar).toHaveClass(/\bis-feed-fading\b/);

        // Running-feed Pause / Resume arm: open on an active interval, let >= 2 ticks run, Pause across 5 intervals, then Resume
        await page.goto(`${EXAMPLE_URL}?seed=19257&interval=${PAUSE_FEED_INTERVAL_MS}&theme=neo-theme-neo-dark`);
        await expect(simBadge).toBeVisible();
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount, {timeout: 8_000}).toBeGreaterThanOrEqual(2);

        await pauseBtn.click();
        await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(pauseBtn).toHaveClass(/\bpressed\b/);

        const
            pausedSnap        = await readWorkerSnapshot(page),
            counterBeforeHold = await page.locator('.gate-counter').textContent();

        expect(pausedSnap.paused).toBe(true);

        // wall-clock-under-test: verifies Pause stops the active simulated feed timer and holds the counter still across 5 tick intervals
        await page.waitForTimeout(PAUSE_HOLD_VERIFY_MS);

        const afterHoldSnap = await readWorkerSnapshot(page);
        expect(afterHoldSnap.changeCount).toBe(pausedSnap.changeCount);
        await expect(page.locator('.gate-counter')).toHaveText(counterBeforeHold);
        await expect(simBadge).toBeVisible();

        await pauseBtn.click();
        await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount, {timeout: 8_000})
            .toBeGreaterThanOrEqual(pausedSnap.changeCount + 2);
        expect(consoleErrors).toEqual([])
    });

    test('preserves visitor horizontal and vertical scroll positions and an in-progress bar drag across live feed updates with clean VDOM deltas', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?seed=19257&interval=${CI_DRAG_INTERVAL_MS}&theme=neo-theme-neo-dark`);
        await expect(page.locator('.neo-scheduler .neo-timeline-track').first()).toBeVisible();

        const pauseBtn = page.locator('.gate-pause-btn');
        await pauseBtn.click();
        await expect(pauseBtn).toHaveAttribute('aria-pressed', 'true');

        await page.evaluate(() => {
            globalThis.Neo.config.logDeltaUpdates = true;
            window.__observedUpdates = 0;
            window.__idlessInserts   = 0;

            const orig = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    window.__observedUpdates++;
                    const data   = args[3],
                          deltas = Array.isArray(data) ? data : (data?.deltas || []);
                    window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id && !d.vnode?.id).length
                }
                orig(...args)
            }
        });

        // Scroll horizontally and vertically, then verify both survive >= 3 live feed updates (delay, arrive, depart)
        await page.evaluate(() => {
            const
                hScroll = document.querySelector('.neo-grid-horizontal-scrollbar'),
                vView   = document.querySelector('.neo-grid-view');

            if (hScroll) {
                hScroll.scrollLeft = 216;
                hScroll.dispatchEvent(new Event('scroll'))
            }
            if (vView) {
                vView.scrollTop = 96;
                vView.dispatchEvent(new Event('scroll'))
            }
        });

        await expect.poll(async () => {
            const snap = await readWorkerSnapshot(page);
            return snap.scrollLeft === 216 && snap.scrollTop > 0
        }).toBe(true);

        const scrollBaseline = await page.evaluate(() => ({
            changeText: document.querySelector('.gate-counter')?.textContent,
            left      : document.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft ?? -1,
            top       : document.querySelector('.neo-grid-view')?.scrollTop ?? -1
        }));
        const countAtScroll = (await readWorkerSnapshot(page)).changeCount;
        await pauseBtn.click();
        await expect(pauseBtn).toHaveAttribute('aria-pressed', 'false');

        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount, {timeout: 10_000})
            .toBeGreaterThanOrEqual(countAtScroll + 3);

        const scrollAfterUpdates = await page.evaluate(() => ({
            left: document.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft ?? -1,
            top : document.querySelector('.neo-grid-view')?.scrollTop ?? -1
        }));
        expect(scrollAfterUpdates.left).toBe(scrollBaseline.left);
        expect(scrollAfterUpdates.top).toBe(scrollBaseline.top);
        await expect(page.locator('.neo-grid-body.neo-is-scrolling')).toHaveCount(0);

        // While still scrolled at (216, 96), drag fl-126 (UN 126 · Riga, Gate B1, 08:05–08:45) onto Gate B2 (+30m -> 08:35–09:15) and hold across >= 2 live feed ticks
        const
            sourceBar = page.locator('.neo-timeline-bar[data-event-id="fl-126"]'),
            gateB2Row = page.locator('.neo-scheduler .neo-grid-row').filter({hasText: 'Gate B2'}).first();

        await expect(sourceBar).toBeVisible();
        await expect(gateB2Row).toBeVisible();

        const
            barBox = await sourceBar.boundingBox(),
            rowBox = await gateB2Row.boundingBox(),
            startX = barBox.x + barBox.width / 2,
            startY = barBox.y + barBox.height / 2,
            // +30 min at 4.5 px/min = +135 px
            targetX = startX + 135,
            targetY = rowBox.y + rowBox.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(targetX, targetY, {steps: 12});

        const proxy = page.locator('.neo-dragproxy');
        await expect(proxy).toBeVisible();

        const countMidDrag = (await readWorkerSnapshot(page)).changeCount;
        await expect.poll(async () => (await readWorkerSnapshot(page)).changeCount, {timeout: 10_000})
            .toBeGreaterThanOrEqual(countMidDrag + 2);

        // Proxy and visitor scroll both remain intact while background feed mutated other flights
        await expect(proxy).toBeVisible();

        await page.mouse.up();
        await expect(proxy).toHaveCount(0);

        await expect.poll(async () => (await readWorkerSnapshot(page, ['fl-126'])).flights['fl-126']).toMatchObject({
            endDate   : '2026-11-09T09:15:00.000Z',
            resourceId: 'g-07',
            startDate : '2026-11-09T08:35:00.000Z'
        });

        const scrollAfterDrop = await page.evaluate(() => ({
            left: document.querySelector('.neo-grid-horizontal-scrollbar')?.scrollLeft ?? -1,
            top : document.querySelector('.neo-grid-view')?.scrollTop ?? -1
        }));
        expect(scrollAfterDrop.left).toBe(scrollBaseline.left);
        expect(scrollAfterDrop.top).toBe(scrollBaseline.top);

        const deltaStats = await page.evaluate(() => ({
            idlessInserts  : window.__idlessInserts,
            observedUpdates: window.__observedUpdates
        }));
        expect(deltaStats.observedUpdates).toBeGreaterThan(0);
        expect(deltaStats.idlessInserts).toBe(0);
        expect(consoleErrors).toEqual([])
    });

    test('sustains two minutes of live simulated feed at 1440x900 and 390x844 and renders all five themes without console errors', async ({browser, page}) => {
        test.setTimeout(210_000);

        const consoleErrors         = [];
        const attachErrorCollectors = (targetPage, label) => {
            targetPage.on('console', msg => {
                if (msg.type() === 'error') {
                    consoleErrors.push(`${label}:${msg.text()}`)
                }
            });
            targetPage.on('response', res => {
                if (res.status() === 404) {
                    consoleErrors.push(`${label}:404:${res.url()}`)
                }
            });
            targetPage.on('pageerror', err => consoleErrors.push(`${label}:${err.message}`))
        };

        attachErrorCollectors(page, 'desktop');

        const
            soakQuery     = RUN_WALL_CLOCK_SOAK
                ? 'seed=19257&theme=neo-theme-neo-dark'
                : `seed=19257&interval=${CI_SOAK_INTERVAL_MS}&theme=neo-theme-neo-dark`,
            mobileContext = await browser.newContext({viewport: {width: 390, height: 844}}),
            mobilePage    = await mobileContext.newPage();

        attachErrorCollectors(mobilePage, 'mobile');

        const setViewportTheme = (targetPage, nextTheme) => getAppWorker(targetPage).evaluate(theme => {
            const viewport = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.examples.scheduler.liveUpdates.Viewport');
            if (viewport) {
                viewport.theme = theme
            }
        }, nextTheme);

        try {
            await page.setViewportSize({width: 1440, height: 900});
            await Promise.all([
                page.goto(`${EXAMPLE_URL}?${soakQuery}`),
                mobilePage.goto(`${EXAMPLE_URL}?${soakQuery}`)
            ]);

            await Promise.all([
                expect(page.locator('.gate-sim-badge')).toBeVisible(),
                expect(mobilePage.locator('.gate-sim-badge')).toBeVisible()
            ]);

            // Verify all five themes in basic's neo-config.json at both 1440x900 and 390x844 while the feed runs
            for (const theme of THEMES) {
                await Promise.all([
                    setViewportTheme(page, theme),
                    setViewportTheme(mobilePage, theme)
                ]);

                await Promise.all([
                    expect(page.locator(`.gate-viewport.${theme}`)).toBeVisible(),
                    expect(mobilePage.locator(`.gate-viewport.${theme}`)).toBeVisible(),
                    expect(page.locator('.gate-sim-badge')).toHaveText('Simulated feed'),
                    expect(mobilePage.locator('.gate-sim-badge')).toHaveText('Simulated feed'),
                    expect(page.locator('.neo-scheduler .neo-timeline-track').first()).toBeVisible(),
                    expect(mobilePage.locator('.neo-scheduler .neo-timeline-track').first()).toBeVisible()
                ]);

                const [desktopRadius, mobileRadius] = await Promise.all([
                    page.locator('.gate-pause-btn').evaluate(el => getComputedStyle(el).borderRadius),
                    mobilePage.locator('.gate-pause-btn').evaluate(el => getComputedStyle(el).borderRadius)
                ]);
                expect(desktopRadius).toBe('999px');
                expect(mobileRadius).toBe('999px');

                await Promise.all([
                    expect.poll(() => page.locator('.neo-scheduler .neo-timeline-track').first()
                        .evaluate(el => getComputedStyle(el).getPropertyValue('--neo-timeline-gridline-step').trim())
                    ).toBe('270px'),
                    expect.poll(() => mobilePage.locator('.neo-scheduler .neo-timeline-track').first()
                        .evaluate(el => getComputedStyle(el).getPropertyValue('--neo-timeline-gridline-step').trim())
                    ).toBe('180px')
                ]);

                const docFits = await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
                expect(docFits, `${theme} fits 390px viewport without document overflow`).toBe(true)
            }

            const minExpectedTicks = RUN_WALL_CLOCK_SOAK ? 110 : SOAK_MIN_TICKS;

            if (RUN_WALL_CLOCK_SOAK) {
                // wall-clock-under-test: sustains two minutes of continuous 1s simulated feed with zero console errors at 1440x900 and 390x844
                await page.waitForTimeout(TWO_MINUTES_FEED_SOAK_MS)
            }

            await expect.poll(async () => {
                const [d, m] = await Promise.all([readWorkerSnapshot(page), readWorkerSnapshot(mobilePage)]);
                return Math.min(d.changeCount, m.changeCount)
            }, {timeout: 30_000}).toBeGreaterThanOrEqual(minExpectedTicks);

            const [desktopEnd, mobileEnd] = await Promise.all([
                readWorkerSnapshot(page),
                readWorkerSnapshot(mobilePage)
            ]);

            expect(desktopEnd.changeCount).toBeGreaterThanOrEqual(minExpectedTicks);
            expect(mobileEnd.changeCount).toBeGreaterThanOrEqual(minExpectedTicks);
            expect(desktopEnd.flightCount).toBeGreaterThanOrEqual(52);
            expect(desktopEnd.flightCount).toBeLessThanOrEqual(68);
            expect(mobileEnd.flightCount).toBeGreaterThanOrEqual(52);
            expect(mobileEnd.flightCount).toBeLessThanOrEqual(68);
            await expect(page.locator('.gate-sim-badge')).toBeVisible();
            await expect(mobilePage.locator('.gate-sim-badge')).toBeVisible()
        } finally {
            await mobileContext.close()
        }

        expect(consoleErrors).toEqual([])
    })
});
