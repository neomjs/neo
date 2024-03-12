import Container from '../../../../src/container/Base.mjs';
import Label from '../../../../src/component/Label.mjs';

/**
 * @class Route.view.center.CardContact
 * @extends Neo.container.Base
 */
class CardContact extends Container {
    static config = {
        /**
         * @member {String} className='Route.view.center.CardContact'
         * @protected
         */
        className: 'Route.view.center.CardContact',
        baseCls: ['route_card_simple_page', 'neo-container'],

        items: [
            { cls : ['route_card_simple_page'], vdom: { cn: [
                {tag: 'h1',innerHTML: 'Contact' },
                {tag: 'a',  href: 'https://github.com/neomjs/neo', target: '_blank', innerHTML: 'please visit https://github.com/neomjs/neo'}
            ] } } 
        ]
    }

}

Neo.setupClass(CardContact);

export default CardContact;
