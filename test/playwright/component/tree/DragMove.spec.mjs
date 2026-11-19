import {test, expect} from '@playwright/test';

/**
 * @summary A tree list's items move by real pointer drags: into a folder, between two items, never into their own
 * subtree, and `draggable: true` still drags an item out.
 *
 * `Neo.draggable.tree.SortZone` reads its slot from the main thread's hit test, which only a real pointer produces:
 * a dispatched event carries no `targetPath`. Every arm reads the rendered tree, which the list builds from the
 * store's `parentId` links, so the DOM shows where a record went.
 *
 *     docs (open)    a, b, sub (open) > c
 *     music (closed) d
 *     e
 *
 * Run: npx playwright test component/tree/DragMove -c test/playwright/playwright.config.component.mjs --workers=1
 */

const
    TREE_ID = 'tree-drag-move',
    item    = key => `#${TREE_ID}__${key}`,
    DATA    = [
        {id: 'docs',  name: 'docs',  parentId: null,    isLeaf: false, collapsed: false},
        {id: 'a',     name: 'a.txt', parentId: 'docs',  isLeaf: true},
        {id: 'b',     name: 'b.txt', parentId: 'docs',  isLeaf: true},
        {id: 'sub',   name: 'sub',   parentId: 'docs',  isLeaf: false, collapsed: false},
        {id: 'c',     name: 'c.txt', parentId: 'sub',   isLeaf: true},
        {id: 'music', name: 'music', parentId: null,    isLeaf: false, collapsed: true},
        {id: 'd',     name: 'd.mp3', parentId: 'music', isLeaf: true},
        {id: 'e',     name: 'e.txt', parentId: null,    isLeaf: true}
    ];

/**
 * @param {Object} page
 * @param {Object} config `dragResortable: true` or `draggable: true`
 * @returns {Promise<void>}
 */
async function createTree(page, config) {
    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
        height                    : 420,
        id                        : TREE_ID,
        importPath                : '../tree/List.mjs',
        ntype                     : 'treelist',
        parentId                  : 'component-test-viewport',
        showCollapseExpandAllIcons: false,
        store: {
            model: {
                fields: [
                    {name: 'id',        type: 'String'},
                    {name: 'name',      type: 'String'},
                    {name: 'parentId',  type: 'String'},
                    {name: 'isLeaf',    type: 'Boolean'},
                    {name: 'collapsed', type: 'Boolean'}
                ]
            },
            data: DATA
        },
        width: 320,
        ...config
    });

    if (!result.success) {
        throw new Error(`Tree creation failed: ${result.error.message}`)
    }

    // The zone loads on demand, then marks the items a drag can start on
    await page.waitForSelector(`${item('a')}.neo-draggable`)
}

/**
 * The keys of the items the tree shows directly inside a folder, or at its root
 * @param {Object}      page
 * @param {String|null} parentKey
 * @returns {Promise<String[]|null>} null for a closed folder, which renders no list
 */
const shown = (page, parentKey) => page.evaluate(({parentId, treeId}) => {
    let list = parentId
        ? document.getElementById(`${treeId}__${parentId}`).nextElementSibling
        : document.querySelector(`#${treeId} .neo-list-container`);

    if (list?.tagName !== 'UL') {
        return null
    }

    return [...list.children].filter(node => node.tagName === 'LI').map(node => node.id.split('__')[1])
}, {parentId: parentKey, treeId: TREE_ID});

/**
 * Presses on an item and moves the pointer over another one, without releasing
 * @param {Object} page
 * @param {String} from
 * @param {String} to
 * @param {Number} at The pointer's height inside the target, as a share of the item's height
 * @returns {Promise<void>}
 */
async function dragOver(page, from, to, at) {
    const
        source = await page.locator(item(from)).boundingBox(),
        target = await page.locator(item(to)).boundingBox(),
        startX = source.x + source.width / 2,
        startY = source.y + source.height / 2;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    // Stepped past the start distance: one jump can coalesce into a single event below it
    await page.mouse.move(startX + 8, startY + 8, {steps: 6});
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * at, {steps: 12})
}

/**
 * Releases the pointer and waits for the proxy to land
 * @param {Object} page
 * @returns {Promise<void>}
 */
async function drop(page) {
    await page.mouse.up();
    await expect(page.locator('.neo-dragproxy')).toHaveCount(0, {timeout: 5000})
}

