import Button    from '../../../src/button/Base.mjs';
import Container from '../../../src/container/Base.mjs';

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

        baseCls: ['route_meta', 'route_meta_color','route_meta_center', 'neo-container'],

        height: 55,
        /**
         * @member {Object[]} items
         */
        items: [
            {
                module: Button,
                flex: 'none',
                handler: 'onSwitchButtonMetaUser1',
                cls: ['route_meta_button_grant', 'neo-button'],
                text: 'User 1'
            },
            {
                module: Button,
                flex: 'none',
               handler: 'onSwitchButtonMetaUser2',
                cls: ['route_meta_button_grant', 'neo-button'],
                text: 'User 2'
            },
            {
                module: Button,
                flex: 'none',
                handler: 'onSwitchButtonMetaReset',
                cls: ['route_meta_button_remove', 'neo-button'],
                text: 'Reset User'
            }
        ],
        layout: { ntype: 'hbox', align: 'stretch'  }

    }
}

export default Neo.setupClass(MetaContainer);
