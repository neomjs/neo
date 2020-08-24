import Component from '../../component/Base.mjs';

const todayDate = new Date();

const today = {
    day  : todayDate.getDate(),
    month: todayDate.getMonth(),
    year : todayDate.getFullYear()
};

/**
 * @class Neo.calendar.view.DayComponent
 * @extends Neo.component.Base
 */
class DayComponent extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.DayComponent'
         * @protected
         */
        className: 'Neo.calendar.view.DayComponent',
        /**
         * @member {String} ntype='calendar-view-daycomponent'
         * @protected
         */
        ntype: 'calendar-view-daycomponent',
        /**
         * @member {String[]} cls=['neo-calendar-daycomponent']
         */
        cls: ['neo-calendar-daycomponent'],
        /**
         * Will get passed from the MainContainer
         * @member {Date|null} currentDate_=null
         * @protected
         */
        currentDate_: null,
        /**
         * @member {Neo.calendar.store.Events|null} eventStore_=null
         */
        eventStore_: null,
        /**
         * @member {String} html='Month'
         */
        html: 'Day', // todo: remove
        /**
         * @member {Object} vdom
         */
        vdom: {},
        /**
         * 0-6 => Sun-Sat
         * @member {Number} weekStartDay_=0
         */
        weekStartDay_: 0
    }}
}

Neo.applyClassConfig(DayComponent);

export {DayComponent as default};