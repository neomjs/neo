import CheckBoxField from '../../../form/field/CheckBox.mjs';
import BaseList      from '../../../list/Base.mjs';

/**
 * @class Neo.calendar.view.calendars.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.List'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.List',
        /**
         * @member {String} ntype='calendar-calendars-list'
         * @protected
         */
        ntype: 'calendar-calendars-list',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.calendars'
        }
    }}
}

Neo.applyClassConfig(List);

export {List as default};
