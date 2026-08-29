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

test.describe('Neo.menu.List leaf-click cascade', () => {
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
