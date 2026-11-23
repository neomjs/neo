import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/board/dueDates/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

/**
 * @summary Formats a local `YYYY-MM-DD` date shifted by `dayOffset` days from `now` in the page's timezone.
 * @param {import('@playwright/test').Page} page
 * @param {Number} dayOffset
 * @returns {Promise<String>}
 */
function pageOffsetIso(page, dayOffset) {
    return page.evaluate(offset => {
        const d   = new Date(),
              adj = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset, 12, 0, 0, 0),
              pad = n => String(n).padStart(2, '0');

        return `${adj.getFullYear()}-${pad(adj.getMonth() + 1)}-${pad(adj.getDate())}`
    }, dayOffset)
}

/**
 * @summary Reads live App Worker state for the `BoardDueDates` example without external bridge dependencies.
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Object>}
 */
async function readWorkerState(page) {
    await expect.poll(() => page.workers().some(w => w.url().includes('worker/App'))).toBe(true);

    const worker = page.workers().find(candidate => candidate.url().includes('worker/App'));

    return worker.evaluate(() => {
        const
            viewport = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.examples.board.dueDates.Viewport'),
            board    = [...globalThis.Neo.manager.Instance.items.values()]
                .find(inst => inst.className === 'Neo.board.Container'),
            store    = board?.store;

        return {
            allCount    : (store?.allItems || store)?.getCount?.() ?? 0,
            lateOnly    : Boolean(viewport?.lateOnly),
            visibleCount: store?.getCount() ?? 0
        }
    })
}

