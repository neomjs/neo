import Container     from '../../../../src/container/Base.mjs';
import MainContainer from '../../../../src/calendar/view/MainContainer.mjs';

/**
 * The team's calendars, one per person the desktop's accounts and messages name
 * @type {Object[]}
 */
const calendars = [
    {active: true, color: 'blue',   id: 1, name: 'Team'},
    {active: true, color: 'green',  id: 2, name: 'Alex'},
    {active: true, color: 'orange', id: 3, name: 'Sam'},
    {active: true, color: 'pink',   id: 4, name: 'Mia'}
];

// Each entry: weekday (0 = Sunday), start time, minutes, calendarId, title
const meetings = [
    ...[1, 2, 3, 4, 5].map(day => [day, '09:30', 30, 1, 'Stand-up']),
    [1, '10:00', 60, 1, 'Launch planning'],
    [1, '14:00', 90, 3, 'Release notes pass'],
    [2, '11:00', 60, 2, 'Permissions audit'],
    [2, '15:00', 60, 4, 'Playlist for the party'],
    [3, '10:00', 60, 1, 'Design review'],
    [3, '13:30', 60, 3, 'Examples screenshots'],
    [4, '11:00', 30, 2, 'Guest access check-in'],
    [4, '14:00', 60, 1, 'Support questions'],
    [5, '12:00', 60, 1, 'Team lunch'],
    [5, '15:00', 60, 1, 'Sprint demo']
];

/**
 * @summary Creates the team's meetings in the week of `today`, so the window never opens on an empty or dated week.
 * @param {Date} [today=new Date()]
 * @returns {Object[]} Event records: `allDay`, `calendarId`, `endDate`, `id`, `startDate` and `title`
 */
function createEvents(today=new Date()) {
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay());

    return meetings.map(([day, start, minutes, calendarId, title], index) => {
        const [hours, mins] = start.split(':').map(Number),
              startDate     = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + day, hours, mins);

        return {allDay: false, calendarId, endDate: new Date(startDate.getTime() + minutes * 60000), id: index + 1, startDate, title}
    })
}

/**
 * @summary The Calendar app: the engine's calendar on the team's week. The calendar joins the window once the window
 * shows at its size: the week view measures its scroll position when it mounts, and a window grows out of its launcher
 * icon first, so a calendar mounted with the window would measure the growing window and open on another week.
 * @class WebDesktop.view.apps.Calendar
 * @extends Neo.container.Base
 */
class Calendar extends Container {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.apps.Calendar'
         * @protected
         */
        className: 'WebDesktop.view.apps.Calendar',
        /**
         * @member {Object} layout='fit'
         */
        layout: 'fit'
    }

    /**
     * Waits for the window's first show. The window manager creates a window hidden and shows it afterwards, so the
     * listener is in place before the show.
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.up('dialog').on({show: me.onWindowShow, once: true, scope: me})
    }

    /**
     * Adds the calendar, now that the window has its size, on the working hours so the week's meetings are in view
     */
    onWindowShow() {
        let calendar = this.add({
            module              : MainContainer,
            calendarStoreConfig : {data: calendars},
            eventStoreConfig    : {data: createEvents()},
            useSettingsContainer: false
        });

        calendar.stateProvider.setData({endTime: '19:00', startTime: '08:00'})
    }
}

export default Neo.setupClass(Calendar);
