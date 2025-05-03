import Container from '../../../../src/container/Base.mjs';
import Label     from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardSection1
 * @extends Neo.container.Base
 */
class CardSection1 extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardSection1'
         * @protected
         */
        className: 'Route.view.center.CardSection1',
        baseCls: ['route_card_simple_page','neo-container'],

        vdom: {
            tag: 'h1',
            innerHTML: 'This is section 1 of the example.'
        }
    }
}

export default Neo.setupClass(CardSection1);
