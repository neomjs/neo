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
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            style : {marginBottom: '1em'},

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
                store     : ['1000', '5000', '10000', '20000'],
                value     : '10000',
                width     : 200
            }, {
                labelText : 'Amount Columns',
                labelWidth: 135,
                listeners : {change: 'up.onAmountColumnsChange'},
                store     : ['25', '50', '75', '100'],
                style     : {marginLeft: '2em'},
                value     : '50',
                width     : 200
            }, {
                labelText : 'Buffer Rows',
                labelWidth: 100,
                listeners : {change: 'up.onAmountBufferRowsChange'},
                store     : ['0', '3', '5', '10', '25', '50'],
                style     : {marginLeft: '2em'},
                value     : '5',
                width     : 160
            }]
        }, {
            module: GridContainer
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

    /**
     * @param {Object} data
     */
    onAmountBufferRowsChange(data) {
        console.log('onAmountBufferRowsChange', data);
    }

    /**
     * @param {Object} data
     */
    onAmountColumnsChange(data) {
        console.log('onAmountColumnsChange', data);
    }

    /**
     * @param {Object} data
     */
    onAmountRowsChange(data) {
        console.log('onAmountRowsChange', data);
    }
}

export default Neo.setupClass(MainContainer);
