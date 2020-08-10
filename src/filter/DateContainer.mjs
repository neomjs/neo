import Date            from '../form/field/Date.mjs';
import NumberContainer from './NumberContainer.mjs';

/**
 * @class Neo.filter.DateContainer
 * @extends Neo.filter.NumberContainer
 */
class DateContainer extends NumberContainer {
    static getConfig() {return {
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
         * @member {Neo.form.field.Base} fieldModule=Date
         */
        fieldModule: Date
    }}
}

Neo.applyClassConfig(DateContainer);

export {DateContainer as default};