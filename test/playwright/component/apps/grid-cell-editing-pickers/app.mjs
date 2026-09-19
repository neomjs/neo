import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import ComboBox      from '../../../../../src/form/field/ComboBox.mjs';
import DateField     from '../../../../../src/form/field/Date.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for picker editors on a pooled grid: a field whose floating picker can outlive the cell it opened in.
 *
 * `#grid-cell-editing-pickers` pools both axes: 400 rows and 20 columns of 150px, far more than one window of either.
 * `c2` edits a `Date` with a `DateField`, and `c3` edits a string with a `ComboBox` that accepts free text, so a typed
 * draft is a value of its own. Scrolling either column out of its window unmounts the editor while its picker, which
 * floats on the document body outside the row, is open.
 *
 * The fixture is its own app: a picker column in `grid-cell-editing`'s pooled grid would change the cells its pooling
 * and Tab arms walk through.
 */
const pooledStore = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridCellEditingPickersStore',
        keyProperty: 'id',

        model: {
            fields: [
                {name: 'id', type: 'Integer'},
                ...Array.from({length: 20}, (_, c) => ({name: `c${c}`, type: c === 2 ? 'Date' : 'String'}))
            ]
        },

        data: Array.from({length: 400}, (_, r) => {
            const record = {id: r + 1};

            for (let c = 0; c < 20; c++) {
                record[`c${c}`] = c === 2 ? new Date('2024-12-10') : `r${r + 1}c${c}`
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
            id         : 'grid-cell-editing-pickers',
            cellEditing: true,
            flex       : 1,
            store      : pooledStore,
            viewConfig : {selectionModel: CellModel},

            columns: Array.from({length: 20}, (_, c) => ({
                dataField: `c${c}`,
                editable : true,
                text     : `C${c}`,
                width    : 150,
                ...(c === 2 ? {
                    editor  : {module: DateField, clearable: false},
                    renderer: ({value}) => value ? value.toISOString().slice(0, 10) : ''
                } : {}),
                ...(c === 3 ? {
                    editor: {module: ComboBox, clearable: false, forceSelection: false, store: ['alpha', 'beta', 'gamma']}
                } : {})
            }))
        }]
    },
    name: 'Test.Playwright.GridCellEditingPickers'
});
