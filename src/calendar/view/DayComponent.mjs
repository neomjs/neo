import WeekComponent from './week/Component.mjs';

/**
 * @class Neo.calendar.view.DayComponent
 * @extends Neo.calendar.view.week.Component
 */
class DayComponent extends WeekComponent {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.DayComponent'
         * @protected
         */
        className: 'Neo.calendar.view.DayComponent',
        /**
         * @member {String[]} cls=['neo-calendar-daycomponent','neo-calendar-weekcomponent']
         */
        cls: ['neo-calendar-daycomponent', 'neo-calendar-weekcomponent']
    }}
}

Neo.applyClassConfig(DayComponent);

export {DayComponent as default};
