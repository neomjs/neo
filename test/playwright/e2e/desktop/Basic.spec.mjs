import {expect, test} from '../../fixtures.mjs';

const EXAMPLE   = '/examples/desktop/basic/index.html',
      ICON      = '.neo-desktop-launcher .neo-list-item:not(.neo-list-header)',
      MENU_ITEM = '.neo-menu-list .neo-list-item',
      TASK      = '.neo-desktop-task-list .neo-list-item',
      WINDOW    = '.neo-dialog.neo-desktop-app-window';

/**
 * @summary `examples/desktop/basic`, the engine's web desktop with no code of its own: an app opens from an icon and
 * from the start menu, minimizes into its task and comes back from it, comes to the front from the taskbar, toggles
 * maximize and restore, and closes.
 */

/**
 * @param {Object} page
 * @param {String} app
 * @returns {Object} The visible window of the app
 */
const windowOf = (page, app) => page.locator(WINDOW).filter({hasText: app}).filter({visible: true});

/**
 * @param {Object} page
 * @returns {Promise<String[]>} The titles of the visible windows, front first
 */
function frontToBack(page) {
    return page.locator(WINDOW).evaluateAll(nodes => nodes
        .filter(node => getComputedStyle(node).display !== 'none')
        .sort((a, b) => Number(getComputedStyle(b).zIndex) - Number(getComputedStyle(a).zIndex))
        .map(node => node.querySelector('.neo-header-toolbar .neo-panel-header-text')?.innerText.trim()))
}

/**
 * @param {Object} locator
 * @returns {Promise<Object>} The window's place and size, rounded
 */
async function geometry(locator) {
    const {height, width, x, y} = await locator.boundingBox();

    return {height: Math.round(height), width: Math.round(width), x: Math.round(x), y: Math.round(y)}
}

/**
 * A window grows out of its icon and shrinks back into it, so a geometry counts once two reads agree
 * @param {Object} page
 * @param {Object} locator
 * @returns {Promise<Object>} The window's place and size at rest
 */
async function settled(page, locator) {
    let previous = null,
        current  = await geometry(locator);

    while (JSON.stringify(previous) !== JSON.stringify(current)) {
        await page.waitForTimeout(150);

        previous = current;
        current  = await geometry(locator)
    }

    return current
}

test.describe('examples/desktop/basic', () => {
    test.use({viewport: {width: 1280, height: 800}});

    test.beforeEach(async ({page}) => {
        await page.goto(EXAMPLE);
        await expect(page.locator(ICON)).toHaveCount(3)
    });

    test('an app opens, minimizes into its task, comes back from it, comes to the front and closes', async ({page}) => {
        await page.locator(ICON).filter({hasText: 'Notes'}).dblclick();

        const notes = windowOf(page, 'Notes'),
              task  = page.locator(TASK).filter({hasText: 'Notes'});

        await expect(notes).toBeVisible();
        await expect(notes).toContainText('Write things down');
        await expect(page.locator(TASK)).toHaveCount(1);

        const normal = await settled(page, notes);

        await notes.getByRole('button', {name: 'minimize'}).click();
        await expect(notes).toHaveCount(0);
        await expect(task).toHaveClass(/neo-desktop-task-minimized/);

        await task.click();
        await expect(notes).toBeVisible();
        await expect(task).not.toHaveClass(/neo-desktop-task-minimized/);
        expect(await settled(page, notes), 'a restore keeps the normal place and size').toEqual(normal);

        // A second app opens in front, and the first one's task brings it back to the front
        await page.locator(ICON).filter({hasText: 'Music'}).dblclick();
        await expect(windowOf(page, 'Music')).toBeVisible();
        await expect.poll(() => frontToBack(page)).toEqual(['Music', 'Notes']);

        await task.click();
        await expect.poll(() => frontToBack(page)).toEqual(['Notes', 'Music']);

        await notes.getByRole('button', {name: 'close'}).click();
        await expect(notes).toHaveCount(0);
        await expect(page.locator(TASK)).toHaveCount(1);
        await expect(page.locator(TASK)).toHaveText(/Music/)
    });

    test('maximize toggles to restore with its own glyph and name, and a restore returns the normal place', async ({page}) => {
        await page.locator(ICON).filter({hasText: 'Calculator'}).dblclick();

        const calculator = windowOf(page, 'Calculator');

        await expect(calculator).toBeVisible();

        const normal   = await settled(page, calculator),
              minimize = calculator.getByRole('button', {name: 'minimize'});

        await calculator.getByRole('button', {name: 'maximize'}).click();

        const restore = calculator.getByRole('button', {name: 'restore'});

        await expect(restore).toBeVisible();
        await expect.poll(async () => (await geometry(calculator)).width, {message: 'maximized fills the workspace'}).toBe(1280);

        const glyphs = await Promise.all([restore, minimize].map(button => button.locator('.neo-button-glyph').getAttribute('class')));

        expect(glyphs[0], 'restore glyph').toContain('fa-window-restore');
        expect(glyphs[0], 'not the minimize glyph').not.toBe(glyphs[1]);

        await restore.click();
        await expect(calculator.getByRole('button', {name: 'maximize'})).toBeVisible();
        expect(await settled(page, calculator), 'a restore returns the normal place and size').toEqual(normal)
    });

    test('the start menu opens an app of its group', async ({page}) => {
        await page.getByRole('button', {name: 'Apps'}).click();
        await page.locator(MENU_ITEM).filter({hasText: 'Tools'}).click();
        await page.locator(MENU_ITEM).filter({hasText: 'Calculator'}).click();

        await expect(windowOf(page, 'Calculator')).toBeVisible();
        await expect(page.locator(TASK)).toHaveText(/Calculator/)
    })
});
