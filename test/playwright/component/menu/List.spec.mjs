import {test, expect} from '@playwright/test';

let menuId;

/**
 * @summary The three-level tree the cascade is measured on.
 *
 * Depth two on purpose: at depth one the clicked menu IS the root, so closing only itself passes by
 * accident. `Copy name` sits two levels below the root, and a correct dismissal has to travel up
 * through `Details` and `Inspect` before it can come back down.
 * @type {Object[]}
 */
const items = [{
    id  : 'open',
    text: 'Open'
}, {
    id   : 'inspect',
    items: [{
        id   : 'details',
        items: [{
            id  : 'copy-name',
            text: 'Copy name'
        }],
        text: 'Details'
    }],
    text: 'Inspect'
}];

/**
 * @summary Creates the floating root menu inside the component harness app.
 * @param {Object} page
 * @param {Object} [config] Merged over the defaults, e.g. `{hideOnLeafItemClick: false}`
 * @returns {Promise<String>} The root menu id
 */
async function createMenu(page, config={}) {
    const result = await page.evaluate(instanceConfig => {
        return Neo.worker.App.createNeoInstance(instanceConfig)
    }, {
        align       : {axisLock: true, edgeAlign: 't0-b0', target: {x: 40, y: 40, width: 0, height: 0}},
        displayField: 'text',
        floating    : true,
        importPath  : '../menu/List.mjs',
        items,
        ntype       : 'menu-list',
        parentId    : 'component-test-viewport',
        ...config
    });

    if (!result.success) {
        throw new Error(`Component creation failed: ${result.error.message}`)
    }

    return result.id
}

/**
 * @summary Walks the real tree open with pointer input, leaving focus on the leaf.
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function openToLeaf(page) {
    const menus = page.locator('.neo-menu-list');

    await expect(menus).toHaveCount(1);
    await page.getByText('Inspect', {exact: true}).click();
    await expect(menus).toHaveCount(2);
    await page.getByText('Details', {exact: true}).click();
    await expect(menus).toHaveCount(3)
}

/**
 * @summary Starts recording how many menu levels stand, on every DOM mutation batch.
 *
 * A settled assertion cannot witness this defect. `expect(locator).toHaveCount(0)` is web-first: it
 * re-polls until the timeout, so it reports the tree that eventually stands, not the tree the click
 * produced. The regression closed the clicked submenu on its own and left two ancestors mounted until
 * a later focus round-trip swept them up — under a retrying assertion that is a pass, and it is how
 * the defect reached `dev` with the suites green. Recording every intermediate state instead makes
 * the lingering ancestors the observation rather than a state polled past.
 * @param {Object} page
 * @returns {Promise<void>}
 */
function recordLevelCounts(page) {
    return page.evaluate(() => {
        const count = () => document.querySelectorAll('.neo-menu-list').length;

        window.__menuLevelCounts = [count()];

        new MutationObserver(() => {
            const current = count();

            current !== window.__menuLevelCounts.at(-1) && window.__menuLevelCounts.push(current)
        }).observe(document.body, {childList: true, subtree: true})
    })
}

/**
 * @summary Returns the recorded level-count transitions, newest last.
 * @param {Object} page
 * @returns {Promise<Number[]>}
 */
function levelCounts(page) {
    return page.evaluate(() => window.__menuLevelCounts)
}

/**
 * @summary A parent over three siblings, whose submenu has three rows.
 *
 * The shape the diagonal arm needs: the submenu aligns to its parent's top, so the path from `Share` to the
 * third submenu row descends while still inside the root menu, across `Rename`. The focus-rest arms reuse it
 * because one arrow key reaches the parent from `Rename`, and another leaves it again.
 * @type {Object[]}
 */
const restItems = [{
    id   : 'share',
    items: [{id: 'email', text: 'Email'}, {id: 'link', text: 'Copy link'}, {id: 'print', text: 'Print'}],
    text : 'Share'
}, {
    id  : 'rename',
    text: 'Rename'
}, {
    id  : 'duplicate',
    text: 'Duplicate'
}, {
    id  : 'delete',
    text: 'Delete'
}];

/**
 * @summary Returns the text of the menu item holding browser focus, or null.
 * @param {Object} page
 * @returns {Promise<String|null>}
 */
