import {expect, test} from '../../fixtures.mjs';

/**
 * @summary A header menu's wrapper is part of the column: rows render, cells stay under their headers, and the
 * columnheader keeps its `aria-colindex`, however the menu was turned on.
 *
 * `columnMenu: true` in a grid's config meets the grid's first render, so each header takes its wrapper shape before
 * that render. The header toolbar measures the wrapper, the box its layout positions and the sort button's offset
 * parent. Turned on at runtime, the wrapper widens a content-sized column, and the toolbar re-measures.
 *
 * Fixture: `apps/grid-column-menu`. The fixture's own console guard fails the test on any worker error.
 */
const APP = 'test/playwright/component/apps/grid-column-menu/index.html';

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} grid The grid's id
 * @returns {Promise<{colindex: String[], headers: String[], rows: Number[], triggers: Number, wrappers: Number}>}
 * `rows` per body
 */
async function readGrid(page, grid) {
    return page.evaluate(id => {
        const root = document.getElementById(id);

        return {
            colindex: [...root.querySelectorAll('[role="columnheader"]')].map(header => header.getAttribute('aria-colindex')),
            headers : [...root.querySelectorAll('.neo-grid-header-button')].map(button => button.textContent.trim()),
            // Rendered rows per body. Only the lead region's rows carry role="row", so count the record rows
            rows    : [...root.querySelectorAll('.neo-grid-body')].map(body => body.querySelectorAll('.neo-grid-row[data-record-id]').length),
            triggers: root.querySelectorAll('.neo-grid-menu-trigger').length,
            wrappers: root.querySelectorAll('.neo-grid-menu-wrapper').length
        }
    }, grid)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} grid The grid's id
 * @returns {Promise<String[]>} The data fields whose first cell does not span its header
 */
async function readMisalignedColumns(page, grid) {
    return page.evaluate(id => {
        const root = document.getElementById(id);

        return [...root.querySelectorAll('.neo-grid-header-button')].map(button => {
            const field  = button.textContent.trim().toLowerCase(),
                  header = button.getBoundingClientRect(),
                  cell   = root.querySelector(`.neo-grid-body [data-field="${field}"]`)?.getBoundingClientRect();

            return cell && Math.abs(cell.left - header.left) < 1 && Math.abs(cell.width - header.width) < 1 ? null : field
        }).filter(Boolean)
    }, grid)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} grid The grid's id
 * @returns {Promise<String[]>} The headers whose menu trigger reaches outside them
 */
