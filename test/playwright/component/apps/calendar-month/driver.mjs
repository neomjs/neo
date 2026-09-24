/**
 * @module test/playwright/component/apps/calendar-month/driver
 * @summary Writes into the month view's stores or state from inside the App Worker: one write per
 * import, named by the module's own `action` query parameter.
 *
 * A spec cannot add a record by pointer, and it cannot reach the stores through `page.evaluate`
 * either, because they live in the App Worker alongside the component that reads them.
 * `Neo.worker.App.loadModule()` imports this module where the stores are, so each write runs in the
 * order the spec asked for it. The caller adds a counter to the query, which makes every call a new
 * module URL and therefore evaluates it again.
 *
 * These are the writes the ticket's cases need, and they are deliberately raw: `addCalendar` and
 * `addEvent` seed a matched pair, `addOrphanEvent` seeds an event whose calendar is absent from the
 * calendar store, which is the record shape that reaches `createWeek`'s `.active` read with nothing
 * to read it from. `setCurrentDate`, `setWeekStartDay` and `setShowWeekends` move the fixture's
 * mount values through the state provider, the path the app's own settings take.
 */
const {searchParams} = new URL(import.meta.url),
      month          = Neo.getComponent('calendar-month-view'),
      action         = searchParams.get('action');

const eventDate = new Date('2027-02-10T09:00:00');

switch (action) {
    case 'addCalendar':
        month.calendarStore.add({active: true, color: 'red', id: 1, name: 'Probe'});
        break;
    case 'addEvent':
        month.eventStore.add({
            calendarId: 1,
            endDate   : new Date('2027-02-10T10:00:00'),
            id        : 1,
            startDate : eventDate,
            title     : 'Probe event'
        });
        break;
    case 'addOrphanEvent':
        month.eventStore.add({
            calendarId: 99,
            endDate   : new Date('2027-02-10T10:00:00'),
            id        : 1,
            startDate : eventDate,
            title     : 'Orphan event'
        });
        break;
    case 'setCurrentDate':
        month.setState('currentDate', new Date('2027-08-01T12:00:00'));
        break;
    case 'setWeekStartDay':
        month.setState('weekStartDay', 1);
        break;
    case 'setShowWeekends':
        month.setState('showWeekends', false);
        break;
    default:
        throw new Error(`Unknown calendar-month driver action: ${action}`)
}
