import CellModel      from '../../../../../src/selection/table/CellModel.mjs';
import Model          from '../../../../../src/data/Model.mjs';
import Store          from '../../../../../src/data/Store.mjs';
import TableContainer from '../../../../../src/table/Container.mjs';
import Viewport       from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the TABLE half of the cell-editing contract, as a regression guard.
 *
 * `table.plugin.CellEditing` is the only implementation; `grid.plugin.CellEditing` inherits it.
 * The base's cell-id lookup and key-registry target are hooks so the grid variant can answer them
 * differently, and the table is the surface those hooks default to.
 *
 * So this exists to prove the default path still works, behaviourally rather than by reading the
 * diff. The table previously had no cell-editing coverage at all, which is part of how a
 * three-way break in the grid variant survived unnoticed.
 *
 * `bodyConfig` rather than `body`: that is the table's own config name for it.
 * @class Neo.test.playwright.TableCellEditingModel
 * @extends Neo.data.Model
 */
class TableCellEditingModel extends Model {
    static config = {
        className: 'Neo.test.playwright.TableCellEditingModel',
        fields   : [
            {name: 'id',    type: 'Integer'},
            {name: 'name',  type: 'String'},
            {name: 'score', type: 'Integer'}
        ]
    }
}

TableCellEditingModel = Neo.setupClass(TableCellEditingModel);

const store = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.TableCellEditingStore',
        keyProperty: 'id',
        model      : TableCellEditingModel,

        data: Array.from({length: 6}, (_, i) => ({
            id   : i + 1,
            name : `Name ${i + 1}`,
            score: (i * 17) % 100
        }))
    }
});

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},

        items: [{
            module     : TableContainer,
            id         : 'table-cell-editing',
            cellEditing: true,
            flex       : 1,
            store,

            bodyConfig: {
                selectionModel: CellModel
            },

            columns: [
                {dataField: 'id',    text: '#',     width: 60},
                {dataField: 'name',  text: 'Name',  editable: true,  width: 200},
                {dataField: 'score', text: 'Score', editable: false, width: 120}
            ]
        }]
    },
    name: 'Test.Playwright.TableCellEditing'
});
