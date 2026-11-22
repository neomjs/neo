import {expect, test} from '../../fixtures.mjs';

const URL = '/examples/grid/tree/index.html';

/**
 * @param {String} text
 * @returns {Number}
 */
const parseMoney = text => Number(String(text).replace(/[^0-9.-]+/g, ''));

/**
 * x of the folder's 1px toggle stem, and x of the same depth's lane in its child row's .neo-tree-indent
 * @param {import('@playwright/test').Page} page
 * @param {String} folderText
 * @param {String} childText
 * @returns {Promise<{laneX: Number, stemX: Number, toggleWidth: Number}>}
 */
const helperLineXs = (page, folderText, childText) => page.evaluate(([folderText, childText]) => {
    const row          = text => [...document.querySelectorAll('.neo-grid-row')].find(el => el.textContent.includes(text)),
          folderToggle = row(folderText).querySelector('.neo-tree-toggle'),
          folderIndent = row(folderText).querySelector('.neo-tree-indent'),
          childIndent  = row(childText) .querySelector('.neo-tree-indent'),
          style        = getComputedStyle(folderToggle),
          indent       = parseFloat(style.getPropertyValue('--tree-indent')) || 16,
          toggleWidth  = folderToggle.getBoundingClientRect().width,
          depth        = folderIndent.getBoundingClientRect().width / indent,
          position     = style.backgroundPositionX,
          // A % position places the 1px image at (box width - 1px) * %
          stemOffset   = position.endsWith('%') ? (toggleWidth - 1) * parseFloat(position) / 100 : parseFloat(position);

    return {
        laneX: childIndent.getBoundingClientRect().left + depth * indent + toggleWidth / 2 - 1,
        stemX: folderToggle.getBoundingClientRect().left + stemOffset,
        toggleWidth
    }
}, [folderText, childText]);