function focusedItem(page) {
    return page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.textContent.trim() ?? null)
}

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector('#component-test-viewport', {state: 'attached'})
});

test.afterEach(async ({page}) => {
    if (menuId) {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), menuId);
        menuId = null
    }
});

test.describe('Neo.menu.List leaf-click cascade', () => {
    test('a leaf click takes every level down together, with no ancestor left standing', async ({page}) => {
        menuId = await createMenu(page);

        await openToLeaf(page);
        await recordLevelCounts(page);
        await page.getByText('Copy name', {exact: true}).click();
        await expect(page.locator('.neo-menu-list')).toHaveCount(0);

        // Three levels stand, then none. Any value in between is an ancestor that outlived the
        // submenu the click was in — exactly what the regression produced ([3, 2, 0]).
        expect(await levelCounts(page)).toEqual([3, 0])
    });

    test('hideOnLeafItemClick: false keeps every level open', async ({page}) => {
        menuId = await createMenu(page, {hideOnLeafItemClick: false});

        await openToLeaf(page);
        await recordLevelCounts(page);
        await page.getByText('Copy name', {exact: true}).click();

        // The policy gate governs the dismissal as a whole, so the tree never moves off three.
        await expect(page.locator('.neo-menu-list')).toHaveCount(3);
        expect(await levelCounts(page)).toEqual([3])
    })
});

test.describe('Neo.menu.List parent click', () => {
    test('without hover, a rest shows nothing, and a second click on a parent hides the submenu its first click showed', async ({page}) => {
        menuId = await createMenu(page, {showSubMenuOnHover: false});

        const
            inspect = page.getByText('Inspect', {exact: true}),
            menus   = page.locator('.neo-menu-list');

        await expect(menus).toHaveCount(1);
        await inspect.hover();

        // Absence cannot be polled for: outlast the default rest delay, then read
        await page.waitForTimeout(400);
        await expect(menus).toHaveCount(1);

        await inspect.click();
        await expect(menus).toHaveCount(2);

        await recordLevelCounts(page);
        await inspect.click();
        await expect(menus).toHaveCount(1);

        // A reopen after the hide would land later than the count poll above, so let one settle before reading
        await page.waitForTimeout(300);

        expect(await levelCounts(page)).toEqual([2, 1])
    })
});

