import {test, expect} from '../../fixtures.mjs';

const
    EXAMPLE_URL = '/examples/board/basic/index.html',
    THEMES      = [
        'neo-theme-neo-dark',
        'neo-theme-neo-light',
        'neo-theme-light',
        'neo-theme-dark',
        'neo-theme-cyberpunk'
    ];

test.describe('Neo.board.Column collapsed vertical title geometry', () => {
    test('keeps vertical column title readable with non-zero height across collapsed, expanded, and re-collapsed states in all themes', async ({page}) => {
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push(msg.text())
            }
        });
        page.on('pageerror', err => consoleErrors.push(err.message));
        await page.route('**/favicon.ico', route => route.fulfill({status: 204}));

        await page.setViewportSize({width: 1440, height: 900});

        for (const theme of THEMES) {
            await page.goto(`${EXAMPLE_URL}?theme=${theme}`);

            const firstColumn = page.locator('.neo-board-column').first();
            await expect(firstColumn).toBeVisible();

            // Collapse first column via its header collapse button
            const collapseBtn = firstColumn.locator('.neo-board-column-collapse');
            await collapseBtn.click();
            await expect(firstColumn).toHaveClass(/neo-board-column-collapsed/);

            const
                titleLoc  = firstColumn.locator('.neo-board-column-title'),
                titleBox  = await titleLoc.boundingBox(),
                colBox    = await firstColumn.boundingBox(),
                headerBox = await firstColumn.locator('.neo-board-column-header').boundingBox();

            expect(titleBox, `${theme}: collapsed title bounding box`).not.toBeNull();
            expect(titleBox.height, `${theme}: collapsed vertical title height`).toBeGreaterThan(20);
            expect(titleBox.width, `${theme}: collapsed vertical title width`).toBeGreaterThan(10);
            expect(headerBox.y + headerBox.height, `${theme}: collapsed header stays inside column`).toBeLessThanOrEqual(colBox.y + colBox.height + 1);

            // Expand again and verify horizontal truncation rules still hold
            await collapseBtn.click();
            await expect(firstColumn).not.toHaveClass(/neo-board-column-collapsed/);

            const expandedTitleStyles = await titleLoc.evaluate(el => {
                const cs = getComputedStyle(el);
                return {
                    flexGrow    : cs.flexGrow,
                    textOverflow: cs.textOverflow,
                    writingMode : cs.writingMode
                }
            });
            expect(expandedTitleStyles).toEqual({
                flexGrow    : '1',
                textOverflow: 'ellipsis',
                writingMode : 'horizontal-tb'
            })
        }

        expect(consoleErrors).toEqual([])
    })
});
