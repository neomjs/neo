import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the grid click-focus contract.
 *
 * Two grids with the default drag-to-scroll, so a real pointer can prove both halves of the
 * contract on one page: a click anywhere in a grid — a cell, or the empty body below a short
 * store's last row — must land DOM focus on the grid View (the single focus anchor), and a real
 * drag inside a body tall enough to scroll must still scroll it without selecting any text.
 * `#grid-focus-outside` in index.html is the focusable target the leave arm moves focus to.
 *
 * The long grid's first three rows are also native HTML5 drag sources (`nativeDragZone`), the way
 * a consumer grid hands rows to an iframe or another window: a press on one of them turns into a
 * browser drag after a few pixels, which ends the mouse-event stream the drag-to-scroll addon's
 * monitor waits on. Rows further down stay plain, so the same body still proves ordinary
 * drag-to-scroll.
 * @class Neo.test.playwright.GridFocusModel
 * @extends Neo.data.Model
 */
class GridFocusModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridFocusModel',
        fields   : [
            {name: 'id',    type: 'Integer'},
            {name: 'name',  type: 'String'},
            {name: 'city',  type: 'String'},
            {name: 'score', type: 'Integer'}
        ]
    }
}

GridFocusModel = Neo.setupClass(GridFocusModel);

/**
 * @param {Number} length
 * @returns {Object[]}
 */
const rows = length => Array.from({length}, (_, i) => ({
    id   : i + 1,
    name : `Row ${i + 1} with enough words to select across cells`,
    city : ['Berlin', 'Hamburg', 'Munich', 'Cologne'][i % 4],
    score: (i * 37) % 100
}));

const columns = [
    {dataField: 'id',    text: '#',     width: 60},
    {dataField: 'name',  text: 'Name',  flex : 1},
    {dataField: 'city',  text: 'City',  width: 140},
    {dataField: 'score', text: 'Score', width: 90}
];

/**
 * @param {String} className
 * @param {Number} length
 * @returns {Function}
 */
const storeClass = (className, length) => Neo.setupClass(class extends Store {
    static config = {
        className,
        keyProperty: 'id',
        model      : GridFocusModel,
        data       : rows(length)
    }
});

const
    ShortStore = storeClass('Neo.test.playwright.GridFocusShortStore', 6),
    LongStore  = storeClass('Neo.test.playwright.GridFocusLongStore', 400);

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module: GridContainer,
            id    : 'grid-focus-short',
            flex  : 1,
            store : ShortStore,
            columns
        }, {
            module        : GridContainer,
            id            : 'grid-focus-long',
            flex          : 1,
            store         : LongStore,
            columns,
            nativeDragZone: {
                delegate: '.neo-grid-row:nth-child(-n+3)',
                types   : {'text/plain': '{data-record-id}'}
            }
        }]
    },
    name: 'Test.Playwright.GridFocus'
});
