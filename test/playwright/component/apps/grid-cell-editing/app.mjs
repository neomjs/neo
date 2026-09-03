import CellModel     from '../../../../../src/selection/grid/CellModel.mjs';
import GridContainer from '../../../../../src/grid/Container.mjs';
import Model         from '../../../../../src/data/Model.mjs';
import Store         from '../../../../../src/data/Store.mjs';
import Viewport      from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Fixture for the grid cell-editing KEY contract.
 *
 * `grid.plugin.CellEditing` offers two activation gestures, and only one of them had a witness. A
 * double-click calls `mountEditor` directly; `Enter` and `Space` route through a key registration,
 * and that half is what this fixture exists to exercise. A real pointer plus a real keystroke is the
 * only instrument that can tell them apart, because the difference lives in which element holds DOM
 * focus when the keydown is dispatched — `grid.View` is the single focus anchor (the sole element in
 * a grid that declares `tabindex`), and `neo-selected` lands on the CELL.
 *
 * `body.selectionModel` is a `CellModel` deliberately: cell editing addresses a cell, and the row
 * models never mark one, so a row model would make every arm here vacuous rather than red.
 *
 * One editable column and one that is not, so the refusal is a control rather than an assumption:
 * `mountEditor` returns early on `!column.editable`, and an arm that only ever saw editable columns
 * could not distinguish "declined correctly" from "never fired".
 * @class Neo.test.playwright.GridCellEditingModel
 * @extends Neo.data.Model
 */
class GridCellEditingModel extends Model {
    static config = {
        className: 'Neo.test.playwright.GridCellEditingModel',
        fields   : [
            {name: 'id',    type: 'Integer'},
            {name: 'name',  type: 'String'},
            {name: 'score', type: 'Integer'}
        ]
    }
}

GridCellEditingModel = Neo.setupClass(GridCellEditingModel);

const store = Neo.setupClass(class extends Store {
    static config = {
        className  : 'Neo.test.playwright.GridCellEditingStore',
        keyProperty: 'id',
        model      : GridCellEditingModel,

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
            module     : GridContainer,
            id         : 'grid-cell-editing',
            cellEditing: true,
            flex       : 1,
            store,

            body: {
                selectionModel: CellModel
            },

            columnDefaults: {
                width: 200
            },

            columns: [
                {dataField: 'id',    text: '#',     width: 60},
                {dataField: 'name',  text: 'Name',  editable: true},
                // No editor config: `mountEditor` defaults to a `TextField`, which is the shape a
                // consumer gets for a plain string column and therefore the one worth covering.
                {dataField: 'score', text: 'Score', editable: false}
            ]
        }]
    },
    name: 'Test.Playwright.GridCellEditing'
});
