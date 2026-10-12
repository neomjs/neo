import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * Row heights in px, repeating every six rows. Rows up to 7.5 times the 32px estimate make every row position
 * differ from `index × rowHeight`. `test/playwright/e2e/grid/ContentSizedRows.spec.mjs` mirrors them.
 * @type {Number[]}
 */
const HEIGHTS = [32, 96, 48, 240, 32, 64];

/**
 * @summary Fixture for content-sized grid rows: a record carries the height of its row.
 * @class Neo.test.playwright.GridContentSizedModel
 * @extends Neo.data.Model
 */
class GridContentSizedModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridContentSizedModel',
        fields   : [
            {name: 'id',     type: 'Integer'},
            {name: 'height', type: 'Integer'},
            {name: 'name',   type: 'String'}
        ]
    }
}

GridContentSizedModel = Neo.setupClass(GridContentSizedModel);

/**
 * @summary 300 records whose heights repeat {@link HEIGHTS}.
 * @class Neo.test.playwright.GridContentSizedStore
 * @extends Neo.data.Store
 */
class GridContentSizedStore extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridContentSizedStore',
        keyProperty: 'id',
        model      : GridContentSizedModel,
        data       : Array.from({length: 300}, (_, i) => ({id: i + 1, height: HEIGHTS[i % HEIGHTS.length], name: `Row ${i + 1}`}))
    }
}

GridContentSizedStore = Neo.setupClass(GridContentSizedStore);

/**
 * @summary A grid in `contentSizedRows` mode that takes its row heights from its records.
 *
 * Measuring row content is not part of the engine yet, so this grid stands in for it: it hands each record's
 * `height` to `grid.View#setRowHeights`, the setter measurement will feed.
 * @class Neo.test.playwright.GridContentSizedGrid
 * @extends Neo.grid.Container
 */
class GridContentSizedGrid extends GridContainer {
    static config = {
        className: 'Neo.test.playwright.GridContentSizedGrid'
    }

    /**
     * Applies the record heights before the first layout
     */
    onConstructed() {
        super.onConstructed();

        let {store, view} = this;

        view.setRowHeights(new Map(store.items.map(record => [view.getRecordId(record), record.height])))
    }
}

GridContentSizedGrid = Neo.setupClass(GridContentSizedGrid);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: 'fit',
        items : [{
            module          : GridContentSizedGrid,
            contentSizedRows: true,
            id              : 'grid-content-sized',
            rowHeight       : 32,
            store           : GridContentSizedStore,
            columns         : [
                {dataField: 'id',     text: '#',      width: 80},
                {dataField: 'name',   text: 'Name',   flex : 1},
                {dataField: 'height', text: 'Height', width: 100}
            ]
        }]
    },
    name: 'Test.Playwright.GridContentSized'
});
