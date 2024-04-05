import Container from '../container/Base.mjs';
import Toolbar   from '../toolbar/Base.mjs';

/**
 * @class Neo.container.DateSelector
 * @extends Neo.container.Base
 */
class DateSelector extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.DateSelector'
         * @protected
         */
        className: 'Neo.container.DateSelector',
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                text: 'prev'
            }, {
                text: '2024'
            }, {
                text: 'next'
            }]
        }, {
            module: Container,
            layout: 'card',
            items : [{
                vdom: {html: 'body'}
            }]
        }]
    }
}

Neo.setupClass(DateSelector);

export default DateSelector;
