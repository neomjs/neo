import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies `Neo.button.ThemeSwitcher` across all standalone `board`, `scheduler`, `gantt`, and `timeline`
 * examples at `1440 × 900` and `390 × 844`, including live 5-theme menu switching and App Worker `getTheme()` parity.
 */

const
    THEMES = {
        'Neo Light': 'neo-theme-neo-light',
        'Neo Dark' : 'neo-theme-neo-dark',
        Light      : 'neo-theme-light',
        Dark       : 'neo-theme-dark',
        Cyberpunk  : 'neo-theme-cyberpunk'
    },
    INTERACTIVE_EXAMPLES = [
        {appName: 'GanttBasic',          path: 'gantt/basic'},
        {appName: 'SchedulerBasic',      path: 'scheduler/basic'},
        {appName: 'MeridianObservatory', path: 'scheduler/meridian', routeAiClient: true},
        {appName: 'BoardBasic',          path: 'board/basic'},
        {appName: 'TimelineBasic',       path: 'timeline/basic'}
    ],
    ALL_PLANNING_EXAMPLES = [
        'board/basic',
        'board/cardDesigns',
        'board/cardEditor',
        'board/columns',
        'board/multiSelect',
        'board/swimlanes',
        'board/wipLimits',
        'scheduler/barRenderer',
        'scheduler/basic',
        'scheduler/bigData',
        'scheduler/dragAndResize',
        'scheduler/eventEditor',
        'scheduler/liveUpdates',
        'scheduler/meridian',
        'scheduler/nonWorkingTime',
        'scheduler/resourceColumns',
        'scheduler/timeZones',
        'scheduler/zoom',
        'gantt/basic',
        'gantt/bigData',
        'gantt/cascade',
        'gantt/dependencies',
        'gantt/taskColumns',
        'gantt/taskEditor',
        'gantt/workingTime',
        'gantt/zoom',
        'timeline/basic'
    ];

