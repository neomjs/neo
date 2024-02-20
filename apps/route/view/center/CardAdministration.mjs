import Container from '../../../../src/container/Base.mjs';
import Label     from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardAdministration
 * @extends Neo.container.Base
 */
class CardAdministration extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardAdministration'
         * @protected
         */
        className: 'Route.view.center.CardAdministration',
        baseCls: ['route_card_simple_page', 'neo-container'],

        username_: '',
        /**
         * @member {Object[]} items
         */

        vdom: {
            tag: 'h1',
            innerHTML: 'Access Granted.'
        }
    }


    afterSetUsername(value, oldValue){
        this.vdom.innerHTML = `Access Granted to ${this.username}.`;
    }
}

Neo.setupClass(CardAdministration);

export default CardAdministration;
