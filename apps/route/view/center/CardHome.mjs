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
        baseCls: ['neo-container'],

        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text: 'CardHome'
        }],
    }
}

Neo.applyClassConfig(CardHome);

export default CardHome;
