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
        baseCls: ['neo-container'],

        /**
         * @member {Object[]} items
         */
        items: [{
            module: Label,
            text: 'CardAdministration'
        }],
    }
}

Neo.applyClassConfig(CardAdministration);

export default CardAdministration;
