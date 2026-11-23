import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/scheduler/barRenderer/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Resolves the dedicated App Worker for the current page.
 * @param {import('@playwright/test').Page} page
 * @returns {import('@playwright/test').Worker}
 */
function getAppWorker(page) {
    const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

    if (!worker) {
        throw new Error('App Worker not found for SchedulerBarRenderer')
    }

    return worker
}

/**
 * @summary Reads live scheduler store counts, renderer presence, and sample job records from the App Worker.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readWorkerState(page) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    return getAppWorker(page).evaluate(() => {
        const
            scheduler = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.scheduler.Container'),
            job1      = scheduler?.resolveEventRecord('job-1'),
            job6      = scheduler?.resolveEventRecord('job-6'),
            job11     = scheduler?.resolveEventRecord('job-11');

        return {
            hasBarRenderer: typeof scheduler?.barRenderer === 'function',
            jobCount      : scheduler?.eventStore?.getCount() ?? 0,
            pressCount    : scheduler?.store?.getCount() ?? 0,
            samples       : {
                job1 : {customer: job1?.customer,  percentDone: job1?.percentDone,  status: job1?.status},
                job6 : {customer: job6?.customer,  percentDone: job6?.percentDone,  status: job6?.status},
                job11: {customer: job11?.customer, percentDone: job11?.percentDone, status: job11?.status}
            }
        }
    })
}

/**
 * @summary Computes WCAG 2.1 contrast ratios from browser-resolved CSS colors across all three bar states.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function measureStateContrasts(page) {
    return page.evaluate(() => {
        const parseRgb = str => {
            const match = str && str.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
            return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : [0, 0, 0]
        };

        const relLum = ([r, g, b]) => {
            const chan = c => {
                const s = c / 255;
                return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
            };
            return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
        };

        const ratio = (fg, bg) => {
            const l1 = relLum(parseRgb(fg)), l2 = relLum(parseRgb(bg));
            return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2))
        };

        const out = {};

        for (const state of ['on-time', 'at-risk', 'late']) {
            const
                bar   = document.querySelector(`.neo-timeline-bar.print-bar-${state}`),
                prog  = bar?.querySelector('.neo-timeline-bar-progress'),
                title = bar?.querySelector('.print-bar-title'),
                meta  = bar?.querySelector('.print-bar-meta');

            const
                barBg   = bar   ? getComputedStyle(bar).backgroundColor   : '',
                progBg  = prog  ? getComputedStyle(prog).backgroundColor  : '',
                titleFg = title ? getComputedStyle(title).color           : '',
                metaFg  = meta  ? getComputedStyle(meta).color            : '';

            out[state] = {
                metaOnBase : ratio(metaFg, barBg),
                metaOnFill : ratio(metaFg, progBg),
                titleOnBase: ratio(titleFg, barBg),
                titleOnFill: ratio(titleFg, progBg)
            }
        }

        return out
    })
}

test.describe('Scheduler barRenderer example', () => {
    test('renders progress fills, derived status classes, late glyphs, two-line metadata, and toggles Plain bars cleanly', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator('.neo-scheduler .neo-grid-cell.neo-locked-start')).toHaveCount(8);
        await expect(page.locator('.neo-scheduler .neo-timeline-track')).toHaveCount(8);
        await expect(page.locator('.neo-timeline-tick-major').first()).toContainText('9 Nov');

        // Legend names all three states with distinct glyphs
        await expect(page.locator('.print-legend-pill.is-on-time')).toHaveText('✓ On time');
        await expect(page.locator('.print-legend-pill.is-at-risk')).toHaveText('◆ At risk');
        await expect(page.locator('.print-legend-pill.is-late')).toHaveText('▲ Late');

        const workerState = await readWorkerState(page);
        expect(workerState).toEqual({
            hasBarRenderer: true,
            jobCount      : 40,
            pressCount    : 8,
            samples       : {
                job1 : {customer: 'Kunsthalle', percentDone: 62, status: 'late'},
                job6 : {customer: 'Nordic Rail', percentDone: 88, status: 'on-time'},
                job11: {customer: 'Metro Post', percentDone: 45, status: 'at-risk'}
            }
        });

        // All three status classes appear on the first frame, and every rendered bar shows its progress node
        await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-on-time').count()).toBeGreaterThan(0);
        await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-at-risk').count()).toBeGreaterThan(0);
        await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-late').count()).toBeGreaterThan(0);

        const barAndProgressCounts = await page.evaluate(() => {
            const bars = [...document.querySelectorAll('.neo-timeline-bar')];
            return {
                barCount    : bars.length,
                withProgress: bars.filter(b => {
                    const p = b.querySelector('.neo-timeline-bar-progress');
                    return p && parseFloat(p.style.width) > 0
                }).length
            }
        });
        expect(barAndProgressCounts.barCount).toBeGreaterThan(0);
        expect(barAndProgressCounts.withProgress).toBe(barAndProgressCounts.barCount);

        // Assert specific status classes, Late glyph+word, customer+quantity second line, and progress width on job-1 (62%), job-6 (88%), job-11 (45%)
        const job1Bar  = page.locator('.neo-timeline-bar[data-event-id="job-1"]');
        const job6Bar  = page.locator('.neo-timeline-bar[data-event-id="job-6"]');
        const job11Bar = page.locator('.neo-timeline-bar[data-event-id="job-11"]');

        await expect(job1Bar).toHaveClass(/print-bar-late/);
        await expect(job6Bar).toHaveClass(/print-bar-on-time/);
        await expect(job11Bar).toHaveClass(/print-bar-at-risk/);

        await expect(job1Bar.locator('.print-bar-late-flag')).toHaveText('▲ Late');
        await expect(job11Bar.locator('.print-bar-risk-flag')).toHaveText('◆ At risk');
        await expect(job6Bar.locator('.print-bar-ok-mark')).toHaveText('✓');
        await expect(job6Bar.locator('.print-bar-late-flag')).toHaveCount(0);
        await expect(job1Bar.locator('.print-bar-meta')).toHaveText('Kunsthalle · 4,000 · 62%');

        const job1Geometry = await job1Bar.evaluate(bar => {
            const
                prog      = bar.querySelector('.neo-timeline-bar-progress'),
                barRect   = bar.getBoundingClientRect(),
                progRect  = prog.getBoundingClientRect(),
                innerSpan = bar.clientWidth;

            return {
                expectedPx: innerSpan * 0.62,
                measuredPx: progRect.width,
                styleWidth: prog.style.width,
                totalWidth: barRect.width
            }
        });
        expect(job1Geometry.styleWidth).toBe('62%');
        expect(Math.abs(job1Geometry.measuredPx - job1Geometry.expectedPx)).toBeLessThanOrEqual(1.5);

        // Contrast >= 4.5:1 across all three states in dark theme
        const darkContrasts = await measureStateContrasts(page);
        for (const state of ['on-time', 'at-risk', 'late']) {
            expect(darkContrasts[state].titleOnBase).toBeGreaterThanOrEqual(4.5);
            expect(darkContrasts[state].titleOnFill).toBeGreaterThanOrEqual(4.5);
            expect(darkContrasts[state].metaOnBase).toBeGreaterThanOrEqual(4.5);
            expect(darkContrasts[state].metaOnFill).toBeGreaterThanOrEqual(4.5)
        }

        // Intercept delta updates and toggle Plain bars ON -> removes renderer output without reload while keeping progress fill
        await page.evaluate(() => {
            globalThis.Neo.config.logDeltaUpdates = true;
            window.__idlessInserts = 0;
            const orig = console.log.bind(console);
            console.log = (...args) => {
                if (typeof args[0] === 'string' && args[0].startsWith('update ')) {
                    const data   = args[3],
                          deltas = Array.isArray(data) ? data : (data?.deltas || []);
                    window.__idlessInserts += deltas.filter(d => d.action === 'insertNode' && !d.id && !d.vnode?.id).length
                }
                orig(...args)
            }
        });

        const plainSwitch = page.locator('.print-plain-switch');
        await expect(plainSwitch).toHaveAttribute('aria-pressed', 'false');
        await expect(plainSwitch).not.toHaveAttribute('aria-checked');
        await expect(plainSwitch).not.toHaveAttribute('role');
        await expect(plainSwitch).toHaveClass(/neo-button/);
        await expect(plainSwitch).toHaveClass(/icon-left/);
        await expect(plainSwitch).not.toHaveClass(/\bpressed\b/);

        await plainSwitch.click();
        await expect(plainSwitch).toHaveAttribute('aria-pressed', 'true');
        await expect(plainSwitch).not.toHaveAttribute('aria-checked');
        await expect(plainSwitch).toHaveClass(/neo-button/);
        await expect(plainSwitch).toHaveClass(/icon-left/);
        await expect(plainSwitch).toHaveClass(/\bpressed\b/);

        await expect(page.locator('.neo-timeline-bar.print-bar-rich')).toHaveCount(0);
        await expect(page.locator('.print-bar-late-flag')).toHaveCount(0);
        await expect(page.locator('.print-bar-meta')).toHaveCount(0);
        await expect(job1Bar.locator('.neo-timeline-bar-progress')).toHaveAttribute('style', /width:\s*62%/);
        await expect(job1Bar.locator('.neo-timeline-bar-label')).toHaveText('Art catalogue');

        const plainWorker = await readWorkerState(page);
        expect(plainWorker.hasBarRenderer).toBe(false);

        // Toggle Plain bars back OFF -> restores status classes, Late glyph, and second line without reload
        await plainSwitch.click();
        await expect(plainSwitch).toHaveAttribute('aria-pressed', 'false');
        await expect(plainSwitch).toHaveClass(/neo-button/);
        await expect(plainSwitch).toHaveClass(/icon-left/);
        await expect(plainSwitch).not.toHaveClass(/\bpressed\b/);
        await expect(job1Bar).toHaveClass(/print-bar-late/);
        await expect(job1Bar.locator('.print-bar-late-flag')).toHaveText('▲ Late');
        await expect(job1Bar.locator('.print-bar-meta')).toHaveText('Kunsthalle · 4,000 · 62%');

        const idlessInserts = await page.evaluate(() => window.__idlessInserts);
        expect(idlessInserts).toBe(0);
        expect(consoleErrors).toEqual([])
    });

    test('renders cleanly at 1440x900 and 390x844 across all five shipped themes with >= 4.5:1 light contrast and zero console errors', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('response', res => {
            if (res.status() === 404) {
                consoleErrors.push(`404:${res.url()}`)
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        for (const viewport of [{width: 1440, height: 900}, {width: 390, height: 844}]) {
            await page.setViewportSize(viewport);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
                await expect(page.locator(`.print-viewport.${theme}`)).toBeVisible();
                await expect(page.locator('.neo-scheduler .neo-timeline-track')).toHaveCount(8);
                await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-on-time').count()).toBeGreaterThan(0);
                await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-at-risk').count()).toBeGreaterThan(0);
                await expect.poll(() => page.locator('.neo-timeline-bar.print-bar-late').count()).toBeGreaterThan(0);

                // Toolbar switch carries custom pill styling in every theme
                const switchRadius = await page.locator('.print-plain-switch').evaluate(el => getComputedStyle(el).borderRadius);
                expect(switchRadius).toBe('999px');

                if (viewport.width === 1440 && theme === 'neo-theme-neo-light') {
                    const headerTextColor = await page.locator('.print-scheduler .neo-grid-header-button .neo-button-text').evaluate(el => getComputedStyle(el).color);
                    expect(headerTextColor).toBe('rgb(15, 23, 42)');

                    const lightContrasts = await measureStateContrasts(page);
                    for (const state of ['on-time', 'at-risk', 'late']) {
                        expect(lightContrasts[state].titleOnBase).toBeGreaterThanOrEqual(4.5);
                        expect(lightContrasts[state].titleOnFill).toBeGreaterThanOrEqual(4.5);
                        expect(lightContrasts[state].metaOnBase).toBeGreaterThanOrEqual(4.5);
                        expect(lightContrasts[state].metaOnFill).toBeGreaterThanOrEqual(4.5)
                    }
                }
            }
        }

        expect(consoleErrors).toEqual([])
    })
});
