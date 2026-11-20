import Component         from '../../../src/component/Base.mjs';
import ControlsContainer from './ControlsContainer.mjs';
import GridContainer     from './GridContainer.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';

/**
 * @summary The big data grid under a headline and one line on what to try. The Settings panel slides in from the
 * right; while it is open the view pads its right edge, so neither the header nor the grid sits under it.
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
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Component,
            cls   : ['neo-examples-bigdata-header'],
            flex  : 'none',
            vdom  : {tag: 'header', cn: [
                {tag: 'h1', cls: ['neo-examples-bigdata-title'],       text: 'A data grid that scales to 100,000 rows × 200 columns'},
                {tag: 'p',  cls: ['neo-examples-bigdata-instruction'], text: 'Read the size below the rows, raise rows and columns in ☰ Settings, then scroll both ways and press a button in a cell.'}
            ]}
        }, {
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
