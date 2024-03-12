import Container from '../../../../src/container/Base.mjs';
import Label     from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardHome
 * @extends Neo.container.Base
 */
class CardHome extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardHome'
         * @protected
         */
        className: 'Route.view.center.CardHome',
        baseCls: ['route_card_simple_page','neo-container'],

        vdom: {
            tag: 'h1',
            innerHTML: 'This is the landing page of the example.'
        }
    }
}

Neo.setupClass(CardHome);

export default CardHome;
