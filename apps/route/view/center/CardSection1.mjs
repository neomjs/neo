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
        baseCls: ['neo-container'],

        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text: 'CardSection1'
        }],
    }
}

Neo.applyClassConfig(CardSection1);

export default CardSection1;
