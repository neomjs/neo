import {test, expect} from '@playwright/test';

/**
 * @file test/playwright/component/list/NavigatorEventSource.spec.mjs
 * @summary A list whose navigator reads keys from another element subscribes only while that element is in the DOM.
 *
 * A picker list mounts on the document body, apart from the field input it takes keys from, so the list can mount
 * while the input is gone. `Neo.main.addon.Navigator#subscribe` must then neither subscribe nor throw, and the
 * list's later unmount must not throw either.
 */
const MISSING = 'navigator-event-source-missing',
      SOURCE  = 'component-test-viewport';

/**
 * @summary Creates a list in the component viewport whose navigator takes keys from `eventSource`, and waits for its
 * items.
 * @param {Object} page
 * @param {String} id
 * @param {String} eventSource
 */
async function createList(page, id, eventSource) {
    const result = await page.evaluate(([id, eventSource, parentId]) => Neo.worker.App.createNeoInstance({
        id, importPath: '../list/Base.mjs', ntype: 'list', parentId, height: 100, width: 200,
        navigator: {eventSource},
        store    : {
            ntype: 'store', keyProperty: 'id',
            model: {fields: [{name: 'id', type: 'String'}, {name: 'name', type: 'String'}]},
            data : [{id: 'a', name: 'Alpha'}, {id: 'b', name: 'Beta'}]
        }
    }), [id, eventSource, SOURCE]);

    expect(result.success).toBe(true);
    await expect(page.locator(`#${id} .neo-list-item`)).toHaveCount(2)
}

const hasNavigator = (page, id) => page.evaluate(id => document.getElementById(id)?.$navigator !== undefined, id);

test.beforeEach(async ({page}) => {
    await page.goto('test/playwright/component/apps/empty-viewport/index.html');
    await page.waitForSelector(`#${SOURCE}`)
});

test('a list whose eventSource is not in the DOM neither subscribes nor throws, mounting or unmounting', async ({page}) => {
    const errors = [];

    page.on('pageerror', error => errors.push(error.message));

    await createList(page, 'navigator-orphan-list', MISSING);
    // Main runs App-worker calls in order, so once the control's subscription lands, the orphan's has run
    await createList(page, 'navigator-control-list', SOURCE);
    await expect.poll(() => hasNavigator(page, 'navigator-control-list'), 'the control subscribes').toBe(true);

    expect(errors, 'mounting threw nothing').toEqual([]);
    expect(await hasNavigator(page, 'navigator-orphan-list'), 'no half-subscription').toBe(false);

    // Hiding unmounts the orphan, so it unsubscribes; a later control's subscription lands after that
    await page.evaluate(() => Neo.worker.App.setConfigs({id: 'navigator-orphan-list', hidden: true}));
    await createList(page, 'navigator-second-control-list', SOURCE);
    await expect.poll(() => hasNavigator(page, 'navigator-second-control-list'), 'the second control subscribes').toBe(true);

    expect(errors, 'unmounting threw nothing').toEqual([])
});