test.describe('Neo.menu.List pointer rest', () => {
    /**
     * @summary Measures the named rows inside ONE page task.
     *
     * Two `boundingBox()` calls are two round-trips: they can straddle a change, and a row that leaves
     * between them answers `null` — which then surfaces as a property read on `null` two lines later
     * rather than as a statement about the menu. One task measures every row against one layout state, and
     * a row that is not there says so, with the menu count that explains it.
     * @param {Object} page
     * @param {String[]} texts
     * @returns {Promise<Object[]>} Per text, `{text, x, y, width, height}` or `{text, missing: true, menus}`
     */
    function measureRows(page, texts) {
        return page.evaluate(names => names.map(text => {
            const row = [...document.querySelectorAll('.neo-list-item')].find(item => item.textContent.trim() === text);

            if (!row) {
                return {text, missing: true, menus: document.querySelectorAll('.neo-menu-list').length}
            }

            const {height, width, x, y} = row.getBoundingClientRect();

            return {height, text, width, x, y}
        }), texts)
    }

    /**
     * @summary Moves the pointer from `Share` to the third submenu row in small steps, recording each row entered.
     * @param {Object} page
     * @returns {Promise<String[]>} The texts of the rows the pointer entered, in order
     */
    async function travelDiagonally(page) {
        const [share, print] = await measureRows(page, ['Share', 'Print']);

        [share, print].forEach(row => {
            expect(row.missing, `${row.text} is not in the DOM; ${row.menus} menu(s) present`).toBeUndefined()
        });

        await page.mouse.move(share.x + share.width / 2, share.y + share.height / 2);

        await page.evaluate(() => {
            window.__enteredRows = [];

            document.addEventListener('mouseover', ({target}) => {
                const text = target.closest?.('.neo-list-item')?.textContent.trim();

                text && window.__enteredRows.at(-1) !== text && window.__enteredRows.push(text)
            }, true)
        });

        await page.mouse.move(print.x + print.width / 2, print.y + print.height / 2, {steps: 20});

        return page.evaluate(() => window.__enteredRows)
    }

    test('resting on a parent previews its submenu without selecting it or moving focus', async ({page}) => {
        menuId = await createMenu(page, {items: restItems});

        const
            menus = page.locator('.neo-menu-list'),
            share = page.locator('.neo-list-item', {has: page.getByText('Share', {exact: true})});

        await expect(menus).toHaveCount(1);
        await expect.poll(() => page.evaluate(() => document.activeElement?.closest('.neo-menu-list')?.id)).toBe(menuId);

        const focused = await page.evaluate(() => document.activeElement.id);

        await share.hover();

        await expect(menus).toHaveCount(2);
        await expect(share).toHaveAttribute('aria-expanded', 'true');
        await expect(share).not.toHaveClass(/neo-selected/);
        expect(await page.evaluate(() => document.activeElement.id)).toBe(focused)
    });

    test('resting on a leaf hides the submenu showing for its sibling', async ({page}) => {
        menuId = await createMenu(page, {items: restItems});

        const menus = page.locator('.neo-menu-list');

        await page.getByText('Share', {exact: true}).hover();
        await expect(menus).toHaveCount(2);

        await page.getByText('Rename', {exact: true}).hover();
        await expect(menus).toHaveCount(1)
    });

    test('a diagonal path into the submenu keeps it showing, although it crosses a sibling', async ({page}) => {
        menuId = await createMenu(page, {items: restItems});

        const menus = page.locator('.neo-menu-list');

        await page.getByText('Share', {exact: true}).hover();
        await expect(menus).toHaveCount(2);

        // The witness that the path really crosses a sibling, without which staying open proves nothing
        expect(await travelDiagonally(page)).toContain('Rename');

        // A switch lands once the delay elapses, so outlast it before reading
        await page.waitForTimeout(400);
        await expect(menus).toHaveCount(2)
    });

    test('CONTROL: the same path closes the submenu when a rest counts on enter', async ({page}) => {
        menuId = await createMenu(page, {items: restItems, subMenuHoverDelay: 0});

        const menus = page.locator('.neo-menu-list');

        await page.getByText('Share', {exact: true}).hover();
        await expect(menus).toHaveCount(2);

        expect(await travelDiagonally(page)).toContain('Rename');
        await expect(menus).toHaveCount(1)
    });

    test('a click on the parent of a preview never closes it', async ({page}) => {
        menuId = await createMenu(page, {items: restItems});

        const
            menus = page.locator('.neo-menu-list'),
            share = page.getByText('Share', {exact: true});

        await share.hover();
        await expect(menus).toHaveCount(2);

        // Counted per removal, not per level count: a toggle's close and the selection's reopen land in one
        // worker task, and a count read once per mutation batch reads 2 on both sides of them
        await page.evaluate(() => {
            window.__menuRemovals = 0;

            new MutationObserver(records => records.forEach(({removedNodes}) => {
                removedNodes.forEach(node => {
                    node.classList?.contains('neo-menu-list') && window.__menuRemovals++
                })
            })).observe(document.body, {childList: true, subtree: true})
        });

        await share.click();

        // Outlast the rest delay before reading, so a late close is inside the window too
        await page.waitForTimeout(400);

        await expect(menus).toHaveCount(2);
        expect(await page.evaluate(() => window.__menuRemovals)).toBe(0)
    })
});