test.describe('Planning & Timeline ThemeSwitcher', () => {
    for (const {appName, path, routeAiClient} of INTERACTIVE_EXAMPLES) {
        test(`${path} switches live across all five themes in the App Worker and DOM`, async ({page, neuralLink}) => {
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));
            page.on('console', msg => {
                if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) {
                    errors.push(msg.text())
                }
            });

            await page.setViewportSize({width: 1440, height: 900});
            await page.emulateMedia({reducedMotion: 'reduce'});

            if (routeAiClient) {
                await neuralLink.routeConfig(page, config => ({...config, useAiClient: true}))
            }

            await page.goto(`/examples/${path}/index.html`);

            const
                switcher = page.locator('.neo-theme-switcher').first(),
                menu     = page.getByRole('menu');

            await expect(switcher).toBeVisible();

            const
                app        = await neuralLink.connectToApp(appName),
                viewportId = await page.locator('.neo-viewport').first().getAttribute('id');

            await switcher.click();
            await expect(menu.getByRole('menuitemradio')).toHaveCount(5);
            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden();

            for (const [label, theme] of Object.entries(THEMES)) {
                const current = await app.callMethod(viewportId, 'getTheme', []);
                if (current === theme) continue;

                await switcher.click();
                await menu.getByRole('menuitemradio', {name: label, exact: true}).click();

                await expect.poll(() => app.callMethod(viewportId, 'getTheme', []), `${path}: worker theme ${theme}`).toBe(theme);
                await expect(page.locator(`#${viewportId}`)).toHaveClass(new RegExp(`\\b${theme}\\b`));
                await expect.poll(() => page.evaluate(cls => document.body.classList.contains(cls), theme), `${path}: body class ${theme}`).toBe(true)
            }

            expect(errors, `${path}: console/page errors`).toEqual([])
        })
    }

    for (const path of ALL_PLANNING_EXAMPLES) {
        test(`${path} keeps every toolbar control and ThemeSwitcher reachable without horizontal overflow at 390 × 844 and 1440 × 900`, async ({page}) => {
            await page.emulateMedia({reducedMotion: 'reduce'});
            const query = path === 'scheduler/liveUpdates' ? '?seed=19257&interval=60000' : '';

            for (const [width, height] of [[390, 844], [1440, 900]]) {
                await page.setViewportSize({width, height});
                await page.goto(`/examples/${path}/index.html${query}`);

                const switcher = page.locator('.neo-theme-switcher').first();
                await expect(switcher, `${path} @ ${width}x${height}`).toBeVisible();

                const check = await page.evaluate(vw => {
                    const sw  = document.querySelector('.neo-theme-switcher'),
                          bar = sw?.closest('.neo-toolbar, .meridian-mast');

                    if (!sw || !bar) return {ok: false, reason: 'missing switcher or bar'};

                    const barOverflow = bar.scrollWidth - bar.clientWidth,
                          buttons     = [...bar.querySelectorAll('.neo-button')].filter(b => b.offsetParent !== null).map(b => {
                              const r   = b.getBoundingClientRect(),
                                    hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.neo-button') === b;
                              return {
                                  hit,
                                  inBounds: r.left >= -0.5 && r.right <= vw + 0.5,
                                  text    : (b.textContent || b.getAttribute('aria-label') || '').trim(),
                                  top     : Math.round(r.top)
                              }
                          });

                    return {
                        badButtons: buttons.filter(b => !b.inBounds || !b.hit),
                        barOverflow,
                        buttons,
                        ok        : barOverflow <= 1 && buttons.every(b => b.inBounds && b.hit)
                    }
                }, width);

                expect(check.ok, `${path} @ ${width}x${height}: ${JSON.stringify(check)}`).toBe(true);

                if (path === 'gantt/basic' && width === 390) {
                    const day  = check.buttons.find(b => b.text === 'Day'),
                          week = check.buttons.find(b => b.text === 'Week');

                    expect(Math.abs(day.top - week.top), 'gantt/basic Day and Week share one row on phone').toBeLessThanOrEqual(1)
                }
            }
        })
    }

    const LANDING_HEADER_EXAMPLES = [
        {path: 'gantt/bigData',             titleCls: '.programme-title', groupTexts: ['Days', 'Weeks']},
        {path: 'gantt/dependencies',        titleCls: '.launch-title',    groupTexts: ['Reset']},
        {path: 'gantt/cascade',             titleCls: '.cascade-title',   groupTexts: ['Delay the cabling by a week', 'Reset']},
        {path: 'scheduler/dragAndResize',   titleCls: '.depot-title',     groupTexts: ['5m', '15m', '30m', '60m']},
        {path: 'scheduler/zoom',            titleCls: '.venue-title',     groupTexts: ['Hours', 'Days', 'Week']},
        {path: 'scheduler/resourceColumns', titleCls: '.fs-title',        groupTexts: []}
    ];

    test('the seven planning cover examples hold their headers in one piece at 960 × 540, 1440 × 900 and 390 × 844, and gantt/zoom opens on Month (#21939)', async ({page}) => {
        const errors = [];
        page.on('pageerror', err => errors.push(err.message));
        page.on('console', msg => {
            if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) {
                errors.push(msg.text())
            }
        });

        await page.emulateMedia({reducedMotion: 'reduce'});

        for (const theme of ['neo-theme-neo-dark', 'neo-theme-neo-light']) {
            for (const [width, height] of [[960, 540], [1440, 900], [390, 844]]) {
                await page.setViewportSize({width, height});

                for (const {groupTexts, path, titleCls} of LANDING_HEADER_EXAMPLES) {
                    await page.goto(`/examples/${path}/index.html?theme=${theme}`);
                    await expect(page.locator(`.${theme}`).first()).toBeAttached();
                    await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

                    const layout = await page.evaluate(({groupTexts, titleCls, vw}) => {
                        const
                            sw    = document.querySelector('.neo-theme-switcher'),
                            title = document.querySelector(titleCls),
                            bar   = sw?.closest('.neo-toolbar');

                        if (!sw || !title || !bar) {
                            return {ok: false, reason: 'missing toolbar elements'}
                        }

                        const
                            swRect    = sw.getBoundingClientRect(),
                            titleRect = title.getBoundingClientRect(),
                            midY      = r => r.top + r.height / 2,
                            buttons   = [...bar.querySelectorAll('.neo-button')].filter(b => b.offsetParent !== null).map(b => {
                                const r   = b.getBoundingClientRect(),
                                      hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('.neo-button') === b;
                                return {
                                    hit,
                                    inBounds: r.left >= -0.5 && r.right <= vw + 0.5,
                                    left    : Math.round(r.left),
                                    midY    : Math.round(midY(r)),
                                    right   : Math.round(r.right),
                                    text    : (b.textContent || b.getAttribute('aria-label') || '').trim(),
                                    top     : Math.round(r.top)
                                }
                            }),
                            group = groupTexts.map(text => buttons.find(b => b.text === text));

                        return {
                            barOverflow: bar.scrollWidth - bar.clientWidth,
                            buttons,
                            docOverflow: document.documentElement.scrollWidth - vw,
                            group,
                            ok         : bar.scrollWidth - bar.clientWidth <= 1 && document.documentElement.scrollWidth <= vw + 1 && buttons.every(b => b.inBounds && b.hit),
                            swMidY     : Math.round(midY(swRect)),
                            titleMidY  : Math.round(midY(titleRect))
                        }
                    }, {groupTexts, titleCls, vw: width});

                    const label = `${path} (${theme} @ ${width}x${height})`;
                    expect(layout.ok, `${label}: ${JSON.stringify(layout)}`).toBe(true);

                    if (width >= 960) {
                        expect(Math.abs(layout.swMidY - layout.titleMidY), `${label}: ThemeSwitcher stands in the header's first row`).toBeLessThanOrEqual(8);

                        for (const btn of layout.group) {
                            expect(btn, `${label}: control found`).toBeTruthy();
                            expect(Math.abs(btn.midY - layout.titleMidY), `${label}: "${btn.text}" stands in the header's first row`).toBeLessThanOrEqual(8)
                        }

                        if (path === 'gantt/bigData') {
                            const [days, weeks] = layout.group;
                            expect(Math.abs(days.top - weeks.top), `${label}: Days and Weeks share one row`).toBeLessThanOrEqual(1);
                            expect(Math.abs(weeks.left - days.right), `${label}: Days and Weeks touch side by side`).toBeLessThanOrEqual(2)
                        }
                    } else if (layout.group.length > 1 && path !== 'gantt/cascade') {
                        const tops = layout.group.map(b => b.top);
                        expect(Math.max(...tops) - Math.min(...tops), `${label}: segmented group stays together on phone`).toBeLessThanOrEqual(1)
                    }
                }

                await page.goto(`/examples/gantt/zoom/index.html?theme=${theme}`);
                await expect(page.locator(`.${theme}`).first()).toBeAttached();
                await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
                await expect(page.getByRole('button', {name: 'Month', exact: true})).toHaveAttribute('aria-pressed', 'true');

                const zoomHeader = await page.evaluate(vw => {
                    const
                        sw    = document.querySelector('.neo-theme-switcher'),
                        title = document.querySelector('.zoom-title'),
                        bar   = sw?.closest('.neo-toolbar'),
                        midY  = el => { const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2) };

                    return {
                        barOverflow: bar.scrollWidth - bar.clientWidth,
                        docOverflow: document.documentElement.scrollWidth - vw,
                        swMidY     : midY(sw),
                        titleMidY  : midY(title)
                    }
                }, width);

                expect(zoomHeader.barOverflow, `gantt/zoom (${theme} @ ${width}x${height})`).toBeLessThanOrEqual(1);
                expect(zoomHeader.docOverflow, `gantt/zoom (${theme} @ ${width}x${height})`).toBeLessThanOrEqual(1);
                if (width >= 960) {
                    expect(Math.abs(zoomHeader.swMidY - zoomHeader.titleMidY), `gantt/zoom (${theme} @ ${width}x${height}): ThemeSwitcher on row 1`).toBeLessThanOrEqual(8)
                }
            }
        }

        expect(errors).toEqual([])
    });
});
