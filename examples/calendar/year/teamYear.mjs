/**
 * @module examples/calendar/year/teamYear
 * @summary A product team's year around today, so the year view never opens on an empty or dated year.
 *
 * Six calendars: a shared Team calendar and one per teammate. The team's cadence runs through the whole year: sprint
 * planning and a demo every second week, a monthly all-hands and release, a two-day offsite each quarter. Each
 * teammate adds a vacation and a conference, and the week of today carries its full schedule, so a click on today
 * opens a busy day. Days stack up to the year view's medium and high marks where these meet; quiet days stay blank.
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

// Each entry: calendarId, title, month (0 = January), first day, number of days
const awayDays = [
    [2, 'Vacation: Lisbon',          1, 16, 9],
    [3, 'Conference: JSWorld',       2, 4,  3],
    [4, 'Vacation',                  4, 25, 12],
    [5, 'Conference: ReactiveConf',  5, 10, 2],
    [6, 'Vacation: hiking',          6, 20, 14],
    [2, 'Conference: Smashing',      8, 8,  3],
    [3, 'Vacation',                  9, 12, 7],
    [5, 'Vacation: family visit',    11, 21, 10]
];

// Each entry: weekday (0 = Sunday), start time, minutes, calendarId, title
const thisWeek = [
    [1, '13:00', 60, 2, 'Onboarding flow critique'],
    [2, '11:00', 60, 5, 'Acme renewal call'],
    [2, '14:00', 90, 3, 'Pairing: offline sync'],
    [3, '10:30', 60, 2, 'Design review'],
    [3, '15:00', 60, 4, 'Roadmap sync'],
    [4, '12:00', 60, 1, 'Lunch & learn: web workers'],
    [4, '14:00', 60, 5, 'Globex product demo'],
    [5, '11:00', 30, 6, 'On-call handover']
];

/**
 * @summary The date of a month's n-th weekday, or of its last one for n = -1.
 * @param {Number} year
 * @param {Number} month 0 = January
 * @param {Number} weekday 0 = Sunday
 * @param {Number} n 1 for the first, -1 for the last
 * @returns {Date}
 */
function nthWeekday(year, month, weekday, n) {
    if (n < 0) {
        const last = new Date(year, month + 1, 0);

        return new Date(year, month, last.getDate() - (last.getDay() - weekday + 7) % 7)
    }

    const first = new Date(year, month, 1);

    return new Date(year, month, 1 + (weekday - first.getDay() + 7) % 7 + 7 * (n - 1))
}

/**
 * @summary Creates the year of today: the team's cadence from January to December, the teammates' days away, and the
 * full schedule of today's week.
 * @param {Date} [today=new Date()]
 * @returns {Object[]} Event records: `allDay`, `calendarId`, `endDate`, `id`, `startDate` and `title`.
 */
export function createEvents(today = new Date()) {
    const year   = today.getFullYear(),
          events = [];

    const add = (date, start, minutes, calendarId, title) => {
        const [hours, mins] = start.split(':').map(Number),
              startDate     = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, mins);

        events.push({allDay: false, calendarId, endDate: new Date(startDate.getTime() + minutes * 60000), id: events.length + 1, startDate, title})
    };

    const addAllDay = (startDate, days, calendarId, title) => {
        const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + days - 1, 23, 59);

        events.push({allDay: true, calendarId, endDate, id: events.length + 1, startDate, title})
    };

    // Two-week sprints from the first Monday of the year: planning on its Monday, the demo on its second Friday
    for (let monday = nthWeekday(year, 0, 1, 1); monday.getFullYear() === year; monday.setDate(monday.getDate() + 14)) {
        const demo = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 11);

        add(monday, '10:00', 60, 1, 'Sprint planning');
        demo.getFullYear() === year && add(demo, '15:00', 60, 1, 'Sprint demo')
    }

    for (let month = 0; month < 12; month++) {
        add(nthWeekday(year, month, 2, 1), '16:00', 45, 1, 'All-hands');
        add(nthWeekday(year, month, 4, -1), '11:00', 30, 6, `Release ${year % 100}.${month + 1}`);

        // A two-day offsite opens each quarter, in its second week
        month % 3 === 0 && addAllDay(nthWeekday(year, month, 3, 2), 2, 1, 'Quarterly offsite')
    }

    awayDays.forEach(([calendarId, title, month, day, days]) => addAllDay(new Date(year, month, day), days, calendarId, title));

    const sunday = new Date(year, today.getMonth(), today.getDate() - today.getDay());

    thisWeek.forEach(([weekday, start, minutes, calendarId, title]) => {
        add(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + weekday), start, minutes, calendarId, title)
    });

    return events
}
