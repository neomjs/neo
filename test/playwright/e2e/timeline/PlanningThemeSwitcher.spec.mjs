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
                switcher = page.locator('.neo-themeswitcher').first(),
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

                if (path === 'scheduler/eventEditor' || path === 'gantt/taskEditor') {
                    const editor = page.locator('.neo-timeline-event-editor');
                    await editor.getByRole('button', {name: 'Cancel', exact: true}).click();
                    await expect(editor).toBeHidden()
                }

                const switcher = page.locator('.neo-themeswitcher').first();
                await expect(switcher, `${path} @ ${width}x${height}`).toBeVisible();

                const check = await page.evaluate(vw => {
                    const sw  = document.querySelector('.neo-themeswitcher'),
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
});
