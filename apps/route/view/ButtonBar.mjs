import Base from '../../../src/container/Base.mjs';
import Button from '../../../src/button/Base.mjs';

/**
 * @class Route.view.ButtonBar
 * @extends Neo.container.Base
 */
class ButtonBar extends Base {
    static config = {
        /**
         * @member {String} className='Route.view.ButtonBar'
         * @protected
         */
        className: 'Route.view.ButtonBar',
        baseCls: ['route', 'neo-container'],
        cls: ['route_buttonbar', 'centerPanel'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Button,
            flex: 'none',
            handler: 'onSwitchButtonCardHome',
            cls: ['route_button', 'neo-button'],
            iconCls: 'fa-solid fa-home',
            reference: 'home_button',
            text: 'Home',
        }, {
            module: Button,
            flex: 'none',
            handler: 'onSwitchButtonCardSection1',
            cls: ['route_button', 'neo-button'],
            iconCls: 'fa-solid fa-globe',
            text: 'Section 1'
        }, {
            module: Button,
            flex: 'none',
            handler: 'onSwitchButtonCardSection2',
            cls: ['route_button', 'neo-button'],
            iconCls: 'fa-solid fa-globe',
            text: 'Section 2'
        },{
            module: Button,
            flex: 'none',
            handler: 'onSwitchButtonAdministration',
            cls: ['route_button', 'neo-button'],
            iconCls: 'fa-solid fa-building-user',
            text: 'Administration',
        }],
        layout: { ntype: 'flexbox', wrap: 'wrap' },

    }
}

Neo.setupClass(ButtonBar);

export default ButtonBar;
