import CheckBox              from '../../../src/form/field/CheckBox.mjs';
import ConfigurationViewport from '../../ConfigurationViewport.mjs';
import GridContainer         from '../../../src/grid/Container.mjs';
import MainStore             from './MainStore.mjs';
import NumberField           from '../../../src/form/field/Number.mjs';

/**
 * @class Neo.examples.grid.valueBanding.MainContainer
 * @extends Neo.examples.ConfigurationViewport
 */
class MainContainer extends ConfigurationViewport {
    static config = {
        className           : 'Neo.examples.grid.valueBanding.MainContainer',
        autoMount           : true,
        configItemLabelWidth: 130,
        configPanelFlex     : 1.5,
        exampleComponentFlex: 3,
        layout              : {ntype: 'hbox', align: 'stretch'}
    }

    createConfigurationComponents() {
        let me = this;

        return [{
            module   : NumberField,
            labelText: 'height',
            listeners: {change: me.onConfigChange.bind(me, 'height')},
            maxValue : 800,
            minValue : 225,
            stepSize : 5,
            value    : me.exampleComponent.height
        }, {
            module   : CheckBox,
            checked  : false,
            labelText: 'stripedRows',
            listeners: {change: me.onStripedRowsChange.bind(me)},
            style    : {marginTop: '10px'}
        }, {
            module   : CheckBox,
            checked  : true,
            labelText: 'useValueBanding (Dept)',
            listeners: {change: me.onUseValueBandingChange.bind(me, 'department')},
            style    : {marginTop: '10px'}
        }]
    }

    createExampleComponent() {
        return {
            module: GridContainer,
            store : MainStore,

            columnDefaults: {
                width: 150
            },

            body: {
                stripedRows: false
            },

            columns: [
                {dataField: 'id',         text: 'ID'},
                {dataField: 'country',    text: 'Country',    useValueBanding: true},
                {dataField: 'department', text: 'Department', useValueBanding: true},
                {dataField: 'role',       text: 'Role'},
                {dataField: 'firstname',  text: 'Firstname'}
            ],

            wrapperStyle: {
                height: '400px'
            }
        }
    }

    /**
     * @param {Object} opts
     */
    onStripedRowsChange(opts) {
        this.exampleComponent.body.stripedRows = opts.value
    }

    /**
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
