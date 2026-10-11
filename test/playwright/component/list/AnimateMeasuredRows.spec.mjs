import {test, expect} from '@playwright/test';

/**
 * @summary A measured animated list is a grid of equal items, and its row still follows the content.
 *
 * `Neo.list.plugin.Animate` in its measured mode takes the tallest item as the row height and writes
 * that height into every item. An item that carries an inline height answers a plain rect read with
 * that height, never with its content's, so the plugin measures through
 * `Neo.main.DomAccess.getNaturalRect()` — inline height released for the read, restored after it.
 * Only a real DOM can tell those two reads apart; every number here is a real measurement.
 */

const LIST_ID  = 'animate-measured-list',
      STORE_ID = 'animate-measured-store',
      short    = [{id: 1, name: 'one'}, {id: 2, name: 'one'},                 {id: 3, name: 'one'}],
      mixed    = [{id: 1, name: 'one'}, {id: 2, name: 'one<br>two<br>three'}, {id: 3, name: 'one'}];

/**
 * @param {Object} page
 * @returns {Promise<Object[]>} Per rendered item: the height it paints, the one it carries inline, the one its content asks for
 */
const readItems = page => page.evaluate(listId => {
    const nodes = [...document.querySelectorAll(`#${listId} .neo-list-item`)];

    return nodes.map(node => ({
        hidden : node.style.visibility === 'hidden',
        inline : node.style.height,
        natural: Neo.main.DomAccess.getNaturalRect({id: node.id}).height,
        painted: node.getBoundingClientRect().height
    }))
}, LIST_ID);

/**
 * @param {Object} page
 * @param {Object[]} data
 */
const loadData = async (page, data) => {
    const result = await page.evaluate(configs => Neo.worker.App.setConfigs(configs), {id: STORE_ID, data});

    expect(result.success, 'the store took the data').toBe(true)
};

test.describe('Neo.list.plugin.Animate measured rows', () => {
    test.beforeEach(async ({page}) => {
        await page.goto('/test/playwright/component/apps/empty-viewport/index.html');
        await page.waitForSelector('#component-test-viewport', {state: 'attached'})
    });

    test('getNaturalRect answers the content box and leaves the inline value and its priority as they were', async ({page}) => {
        const result = await page.evaluate(() => {
            const probe = document.createElement('div');

            probe.id          = 'natural-rect-probe';
            probe.textContent = 'one line';
            probe.style.setProperty('height', '200px', 'important');
            probe.style.position = 'fixed';                 // out of the body's flex flow, so 300px is 300px
            probe.style.width    = '300px';

            document.body.appendChild(probe);

            const {DomAccess} = Neo.main,
                  written     = DomAccess.getBoundingClientRect({id: probe.id}).height,
                  natural     = DomAccess.getNaturalRect({id: probe.id}),
                  both        = DomAccess.getNaturalRect({id: [probe.id, 'no-such-node'], properties: ['height', 'width']});

            const state = {
                both,
                natural,
                priority: probe.style.getPropertyPriority('height'),
                restored: probe.style.getPropertyValue('height'),
                width   : probe.style.width,
                written
            };

            probe.remove();

            return state
        });

        expect(result.written, 'a plain rect read answers the written height').toBe(200);
        expect(result.natural.height, 'the natural read answers the content').toBeGreaterThan(0);
        expect(result.natural.height).toBeLessThan(100);
        expect(result.natural.width, 'only the named properties are released').toBe(300);

        expect(result.both).toHaveLength(2);
        expect(result.both[0].width, 'width released too: a fixed box shrinks to its text').toBeLessThan(300);
        expect(result.both[1], 'a node that is not in the DOM').toEqual({});

        expect(result.restored).toBe('200px');
        expect(result.priority).toBe('important');
        expect(result.width).toBe('300px')
    });

    test('every item takes the tallest height, and the row shrinks and grows again with the content', async ({page}) => {
        const result = await page.evaluate(config => Neo.worker.App.createNeoInstance(config), {
            animate            : true,
            displayField       : 'name',
            height             : 400,
            id                 : LIST_ID,
            importPath         : '../list/Base.mjs',
            itemHeight         : null,
            itemWidth          : 200,
            ntype              : 'list',
            parentId           : 'component-test-viewport',
            pluginAnimateConfig: {measureItemHeight: true},
            // an `html` field keeps its markup, a `string` one is stripped of it — the line breaks are the content
            store: {data: mixed, id: STORE_ID, keyProperty: 'id', model: {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'html'}]}},
            width: 700
        });

        expect(result.success, result.error?.message).toBe(true);

        // settled: every item carries one inline height and none is hidden any more
        const settled = async () => {
            const items = await readItems(page);

            return items.length === 3 && items.every(item => item.inline && !item.hidden) ? new Set(items.map(item => item.inline)).size : 0
        };

        await expect.poll(settled, 'three revealed items, one height').toBe(1);

        let items = await readItems(page);

        const tall = Math.ceil(items[1].natural);

        expect(items[1].natural, 'three lines ask for more than one').toBeGreaterThan(items[0].natural);
        items.forEach(item => expect(item.painted, 'every item is as tall as the tallest one').toBe(tall));

        // the tall record leaves: a plain rect read would answer `tall` for every item, forever
        await loadData(page, short);
        await expect.poll(async () => (await readItems(page)).map(item => item.painted), 'the row shrank').toEqual(Array(3).fill(Math.ceil(items[0].natural)));

        // and it comes back
        await loadData(page, mixed);
        await expect.poll(async () => (await readItems(page)).map(item => item.painted), 'the row grew again').toEqual(Array(3).fill(tall));

        await page.evaluate(id => Neo.worker.App.destroyNeoInstance(id), LIST_ID)
    })
});
