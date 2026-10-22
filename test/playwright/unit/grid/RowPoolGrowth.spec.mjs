/**
 * @file test/playwright/unit/grid/RowPoolGrowth.spec.mjs
 * @summary A growing row pool never creates a row whose id is registered.
 *
 * Row ids are pool slots (`${bodyId}__row-${slot}`), and a row registers its id the moment it is created. So every
 * registered row id must belong to the row in that slot of `body.items`, across a shrink, a regrowth while scrolled,
 * and a growth larger than the engine accepts as call arguments.
 *
 * @see Neo.grid.Body#createRowPool
 */

import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridRowPoolGrowthTest',
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceManager from '../../../../src/manager/Instance.mjs';
import GridContainer   from '../../../../src/grid/Container.mjs';
import Store           from '../../../../src/data/Store.mjs';
import                      '../../../../src/vdom/Helper.mjs';
import                      '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/**
 * V8 refuses a call with more arguments than its stack holds (measured in Node: 100,000 pass, 125,000 throw), and
 * throws before the callee runs. This array refuses the same way at a size a unit test can reach.
 */
class ArgumentLimitedArray extends Array {
    static limit = 16

    push(...items) {
        if (items.length > ArgumentLimitedArray.limit) {
            throw new RangeError('Maximum call stack size exceeded')
        }

        return super.push(...items)
    }
}

test.describe('Grid row pool growth', () => {
    const rowHeight = 40;

    let duplicateIds, grid, logError, store;

    /**
     * @returns {String[]} The ids of every registered row of the body
     */
    const registeredRowIds = () => InstanceManager.items
        .map(instance => instance.id)
        .filter(id => id.startsWith(`${grid.body.id}__row-`));

    /**
     * A viewport change while the body updates is deferred to its next update: wait for the pool it asks for.
     * @param {Number} availableHeight
     */
    const resizeViewport = async availableHeight => {
        const {body} = grid;

        body.availableHeight = availableHeight;
        await expect.poll(() => body.items.length).toBe(body.availableRows + 2 * body.bufferRowRange)
    };

    /**
     * Every registered row sits in the pool slot its id names, and the pool holds nothing else.
     */
    const expectPoolMatchesRegistry = () => {
        const {body}  = grid,
              slotIds = body.items.map((row, slot) => `${body.id}__row-${slot}`);

        expect(body.items.map(row => row.id), 'each row sits in the slot its id names').toEqual(slotIds);
        expect(body.items.length, 'the pool holds rowPoolSize rows').toBe(body.rowPoolSize);
        expect(registeredRowIds().sort(), 'the registry holds exactly the pooled rows').toEqual([...slotIds].sort());
        expect(duplicateIds, 'no row id is created twice').toEqual([])
    };

    test.beforeEach(async () => {
        duplicateIds = [];
        logError     = Neo.logError;

        Neo.logError = (message, item, ...args) => {
            message === 'Trying to create an item with an already existing id' && duplicateIds.push(item?.id);
            return logError.call(Neo, message, item, ...args)
        };

        store = Neo.create(Store, {
            data       : Array.from({length: 1000}, (_, id) => ({id, name: `Row ${id}`})),
            keyProperty: 'id',
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name', type: 'String'}]}
        });

        grid = Neo.create(GridContainer, {
            appName       : 'GridRowPoolGrowthTest',
            bufferRowRange: 2,
            columns       : [{dataField: 'id', text: 'ID', width: 60}, {dataField: 'name', text: 'Name', width: 200}],
            height        : 400,
            rowHeight,
            store,
            width         : 400
        });

        await grid.initVnode();
        grid.mounted = true;

        grid.body.columnPositions.clear();
        grid.body.columnPositions.add([{dataField: 'id', width: 60, x: 0}, {dataField: 'name', width: 200, x: 60}]);
        grid.body.set({availableHeight: 360, containerWidth: 400});

        await grid.timeout(50)
    });

    test.afterEach(async () => {
        Neo.logError = logError;

        await grid.timeout(20);
        grid?.destroy();
        store?.destroy()
    });

    test('regrowing after a shrink, and while scrolled, re-creates no registered id', async () => {
        const {body} = grid,
              small  = body.items.length;

        await resizeViewport(2000);
        expect(body.items.length, 'the pool grows with the viewport').toBeGreaterThan(small);
        expectPoolMatchesRegistry();

        await resizeViewport(360);
        expect(body.items.length, 'the pool shrinks with the viewport').toBe(small);
        expectPoolMatchesRegistry();

        grid.view.syncBodies(500 * rowHeight);
        await grid.view.promiseUpdate();

        await resizeViewport(2000);
        expectPoolMatchesRegistry();
        expect(body.items.find(row => row.rowIndex === 500)?.record.name, 'the scrolled window still shows its records').toBe('Row 500')
    });

    test('a growth past the argument limit leaves no orphaned row id', async () => {
        const {body}    = grid,
              smallPool = body.items.length;

        body.items = ArgumentLimitedArray.from(body.items);

        expect(() => body.availableHeight = 2000, 'growing the pool by more rows than one call takes').not.toThrow();
        expect(body.items.length - smallPool, 'the growth is larger than the argument limit').toBeGreaterThan(ArgumentLimitedArray.limit);
        expectPoolMatchesRegistry();

        // The next growth must find each slot's id held by that slot's own row, not by a leftover of the first
        await resizeViewport(2400);
        expectPoolMatchesRegistry()
    })
});
