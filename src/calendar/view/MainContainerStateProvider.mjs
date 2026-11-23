import CalendarsStore from '../store/Calendars.mjs';
import ColorsStore    from '../store/Colors.mjs';
import DateUtil       from '../../../src/util/Date.mjs';
import EventsStore    from '../store/Events.mjs';
import StateProvider  from '../../../src/state/Provider.mjs';

const todayDate = new Date();

/**
 * @class Neo.calendar.view.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.MainContainerStateProvider'
         * @protected
         */
        className: 'Neo.calendar.view.MainContainerStateProvider',
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
             * Mirrors {@link Neo.calendar.view.MainContainer#activeView} so header formulas follow view changes.
             * @member {String} data.activeView='week'
             */
            activeView: 'week',
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
        },
        /**
         * Defines computed properties based on other data properties.
         * @member {Object} formulas
         */
        formulas: {
            /**
             * Formats full and compact localized labels for the active calendar period.
             * Re-runs automatically whenever `activeView`, `currentDate`, `locale`, `showWeekends`, or `weekStartDay` changes.
             * @param {Object} data The hierarchical data proxy
             * @returns {{full: String, short: String}}
             */
            headerPeriod: data => MainContainerStateProvider.formatHeaderPeriod(data),
            /**
             * Creates the Intl.DateTimeFormat instance based on the current locale and timeFormat.
             * This formula will automatically re-run whenever `data.locale` or `data.timeFormat` changes.
             * The result is exposed as the 'timeFormatter' property in the state.
             * @param {Object} data The hierarchical data proxy
             * @returns {Intl.DateTimeFormat}
             */
            timeFormatter: data => (data.locale && data.timeFormat) ? new Intl.DateTimeFormat(data.locale, data.timeFormat) : null
        }
    }

    /**
     * @summary Formats full and compact localized labels for the active calendar period.
     * @param {Object} opts
     * @param {String} opts.activeView
     * @param {Date|null} opts.currentDate
     * @param {String} [opts.locale=Neo.config.locale]
     * @param {Boolean} [opts.showWeekends=true]
     * @param {Number} [opts.weekStartDay=0]
     * @returns {{full: String, short: String}}
     */
    static formatHeaderPeriod({activeView, currentDate, locale = Neo.config.locale, showWeekends = true, weekStartDay = 0}) {
        if (!currentDate || activeView === 'year') {
            return {full: '', short: ''}
        }

        const toWallUtc = date => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())),
              wall      = toWallUtc(currentDate);

        if (activeView === 'day') {
            return {
                full : DateUtil.formatWall(locale, {weekday: 'long', month: 'long',  day: 'numeric', year: 'numeric'}, wall),
                short: DateUtil.formatWall(locale, {month:   'short', day: 'numeric', year: 'numeric'}, wall)
            }
        }

        if (activeView === 'month') {
            return {
                full : DateUtil.formatWall(locale, {month: 'long',  year: 'numeric'}, wall),
                short: DateUtil.formatWall(locale, {month: 'short', year: 'numeric'}, wall)
            }
        }

        if (activeView === 'week') {
            let cursor = new Date(
                    currentDate.getFullYear(),
                    currentDate.getMonth(),
                    currentDate.getDate() - currentDate.getDay() + weekStartDay
                ),
                visibleDays = [],
                i           = 0;

            for (; i < 7; i++) {
                let day = cursor.getDay();

                if (showWeekends || (day !== 0 && day !== 6)) {
                    visibleDays.push(toWallUtc(cursor))
                }

                cursor.setDate(cursor.getDate() + 1)
            }

            let rangeStart = visibleDays[0] || wall,
                rangeEnd   = visibleDays[visibleDays.length - 1] || rangeStart,
                text       = DateUtil.formatWall(locale, {month: 'short', day: 'numeric', year: 'numeric'}, rangeStart, rangeEnd);

            return {full: text, short: text}
        }

        return {full: '', short: ''}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me          = this,
            {component} = me;

        if (component?.activeView) {
            me.setData({activeView: component.activeView})
        }

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
        }
    }
}

export default Neo.setupClass(MainContainerStateProvider);
