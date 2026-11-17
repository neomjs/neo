import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import Component             from '../../../src/component/Base.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import MainStore             from './MainStore.mjs';

/**
 * @summary Demonstrates country and department value banding on a repeatable staff directory.
 * @class Neo.examples.grid.valueBanding.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className             : 'Neo.examples.grid.valueBanding.MainContainer',
        autoMount             : true,
        cls                   : ['neo-examples-grid-value-banding'],
        configItemLabelWidth  : 190,
        configItemWidth       : 280,
        configPanelFlex       : 'none',
        configPanelMinWidth   : 300,
        configPanelMaxWidth   : 320,
        exampleComponentFlex  : 1,
        exampleContainerConfig: {layout: {ntype: 'vbox', align: 'stretch'}},
        layout                : {ntype: 'hbox', align: 'stretch'}
    }

    /** @summary Explains the visible bands and offers independent banding and row-stripe controls. */
    createConfigurationComponents() {
        let me = this;

        return [{
            module: Component,
            cls   : ['value-banding-introduction'],
            vdom  : {cn: [{
                tag : 'h2',
                text: 'Staff by country'
            }, {
                tag : 'p',
                text: 'Country banding keeps the same tint for consecutive country cells. Switch on Department banding for a second level; compare it with alternating row stripes.'
            }, {
                tag : 'p',
                text: '100 fictional colleagues · sorted by country, then department.'
            }]}
        }, {
            module   : CheckBox,
            checked  : false,
            labelText: 'Alternate row stripes',
            listeners: {change: me.onStripedRowsChange.bind(me)},
            name     : 'stripedRows'
        }, {
            module   : CheckBox,
            checked  : false,
            labelText: 'Department banding',
            listeners: {change: me.onUseValueBandingChange.bind(me, 'department')},
            name     : 'departmentBanding'
        }]
    }

    /** @summary Fills the stage with a sorted directory; country banding is the initial single level. */
    createExampleComponent() {
        return {
            module   : GridContainer,
            flex     : 1,
            rowHeight: 32,
            store    : MainStore,

            columnDefaults: {
                width: 150
            },

            body: {
                stripedRows: false
            },

            columns: [
                {dataField: 'country',    text: 'Country',    useValueBanding: true, width: 125},
                {dataField: 'department', text: 'Department', useValueBanding: false, width: 155},
                {dataField: 'name',       text: 'Colleague', flex: 1, minWidth: 180},
                {dataField: 'role',       text: 'Role', width: 180}
            ]
        }
    }

    /**
     * @summary Toggles ordinary alternating rows independently of the value bands.
     * @param {Object} opts
     */
    onStripedRowsChange(opts) {
        this.exampleComponent.body.stripedRows = opts.value
    }

    /**
     * @summary Adds or removes department banding without changing country banding or sorting.
     * @param {String} dataField
     * @param {Object} opts
     */
    onUseValueBandingChange(dataField, opts) {
        let grid   = this.exampleComponent,
            column = grid.columns.get(dataField);

        column.useValueBanding = opts.value
    }
}

export default Neo.setupClass(MainContainer);
