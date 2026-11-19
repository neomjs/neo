import CellColumnModel       from '../../../src/selection/grid/CellColumnModel.mjs';
import CellColumnRowModel    from '../../../src/selection/grid/CellColumnRowModel.mjs';
import CellModel             from '../../../src/selection/grid/CellModel.mjs';
import CellRowModel          from '../../../src/selection/grid/CellRowModel.mjs';
import ColumnModel           from '../../../src/selection/grid/ColumnModel.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import MainStore             from './MainStore.mjs';
import Radio                 from '../../../src/form/field/Radio.mjs';
import RowModel              from '../../../src/selection/grid/RowModel.mjs';

const MODEL_GUIDANCE = {
    'selection-grid-cellmodel'         : {label: 'Cell',              keys: 'Click a shift cell, then press ↑ ↓ ← → to move cell-by-cell (wrapping at edges).'},
    'selection-grid-columnmodel'       : {label: 'Column',            keys: 'Click any weekday or press ← → to step coverage column-by-column.'},
    'selection-grid-rowmodel'          : {label: 'Row',               keys: 'Click any clinician or press ↑ ↓ to step row-by-row across the roster.'},
    'selection-grid-cellcolumnmodel'   : {label: 'Cell & Column',     keys: '↑ ↓ move within the highlighted weekday · ← → move cell and column together.'},
    'selection-grid-cellrowmodel'      : {label: 'Cell & Row',        keys: '↑ ↓ move cell and clinician row together · ← → move across days in that row.'},
    'selection-grid-cellcolumnrowmodel': {label: 'Cell & Column & Row', keys: '↑ ↓ ← → move the active shift cell, clinician row, and weekday column crosshair together.'}
};

