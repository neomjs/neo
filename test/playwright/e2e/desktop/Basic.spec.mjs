import {contrastRatio, parseColor} from '../../../../buildScripts/util/check-theme-palette.mjs';
import {expect, test}              from '../../fixtures.mjs';

const EXAMPLE   = '/examples/desktop/basic/index.html',
      ICON      = '.neo-desktop-launcher .neo-list-item:not(.neo-list-header)',
      MENU_ITEM = '.neo-menu-list .neo-list-item',
      TASK      = '.neo-desktop-task-list .neo-list-item',
      THEMES    = ['neo-theme-neo-dark', 'neo-theme-neo-light', 'neo-theme-dark', 'neo-theme-light', 'neo-theme-cyberpunk'],
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
 * The theme owns every `--neo-desktop-*` variable the loaded stylesheets read, except the colour each app sets on its
 * icon, task and window. A variable that is undefined, or refers to one that is, computes to nothing.
 * @param {Object} page
 * @returns {Promise<String[]>} The variables that compute to nothing on the desktop
 */
function unresolvedVariables(page) {
    return page.evaluate(() => {
        const names = new Set();

        for (const sheet of document.styleSheets) {
            for (const rule of sheet.cssRules) {
                for (const [, name] of rule.cssText.matchAll(/var\((--neo-desktop-[a-z-]+)/g)) {
                    names.add(name)
                }
            }
        }

        names.delete('--neo-desktop-app-color');

        const style = getComputedStyle(document.querySelector('.neo-desktop'));

        return names.size ? [...names].filter(name => !style.getPropertyValue(name).trim()) : ['no stylesheet reads a --neo-desktop-* variable']
    })
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

/**
 * @summary Verifies the Apps button paints the accent role for each pointer state and opens on release.
 * @param {import('@playwright/test').Page} page
 * @param {import('@playwright/test').Locator} button
 */
async function openAppsWithContrastCheck(page, button) {
    const [rest, hover, active] = await button.evaluate(node => {
        const probe = node.appendChild(document.createElement('span'));

        probe.style.position = 'absolute';

        try {
            return ['', '-hover', '-active'].map(suffix => {
                probe.style.backgroundColor = `var(--neo-color-background-accent${suffix})`;
                return getComputedStyle(probe).backgroundColor
            })
        } finally {
            probe.remove()
        }
    });

    const check = async fill => {
        await expect(button).toHaveCSS('background-color', fill);
        const paint = await button.evaluate(node => ({
                  background: getComputedStyle(node).backgroundColor,
                  foreground: getComputedStyle(node.querySelector('.neo-button-text')).color
              })),
              background = parseColor(paint.background),
              foreground = parseColor(paint.foreground);

        expect(background?.rgba[3]).toBe(1);
        expect(foreground?.rgba[3]).toBe(1);
        expect(contrastRatio(background.rgba.slice(0, 3), foreground.rgba.slice(0, 3))).toBeGreaterThanOrEqual(4.5)
    };

    await check(rest);
    await button.hover();
    await check(hover);
    await page.mouse.down();

    try {
        await check(active)
    } finally {
        await page.mouse.up()
    }
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
        await expect(notes.locator('textarea')).toHaveValue(/^Saturday/);
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

    test('each app opens its own view at its own size: a typed note stays, a sum computes and the tracks show', async ({page}) => {
        await page.locator(ICON).filter({hasText: 'Notes'}).dblclick();

        const notes = windowOf(page, 'Notes'),
              note  = notes.locator('textarea');

        await expect(note).toHaveValue(/^Saturday/);
        expect(await settled(page, notes), 'the notes size').toMatchObject({height: 400, width: 460});

        await note.focus();
        await page.keyboard.press('ControlOrMeta+End');
        await page.keyboard.type('\n- buy stamps');
        await notes.getByRole('button', {name: 'close'}).click();
        await expect(notes).toHaveCount(0);

        // The desktop keeps a closed window, so the note comes back with it
        await page.locator(ICON).filter({hasText: 'Notes'}).dblclick();
        await expect(note).toHaveValue(/- buy stamps$/);

        await page.locator(ICON).filter({hasText: 'Calculator'}).dblclick();

        const calculator = windowOf(page, 'Calculator');

        for (const key of ['1', '2', '+', '3', '0', '=']) {
            await calculator.getByRole('button', {name: key, exact: true}).click()
        }

        await expect(calculator.locator('.desktop-basic-calculator-display')).toHaveText('42');
        expect(await settled(page, calculator), 'the calculator size').toMatchObject({height: 460, width: 320});

        await page.locator(ICON).filter({hasText: 'Music'}).dblclick();

        const music = windowOf(page, 'Music');

        await expect(music).toContainText('Morning Over Harbour Street');
        await expect(music).toContainText('3:34');
        expect(await settled(page, music), 'the music size').toMatchObject({height: 480, width: 720})
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

        expect(glyphs[0], 'restore glyph').toContain('fa-clone');
        expect(glyphs[0], 'not the minimize glyph').not.toBe(glyphs[1]);

        await restore.click();
        await expect(calculator.getByRole('button', {name: 'maximize'})).toBeVisible();
        expect(await settled(page, calculator), 'a restore returns the normal place and size').toEqual(normal)
    });

    test('a window the shrinking workspace cuts moves back in by the overlap, and a grown workspace moves nothing', async ({page}) => {
        await page.locator(ICON).filter({hasText: 'Calculator'}).dblclick();

        const calculator = windowOf(page, 'Calculator');

        await expect(calculator).toBeVisible();
        const initial = await settled(page, calculator);

        // A move ends at the workspace's right edge, which it cannot cross
        const title = await calculator.locator('.neo-header-toolbar .neo-panel-header-text').boundingBox(),
              x     = title.x + title.width / 2,
              y     = title.y + title.height / 2;

        await page.mouse.move(x, y);
        await page.mouse.down();
        await page.mouse.move(x + page.viewportSize().width - initial.x - initial.width, y, {steps: 16});
        await page.mouse.up();

        // The drag proxy, a clone of the window, leaves after the drop
        await expect(calculator).toHaveCount(1);

        expect(page.context().pages()).toHaveLength(1);
        const atEdge = await settled(page, calculator);

        // The drag's own clamp lets the drop land 2px past the edge: the window lands inside the workspace
        expect(atEdge.x + atEdge.width, 'at the right edge').toBe(1280);

        await page.setViewportSize({height: 800, width: 1100});
        await expect.poll(async () => (await geometry(calculator)).x, {message: 'moved back by the overlap'}).toBe(1100 - atEdge.width);

        const inside = await settled(page, calculator);

        expect(inside, 'its size and its top stay').toMatchObject({height: atEdge.height, width: atEdge.width, y: atEdge.y});

        await page.setViewportSize({height: 800, width: 1280});
        await page.waitForTimeout(300);
        expect(await settled(page, calculator), 'a grown workspace moves and sizes nothing').toEqual(inside);

        // The workspace ends at the 60px taskbar: 340px is too short for the window, so only its height shrinks
        await page.setViewportSize({height: 400, width: 1280});
        await expect.poll(async () => (await geometry(calculator)).height, {message: 'only the height shrinks'}).toBe(340);
        expect(await settled(page, calculator)).toMatchObject({width: inside.width, x: inside.x, y: 0})
    });

    test('the start menu opens an app of its group', async ({page}) => {
        await page.getByRole('button', {name: 'Apps'}).click();
        await page.locator(MENU_ITEM).filter({hasText: 'Tools'}).click();
        await page.locator(MENU_ITEM).filter({hasText: 'Calculator'}).click();

        await expect(windowOf(page, 'Calculator')).toBeVisible();
        await expect(page.locator(TASK)).toHaveText(/Calculator/)
    })
});

test.describe('examples/desktop/basic in every shipped theme', () => {
    for (const theme of THEMES) {
        for (const [width, height] of [[1440, 900], [390, 844]]) {
            test(`at ${width} × ${height} a window and the start menu wear ${theme}, every desktop variable resolved`, async ({page}, testInfo) => {
                await page.setViewportSize({height, width});
                await page.goto(`${EXAMPLE}?theme=${theme}`);
                await expect(page.locator(ICON)).toHaveCount(3);
                await expect(page.locator(`.${theme}`).first(), 'the example runs in the theme').toBeAttached();

                await page.locator(ICON).filter({hasText: 'Notes'}).dblclick();
                await expect(windowOf(page, 'Notes')).toBeVisible();
                const apps = page.getByRole('button', {name: 'Apps'});

                if (width === 1440 && theme.startsWith('neo-theme-neo-')) {
                    await openAppsWithContrastCheck(page, apps)
                } else {
                    await apps.click()
                }

                await expect(page.locator(MENU_ITEM).filter({hasText: 'Tools'})).toBeVisible();

                expect(await unresolvedVariables(page), 'every desktop variable resolves').toEqual([]);

                // The frame waits for the window to finish growing out of its icon and for the start button's ripple
                await settled(page, windowOf(page, 'Notes'));
                await expect(page.locator('.neo-desktop-start-button .neo-button-ripple-wrapper')).toHaveCount(0);

                const frame = testInfo.outputPath(`desktop-basic-${width}-${theme}.png`);

                await page.screenshot({path: frame});
                await testInfo.attach(`desktop-basic-${width}-${theme}`, {path: frame, contentType: 'image/png'})
            })
        }
    }
});
