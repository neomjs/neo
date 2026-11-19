import {expect, test} from '../../fixtures.mjs';

/**
 * @summary `examples/grid/cellTypes`: renders all 14 non-tree built-in column types on a 32-row seeded maintainer
 * directory, ticks values live while the visitor watches, triggers row sponsorship via the `component` button, resets
 * deterministically, navigates rows by keyboard, and works cleanly at `1440 × 900` and `390 × 844` in both themes.
 */
const URL = '/examples/grid/cellTypes/index.html';

const EXPECTED_HEADERS = [
    '# · index',
    'Maintainer · githubUser',
    'Country · countryFlag',
    'Trend · sparkline',
    'Pledged · animatedCurrency',
    'Back · component',
    'Funded · progress',
    'Goal · currency',
    'Tier · icon',
    'Commits · animatedChange',
    'Repo · iconLink',
    'Profile · linkedin',
    'Orgs · githubOrgs',
    'Stack · column'
];

test.describe('Grid built-in cell types example', () => {
    test('renders all 14 non-tree column types with non-empty cells and live ticking values at 1440x900', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const grid = page.getByRole('grid');
        await expect(page.locator('.neo-grid-cell[data-field="login"]').first()).toContainText('tobiu', {timeout: 30000});

        // Pause feed first so we can inspect the deterministic initial snapshot across all 14 column types
        const feedBtn = page.locator('.cell-types-feed-button');
        await feedBtn.click();
        await expect(feedBtn).toContainText('Resume feed');
        await page.locator('.cell-types-reset-button').click();
        await feedBtn.click();

        expect(Number(await grid.getAttribute('aria-rowcount'))).toBe(33); // 1 header + 32 maintainer rows
        await expect(page.locator('.cell-types-footer')).toContainText('pledges, goals, funded %, commits and tiers are generated');

        // Verify visible column headers name their type and none truncates its label
        const initialHeaderMetrics = await page.locator('.neo-grid-header-button').evaluateAll(buttons =>
            buttons.map(btn => {
                const label = btn.querySelector('.neo-button-text');
                return {
                    clientWidth: label?.clientWidth ?? 0,
                    scrollWidth: label?.scrollWidth ?? 0,
                    text       : label?.textContent?.trim(),
                    truncated  : label ? label.scrollWidth > label.clientWidth + 1 : false
                }
            })
        );
        for (const {text, truncated, scrollWidth, clientWidth} of initialHeaderMetrics) {
            expect(EXPECTED_HEADERS).toContain(text);
            expect(truncated, `header "${text}" (${scrollWidth} > ${clientWidth}) should not truncate`).toBe(false)
        }

        // Assert rendered cells for the initially visible columns (locked-start + left center + locked-end)
        await expect(page.locator('.neo-grid-cell[data-field="id"]').first()).toHaveText('1');

        const userCell = page.locator('.neo-grid-cell[data-field="login"]').first();
        await expect(userCell.locator('img.neo-avatar')).toHaveAttribute('src', /avatars\.githubusercontent\.com\/u\/1177434/);
        await expect(userCell.locator('a.neo-username')).toHaveAttribute('href', 'https://github.com/tobiu');
        await expect(userCell.locator('.neo-name')).toHaveText('Tobias Uhlig');

        const flagCell = page.locator('.neo-grid-cell[data-field="countryCode"]').first();
        await expect(flagCell.locator('img.neo-country-flag')).toHaveAttribute('src', /circle-flags\/flags\/de\.svg/);
        await expect(flagCell.locator('.neo-location-text')).toHaveText('Stuttgart, Germany');

        const pledgedCell       = page.locator('.neo-grid-cell[data-field="pledged"]').first();
        const seededPledgedText = (await pledgedCell.textContent()).trim();
        expect(seededPledgedText).toMatch(/^\$[0-9,]+(\.00)?$/);

        await expect(page.locator('.neo-grid-cell[data-field="trend"] .neo-sparkline-wrapper[data-drawn="true"]').first()).toBeVisible({timeout: 15000});
        await expect(page.locator('.neo-grid-cell[data-field="goalPercent"] progress.neo-progress').first()).toBeVisible();
        await expect(page.locator('.neo-grid-cell[data-field="annualGoal"]').first()).toHaveText(/^\$[0-9,]+(\.00)?$/);
        await expect(page.locator('.neo-grid-cell[data-field="tierIcon"] i.fa-solid').first()).toBeVisible();

        const sponsorBtn = page.locator('.neo-grid-cell[data-field="actionLabel"] .cell-types-sponsor-button').first();
        await expect(sponsorBtn).toHaveText('+$250');

        // Scroll horizontally to bring the remaining columns into view and assert each type's cell
        await page.locator('.neo-grid-horizontal-scrollbar').evaluate(el => { el.scrollLeft = el.scrollWidth; });

        await expect(page.locator('.neo-grid-cell[data-field="recentCommits"]').first()).toHaveText(/^\d+$/);

        const scrolledHeaderMetrics = await page.locator('.neo-grid-header-button').evaluateAll(buttons =>
            buttons.map(btn => {
                const label = btn.querySelector('.neo-button-text');
                return {
                    text     : label?.textContent?.trim(),
                    truncated: label ? label.scrollWidth > label.clientWidth + 1 : false
                }
            })
        );
        for (const {text, truncated} of scrolledHeaderMetrics) {
            expect(EXPECTED_HEADERS).toContain(text);
            expect(truncated, `scrolled header "${text}" should not truncate`).toBe(false)
        }

        const repoLink = page.locator('.neo-grid-cell[data-field="topRepoUrl"] a.neo-icon-link').first();
        await expect(repoLink).toHaveAttribute('href', /^https:\/\/github\.com\/.+\/.+$/);
        await expect(repoLink.locator('.neo-link-label')).toContainText('★');

        const linkedinLink = page.locator('.neo-grid-cell[data-field="linkedin"] a.neo-icon-link').first();
        await expect(linkedinLink).toHaveAttribute('href', /^https:\/\/www\.linkedin\.com\/in\/.+\/$/);
        await expect(linkedinLink.locator('i.fa-linkedin')).toBeVisible();

        const orgLink = page.locator('.neo-grid-cell[data-field="organizations"] a.neo-org-link').first();
        await expect(orgLink).toHaveAttribute('href', /^https:\/\/github\.com\/.+$/);
        await expect(orgLink.locator('img.neo-org-avatar')).toHaveAttribute('src', /avatars\.githubusercontent\.com\/u\//);

        await expect(page.locator('.neo-grid-cell[data-field="ecosystem"]').first()).not.toBeEmpty();

        // Scroll back to start, click +$250 on row 0, and verify animatedCurrency + animatedChange update
        await page.locator('.neo-grid-horizontal-scrollbar').evaluate(el => { el.scrollLeft = 0; });
        await expect(pledgedCell).toHaveText(seededPledgedText);

        await sponsorBtn.click();
        await expect(pledgedCell).not.toHaveText(seededPledgedText);
        await expect(pledgedCell).toHaveClass(/neo-animated-positive/);

        // Sort a column by its header, click Reset, and assert no header keeps its sort state (aria-sort absent)
        await page.locator('.neo-grid-header-button', {hasText: 'Pledged · animatedCurrency'}).click();
        await expect(page.locator('[role="columnheader"][aria-sort="ascending"]')).toHaveCount(1);

        // Reset restores seeded values, clears header sort state, and restarts the live feed
        await page.locator('.cell-types-reset-button').click();
        await expect(page.locator('[role="columnheader"][aria-sort]')).toHaveCount(0);
        await expect(page.locator('.neo-grid-cell[data-field="login"]').first()).toContainText('tobiu');
        await expect(pledgedCell).toHaveText(seededPledgedText);

        const beforeWatchSnapshot = await page.locator('.neo-grid-cell[data-field="recentCommits"]').allTextContents();
        await expect.poll(
            async () => (await page.locator('.neo-grid-cell[data-field="recentCommits"]').allTextContents()).join(','),
            {timeout: 6000}
        ).not.toBe(beforeWatchSnapshot.join(','))
    });

    test('moves selection by keyboard, switches both themes, and contains cleanly at 390x844', async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);

        const firstLoginCell  = page.locator('.neo-grid-cell[data-field="login"]').nth(0),
              secondLoginCell = page.locator('.neo-grid-cell[data-field="login"]').nth(1);

        await expect(firstLoginCell).toContainText('tobiu', {timeout: 30000});

        // Select row 0 and move selection by keyboard (ArrowDown / ArrowUp)
        await firstLoginCell.click();
        await expect(firstLoginCell.locator('..')).toHaveClass(/neo-selected/);

        await page.keyboard.press('ArrowDown');
        await expect(secondLoginCell.locator('..')).toHaveClass(/neo-selected/);

        await page.keyboard.press('ArrowUp');
        await expect(firstLoginCell.locator('..')).toHaveClass(/neo-selected/);

        // Switch between neo-theme-neo-light and neo-theme-neo-dark
        const viewport = page.locator('.neo-examples-grid-cell-types'),
              themeBtn = page.locator('.cell-types-theme-button');

        await expect(page.locator('body')).toHaveClass(/neo-theme-neo-light/);
        await expect(themeBtn).toContainText('Dark theme');
        await themeBtn.click();
        await expect(viewport).toHaveClass(/neo-theme-neo-dark/);
        await expect(themeBtn).toContainText('Light theme');
        await themeBtn.click();
        await expect(viewport).toHaveClass(/neo-theme-neo-light/);
        await expect(themeBtn).toContainText('Dark theme');

        // Resize to 390x844 phone width: responsiveLockPolicy unlocks pinned columns so cells stay readable
        await page.setViewportSize({width: 390, height: 844});

        await expect.poll(async () => {
            const rect = await page.locator('.neo-examples-grid-cell-types').evaluate(el => {
                const g = el.querySelector('.neo-grid-container').getBoundingClientRect(),
                      f = el.querySelector('.cell-types-footer').getBoundingClientRect();
                return {
                    footerBottom: Math.round(f.bottom),
                    footerRight : Math.round(f.right),
                    gridBottom  : Math.round(g.bottom),
                    gridRight   : Math.round(g.right),
                    gridWidth   : Math.round(g.width)
                }
            });
            return rect.gridWidth <= 390 && rect.gridRight <= 390 && rect.gridBottom <= rect.footerBottom && rect.footerRight <= 390 && rect.footerBottom <= 844
        }).toBe(true);

        await expect(page.locator('.neo-grid-cell[data-field="login"]').first()).toContainText('tobiu');
        await expect(page.locator('.neo-grid-cell[data-field="countryCode"] .neo-location-text').first()).toHaveText('Stuttgart, Germany')
    })
});
