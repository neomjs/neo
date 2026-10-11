import CellEditing   from '../../../../../src/grid/plugin/CellEditing.mjs';
import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the grid cell-editing contract: two grids that edit their cells.
 *
 * `#grid-cell-editing` is small enough that every row and column stays rendered, so its arms isolate the edit
 * loop — activation, commit, cancel, focus — from pooling. Every body holds an editable column (`code` locked
 * to the start, `name` and `city` in the center, `note` locked to the end), `score` is the non-editable control,
 * and `name` is `required`, so an emptied draft is the invalid value. `city` and `note` carry ids, so an arm can
 * change their config at runtime. It declares the plugin itself, for the id: a generated one names whichever grid
 * constructed first, and the arm that destroys the plugin alone has to name this grid's. `#grid-cell-editing-pooled`
 * keeps `cellEditing: true`, the public entry point.
 *
 * `#grid-cell-editing-pooled` exists for pooling: 40 columns of 150px and 400 rows, so a horizontal scroll moves
 * the mounted column window and a vertical one rebinds pooled rows to other records. `c0` is locked to the start
 * and `c39` to the end, and every column is editable. `c3` carries an id, so an arm can turn it read-only, and `c5`
 * is `required`: the one invalid draft a cell can hold while pooling has taken it out of the DOM. `c7` opts out of
 * suspension (`cancelEditOnProjectionLoss`; `gridDriver.mjs` can opt `c3` and the locked `c39` out at runtime).
 *
 * Both grids write every `cellEditCancel` they fire onto their own node as a class,
 * `edit-cancelled-<dataField>-<reason>`: the one place a Brain-free spec can read an App Worker event.
 *
 * Both select cells with a `CellModel`: keyboard activation edits the selected cell, and a row model selects none.
 * `#grid-cell-editing-outside` in `index.html` is the focus target outside both grids.
 */
const announceCancel = id => ({
    cellEditCancel: ({dataField, reason}) => Neo.getComponent(id).addCls(`edit-cancelled-${dataField}-${reason}`)
});

const smallStore = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridCellEditingStore',
        keyProperty: 'id',

        model: {
            fields: [
                {name: 'id',    type: 'Integer'},
                {name: 'code',  type: 'String'},
                {name: 'name',  type: 'String'},
                {name: 'score', type: 'Integer'},
                {name: 'city',  type: 'String'},
                {name: 'note',  type: 'String'}
            ]
        },

        data: Array.from({length: 6}, (_, i) => ({
            id   : i + 1,
            code : `C-${i + 1}`,
            name : `Name ${i + 1}`,
            score: (i * 17) % 100,
            city : ['Berlin', 'Hamburg', 'Munich'][i % 3],
            note : `Note ${i + 1}`
        }))
    }
});

const pooledStore = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridCellEditingPooledStore',
        keyProperty: 'id',

        model: {
            fields: [{name: 'id', type: 'Integer'}, ...Array.from({length: 40}, (_, c) => ({name: `c${c}`, type: 'String'}))]
        },

        data: Array.from({length: 400}, (_, r) => {
            const record = {id: r + 1};

            for (let c = 0; c < 40; c++) {
                record[`c${c}`] = `r${r + 1}c${c}`
            }

            return record
        })
    }
});

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},

        items: [{
            module    : GridContainer,
            id        : 'grid-cell-editing',
            flex      : 1,
            listeners : announceCancel('grid-cell-editing'),
            plugins   : [{module: CellEditing, id: 'grid-cell-editing-plugin'}],
            store     : smallStore,
            viewConfig: {selectionModel: CellModel},

            columns: [
                {dataField: 'code',  text: 'Code',  width: 110, editable: true, locked: 'start'},
                {dataField: 'id',    text: '#',     width: 60,  locked: 'start'},
                {dataField: 'name',  text: 'Name',  width: 200, editable: true, editor: {required: true}},
                {dataField: 'score', text: 'Score', width: 100},
                {dataField: 'city',  text: 'City',  width: 160, editable: true, id: 'grid-cell-editing-city'},
                {dataField: 'note',  text: 'Note',  width: 160, editable: true, locked: 'end', id: 'grid-cell-editing-note'}
            ]
        }, {
            module     : GridContainer,
            id         : 'grid-cell-editing-pooled',
            cellEditing: true,
            flex       : 1,
            listeners  : announceCancel('grid-cell-editing-pooled'),
            store      : pooledStore,
            viewConfig : {selectionModel: CellModel},

            columns: Array.from({length: 40}, (_, c) => ({
                dataField: `c${c}`,
                editable : true,
                text     : `C${c}`,
                width    : 150,
                ...(c === 0 ? {locked: 'start'} : c === 39 ? {locked: 'end'} : {}),
                ...(c === 3 ? {id: 'grid-cell-editing-pooled-c3'} : {}),
                ...(c === 5 ? {editor: {required: true}} : {}),
                ...(c === 7 ? {cancelEditOnProjectionLoss: true} : {})
            }))
        }]
    },
    name: 'Test.Playwright.GridCellEditing'
});
