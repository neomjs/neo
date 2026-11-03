import {expect, test} from '../../fixtures.mjs';

const ctrlClick = locator => locator.evaluate(el => {
    el.dispatchEvent(new MouseEvent('click', {
        bubbles   : true,
        cancelable: true,
        ctrlKey   : true,
        view      : window
    }))
});

/**
 * @summary Browser witness for `Neo.selection.grid.RowModel` and `Neo.selection.table.RowModel` modifier-click events.
 *
 * By default (`modifierClickEvents: false`), modifier-clicks on a grid or table row toggle row selection and fire
 * `select` / `deselect`. When `modifierClickEvents: true` is enabled on the row selection model, modifier-clicks
 * fire `ctrlSelect` / `shiftSelect` with `{data, record}` on the view and leave row selection unchanged, while an
 * unmodified click still selects the row.
 */
test.describe('RowModel modifierClickEvents in Grid and Table (#5102)', () => {
    test.setTimeout(90000);
    test.use({viewport: {width: 1920, height: 1080}});

    test('Grid RowModel: modifierClickEvents=false selects on modifier-click; modifierClickEvents=true fires ctrlSelect/shiftSelect without selecting', async ({page}) => {
        await page.goto('/examples/grid/lockedColumns/index.html');
        await page.waitForSelector('.neo-grid-body .neo-grid-row', {state: 'visible', timeout: 30000});

        const setupScript = `
            const grid  = Neo.manager.Component.find({ntype: 'grid-container'})[0],
                  view  = grid.view,
                  model = view.selectionModel;

            view.modifierTestLog = [];

            ['altSelect', 'ctrlSelect', 'metaSelect', 'shiftSelect', 'select', 'deselect'].forEach(eventName => {
                view.on(eventName, payload => view.modifierTestLog.push({
                    eventName,
                    ctrlKey : Boolean(payload.data?.ctrlKey),
                    shiftKey: Boolean(payload.data?.shiftKey),
                    hasData : Boolean(payload.data),
                    recordId: String(view.getRecordId(payload.record))
                }));
            });

            view.selectionModelId = model.id;
        `;

        const {success} = await page.evaluate(code => Neo.worker.App.loadModule({
            path: `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
        }), setupScript);

        expect(success, 'App Worker test probe loaded').toBe(true);

        const viewId             = await page.locator('.neo-grid-view').first().getAttribute('id'),
              [selectionModelId] = await page.evaluate(id => Neo.worker.App.getConfigs({
                  id,
                  keys: ['selectionModelId']
              }), viewId),
              row      = page.locator('.neo-grid-body .neo-grid-row').first(),
              recordId = await row.getAttribute('data-record-id');

        expect(selectionModelId).toBeTruthy();
        expect(recordId).toBeTruthy();

        const readLog = async () => (await page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: ['modifierTestLog']
        }), viewId))[0];

        const clearLog = () => page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            modifierTestLog: []
        }), viewId);

        // 1. Default (modifierClickEvents: false): ctrl-click selects the row and fires 'select'
        await ctrlClick(row);
        await expect(row).toHaveClass(/neo-selected/);
        await expect.poll(readLog).toEqual([{
            eventName: 'select',
            ctrlKey  : false,
            shiftKey : false,
            hasData  : false,
            recordId
        }]);

        // Second modifier-click (native pointer Shift-click) with modifierClickEvents: false deselects the row
        await clearLog();
        await row.click({modifiers: ['Shift']});
        await expect(row).not.toHaveClass(/neo-selected/);
        await expect.poll(readLog).toEqual([{
            eventName: 'deselect',
            ctrlKey  : false,
            shiftKey : false,
            hasData  : false,
            recordId
        }]);

        // 2. Opt-in (modifierClickEvents: true): ctrl-click fires 'ctrlSelect' with {data, record} and leaves row unselected
        await clearLog();
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            modifierClickEvents: true
        }), selectionModelId);

        await ctrlClick(row);
        await expect.poll(readLog).toEqual([{
            eventName: 'ctrlSelect',
            ctrlKey  : true,
            shiftKey : false,
            hasData  : true,
            recordId
        }]);
        await expect(row).not.toHaveClass(/neo-selected/);

        // Native pointer Shift-click also fires 'shiftSelect' and leaves row unselected
        await clearLog();
        await row.click({modifiers: ['Shift']});
        await expect.poll(readLog).toEqual([{
            eventName: 'shiftSelect',
            ctrlKey  : false,
            shiftKey : true,
            hasData  : true,
            recordId
        }]);
        await expect(row).not.toHaveClass(/neo-selected/);

        // 3. Plain click with modifierClickEvents: true still selects the row and fires 'select'
        await clearLog();
        await row.click();
        await expect(row).toHaveClass(/neo-selected/);
        await expect.poll(readLog).toEqual([{
            eventName: 'select',
            ctrlKey  : false,
            shiftKey : false,
            hasData  : false,
            recordId
        }]);
    });

    test('Table RowModel: modifierClickEvents=false selects on modifier-click; modifierClickEvents=true fires ctrlSelect/shiftSelect without selecting', async ({page}) => {
        await page.goto('/examples/table/container/index.html');
        await page.waitForSelector('.neo-table-row', {state: 'visible', timeout: 30000});

        const attachScript = `
            const table = Neo.getComponent('myTableStoreContainer'),
                  view  = table.body;

            view.selectionModel = Neo.selection.table.RowModel;

            const model = view.selectionModel;
            view.modifierTestLog = [];

            ['altSelect', 'ctrlSelect', 'metaSelect', 'shiftSelect', 'select', 'deselect'].forEach(eventName => {
                view.on(eventName, payload => view.modifierTestLog.push({
                    eventName,
                    ctrlKey : Boolean(payload.data?.ctrlKey),
                    shiftKey: Boolean(payload.data?.shiftKey),
                    hasData : Boolean(payload.data),
                    githubId: payload.record?.githubId ?? null
                }));
            });

            view.selectionModelId    = model.id;
            view.selectionModelNtype = model.ntype;
        `;

        const {success} = await page.evaluate(code => Neo.worker.App.loadModule({
            path: `data:text/javascript;charset=utf-8,${encodeURIComponent(code)}`
        }), attachScript);

        expect(success, 'App Worker table probe loaded').toBe(true);

        const viewId                                  = await page.locator('.neo-table-body').first().getAttribute('id'),
              [selectionModelId, selectionModelNtype] = await page.evaluate(id => Neo.worker.App.getConfigs({
                  id,
                  keys: ['selectionModelId', 'selectionModelNtype']
              }), viewId),
              row  = page.locator('.neo-table-body .neo-table-row').first(),
              cell = row.locator('.neo-table-cell').first();

        expect(selectionModelNtype).toBe('selection-table-rowmodel');
        expect(selectionModelId).toBeTruthy();

        const readLog = async () => (await page.evaluate(id => Neo.worker.App.getConfigs({
            id,
            keys: ['modifierTestLog']
        }), viewId))[0];

        const clearLog = () => page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            modifierTestLog: []
        }), viewId);

        // 1. Default (modifierClickEvents: false): ctrl-click selects the row and fires 'select'
        await ctrlClick(cell);
        await expect(row).toHaveClass(/neo-selected/);
        await expect.poll(async () => (await readLog())?.[0]?.eventName).toBe('select');

        await clearLog();
        await cell.click({modifiers: ['Shift']});
        await expect(row).not.toHaveClass(/neo-selected/);
        await expect.poll(async () => (await readLog())?.[0]?.eventName).toBe('deselect');

        // 2. Opt-in (modifierClickEvents: true): ctrl-click fires 'ctrlSelect' and leaves row unselected
        await clearLog();
        await page.evaluate(id => Neo.worker.App.setConfigs({
            id,
            modifierClickEvents: true
        }), selectionModelId);

        await ctrlClick(cell);
        await expect.poll(readLog).toEqual([{
            eventName: 'ctrlSelect',
            ctrlKey  : true,
            shiftKey : false,
            hasData  : true,
            githubId : 'tobiu'
        }]);
        await expect(row).not.toHaveClass(/neo-selected/);

        // Native pointer Shift-click fires 'shiftSelect' and leaves row unselected
        await clearLog();
        await cell.click({modifiers: ['Shift']});
        await expect.poll(readLog).toEqual([{
            eventName: 'shiftSelect',
            ctrlKey  : false,
            shiftKey : true,
            hasData  : true,
            githubId : 'tobiu'
        }]);
        await expect(row).not.toHaveClass(/neo-selected/);

        // 3. Plain click with modifierClickEvents: true still selects the row and fires 'select'
        await clearLog();
        await cell.click();
        await expect(row).toHaveClass(/neo-selected/);
        await expect.poll(readLog).toEqual([
            {
                eventName: 'select',
                ctrlKey  : false,
                shiftKey : false,
                hasData  : false,
                githubId : null
            },
            {
                eventName: 'select',
                ctrlKey  : false,
                shiftKey : false,
                hasData  : false,
                githubId : 'tobiu'
            }
        ]);
    });
});