async function readOverflowingTriggers(page, grid) {
    return page.evaluate(id => [...document.getElementById(id).querySelectorAll('.neo-grid-menu-wrapper')].filter(wrapper => {
        const header  = wrapper.getBoundingClientRect(),
              trigger = wrapper.querySelector('.neo-grid-menu-trigger').getBoundingClientRect();

        return trigger.top < header.top || trigger.bottom > header.bottom
    }).map(wrapper => wrapper.querySelector('.neo-grid-header-button').textContent.trim()), grid)
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {String} grid The grid's id
 * @returns {Promise<String[]>} The headers whose menu trigger does not receive a pointer at its center
 */
async function readCoveredTriggers(page, grid) {
    return page.evaluate(id => [...document.getElementById(id).querySelectorAll('.neo-grid-menu-wrapper')].filter(wrapper => {
        const trigger = wrapper.querySelector('.neo-grid-menu-trigger'),
              rect    = trigger.getBoundingClientRect();

        return !trigger.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
    }).map(wrapper => wrapper.querySelector('.neo-grid-header-button').textContent.trim()), grid)
}

test.describe('Header menu shape', () => {
    test.beforeEach(async ({page}) => {
        await page.goto(APP);
        await expect(page.locator('#grid-column-menu-locked .neo-grid-menu-trigger')).toHaveCount(4, {timeout: 30000})
    });

    test('a minimal grid configured with menus renders its rows and one wrapped header per column', async ({page}) => {
        await expect.poll(() => readGrid(page, 'grid-column-menu-plain')).toEqual({
            colindex: ['1', '2', '3'],
            headers : ['Name', 'Team', 'City'],
            rows    : [4],
            triggers: 3,
            wrappers: 3
        })
    });

    test('locked columns and a per-column opt-out keep one header per column', async ({page}) => {
        await expect.poll(() => readGrid(page, 'grid-column-menu-locked')).toEqual({
            // Grid-wide across the locked-start, center and locked-end headers
            colindex: ['1', '2', '3', '4', '5'],
            headers : ['Id', 'Name', 'Team', 'City', 'State'],
            rows    : [4, 4, 4],
            triggers: 4,
            wrappers: 4
        })
    });

    test('a menu plugin that loads after the first render leaves the measured headers in place', async ({page}) => {
        // Holds the plugin, and with it its stylesheet, until both grids have measured their headers and rendered rows:
        // 4 records, in 1 body and in 3
        await page.route('**/grid/header/plugin/Menu.mjs', async route => {
            await expect(page.locator('#grid-column-menu-plain .neo-grid-body .neo-grid-row[data-record-id]')).toHaveCount(4, {timeout: 30000});
            await expect(page.locator('#grid-column-menu-locked .neo-grid-body .neo-grid-row[data-record-id]')).toHaveCount(12, {timeout: 30000});
            await route.continue()
        });

        await page.reload();
        await expect(page.locator('#grid-column-menu-locked .neo-grid-menu-trigger')).toHaveCount(4, {timeout: 30000});

        for (const grid of ['grid-column-menu-plain', 'grid-column-menu-locked']) {
            await expect.poll(() => readMisalignedColumns(page, grid)).toEqual([])
        }
    });

    test('cells follow their headers when the grid is resized', async ({page}) => {
        await page.setViewportSize({width: 900, height: 720});

        for (const grid of ['grid-column-menu-plain', 'grid-column-menu-locked']) {
            await expect.poll(() => readMisalignedColumns(page, grid)).toEqual([])
        }
    });

    test('menus turned on at runtime keep content-sized cells under their headers', async ({neo, page}) => {
        const grid = 'grid-column-menu-runtime';

        // Rows render only once the toolbar has measured its headers
        await expect.poll(() => readGrid(page, grid)).toMatchObject({rows: [4], triggers: 0, wrappers: 0});
        // out-waits: grid.Container's `onResize` buffer (300 ms). Its first resize observation measures the headers
        // again, and menus turned on before it would ride that measurement.
        await page.waitForTimeout(1000);

        await neo.setConfig(grid, {columnMenu: true});
        await expect(page.locator(`#${grid} .neo-grid-menu-trigger`)).toHaveCount(3);

        await expect.poll(() => readMisalignedColumns(page, grid)).toEqual([]);
        expect(await readGrid(page, grid)).toMatchObject({colindex: ['1', '2', '3'], rows: [4], wrappers: 3})
    });

    test('each menu trigger sits inside its header', async ({page}) => {
        for (const grid of ['grid-column-menu-plain', 'grid-column-menu-locked']) {
            expect(await readOverflowingTriggers(page, grid)).toEqual([])
        }
    });

    test('a locked header leaves its menu trigger on top', async ({page}) => {
        for (const grid of ['grid-column-menu-plain', 'grid-column-menu-locked']) {
            expect(await readCoveredTriggers(page, grid)).toEqual([])
        }
    });

    test('a configured menu opens from its trigger, in the center and in a locked region', async ({page}) => {
        const menu = page.locator('.neo-grid-column-menu');

        for (const [grid, header, options] of [['grid-column-menu-plain', 'Team', 3], ['grid-column-menu-locked', 'State', 2]]) {
            const wrapper = page.locator(`#${grid} .neo-grid-menu-wrapper`).filter({hasText: header});

            await wrapper.hover();
            await wrapper.locator('.neo-grid-menu-trigger').click();

            await expect(menu).toBeVisible();
            await expect(menu.locator('[role="option"]')).toHaveCount(options);

            await page.keyboard.press('Escape');
            await expect(menu).toBeHidden()
        }
    })
});