test.describe('Board dueDates example', () => {
    test('renders relative due dates, distinguishes overdue cards without color alone, updates dates in CardEditor, and narrows to Late only', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${EXAMPLE_URL}?theme=neo-theme-neo-dark`);

        await expect(page.locator('.due-board .neo-board-column')).toHaveCount(4);
        await expect(page.locator('.due-board .neo-board-card')).toHaveCount(20);
        await expect(page.locator('.due-board time.neo-board-card-due-date')).toHaveCount(20);

        const
            minusFourIso = await pageOffsetIso(page, -4),
            todayIso     = await pageOffsetIso(page, 0),
            plusThreeIso = await pageOffsetIso(page, 3),
            plusFiveIso  = await pageOffsetIso(page, 5);

        expect(await readWorkerState(page)).toEqual({
            allCount    : 20,
            lateOnly    : false,
            visibleCount: 20
        });

        // 1. Verify relative dates + non-color-alone overdue distinction on active cards vs Shipped cards
        const
            overdueCard  = page.locator('[id$="__card__rel-06"]'),
            overdueBadge = overdueCard.locator('time.neo-board-card-due-date'),
            todayCard    = page.locator('[id$="__card__rel-08"]'),
            todayBadge   = todayCard.locator('time.neo-board-card-due-date'),
            shippedCard  = page.locator('[id$="__card__rel-17"]'),
            shippedBadge = shippedCard.locator('time.neo-board-card-due-date');

        await expect(page.locator('.due-board .neo-board-card.neo-board-card-overdue')).toHaveCount(5);
        await expect(page.locator('.due-board time.neo-board-card-due-date-overdue')).toHaveCount(5);

        await expect(overdueBadge).toHaveAttribute('datetime', minusFourIso);
        await expect(overdueBadge).toContainText('Overdue 4d · ');
        await expect(todayBadge).toHaveAttribute('datetime', todayIso);
        await expect(todayBadge).toContainText('Today · ');
        await expect(shippedCard).not.toHaveClass(/neo-board-card-overdue/);
        await expect(shippedBadge).not.toHaveClass(/neo-board-card-due-date-overdue/);
        await expect(shippedBadge).toContainText('Due ');

        const nonColorSignals = await page.evaluate(() => {
            const
                lateEl   = document.querySelector('[id$="__card__rel-06"] time.neo-board-card-due-date'),
                normalEl = document.querySelector('[id$="__card__rel-09"] time.neo-board-card-due-date'),
                lateCs   = getComputedStyle(lateEl),
                beforeCs = getComputedStyle(lateEl, '::before'),
                normalCs = getComputedStyle(normalEl);

            return {
                beforeContent   : beforeCs.content,
                lateBorderLeft  : lateCs.borderLeftWidth,
                lateWeight      : Number(lateCs.fontWeight),
                normalBorderLeft: normalCs.borderLeftWidth,
                normalWeight    : Number(normalCs.fontWeight)
            }
        });

        expect(nonColorSignals.beforeContent).toBe('"!"');
        expect(nonColorSignals.lateBorderLeft).toBe('3px');
        expect(nonColorSignals.normalBorderLeft).toBe('1px');
        expect(nonColorSignals.lateWeight).toBeGreaterThan(nonColorSignals.normalWeight);

        // 2. Edit rel-06's dueDate in CardEditor and verify immediate card + toolbar update after Save
        const
            editor    = page.locator('.neo-board-card-editor'),
            dateInput = editor.locator('input[type="date"]'),
            lateBtn   = page.locator('.due-late-toggle'),
            resetBtn  = page.locator('.due-reset-button'),
            summary   = page.locator('.due-summary-pill');

        await expect(resetBtn).toHaveClass(/neo-disabled/);
        await overdueCard.locator('.neo-board-card-menu-button').click();
        await expect(editor).toBeVisible();
        await expect(dateInput).toHaveValue(minusFourIso);

        await dateInput.fill(plusFiveIso);
        await editor.locator('.neo-board-card-editor-save').click();
        await expect(editor).toBeHidden();

        await expect(overdueBadge).toHaveAttribute('datetime', plusFiveIso);
        await expect(overdueBadge).toContainText('In 5d · ');
        await expect(overdueCard).not.toHaveClass(/neo-board-card-overdue/);
        await expect(page.locator('.due-board .neo-board-card.neo-board-card-overdue')).toHaveCount(4);
        await expect(summary).toHaveText('4 overdue · 2 today · 20 cards');
        await expect(lateBtn).toHaveText('Late only (4)');
        await expect(resetBtn).not.toHaveClass(/neo-disabled/);

        // 3. Narrow the board to Late only, then reschedule one remaining late card and verify live refilter
        await lateBtn.click();
        await expect(lateBtn).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.due-board .neo-board-card')).toHaveCount(4);
        expect((await readWorkerState(page)).visibleCount).toBe(4);

        const reviewLateCard = page.locator('[id$="__card__rel-13"]');
        await reviewLateCard.locator('.neo-board-card-menu-button').click();
        await expect(editor).toBeVisible();
        await dateInput.fill(plusThreeIso);
        await editor.locator('.neo-board-card-editor-save').click();
        await expect(editor).toBeHidden();

        await expect(page.locator('.due-board .neo-board-card')).toHaveCount(3);
        await expect(lateBtn).toHaveText('Late only (3)');

        // 4. Reset restores all 20 relative-to-today deliverables and disables Reset
        await resetBtn.click();
        await expect(lateBtn).toHaveAttribute('aria-pressed', 'false');
        await expect(lateBtn).toHaveText('Late only (5)');
        await expect(page.locator('.due-board .neo-board-card')).toHaveCount(20);
        await expect(page.locator('.due-board .neo-board-card.neo-board-card-overdue')).toHaveCount(5);
        await expect(resetBtn).toHaveClass(/neo-disabled/);

        expect(consoleErrors).toEqual([])
    });

    test('renders cleanly with WCAG-compliant overdue contrast and zero console errors across all five board themes at 1440x900, 960x540, and 390x844', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));

        for (const size of [{width: 1440, height: 900}, {width: 960, height: 540}, {width: 390, height: 844}]) {
            await page.setViewportSize(size);

            for (const theme of THEMES) {
                await page.goto(`${EXAMPLE_URL}?theme=${theme}`);
                await expect(page.locator(`.due-viewport.${theme}`)).toHaveCount(1);
                await expect(page.locator('.due-board .neo-board-card')).toHaveCount(20);
                await expect(page.locator('.due-board time.neo-board-card-due-date-overdue')).toHaveCount(5);

                const metrics = await page.evaluate(viewportWidth => {
                    const
                        board     = document.querySelector('.due-board'),
                        lateEl    = document.querySelector('time.neo-board-card-due-date-overdue'),
                        cardEl    = lateEl.closest('.neo-board-card'),
                        canvas    = document.createElement('canvas'),
                        ctx       = Object.assign(canvas, {width: 1, height: 1}).getContext('2d', {willReadFrequently: true}),
                        parseRgba = value => {
                            ctx.clearRect(0, 0, 1, 1);
                            ctx.fillStyle = value;
                            ctx.fillRect(0, 0, 1, 1);
                            const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
                            return [r, g, b, a / 255]
                        },
                        blend = (fg, bg) => {
                            const a = fg[3];
                            return [
                                fg[0] * a + bg[0] * (1 - a),
                                fg[1] * a + bg[1] * (1 - a),
                                fg[2] * a + bg[2] * (1 - a),
                                1
                            ]
                        },
                        lum = ([r, g, b]) => [r, g, b]
                            .map(c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
                            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0),
                        cardBg  = parseRgba(getComputedStyle(cardEl).backgroundColor),
                        badgeBg = blend(parseRgba(getComputedStyle(lateEl).backgroundColor), cardBg),
                        fg      = parseRgba(getComputedStyle(lateEl).color),
                        [l1, l2] = [lum(fg), lum(badgeBg)];

                    return {
                        contrast          : (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05),
                        horizontalOverflow: viewportWidth >= 900 ? board.scrollWidth > board.clientWidth + 1 : false
                    }
                }, size.width);

                expect(metrics.contrast, `overdue contrast >= 4.5 in ${theme} at ${size.width}x${size.height}`).toBeGreaterThanOrEqual(4.5);
                expect(metrics.horizontalOverflow, `no horizontal board overflow at ${size.width}x${size.height} in ${theme}`).toBe(false)
            }
        }

        expect(consoleErrors).toEqual([])
    })
});