test.describe('Tree Grid E2E', () => {
    test.beforeEach(async ({page}) => {
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(URL);
        await page.waitForSelector('.neo-grid-container .neo-grid-row', {state: 'visible', timeout: 30000});
    });

    test('fills the 1440x900 stage with >= 15 rows and rolls leaf values up into team and department totals', async ({page}) => {
        const grid = page.locator('.neo-grid-container'),
              box  = await grid.boundingBox(),
              rows = page.locator('.neo-grid-row:visible');

        expect(box.width).toBeGreaterThan(1380);
        expect(box.height).toBeGreaterThan(740);

        const initialCount = await rows.count();
        expect(initialCount).toBeGreaterThanOrEqual(15);
        expect(initialCount).toBe(16);

        // Expand Runtime Engine and verify its 3 leaf items sum to Runtime Engine's seats, budget, and spend
        const runtimeRow = page.locator('.neo-grid-row', {hasText: 'Runtime Engine'});
        const toggleIcon = runtimeRow.locator('.neo-tree-toggle');

        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        const teamSeats  = Number(await runtimeRow.locator('[data-field="headcount"]').innerText()),
              teamBudget = parseMoney(await runtimeRow.locator('[data-field="budget"]').innerText()),
              teamSpent  = parseMoney(await runtimeRow.locator('[data-field="spent"]').innerText());

        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-expanded/);
        await expect(page.getByRole('treegrid')).toHaveAttribute('aria-rowcount', '20'); // header + 19 data rows

        let itemSeats  = 0,
            itemBudget = 0,
            itemSpent  = 0;

        for (const itemName of ['V8 Worker Pool', 'Virtual DOM Diffing', 'Config Reactivity']) {
            const itemRow = page.locator('.neo-grid-row', {hasText: itemName});
            await expect(itemRow).toBeVisible();
            itemSeats  += Number(await itemRow.locator('[data-field="headcount"]').innerText());
            itemBudget += parseMoney(await itemRow.locator('[data-field="budget"]').innerText());
            itemSpent  += parseMoney(await itemRow.locator('[data-field="spent"]').innerText());
        }

        expect(teamSeats).toBe(itemSeats);
        expect(teamBudget).toBe(itemBudget);
        expect(teamSpent).toBe(itemSpent);

        // Collapse again and verify Core Platform stays expanded, not turned into a leaf
        const platformToggle = page.locator('.neo-grid-row', {hasText: 'Core Platform'}).locator('.neo-tree-toggle');
        await expect(platformToggle).not.toHaveClass(/is-leaf/);
        await expect(platformToggle).toHaveClass(/is-expanded/);

        await toggleIcon.click();
        await expect(toggleIcon).toHaveClass(/is-collapsed/);
        await expect(page.getByRole('treegrid')).toHaveAttribute('aria-rowcount', '17');
    });

    test('ArrowRight expands and ArrowLeft collapses the selected parent row (#20745)', async ({page}) => {
        const runtimeRow = page.locator('.neo-grid-row', {hasText: 'Runtime Engine'}),
              toggleIcon = runtimeRow.locator('.neo-tree-toggle'),
              treegrid   = page.getByRole('treegrid');

        await expect(treegrid).toHaveAttribute('aria-rowcount', '17');
        await expect(toggleIcon).toHaveClass(/is-collapsed/);

        await runtimeRow.locator('.neo-tree-content').click();
        await expect(runtimeRow).toHaveClass(/neo-selected/);

        // Right expands the selected, collapsed parent row
        await page.keyboard.press('ArrowRight');
        await expect(treegrid).toHaveAttribute('aria-rowcount', '20');
        await expect(toggleIcon).toHaveClass(/is-expanded/);
        await expect(runtimeRow).toHaveClass(/neo-selected/);

        // Right again is a no-op on an already expanded row
        await page.keyboard.press('ArrowRight');
        await expect(treegrid).toHaveAttribute('aria-rowcount', '20');
        await expect(toggleIcon).toHaveClass(/is-expanded/);

        // Left collapses it again and keeps the selection
        await page.keyboard.press('ArrowLeft');
        await expect(treegrid).toHaveAttribute('aria-rowcount', '17');
        await expect(toggleIcon).toHaveClass(/is-collapsed/);
        await expect(runtimeRow).toHaveClass(/neo-selected/);

        // Left on a collapsed row is a no-op as well
        await page.keyboard.press('ArrowLeft');
        await expect(treegrid).toHaveAttribute('aria-rowcount', '17');
        await expect(toggleIcon).toHaveClass(/is-collapsed/);
    });

    test('Sorting TreeStore hierarchically and Reset restores initial hierarchy', async ({page}) => {
        const nameHeader = page.locator('.neo-grid-header-button', {hasText: 'Name'});

        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-asc/);

        // ASC root departments: Cloud & Operations, Core Platform, Data & Storage, UI & Design Systems
        let rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('Cloud & Operations');
        await expect(rows.nth(1)).toContainText('Edge & Releases');
        await expect(rows.nth(2)).toContainText('Observability');
        await expect(rows.nth(3)).toContainText('Security & Audit');
        await expect(rows.nth(4)).toContainText('Core Platform');
        await expect(rows.nth(5)).toContainText('Build & Tooling');
        await expect(rows.nth(6)).toContainText('Runtime Engine');
        await expect(rows.nth(7)).toContainText('Worker Messaging');

        // DESC sort reverses root and child order
        await nameHeader.click();
        await expect(nameHeader).toHaveClass(/neo-sort-desc/);

        rows = page.locator('.neo-grid-row:visible');
        await expect(rows.nth(0)).toContainText('UI & Design Systems');
        await expect(rows.nth(1)).toContainText('Themes & Accessibility');
        await expect(rows.nth(2)).toContainText('Grid & Table');
        await expect(rows.nth(3)).toContainText('Canvas & Charts');

        // Reset restores initial department order and clears sort state
        await page.getByRole('button', {name: 'Reset'}).click();
        await expect(nameHeader).toHaveClass(/neo-sort-hidden/);
        await expect(rows.nth(0)).toContainText('Core Platform');
        await expect(rows.nth(1)).toContainText('Runtime Engine');
    });

    test('an expanded folder\'s toggle stem lines up with the lane its children draw at that depth (#21966)', async ({page}) => {
        const toggle = page.locator('.neo-grid-row', {hasText: 'Runtime Engine'}).locator('.neo-tree-toggle');

        await toggle.click();
        await expect(page.locator('.neo-grid-row', {hasText: 'V8 Worker Pool'})).toBeVisible();

        let {laneX, stemX, toggleWidth} = await helperLineXs(page, 'Runtime Engine', 'V8 Worker Pool');
        expect(toggleWidth).toBe(24);
        expect(stemX).toBe(laneX);

        // A custom toggle width moves the indent lanes, so the toggle has to follow it
        await page.locator('.neo-grid-container').evaluate(el => el.style.setProperty('--tree-toggle-width', '30px'));

        ({laneX, stemX, toggleWidth} = await helperLineXs(page, 'Runtime Engine', 'V8 Worker Pool'));
        expect(toggleWidth).toBe(30);
        expect(stemX).toBe(laneX);
    });

    test('Deep state interactions: expand, parent collapse/re-expand memory, phone width, and both themes', async ({page}) => {
        const treegrid = page.getByRole('treegrid');

        // 1. Expand Runtime Engine (+3 items -> 19 data rows)
        let runtimeRow = page.locator('.neo-grid-row', {hasText: 'Runtime Engine'});
        await runtimeRow.locator('.neo-tree-toggle').click();
        await expect(treegrid).toHaveAttribute('aria-rowcount', '20');

        // 2. Collapse Core Platform (-3 teams - 3 items = -6 rows -> 13 data rows)
        let platformRow = page.locator('.neo-grid-row', {hasText: 'Core Platform'});
        await platformRow.locator('.neo-tree-toggle').click();
        await expect(treegrid).toHaveAttribute('aria-rowcount', '14');

        // 3. Re-expand Core Platform: remembers Runtime Engine was expanded (-> 20 aria-rowcount)
        await platformRow.locator('.neo-tree-toggle').click();
        await expect(treegrid).toHaveAttribute('aria-rowcount', '20');
        await expect(page.locator('.neo-grid-row', {hasText: 'V8 Worker Pool'})).toBeVisible();

        // 4. Switch theme via toolbar button and verify class toggle
        const viewport = page.locator('.neo-examples-grid-tree');
        await expect(viewport).toHaveClass(/neo-theme-neo-light/);
        await page.getByRole('button', {name: 'Dark theme'}).click();
        await expect(viewport).toHaveClass(/neo-theme-neo-dark/);

        // 5. Verify 390 x 844 phone width fits viewport cleanly without overflowing horizontally
        await page.setViewportSize({width: 390, height: 844});
        const vpBox   = await viewport.boundingBox(),
              gridBox = await page.locator('.neo-grid-container').boundingBox();

        expect(vpBox.width).toBe(390);
        expect(gridBox.width).toBeLessThanOrEqual(390);
        expect(gridBox.height).toBeGreaterThan(600);
    });
});
