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
     * @summary A parent over three siblings, whose submenu has three rows.
     *
     * The shape the diagonal arm needs: the submenu aligns to its parent's top, so the path from `Share` to the
     * third submenu row descends while still inside the root menu, across `Rename`.
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
     * @summary Moves the pointer from `Share` to the third submenu row in small steps, recording each row entered.
     * @param {Object} page
     * @returns {Promise<String[]>} The texts of the rows the pointer entered, in order
     */
    async function travelDiagonally(page) {
        const
            share = await page.getByText('Share', {exact: true}).boundingBox(),
            print = await page.getByText('Print', {exact: true}).boundingBox();

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