test.describe('Neo.menu.List focus rest', () => {
    /**
     * @summary A menu with two parents, so a hover and a keyboard rest can compete for different submenus.
     * @type {Object[]}
     */
    const twoParentItems = [{
        id   : 'share',
        items: [{id: 'email', text: 'Email'}, {id: 'link', text: 'Copy link'}],
        text : 'Share'
    }, {
        id  : 'rename',
        text: 'Rename'
    }, {
        id   : 'export',
        items: [{id: 'pdf', text: 'PDF'}, {id: 'csv', text: 'CSV'}],
        text : 'Export'
    }];

    /**
     * @summary Creates the menu and puts focus on `Rename`, from where one arrow key reaches either parent.
     *
     * Focus is placed with `.focus()` rather than by arrowing, so the arms measure what a MOVE does. Focus
     * arriving from outside the menu is not a move and deliberately shows nothing.
     * @param {Object} page
     * @param {Object} [config]
     * @returns {Promise<Object>} The menu levels locator
     */
    async function createMenuFocusedOnRename(page, config={}) {
        const menus = page.locator('.neo-menu-list');

        menuId = await createMenu(page, {items: restItems, ...config});

        await expect(menus).toHaveCount(1);
        await page.locator('.neo-menu-list .neo-list-item').nth(1).focus();
        await expect.poll(() => focusedItem(page)).toBe('Rename');

        return menus
    }

    test('arrowing onto a parent previews its submenu, and arrowing off it drops the preview', async ({page}) => {
        const
            menus = await createMenuFocusedOnRename(page),
            share = page.locator('.neo-list-item', {has: page.getByText('Share', {exact: true})});

        await page.keyboard.press('ArrowUp');
        await expect.poll(() => focusedItem(page)).toBe('Share');

        await expect(menus).toHaveCount(2);
        await expect(share).toHaveAttribute('aria-expanded', 'true');

        // A preview: the item that opened it keeps focus, and nothing is selected
        expect(await focusedItem(page)).toBe('Share');
        await expect(share).not.toHaveClass(/neo-selected/);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Rename');

        await expect(menus).toHaveCount(1);
        await expect(share).toHaveAttribute('aria-expanded', 'false')
    });

    test('CONTROL: Right into a previewed submenu keeps it open', async ({page}) => {
        const menus = await createMenuFocusedOnRename(page);

        await page.keyboard.press('ArrowUp');
        await expect(menus).toHaveCount(2);

        // Focus moves INTO the submenu: a rule that hides whenever focus leaves the parent would close
        // the level it just opened, and this is the only arm that can tell the two rules apart
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => focusedItem(page)).toBe('Email');

        await page.waitForTimeout(400);
        await expect(menus).toHaveCount(2)
    });

    test('the last rest wins, whichever input started it', async ({page}) => {
        const menus = page.locator('.neo-menu-list');

        menuId = await createMenu(page, {items: twoParentItems});

        await expect(menus).toHaveCount(1);
        await page.getByText('Share', {exact: true}).hover();
        await expect(menus).toHaveCount(2);
        await expect(page.getByText('Email', {exact: true})).toBeVisible();

        await page.locator('.neo-menu-list .neo-list-item').nth(1).focus();
        await expect.poll(() => focusedItem(page)).toBe('Rename');
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Export');

        // One submenu, and it belongs to the item the keyboard rested on last
        await expect(menus).toHaveCount(2);
        await expect(page.getByText('PDF', {exact: true})).toBeVisible();
        await expect(page.getByText('Email', {exact: true})).toHaveCount(0)
    });

    test('Right into a preview wins over a pointer rest still pending on another parent', async ({page}) => {
        const menus = page.locator('.neo-menu-list');

        menuId = await createMenu(page, {items: twoParentItems, subMenuHoverDelay: 1000});

        await expect(menus).toHaveCount(1);
        await page.locator('.neo-menu-list .neo-list-item').nth(1).focus();
        await expect.poll(() => focusedItem(page)).toBe('Rename');

        // A focus rest previews Export's submenu first, so Right below enters a submenu that is already showing
        await page.keyboard.press('ArrowDown');
        await expect(page.getByText('PDF', {exact: true})).toBeVisible();

        // The pointer comes to rest on the other parent; its rest is still pending when Right is pressed
        await page.getByText('Share', {exact: true}).hover();
        await page.keyboard.press('ArrowRight');
        await expect.poll(() => focusedItem(page)).toBe('PDF');

        await page.waitForTimeout(1300);
        await expect(page.getByText('PDF', {exact: true}), 'the submenu Right entered is still the one showing').toBeVisible();
        await expect(page.getByText('Email', {exact: true})).toHaveCount(0)
    });

    test('showSubMenuOnHover: false suppresses the focus rest as well', async ({page}) => {
        const menus = await createMenuFocusedOnRename(page, {showSubMenuOnHover: false});

        await page.keyboard.press('ArrowUp');
        await expect.poll(() => focusedItem(page)).toBe('Share');

        await page.waitForTimeout(400);
        await expect(menus).toHaveCount(1)
    })
});

