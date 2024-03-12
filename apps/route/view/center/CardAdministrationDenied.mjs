import Container from '../../../../src/container/Base.mjs';
import Label     from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardAdministrationDenied
 * @extends Neo.container.Base
 */
class CardAdministrationDenied extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardAdministrationDenied'
         * @protected
         */
        className: 'Route.view.center.CardAdministrationDenied',
        baseCls: ['route_card_simple_page','neo-container'],

        vdom: {
            tag: 'h1',
            innerHTML: 'Access Denied.'
        }
    }
}

Neo.setupClass(CardAdministrationDenied);

export default CardAdministrationDenied;