/**
 * @summary Demonstrates all six `Neo.selection.grid.*` models on a 42-clinician × 10-column hospital shift roster
 * with an initial visible selection and live per-model keyboard guidance.
 * @class Neo.examples.grid.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    /**
     * Guards one-time initial anchor selection once `GridBody#availableRows` becomes positive.
     * @member {Boolean} #initialSelectionSeeded=false
     * @private
     */
    #initialSelectionSeeded = false

    static config = {
        className             : 'Neo.examples.grid.container.MainContainer',
        autoMount             : true,
        cls                   : ['neo-examples-grid-container'],
        componentName         : 'Hospital Weekly Shift Roster',
        configItemLabelWidth  : 68,
        configItemWidth       : 285,
        configPanelFlex       : 'none',
        configPanelMaxWidth   : 320,
        configPanelMinWidth   : 300,
        description           : `Active model: ${MODEL_GUIDANCE['selection-grid-cellmodel'].label} — ${MODEL_GUIDANCE['selection-grid-cellmodel'].keys} Switch models in the Inspector.`,
        exampleComponentFlex  : 1,
        exampleContainerConfig: {
            layout: {ntype: 'vbox', align: 'stretch'},
            style : {overflow: 'hidden', padding: '16px'}
        },
        layout                : {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @summary Seeds a visible selection at row 1 (`Henrik Lindqvist`) × `mon` (`Mon`) for the active selection model.
     * @param {Boolean} [focusView=false] True to focus `grid.view` so arrow keys work immediately
     */
    applyAnchorSelection(focusView=false) {
        let grid      = this.exampleComponent,
            view      = grid?.view,
            model     = view?.selectionModel,
            record    = view?.store?.getAt(1),
            dataField = 'mon';

        if (!view || !model || !record) {
            return
        }

        if (model.selectsCells) {
            model.onCellClick({dataField, record})
        } else if (model.selectsColumns) {
            model.setSelectedColumns([dataField])
        } else if (model.selectsRows) {
            model.selectRow(view.getRecordId(record))
        }

        this.syncStageDescription(model.ntype);

        if (focusView) {
            view.focus(view.id)
        }
    }

    /**
     * @summary Exposes radio controls for all six grid selection models.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me               = this,
            {selectionModel} = me.exampleComponent.view;

        const radioDefaults = {
            module        : Radio,
            hideValueLabel: false,
            labelText     : '',
            name          : 'selectionModel',
            width         : 285
        };

        return [{
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellmodel',
            labelText : 'Model',
            listeners : {change: me.onRadioViewChange.bind(me, CellModel)},
            valueLabel: 'Cell'
        }, {
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-columnmodel',
            listeners : {change: me.onRadioViewChange.bind(me, ColumnModel)},
            valueLabel: 'Column'
        }, {
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-rowmodel',
            listeners : {change: me.onRadioViewChange.bind(me, RowModel)},
            valueLabel: 'Row'
        }, {
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellcolumnmodel',
            listeners : {change: me.onRadioViewChange.bind(me, CellColumnModel)},
            valueLabel: 'Cell & Column'
        }, {
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellrowmodel',
            listeners : {change: me.onRadioViewChange.bind(me, CellRowModel)},
            valueLabel: 'Cell & Row'
        }, {
            ...radioDefaults,
            checked   : selectionModel.ntype === 'selection-grid-cellcolumnrowmodel',
            listeners : {change: me.onRadioViewChange.bind(me, CellColumnRowModel)},
            valueLabel: 'Cell & Column & Row'
        }]
    }

    /**
     * @summary Creates the full-stage 10-column roster `Neo.grid.Container`.
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module   : GridContainer,
            flex     : 1,
            rowHeight: 32,
            store    : MainStore,

            columnDefaults: {
                width: 96
            },

            viewConfig: {
                selectionModel: CellModel
            },

            columns: [
                {dataField: 'staff', text: 'Clinician', width: 152},
                {dataField: 'unit',  text: 'Unit',      width: 90},
                {dataField: 'mon',   text: 'Mon'},
                {dataField: 'tue',   text: 'Tue'},
                {dataField: 'wed',   text: 'Wed'},
                {dataField: 'thu',   text: 'Thu'},
                {dataField: 'fri',   text: 'Fri'},
                {dataField: 'sat',   text: 'Sat'},
                {dataField: 'sun',   text: 'Sun'},
                {dataField: 'role',  text: 'Role',      width: 112}
            ]
        }
    }

    /**
     * @summary Subscribes to `GridBody#availableRows` so the initial selection paints on first render.
     */
    onConstructed() {
        super.onConstructed();

        let body = this.exampleComponent?.body;

        if (body) {
            if (body.availableRows > 0) {
                this.#initialSelectionSeeded = true;
                this.applyAnchorSelection()
            } else {
                this.observeConfig(body, 'availableRows', value => {
                    if (value > 0 && !this.#initialSelectionSeeded) {
                        this.#initialSelectionSeeded = true;
                        this.applyAnchorSelection()
                    }
                })
            }
        }
    }

    /**
     * @summary Switches `grid.view.selectionModel`, seeds an immediate visible selection, and focuses the grid view.
     * @param {Neo.core.Base} ModelClass
     * @param {Object}        opts
     */
    onRadioViewChange(ModelClass, opts) {
        if (opts.value === true && this.exampleComponent?.view) {
            this.exampleComponent.view.selectionModel = ModelClass;
            this.applyAnchorSelection(true)
        }
    }

    /**
     * @summary Restores `CellModel` and re-seeds the initial `Henrik Lindqvist` × `Mon` selection.
     */
    onReset() {
        super.onReset();

        if (this.exampleComponent?.view) {
            this.exampleComponent.view.selectionModel = CellModel;
            this.applyAnchorSelection()
        }
    }

    /**
     * @summary Updates the stage header subtitle sentence to name the active selection model and its keyboard path.
     * @param {String} ntype
     */
    syncStageDescription(ntype) {
        let info = MODEL_GUIDANCE[ntype] || MODEL_GUIDANCE['selection-grid-cellmodel'],
            desc = this.down({reference: 'stage-desc'});

        if (desc) {
            desc.text = `Active model: ${info.label} — ${info.keys} Switch models in the Inspector.`
        }
    }
}

export default Neo.setupClass(MainContainer);
