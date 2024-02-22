import WeekComponent from './week/Component.mjs';

/**
 * @class Neo.calendar.view.DayComponent
 * @extends Neo.calendar.view.week.Component
 */
class DayComponent extends WeekComponent {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.DayComponent'
         * @protected
         */
        className: 'Neo.calendar.view.DayComponent',
        /**
         * @member {String[]} baseCls=['neo-calendar-daycomponent','neo-calendar-weekcomponent']
         */
        baseCls: ['neo-calendar-daycomponent', 'neo-calendar-weekcomponent'],
        /**
         * Amount of hidden columns on both sides each inside this view.
         * @member {Number} columnsBuffer=1
         */
        columnsBuffer: 1,
        /**
         * Amount of visible columns inside this view.
         * @member {Number} columnsVisible=1
         */
        columnsVisible: 1
    }

    /**
     * @param {Date} date
     */
    setFirstColumnDate(date) {
        date.setDate(date.getDate() - this.columnsBuffer);
    }
}

Neo.setupClass(DayComponent);

export default DayComponent;
