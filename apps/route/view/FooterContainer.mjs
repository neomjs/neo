import Container from '../../../src/container/Base.mjs';
import Button from '../../../src/button/Base.mjs';

/**
 * @class Route.view.FooterContainer
 * @extends Neo.container.Base
 */
class FooterContainer extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.FooterContainer'
         * @protected
         */
        className: 'Route.view.FooterContainer',

        baseCls: ['route_footer', 'neo-container'],

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
                        text: 'Contact'
                    }
                ],
                layout: { ntype: 'hbox', align: 'stretch'  },

            }

        ],

    }
}

Neo.applyClassConfig(FooterContainer);

export default FooterContainer;
