import ControlsContainer from './ControlsContainer.mjs';
import GridContainer     from './GridContainer.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';

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
         * @reactive
         */
        cls: ['neo-examples-bigdata-maincontainer'],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : GridContainer,
            reference: 'grid'
        }, {
            module: ControlsContainer
        }]
    }

    /**
     * @param {Object} opts
     */
    onThemeRadioChange({value}) {
        this.theme = value
    }
}

export default Neo.setupClass(MainContainer);