test.describe('Neo.menu.List keyboard cascade', () => {
    /**
     * @summary Creates the menu and puts focus on its first item, `Open`.
     * @param {Object} page
     * @returns {Promise<Object>} The menu levels locator
     */
    async function createFocusedMenu(page) {
        const menus = page.locator('.neo-menu-list');

        menuId = await createMenu(page);

        await expect(menus).toHaveCount(1);
        await page.locator('.neo-menu-list .neo-list-item').first().focus();
        await expect.poll(() => focusedItem(page)).toBe('Open');

        return menus
    }

    test('a rest pending from arrowing onto a parent does not reopen what Right and Left closed', async ({page}) => {
        const menus = page.locator('.neo-menu-list');

        // A long rest delay makes the race deterministic: Right and Left finish long before the rest would fire
        menuId = await createMenu(page, {subMenuHoverDelay: 1000});

        await expect(menus).toHaveCount(1);
        await page.locator('.neo-menu-list .neo-list-item').first().focus();
        await expect.poll(() => focusedItem(page)).toBe('Open');

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        await page.keyboard.press('ArrowRight');
        await expect(menus).toHaveCount(2);

        await page.keyboard.press('ArrowLeft');
        await expect(menus).toHaveCount(1);

        // Outlast the pending rest: absence cannot be polled for
        await page.waitForTimeout(1300);
        await expect(menus).toHaveCount(1)
    });

    test('Right and Left walk two levels down and back up, with focus on the expected item at every step', async ({page}) => {
        const menus = await createFocusedMenu(page);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        await page.keyboard.press('ArrowRight');
        await expect(menus).toHaveCount(2);
        await expect.poll(() => focusedItem(page)).toBe('Details');

        await page.keyboard.press('ArrowRight');
        await expect(menus).toHaveCount(3);
        await expect.poll(() => focusedItem(page)).toBe('Copy name');

        await page.keyboard.press('ArrowLeft');
        await expect(menus).toHaveCount(2);
        await expect.poll(() => focusedItem(page)).toBe('Details');

        await page.keyboard.press('ArrowLeft');
        await expect(menus).toHaveCount(1);
        await expect.poll(() => focusedItem(page)).toBe('Inspect')
    });

    test('Right on a leaf and Left in the root show nothing', async ({page}) => {
        const menus = await createFocusedMenu(page);

        // `Open` is a leaf and the root has no parent to leave, so neither key has anywhere to go.
        // Down onto a parent DOES show its submenu — that is the focus rest, and its own describe measures it
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowLeft');

        // Absence cannot be polled for: outlast a show, then read
        await page.waitForTimeout(400);

        await expect(menus).toHaveCount(1);
        expect(await focusedItem(page)).toBe('Open')
    });

    test('Escape in a submenu hides only that level and focuses its parent item; in the root it dismisses', async ({page}) => {
        const menus = await createFocusedMenu(page);

        // Opened with Enter, not Right, so this arm witnesses Escape alone
        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Inspect');
        await page.keyboard.press('Enter');
        await expect(menus).toHaveCount(2);
        await expect.poll(() => focusedItem(page)).toBe('Details');

        await page.keyboard.press('Escape');
        await expect(menus).toHaveCount(1);
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        await page.keyboard.press('Escape');
        await expect(menus).toHaveCount(0)
    });

    test('Space on an embedded menu\'s item scrolls nothing', async ({page}) => {
        // Embedded, not floating: a fixed-position menu never reaches the page's scroller, so it cannot fail this
        menuId = await createMenu(page, {floating: false});
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // CONTROL: the page must be able to scroll, or an unscrolled page proves nothing. The harness pins `html`
        // to the viewport, so `body` becomes the scroller.
        const scrollable = await page.evaluate(() => {
            const {body} = document;

            body.style.height   = '100%';
            body.style.overflow = 'auto';
            document.getElementById('component-test-viewport').style.minHeight = '5000px';

            body.scrollTop = 10;

            const moved = body.scrollTop;

            body.scrollTop = 0;

            return moved
        });

        expect(scrollable).toBe(10);

        await page.locator('.neo-menu-list .neo-list-item').first().focus();
        await page.keyboard.press('Space');

        // A scroll lands within a frame or two; outlast it before reading
        await page.waitForTimeout(300);

        expect(await page.evaluate(() => document.body.scrollTop)).toBe(0)
    });

    test('Space on a parent enters its submenu, and Space on a leaf dismisses like Enter', async ({page}) => {
        const menus = await createFocusedMenu(page);

        await page.keyboard.press('ArrowDown');
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        await page.keyboard.press('Space');
        await expect(menus).toHaveCount(2);
        await expect.poll(() => focusedItem(page)).toBe('Details');

        await page.keyboard.press('Space');
        await expect(menus).toHaveCount(3);
        await expect.poll(() => focusedItem(page)).toBe('Copy name');

        await page.keyboard.press('Space');
        await expect(menus).toHaveCount(0)
    })
});

