import Container         from '../../../../src/container/Base.mjs';
import ControlsContainer from './ControlsContainer.mjs';
import GridContainer     from './GridContainer.mjs';

/**
 * @class DevRank.view.home.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static config = {
        /**
         * @member {String} className='DevRank.view.home.MainContainer'
         * @protected
         */
        className: 'DevRank.view.home.MainContainer',
        /**
         * @member {Object[]} items
         */
        items: [{
            module   : GridContainer,
            reference: 'grid',
            flex     : 1
        }, {
            module   : ControlsContainer,
            reference: 'controls'
        }],
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }
}

export default Neo.setupClass(MainContainer);
