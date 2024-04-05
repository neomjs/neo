import Base from '../container/Base.mjs';

/**
 * @class Neo.container.DateSelector
 * @extends Neo.container.Base
 */
class DateSelector extends Base {
    static config = {
        /**
         * @member {String} className='Neo.container.DateSelector'
         * @protected
         */
        className: 'Neo.container.DateSelector',
        /**
         * @member {Object[]} items
         */
        items: []
    }
}

Neo.setupClass(DateSelector);

export default DateSelector;