test.describe('Neo.draggable.tree.SortZone — items move by drag', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        // A live pointer capture outlives the instance and would arm the next spec's first press
        await page.mouse.up().catch(() => {});
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), TREE_ID).catch(() => {});
        await page.waitForSelector(`#${TREE_ID}`, {state: 'detached'}).catch(() => {})
    });

    test('AC-1: a leaf dropped on a folder moves into it, open or closed', async ({page}) => {
        await createTree(page, {dragResortable: true});

        await dragOver(page, 'a', 'sub', .5);
        await expect(page.locator(item('sub')), 'the folder shows it takes the item in').toHaveClass(/neo-drop-inside/);
        await expect(page.locator(item('a')),   'the source stays in place, dimmed').toHaveClass(/neo-sort-source/);

        // The proxy hangs below the pointer, clear of the folder's label and outline
        const proxy  = await page.locator('.neo-dragproxy').boundingBox(),
              folder = await page.locator(item('sub')).boundingBox();

        expect(proxy.y, 'the proxy covers no part of the folder it would drop into').toBeGreaterThanOrEqual(folder.y + folder.height);
        await drop(page);

        await expect.poll(() => shown(page, 'sub')).toEqual(['c', 'a']);
        expect(await shown(page, 'docs')).toEqual(['b', 'sub']);
        await expect(page.locator(`#${TREE_ID} [class*="neo-drop-"], #${TREE_ID} .neo-sort-source`)).toHaveCount(0);

        await dragOver(page, 'e', 'music', .5);
        await drop(page);

        await expect.poll(() => shown(page, null)).toEqual(['docs', 'music']);
        expect(await shown(page, 'music'), 'the closed folder stays closed').toBe(null);

        await page.locator(item('music')).click();
        await expect.poll(() => shown(page, 'music')).toEqual(['d', 'e'])
    });

    test('AC-2: a leaf dropped on an item\'s upper or lower half lands before or after it', async ({page}) => {
        await createTree(page, {dragResortable: true});

        await dragOver(page, 'e', 'b', .25);
        await expect(page.locator(item('b'))).toHaveClass(/neo-drop-before/);
        await drop(page);

        await expect.poll(() => shown(page, 'docs')).toEqual(['a', 'e', 'b', 'sub']);
        expect(await shown(page, null)).toEqual(['docs', 'music']);

        await dragOver(page, 'a', 'b', .75);
        await expect(page.locator(item('b'))).toHaveClass(/neo-drop-after/);
        await drop(page);

        await expect.poll(() => shown(page, 'docs')).toEqual(['e', 'b', 'a', 'sub'])
    });

    test('AC-3: a folder dragged onto its own descendant is refused, and the tree is unchanged', async ({page}) => {
        await createTree(page, {dragResortable: true});

        await dragOver(page, 'docs', 'c', .5);
        await expect(page.locator(item('docs')), 'the drag runs').toHaveClass(/neo-sort-source/);
        await expect(page.locator(`#${TREE_ID} [class*="neo-drop-"]`), 'no slot over the own subtree').toHaveCount(0);
        await drop(page);

        expect(await shown(page, null)).toEqual(['docs', 'music', 'e']);
        expect(await shown(page, 'docs')).toEqual(['a', 'b', 'sub']);
        expect(await shown(page, 'sub')).toEqual(['c'])
    });

    test('a folder moves with its subtree', async ({page}) => {
        await createTree(page, {dragResortable: true});

        await dragOver(page, 'sub', 'e', .25);
        await drop(page);

        await expect.poll(() => shown(page, null)).toEqual(['docs', 'music', 'sub', 'e']);
        expect(await shown(page, 'sub')).toEqual(['c']);
        expect(await shown(page, 'docs')).toEqual(['a', 'b'])
    });

    test('AC-4: draggable: true still drags an item out of the tree', async ({page}) => {
        await createTree(page, {draggable: true});

        const
            source = await page.locator(item('a')).boundingBox(),
            startX = source.x + source.width / 2,
            startY = source.y + source.height / 2;

        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(startX + 140, startY + 40, {steps: 12});

        await expect(page.locator('.neo-dragproxy'), 'the gesture produces one live proxy').toHaveCount(1, {timeout: 5000});
        await drop(page);

        expect(await shown(page, 'docs'), 'a drag-out moves nothing').toEqual(['a', 'b', 'sub'])
    })
});