test.describe('Neo.menu.List focus across a reopen', () => {
    test('a menu shown again inside the focus gap stays open', async ({page}) => {
        menuId = await createMenu(page);
        await expect(page.locator('.neo-menu-list')).toHaveCount(1);

        // The delays span manager.Focus's 50 ms gap, so the leave the removal raised comes due while
        // the new mount stands
        for (const delay of [0, 15, 30, 45]) {
            await page.evaluate(async ({id, delay}) => {
                await Neo.worker.App.setConfigs({id, hidden: true});

                while (document.getElementById(id)) {
                    await new Promise(resolve => setTimeout(resolve, 1))
                }

                await new Promise(resolve => setTimeout(resolve, delay));
                await Neo.worker.App.setConfigs({id, hidden: false})
            }, {id: menuId, delay});

            // A dismissal cannot be polled for: the menu stands until the leave lands, so wait out the gap
            await page.waitForTimeout(300);

            expect(await page.evaluate(id => !!document.getElementById(id), menuId), `shown again ${delay} ms after removal`).toBe(true)
        }
    })
});

test.describe('Neo.menu.List focus when a level holding it closes', () => {
    /**
     * @summary Two parents, one of them two levels deep, so a rest can close the level holding focus from either depth.
     * @type {Object[]}
     */
    const branchItems = [{
        id  : 'open',
        text: 'Open'
    }, {
        id   : 'inspect',
        items: [{
            id   : 'details',
            items: [{id: 'copy-name', text: 'Copy name'}],
            text : 'Details'
        }, {
            id  : 'props',
            text: 'Properties'
        }],
        text: 'Inspect'
    }, {
        id   : 'export',
        items: [{id: 'pdf', text: 'PDF'}],
        text : 'Export'
    }];

    /**
     * @summary Creates the menu and walks keyboard focus `depth` levels down from `Inspect`.
     * @param {Object} page
     * @param {Number} depth 1 enters Inspect's submenu, 2 enters Details' submenu as well
     * @returns {Promise<Object>} The menu levels locator
     */
    async function focusIntoSubMenu(page, depth) {
        const menus = page.locator('.neo-menu-list');

        menuId = await createMenu(page, {items: branchItems});

        await expect(menus).toHaveCount(1);
        await page.locator('.neo-menu-list .neo-list-item').nth(1).focus();
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        for (const text of ['Details', 'Copy name'].slice(0, depth)) {
            await page.keyboard.press('ArrowRight');
            await expect.poll(() => focusedItem(page)).toBe(text)
        }

        return menus
    }

    test('a rest on a root leaf closes the submenu holding focus, and focus lands on the item that opened it', async ({page}) => {
        const menus = await focusIntoSubMenu(page, 1);

        await page.getByText('Open', {exact: true}).hover();
        await expect(menus).toHaveCount(1);
        await expect.poll(() => focusedItem(page)).toBe('Inspect');

        // Focus on the body would leave Escape nowhere to go
        await page.keyboard.press('Escape');
        await expect(menus).toHaveCount(0)
    });

    test('a rest on another root parent swaps the preview, and focus lands on the item whose submenu closed', async ({page}) => {
        await focusIntoSubMenu(page, 1);

        await page.getByText('Export', {exact: true}).hover();
        await expect(page.getByText('PDF', {exact: true})).toBeVisible();
        await expect.poll(() => focusedItem(page)).toBe('Inspect')
    });

    test('a rest on a leaf one level up closes the deepest level, and focus lands on its parent item', async ({page}) => {
        const menus = await focusIntoSubMenu(page, 2);

        await page.getByText('Properties', {exact: true}).hover();
        await expect(menus).toHaveCount(2);
        await expect.poll(() => focusedItem(page)).toBe('Details')
    })
});
