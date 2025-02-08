import Container from '../../../src/container/Base.mjs';

/**
 * @class Neo.examples.grid.bigData.ControlsContainer
 * @extends Neo.container.Base
 */
class ControlsContainer extends Container {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.bigData.ControlsContainer'
         * @protected
         */
        className: 'Neo.examples.grid.bigData.ControlsContainer',
        /**
         * @member {String[]} cls=['neo-examples-bigdata-controls-container']
         */
        cls: ['neo-examples-bigdata-controls-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            ntype  : 'button',
            cls    : ['sections-container-button'],
            handler: 'up.onControlsToggleButtonClick',
            iconCls: 'fas fa-bars'
            //ui     : 'secondary'
        }, {
            module   : Container
        }],
        /**
         * @member {Object} layout={ntype:'vbox'}
         */
        layout: {ntype: 'vbox'},
        /**
         * @member {String} tag='aside'
         */
        tag: 'aside'
    }

    /**
     * @param {Object} data
     */
    onControlsToggleButtonClick(data) {
        this.toggleCls('neo-expanded')
    }
}

export default Neo.setupClass(ControlsContainer);
