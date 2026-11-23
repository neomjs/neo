import {test, expect} from '@playwright/test';

/**
 * @summary `Neo.list.plugin.ItemEditing` renames list and tree items in place, from real keys and pointers.
 *
 * F2 and a double-click open the editor, Enter and leaving the field write the record, Escape and an invalid value
 * leave it unchanged, and focus returns to the item. Every arm reads the rendered list, which shows the record.
 *
 * Run: npx playwright test component/list/ItemEditing -c test/playwright/playwright.config.component.mjs --workers=1
 */

const
    ID     = 'list-item-editing',
    EDITOR = `#${ID} .neo-list-item-editor input`,
    FIELDS = [
        {name: 'id',        type: 'String'},
        {name: 'name',      type: 'String'},
        {name: 'parentId',  type: 'String'},
        {name: 'isLeaf',    type: 'Boolean'},
        {name: 'collapsed', type: 'Boolean'}
    ];

/**
 * @param {Object}  page
 * @param {Object}  config
 * @param {Boolean} [withPlugin=true]
 * @returns {Promise<void>}
 */
async function create(page, config, withPlugin=true) {
    await page.evaluate(() => Neo.worker.App.loadModule({path: '../list/plugin/ItemEditing.mjs'}));

    const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
        displayField: 'name',
        height      : 320,
        id          : ID,
        parentId    : 'component-test-viewport',
        width       : 320,
        ...(withPlugin ? {plugins: [{ntype: 'plugin-list-item-editing', ...config.plugin}]} : {}),
        ...config,
        plugin      : undefined
    });

    expect(result.success, result.error?.message).toBe(true);
    await page.waitForSelector(`#${ID} .neo-list-item`)
}

/**
 * @param {Object} page
 * @returns {Promise<Object>} config for a plain list
 */
const list = (page, plugin, withPlugin) => create(page, {
    importPath: '../list/Base.mjs',
    ntype     : 'list',
    plugin,
    store     : {
        model: {fields: FIELDS.slice(0, 2)},
        data : [{id: 'a', name: 'a.txt'}, {id: 'b', name: 'b.txt'}, {id: 'c', name: 'c.txt'}]
    }
}, withPlugin);

const
    item     = (page, text) => page.locator(`#${ID} .neo-list-item`).filter({hasText: new RegExp(`^${text}$`)}),
    texts    = page => page.locator(`#${ID} .neo-list-item`).allInnerTexts(),
    focusedText = page => page.evaluate(() => document.activeElement?.closest('.neo-list-item')?.innerText ?? null),
    /*
     * The editor opens focused with its whole text selected. A key the page receives before the worker's queued
     * selection lands edits the old name instead of replacing it, so the arms wait for the selection before the first
     * editing key.
     */
    editorReady = page => expect.poll(() => page.evaluate(selector => {
        const input = document.querySelector(selector);

        return !!input && document.activeElement === input && input.selectionStart === 0 && input.selectionEnd === input.value.length
    }, EDITOR), 'the editor opens with its whole text selected').toBe(true);

