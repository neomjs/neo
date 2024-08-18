import CalendarsStore from '../store/Calendars.mjs';
import ColorsStore    from '../store/Colors.mjs';
import EventsStore    from '../store/Events.mjs';
import Component      from '../../../src/model/Component.mjs';

const todayDate = new Date();

/**
 * @class Neo.calendar.view.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.MainContainerModel'
         * @protected
         */
        className: 'Neo.calendar.view.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * Selecting a calendar inside Neo.calendar.view.calendars.List will store the id (keyProperty) here.
             * @member {Number|String|null} data.activeCalendarId=null
             */
            activeCalendarId: null,
            /**
             * The currently active date inside all views
             * @member {Date} data.currentDate=new Date()
             */
            currentDate: todayDate,
            /**
             * Only full hours are valid for now
             * format: 'hh:mm'
             * @member {String} data.endTime='24:00'
             */
            endTime: '24:00',
            /**
             * Nested property for event related configs
             * @member {Object} data.events
             */
            events: {
                /**
                 * Valid values: all-sides, left, right
                 * @member {String} data.events.border='left'
                 */
                border: 'left',
                /**
                 * Enables moving and resizing events via drag & drop
                 * @member {Object} data.events.enableDrag = true
                 */
                enableDrag: true,
                /**
                 * Enables editing events via double click => calendar.view.EditEventContainer
                 * @member {Boolean} data.events.enableEdit=true
                 */
                enableEdit: true,
                /**
                 * Enables resizing an event via the south handle to an earlier start time and
                 * resizing via the north handle to a later end time.
                 * @member {Boolean} data.events.enableResizingAcrossOppositeEdge=true
                 */
                enableResizingAcrossOppositeEdge: true
            },
            /**
             * Read only, it will automatically get created inside onDataPropertyChange()
             * @member {Intl.DateTimeFormat|null} data.intlFormat_time=null
             */
            intlFormat_time: null,
            /**
             * @member {String} data.locale=Neo.config.locale
             */
            locale: Neo.config.locale,
            /**
             * Time in minutes
             * @member {Number} data.minimumEventDuration=30
             */
            minimumEventDuration: 30,
            /**
             * True to scroll new years in from the top
             * @member {Boolean} data.scrollNewYearFromTop=false
             */
            scrollNewYearFromTop: false,
            /**
             * @member {Boolean} data.showWeekends=true
             */
            showWeekends: true,
            /**
             * Only full hours are valid for now
             * format: 'hh:mm'
             * @member {String} data.startTime='00:00'
             */
            startTime: '00:00',
            /**
             * @member {Object} data.timeFormat={hour:'2-digit',minute:'2-digit'}
             */
            timeFormat: {hour: '2-digit', minute: '2-digit'},
            /**
             * 0-6 => Sun-Sat
             * @member {Number} data.weekStartDay=0
             */
            weekStartDay: 0
        }
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me          = this,
            {component} = me;

        /**
         * @member {Object} stores
         */
        me.stores = {
            /**
             * config object for {Neo.calendar.store.Calendars}
             * @member {Object} stores.calendars
             */
            calendars: {
                module: CalendarsStore,
                ...component.calendarStoreConfig
            },
            /**
             * config object for {Neo.calendar.store.ColorsStore}
             * @member {Object} stores.colors
             */
            colors: {
                module: ColorsStore,
                ...component.colorStoreConfig
            },
            /**
             * config object for {Neo.calendar.store.Events}
             * @member {Object} stores.events
             */
            events: {
                module: EventsStore,
                ...component.eventStoreConfig
            }
        };
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        let {data} = this;

        switch(key) {
            case 'locale': {
                data.intlFormat_time = new Intl.DateTimeFormat(value, data.timeFormat);
                break
            }

            case 'timeFormat': {
                data.intlFormat_time = new Intl.DateTimeFormat(data.locale, value);
                break
            }
        }
    }
}

export default Neo.setupClass(MainContainerModel);
