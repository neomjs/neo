import ComboBox      from '../../../src/form/field/ComboBox.mjs';
import GridContainer from './GridContainer.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.grid.bigData.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-maincontainer']
         */
        cls: ['neo-examples-bigdata-maincontainer'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'stretch', wrap: 'wrap'},
            style : {marginBottom: '1em', padding: 0},

            itemDefaults: {
                module      : ComboBox,
                clearable   : false,
                displayField: 'id',
                editable    : false
            },

            items: [{
                labelText : 'Amount Rows',
                labelWidth: 110,
                listeners : {change: 'up.onAmountRowsChange'},
                store     : ['1000', '5000', '10000', '20000', '50000'],
                value     : '10000',
                width     : 200
            }, {
                labelText : 'Amount Columns',
                labelWidth: 135,
                listeners : {change: 'up.onAmountColumnsChange'},
                store     : ['10', '25', '50', '75', '100'],
                value     : '50',
                width     : 200
            }, {
                labelText : 'Buffer Rows',
                labelWidth: 95,
                listeners : {change: 'up.ontBufferRowRangeChange'},
                store     : ['0', '3', '5', '10', '25', '50'],
                value     : '5',
                width     : 160
            }, {
                labelText : 'Buffer Columns',
                labelWidth: 120,
                listeners : {change: 'up.ontBufferColumnRangeChange'},
                store     : ['0', '3', '5', '10', '20'],
                value     : '0',
                width     : 185
            }]
        }, {
            module    : GridContainer,
            reference : 'grid',
            viewConfig: {
                bufferRowRange: 5
            }
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} style={padding:'20px'}
         */
        style: {padding: '20px'}
    }

    get grid() {
        return this.getItem('grid')
    }

    /**
     * @param {Object} data
     */
    onAmountColumnsChange(data) {
        if (data.oldValue) {
            this.grid.amountColumns = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    onAmountRowsChange(data) {
        if (data.oldValue) {
            this.grid.store.amountRows = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    ontBufferColumnRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferColumnRange = parseInt(data.value.id)
        }
    }

    /**
     * @param {Object} data
     */
    ontBufferRowRangeChange(data) {
        if (data.oldValue) {
            this.grid.view.bufferRowRange = parseInt(data.value.id)
        }
    }
}

export default Neo.setupClass(MainContainer);