test.describe('Neo.list.plugin.ItemEditing — items are renamed in place', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test.afterEach(async ({page}) => {
        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), ID).catch(() => {});
        await page.waitForSelector(`#${ID}`, {state: 'detached'}).catch(() => {})
    });

    test('AC-1, AC-2: F2 opens the editor with the text, and Enter writes it', async ({page}) => {
        await list(page);

        await item(page, 'b.txt').click();
        await page.keyboard.press('F2');

        await expect(page.locator(EDITOR)).toBeFocused();
        await expect(page.locator(EDITOR)).toHaveValue('b.txt');

        await editorReady(page);
        await page.keyboard.type('renamed.txt');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => texts(page)).toEqual(['a.txt', 'renamed.txt', 'c.txt']);
        await expect.poll(() => focusedText(page), 'focus is back on the item').toBe('renamed.txt')
    });

    test('AC-1, AC-2: a double-click opens the editor, and leaving the field writes it', async ({page}) => {
        await list(page);

        await item(page, 'c.txt').dblclick();
        await expect(page.locator(EDITOR)).toBeFocused();

        await editorReady(page);
        await page.keyboard.type('moved.txt');
        await item(page, 'a.txt').click();

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => texts(page)).toEqual(['a.txt', 'b.txt', 'moved.txt'])
    });

    test('AC-2: Escape leaves the record unchanged, and focus returns to the item', async ({page}) => {
        await list(page);

        await item(page, 'a.txt').click();
        await page.keyboard.press('F2');
        await expect(page.locator(EDITOR)).toBeFocused();

        // Inside the field the keys edit text: the list's navigation pauses
        await editorReady(page);
        await page.keyboard.type('draft');
        await page.keyboard.press('Home');
        await page.keyboard.press('ArrowDown');
        await expect(page.locator(EDITOR)).toBeFocused();

        await page.keyboard.press('Escape');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => texts(page)).toEqual(['a.txt', 'b.txt', 'c.txt']);
        await expect.poll(() => focusedText(page)).toBe('a.txt')
    });

    test('AC-3: an invalid name keeps the old text and the editor open', async ({page}) => {
        await list(page, {editor: {required: true}});

        await item(page, 'b.txt').click();
        await page.keyboard.press('F2');
        await expect(page.locator(EDITOR)).toBeFocused();

        await editorReady(page);
        await page.keyboard.press('Backspace');
        await page.keyboard.press('Enter');

        await expect(page.locator(EDITOR), 'the veto keeps the edit open').toHaveCount(1);
        await expect(page.locator(EDITOR)).toBeFocused();

        await page.keyboard.press('Escape');

        await expect(page.locator(EDITOR)).toHaveCount(0);
        await expect.poll(() => texts(page)).toEqual(['a.txt', 'b.txt', 'c.txt']);
        await expect.poll(() => focusedText(page)).toBe('b.txt')
    });

    test('AC-4: a tree renames a leaf and a folder', async ({page}) => {
        await create(page, {
            importPath                : '../tree/List.mjs',
            ntype                     : 'treelist',
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {fields: FIELDS},
                data : [
                    {id: 'docs', name: 'docs',  parentId: null,   isLeaf: false, collapsed: false},
                    {id: 'a',    name: 'a.txt', parentId: 'docs', isLeaf: true}
                ]
            }
        });

        await item(page, 'a.txt').click();
        await page.keyboard.press('F2');
        await expect(page.locator(EDITOR)).toHaveValue('a.txt');
        await editorReady(page);
        await page.keyboard.type('notes.txt');
        await page.keyboard.press('Enter');

        await expect.poll(() => texts(page)).toEqual(['docs', 'notes.txt']);

        await item(page, 'docs').dblclick();
        await expect(page.locator(EDITOR)).toHaveValue('docs');
        await editorReady(page);
        await page.keyboard.type('papers');
        await page.keyboard.press('Enter');

        await expect.poll(() => texts(page)).toEqual(['papers', 'notes.txt'])
    });

    test('a click inside the field leaves a tree folder open and the edit running', async ({page}) => {
        await create(page, {
            importPath                : '../tree/List.mjs',
            ntype                     : 'treelist',
            showCollapseExpandAllIcons: false,
            store                     : {
                model: {fields: FIELDS},
                data : [
                    {id: 'docs', name: 'docs',  parentId: null,   isLeaf: false, collapsed: false},
                    {id: 'a',    name: 'a.txt', parentId: 'docs', isLeaf: true}
                ]
            }
        });

        await item(page, 'docs').dblclick();
        await expect(page.locator(EDITOR)).toBeFocused();

        // A list item click would toggle the folder: the press places the caret instead
        await page.locator(EDITOR).click();
        await page.locator(EDITOR).dblclick();

        await expect(page.locator(EDITOR), 'the edit stays open').toBeFocused();
        await expect(page.locator(`#${ID}__docs`), 'the folder stays open').toHaveClass(/neo-folder-open/);
        await expect(item(page, 'a.txt'), 'its child stays in view').toBeVisible();

        await page.keyboard.press('Escape');
        await expect.poll(() => texts(page)).toEqual(['docs', 'a.txt'])
    });

    test('AC-4: a list without the plugin opens no editor', async ({page}) => {
        await list(page, undefined, false);

        await item(page, 'b.txt').click();
        await page.keyboard.press('F2');
        await item(page, 'c.txt').dblclick();

        await expect(page.locator(`#${ID} .neo-list-item-editor`)).toHaveCount(0);
        expect(await texts(page)).toEqual(['a.txt', 'b.txt', 'c.txt'])
    })
});
