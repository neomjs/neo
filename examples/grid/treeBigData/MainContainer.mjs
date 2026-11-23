import Component         from '../../../src/component/Base.mjs';
import ControlsContainer from './ControlsContainer.mjs';
import GridContainer     from './GridContainer.mjs';
import Viewport          from '../../../src/container/Viewport.mjs';

/**
 * @summary The tree grid at scale under a headline and one line on what to try. The Settings panel slides in from
 * the right; while it is open the view pads its right edge, so neither the header nor the grid sits under it.
 * @class Neo.examples.grid.treeBigData.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.treeBigData.MainContainer'
         * @protected
         */
        className: 'Neo.examples.grid.treeBigData.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-treebigdata-maincontainer']
         * @reactive
         */
        cls: ['neo-examples-treebigdata-maincontainer'],
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
            cls   : ['neo-examples-treebigdata-header'],
            flex  : 'none',
            vdom  : {tag: 'header', cn: [
                {tag: 'h1', cls: ['neo-examples-treebigdata-title'],       text: 'An organization of 20,000 people as a tree grid'},
                {tag: 'p',  cls: ['neo-examples-treebigdata-instruction'], text: 'Open a squad to its people, give kudos from a cell, then raise rows and depth in ☰ and expand all; filter by first name.'}
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
