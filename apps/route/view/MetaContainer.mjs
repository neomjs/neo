import Container from '../../../src/container/Base.mjs';
import Button from '../../../src/button/Base.mjs';

/**
 * @class Route.view.MetaContainer
 * @extends Neo.container.Base
 */
class MetaContainer extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.MetaContainer'
         * @protected
         */
        className: 'Route.view.MetaContainer',

        baseCls: ['route_meta', 'neo-container'],

        height: 55, 
        /**
         * @member {Object[]} items
         */
        items: [
            {
                module: Container,
                cls: ['centerPanel'],
                items: [
                    {
                        module: Button,
                        flex: 'none',
                        handler: 'onSwitchButtonCardContact',
                        cls: ['route_button', 'neo-button'],
                        text: 'to be change'
                    }
                ],
                layout: { ntype: 'hbox', align: 'stretch'  },

            }

        ],

    }
}

Neo.applyClassConfig(MetaContainer);

export default MetaContainer;
