import Container from '../../../src/container/Base.mjs';
import Label from '../../../src/component/Label.mjs';
import Button from '../../../src/button/Base.mjs';
import Component from '../../../src/component/Base.mjs';

/**
 * @class Route.view.HeaderContainer
 * @extends Neo.container.Base
 */
class HeaderContainer extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.HeaderContainer'
         * @protected
         */
        className: 'Route.view.HeaderContainer',
        baseCls: ['route', 'neo-container', 'route_header'],
        height: 242,
        /**
         * @member {Object[]} items
         */
        items: [
            {
                module: Component,
                reference: 'logo',
                width: 140,
                height: 140,
                cls: ['center'],
                vdom: {
                    tag: 'img',
                    src: '../../resources/images/route/neo_logo.svg'
                }
            },
            {
                module: Label,
                text: 'neo.mjs routes showcase',
                cls: ['headline-caption']
            },
        ],
        layout: { ntype: 'vbox', align: 'stretch' },

    }
}

Neo.applyClassConfig(HeaderContainer);

export default HeaderContainer;
