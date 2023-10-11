import Container from '../../../../src/container/Base.mjs';
import Label     from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardSection2
 * @extends Neo.container.Base
 */
class CardSection2 extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardSection2'
         * @protected
         */
        className: 'Route.view.center.CardSection2',
        baseCls: ['neo-container'],

        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text: 'CardSection2'
        }],
    }
}

Neo.applyClassConfig(CardSection2);

export default CardSection2;
