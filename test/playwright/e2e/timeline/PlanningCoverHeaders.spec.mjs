import {expect, test} from '../../fixtures.mjs';

/**
 * @summary Verifies that the seven planning cover examples keep their headers in one piece at `960 × 540` (dark & light),
 * `1440 × 900`, and `390 × 844`, and that `gantt/zoom` opens on the `Month` preset showing the full plan.
 */

const LANDING_HEADER_EXAMPLES = [
    {path: 'gantt/bigData',             titleCls: '.programme-title', groupTexts: ['Days', 'Weeks']},
    {path: 'gantt/dependencies',        titleCls: '.launch-title',    groupTexts: ['Reset']},
    {path: 'gantt/cascade',             titleCls: '.cascade-title',   groupTexts: ['Delay the cabling by a week', 'Reset']},
    {path: 'scheduler/dragAndResize',   titleCls: '.depot-title',     groupTexts: ['5m', '15m', '30m', '60m']},
    {path: 'scheduler/zoom',            titleCls: '.venue-title',     groupTexts: ['Hours', 'Days', 'Week']},
    {path: 'scheduler/resourceColumns', titleCls: '.fs-title',        groupTexts: []},
    {path: 'gantt/zoom',                titleCls: '.zoom-title',      groupTexts: ['Day', 'Week', 'Month']}
];

/**
 * @summary Measures toolbar overflow, button reachability, and row-1 header alignment in the browser DOM.
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {String[]} options.groupTexts
 * @param {String}   options.titleCls
 * @param {Number}   options.vw
 * @returns {Promise<Object>}
 */
async function readHeaderLayout(page, {groupTexts, titleCls, vw}) {
    return page.evaluate(({groupTexts, titleCls, vw}) => {
        const
            sw    = document.querySelector('.neo-themeswitcher'),
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
    }, {groupTexts, titleCls, vw})
}

/**
 * @summary Asserts header alignment invariants for a given example, theme, and viewport width/height.
 * @param {import('@playwright/test').Page} page
 * @param {Object} example
 * @param {String} theme
 * @param {Number} width
 * @param {Number} height
 */
async function assertHeaderAtViewport(page, {groupTexts, path, titleCls}, theme, width, height) {
    const label = `${path} (${theme} @ ${width}x${height})`;

    await page.setViewportSize({width, height});

    await expect.poll(async () => {
        const layout = await readHeaderLayout(page, {groupTexts, titleCls, vw: width});
        if (!layout.ok) return false;
        if (width >= 960) {
            if (Math.abs(layout.swMidY - layout.titleMidY) > 8) return false;
            if (layout.group.some(btn => !btn || Math.abs(btn.midY - layout.titleMidY) > 8)) return false
        }
        return true
    }, label).toBe(true);

    const layout = await readHeaderLayout(page, {groupTexts, titleCls, vw: width});
    expect(layout.ok, `${label}: ${JSON.stringify(layout)}`).toBe(true);

    if (width >= 960) {
        expect(Math.abs(layout.swMidY - layout.titleMidY), `${label}: ThemeSwitcher stands in row 1`).toBeLessThanOrEqual(8);

        for (const btn of layout.group) {
            expect(btn, `${label}: control found`).toBeTruthy();
            expect(Math.abs(btn.midY - layout.titleMidY), `${label}: "${btn.text}" stands in row 1`).toBeLessThanOrEqual(8)
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

test.describe('Planning cover header layout & gantt/zoom Month preset', () => {
    for (const example of LANDING_HEADER_EXAMPLES) {
        test(`${example.path} keeps its header intact across 960 × 540 (dark & light), 1440 × 900, and 390 × 844`, async ({page}) => {
            const errors = [];
            page.on('pageerror', err => errors.push(err.message));
            page.on('console', msg => {
                if (msg.type() === 'error' && !msg.location()?.url?.endsWith('/favicon.ico')) {
                    errors.push(msg.text())
                }
            });

            await page.emulateMedia({reducedMotion: 'reduce'});
            await page.setViewportSize({width: 960, height: 540});
            await page.goto(`/examples/${example.path}/index.html?theme=neo-theme-neo-dark`);
            await expect(page.locator('.neo-theme-neo-dark').first()).toBeAttached();
            await expect(page.locator('.neo-timeline-bar').first()).toBeVisible();

            if (example.path === 'gantt/zoom') {
                await expect(page.getByRole('button', {name: 'Month', exact: true})).toHaveAttribute('aria-pressed', 'true');
                await expect(page.locator('.neo-timeline-bar[data-event-id="survey"]')).toBeVisible();
                await expect(page.locator('.neo-timeline-bar[data-event-id="sills"]')).toBeVisible()
            }

            await assertHeaderAtViewport(page, example, 'neo-theme-neo-dark', 960, 540);
            await assertHeaderAtViewport(page, example, 'neo-theme-neo-dark', 1440, 900);
            await assertHeaderAtViewport(page, example, 'neo-theme-neo-dark', 390, 844);

            // Switch live to Neo Light at cover viewport (960 × 540) without a second boot
            await page.setViewportSize({width: 960, height: 540});
            await page.locator('.neo-themeswitcher').first().click();
            await page.getByRole('menu').getByRole('menuitemradio', {name: 'Neo Light', exact: true}).click();
            await expect.poll(() => page.evaluate(() => document.body.classList.contains('neo-theme-neo-light'))).toBe(true);

            await assertHeaderAtViewport(page, example, 'neo-theme-neo-light', 960, 540);

            expect(errors, `${example.path}: console/page errors`).toEqual([])
        })
    }
});
