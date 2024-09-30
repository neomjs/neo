import DateField       from '../form/field/Date.mjs';
import NumberContainer from './NumberContainer.mjs';

/**
 * @class Neo.filter.DateContainer
 * @extends Neo.filter.NumberContainer
 */
class DateContainer extends NumberContainer {
    static config = {
        /**
         * @member {String} className='Neo.filter.DateContainer'
         * @protected
         */
        className: 'Neo.filter.DateContainer',
        /**
         * @member {String} ntype='filter-datecontainer'
         * @protected
         */
        ntype: 'filter-datecontainer',
        /**
         * @member {Neo.form.field.Base} fieldModule=DateField
         */
        fieldModule: DateField
    }
}

export default Neo.setupClass(DateContainer);
