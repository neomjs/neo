import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the grid cell-editing contract: two grids with `cellEditing: true`.
 *
 * `#grid-cell-editing` is small enough that every row and column stays rendered, so its arms isolate the edit
 * loop — activation, commit, cancel, focus — from pooling. Every body holds an editable column (`code` locked
 * to the start, `name` and `city` in the center, `note` locked to the end), `score` is the non-editable control,
 * and `name` is `required`, so an emptied draft is the invalid value.
 *
 * `#grid-cell-editing-pooled` exists for pooling: 40 columns of 150px and 400 rows, so a horizontal scroll moves
 * the mounted column window and a vertical one rebinds pooled rows to other records. `c0` is locked to the start
 * and `c39` to the end, and every column is editable.
 *
 * Both select cells with a `CellModel`: keyboard activation edits the selected cell, and a row model selects none.
 * `#grid-cell-editing-outside` in `index.html` is the focus target outside both grids.
 */
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
            module     : GridContainer,
            id         : 'grid-cell-editing',
            cellEditing: true,
            flex       : 1,
            store      : smallStore,
            viewConfig : {selectionModel: CellModel},

            columns: [
                {dataField: 'code',  text: 'Code',  width: 110, editable: true, locked: 'start'},
                {dataField: 'id',    text: '#',     width: 60,  locked: 'start'},
                {dataField: 'name',  text: 'Name',  width: 200, editable: true, editor: {required: true}},
                {dataField: 'score', text: 'Score', width: 100},
                {dataField: 'city',  text: 'City',  width: 160, editable: true, id: 'grid-cell-editing-city'},
                {dataField: 'note',  text: 'Note',  width: 160, editable: true, locked: 'end'}
            ]
        }, {
            module     : GridContainer,
            id         : 'grid-cell-editing-pooled',
            cellEditing: true,
            flex       : 1,
            store      : pooledStore,
            viewConfig : {selectionModel: CellModel},

            columns: Array.from({length: 40}, (_, c) => ({
                dataField: `c${c}`,
                editable : true,
                text     : `C${c}`,
                width    : 150,
                ...(c === 0 ? {locked: 'start'} : c === 39 ? {locked: 'end'} : {})
            }))
        }]
    },
    name: 'Test.Playwright.GridCellEditing'
});
