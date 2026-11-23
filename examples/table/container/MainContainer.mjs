import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import MainStore             from './MainStore.mjs';
import NeoArray              from '../../../src/util/Array.mjs';
import TableContainer        from '../../../src/table/Container.mjs';

/**
 * @summary Shows when `Neo.table.Container` beats a virtualized grid: small local datasets with content-sized columns,
 * sticky headers, and wrapping prose cells.
 * @class Neo.examples.table.container.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className             : 'Neo.examples.table.container.MainContainer',
        autoMount             : true,
        cls                   : ['neo-examples-table-container'],
        componentName         : 'Service Tier Specifications',
        configItemLabelWidth  : 165,
        configItemWidth       : 260,
        configPanelFlex       : 'none',
        configPanelMaxWidth   : 310,
        configPanelMinWidth   : 290,
        description           : 'Use Neo.table.Container for local tabular data where all records are already present, columns size to their content, and cells wrap — switch to Neo.grid.Container when thousands of rows need virtualization.',
        exampleComponentFlex  : 1,
        exampleContainerConfig: {
            layout: {ntype: 'vbox', align: 'start'},
            style : {overflow: 'hidden', padding: '16px'}
        },
        layout                : {ntype: 'hbox', align: 'stretch'}
    }

    /**
     * @summary Builds the five specification columns with wrapping prose on `notes`.
     * @returns {Object[]}
     */
    createColumns() {
        return [
            {dataField: 'specification', text: 'Specification'},
            {dataField: 'area',          text: 'Area'},
            {dataField: 'starter',       text: 'Starter'},
            {dataField: 'production',    text: 'Production'},
            {
                dataField: 'notes',
                text     : 'Notes',
                renderer : ({value}) => ({
                    cls : ['neo-table-spec-notes'],
                    text: value
                })
            }
        ]
    }

    /**
     * @summary Exposes the table's own header, resize, reorder, filter, and width switches.
     * @returns {Object[]}
     */
    createConfigurationComponents() {
        let me              = this,
            {headerToolbar} = me.exampleComponent;

        return [{
            module   : CheckBox,
            checked  : me.exampleComponent.sortable,
            labelText: 'Sortable headers',
            listeners: {change: me.onConfigChange.bind(me, 'sortable')},
            name     : 'sortable'
        }, {
            module   : CheckBox,
            checked  : me.exampleComponent.showHeaderFilters,
            labelText: 'Inline header filters',
            listeners: {change: me.onConfigChange.bind(me, 'showHeaderFilters')},
            name     : 'showHeaderFilters',
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : headerToolbar.dragResortable,
            labelText: 'Drag-reorder columns',
            listeners: {change: me.onToolbarConfigChange.bind(me, 'dragResortable')},
            name     : 'dragResortable',
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : headerToolbar.resizable,
            labelText: 'Resizable columns',
            listeners: {change: me.onToolbarConfigChange.bind(me, 'resizable')},
            name     : 'resizable',
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : false,
            labelText: 'Fit width',
            listeners: {change: me.onFitWidthChange.bind(me)},
            name     : 'fitWidth',
            style    : {marginTop: '10px'}
        }]
    }

    /**
     * @summary Returns the `Neo.table.Container` config bound to `MainStore`.
     * @returns {Object}
     */
    createExampleComponent() {
        return {
            module : TableContainer,
            id     : 'myTableStoreContainer',
            columns: this.createColumns(),
            store  : MainStore
        }
    }

    /**
     * @summary Toggles full-stage fixed table layout vs natural content-sized column widths.
     * @param {Object} opts
     */
    onFitWidthChange(opts) {
        let table = this.exampleComponent,
            cls   = [...table.cls];

        NeoArray.toggle(cls, 'neo-table-fit-width', Boolean(opts.value));
        table.cls = cls
    }

    /**
     * @summary Restores initial controls, column widths/order, fit-width mode, filters, and sort order.
     */
    onReset() {
        let me      = this,
            table   = me.exampleComponent,
            store   = table?.store,
            toolbar = table?.headerToolbar;

        super.onReset();

        if (store) {
            store.clearFilters();
            store.clearSorters();
            store.data = [];
            store.data = Neo.clone(MainStore.initialData, true)
        }

        toolbar?.set({
            dragResortable: true,
            resizable     : true
        });

        if (table) {
            let cls = [...table.cls];
            NeoArray.remove(cls, 'neo-table-fit-width');
            table.cls     = cls;
            table.columns = me.createColumns()
        }
    }

    /**
     * @summary Updates a `Neo.table.header.Toolbar` capability flag from the Inspector.
     * @param {String} config
     * @param {Object} opts
     */
    onToolbarConfigChange(config, opts) {
        let toolbar = this.exampleComponent?.headerToolbar;

        if (toolbar) {
            toolbar[config] = Boolean(opts.value)
        }
    }
}

export default Neo.setupClass(MainContainer);
