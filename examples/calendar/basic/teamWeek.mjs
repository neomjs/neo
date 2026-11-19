/**
 * @module examples/calendar/basic/teamWeek
 * @summary A team's week around today, so the calendar example never opens on an empty or dated week.
 *
 * Six calendars: a shared Team calendar and one per teammate. The week of today carries the full schedule; the weeks
 * before and after keep the team's recurring meetings, so paging stays populated.
 */

/**
 * @summary The shared team calendar and one per teammate, each in one of the calendar's six colors.
 * @type {Object[]}
 */
export const calendars = [
    {active: true, color: 'red',    id: 1, name: 'Team'},
    {active: true, color: 'pink',   id: 2, name: 'Maya'},
    {active: true, color: 'orange', id: 3, name: 'Jonas'},
    {active: true, color: 'yellow', id: 4, name: 'Priya'},
    {active: true, color: 'green',  id: 5, name: 'Leo'},
    {active: true, color: 'blue',   id: 6, name: 'Sofia'}
];

// Each entry: weekday (0 = Sunday), start time, minutes, calendarId, title
const recurring = [
    ...[1, 2, 3, 4, 5].map(day => [day, '09:30', 30, 1, 'Stand-up']),
    [1, '10:00', 60, 1, 'Sprint planning'],
    [5, '15:00', 60, 1, 'Sprint demo']
];

const thisWeek = [
    [1, '13:00', 60, 2, 'Onboarding flow critique'],
    [1, '15:00', 60, 4, 'Customer interview: Northwind'],
    [2, '11:00', 60, 5, 'Acme renewal call'],
    [2, '14:00', 90, 3, 'Pairing: offline sync'],
    [2, '16:00', 30, 6, 'Release checklist'],
    [3, '10:30', 60, 2, 'Design review'],
    [3, '13:00', 60, 3, 'Code review: grid export'],
    [3, '15:00', 60, 4, 'Roadmap sync'],
    [4, '12:00', 60, 1, 'Lunch & learn: web workers'],
    [4, '14:00', 60, 5, 'Globex product demo'],
    [4, '16:00', 30, 6, 'Incident review'],
    [5, '11:00', 30, 6, 'On-call handover']
];

// Each entry: startDay (0 = Sunday), endDay (inclusive), calendarId, title
const allDayThisWeek = [
    [2, 4, 6, 'Architecture summit'],
    [4, 4, 5, 'Release freeze']
];

/**
 * @summary Creates the events of today's week (Sunday to Saturday) and the recurring meetings of the weeks around it.
 * @param {Date} [today=new Date()]
 * @returns {Object[]} Event records: `allDay`, `calendarId`, `endDate`, `id`, `startDate` and `title`.
 */
export function createEvents(today = new Date()) {
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay()),
        events   = [];

    const add = (week, [day, start, minutes, calendarId, title]) => {
        const [hours, mins] = start.split(':').map(Number),
            startDate       = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 7 * week + day, hours, mins);

        events.push({allDay: false, calendarId, endDate: new Date(startDate.getTime() + minutes * 60000), id: events.length + 1, startDate, title})
    };

    const addAllDay = ([startDay, endDay, calendarId, title]) => {
        const startDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + startDay, 0, 0),
              endDate   = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + endDay,  23, 59);

        events.push({allDay: true, calendarId, endDate, id: events.length + 1, startDate, title})
    };

    for (const week of [-1, 0, 1]) recurring.forEach(event => add(week, event));
    thisWeek.forEach(event => add(0, event));
    allDayThisWeek.forEach(addAllDay);

    return events
}
