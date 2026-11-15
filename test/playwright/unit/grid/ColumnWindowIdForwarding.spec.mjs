import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'NeoGridColumnWindowIdForwardingTest',
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import BaseColumn     from '../../../../src/grid/column/Base.mjs';
import GridContainer  from '../../../../src/grid/Container.mjs';
import Store          from '../../../../src/data/Store.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * A grid column is not a component, so the `windowId` cascade `container.Base` performs for its items does not
 * reach it: the grid hands each column its `windowId` once, at creation. A column requests its own theme files when
 * its `windowId` arrives (`Neo.grid.column.Base#afterSetWindowId`). A grid built before it joins a window, the way a
 * dock creates its panes, therefore leaves every column windowless, and a column class that ships its own styles
 * (a tree, progress or icon column, or any app column) never loads them. A move into another window, such as a pop-out,
 * leaves the columns behind in the same way.
 */
const APP = 'NeoGridColumnWindowIdForwardingTest';

class ThemedColumn extends BaseColumn {
    static config = {
        className: 'Test.Unit.Grid.ColumnWindowIdForwarding.ThemedColumn'
    }
}

ThemedColumn = Neo.setupClass(ThemedColumn);

test.describe('Neo.grid.Container forwards windowId to its columns', () => {
    let grid, requests, originalInsert, store;

    test.beforeEach(() => {
        originalInsert = Neo.currentWorker.insertThemeFiles;
        requests       = [];
        Neo.currentWorker.insertThemeFiles = (windowId, proto) => requests.push([windowId, proto?.className]);

        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [{id: 1, name: 'one', value: 10}],
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'name'}, {name: 'value', type: 'Integer'}]}
        })
    });

    test.afterEach(() => {
        grid?.destroy();
        store?.destroy();
        grid = store = null;
        Neo.currentWorker.insertThemeFiles = originalInsert
    });

    function createGrid(config) {
        return Neo.create(GridContainer, {
            appName: APP,
            store,
            columns: [{dataField: 'name', text: 'Name'}, {module: ThemedColumn, dataField: 'value', text: 'Value'}],
            ...config
        })
    }

    test('a grid built while detached hands its first windowId to every column, which then loads its theme files', () => {
        grid = createGrid();

        expect(grid.columns.items.map(column => column.windowId), 'built detached, as a dock builds its panes').toEqual([null, null]);

        grid.windowId = 'w1';

        expect(grid.columns.items.map(column => column.windowId)).toEqual(['w1', 'w1']);
        expect(requests, 'the themed column asks for its styles in the window it joined').toContainEqual(['w1', ThemedColumn.prototype.className])
    });

    test('a grid moved into another window takes its columns along', () => {
        // The control: a grid built inside a window has always handed that id to its columns at creation.
        grid = createGrid({windowId: 'w1'});
        expect(grid.columns.items.map(column => column.windowId)).toEqual(['w1', 'w1']);

        grid.windowId = 'w2';

        expect(grid.columns.items.map(column => column.windowId)).toEqual(['w2', 'w2']);
        expect(requests, 'the new window loads the themed column\'s styles too').toContainEqual(['w2', ThemedColumn.prototype.className])
    });
});
