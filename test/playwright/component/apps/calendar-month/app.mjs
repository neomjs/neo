import Calendar from '../../../../../src/calendar/view/MainContainer.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary Component-test fixture for the month view's empty-store mount.
 *
 * Only the `month` view is created, and only it is active. The week and year views share the
 * store-count idiom the ticket is about, so leaving them out keeps a red in this fixture
 * attributable to the month grid rather than to a sibling that is out of the ticket's scope.
 *
 * Both stores declare `autoLoad: false`: the fixture must not depend on a request, and an arm
 * that wants records seeds them through `driver.mjs` instead of a URL. `currentDate` is fixed so
 * the grid's span is a value the spec derives rather than one it reads back, and `weekStartDay: 0`
 * keeps the first rendered column Sunday. Both are the mount values: `driver.mjs` moves them at
 * runtime for the structure spec.
 *
 * `neo-config.json` pins the locale to `en-US`, so the `Intl` day and month names do not follow
 * the machine. It sits in the config rather than in `modelData`: the config value seeds the state
 * provider as well as each view's static default, so the mount writes nothing. Sent through
 * `modelData` alone it differs from the default during the application construct and fires
 * `DateSelector.afterSetLocale`, which throws before the page mounts.
 *
 * `monthComponentConfig` names the child view, because the container generates an id for each
 * card it creates. A named month view is what lets the spec count rows and day cells belonging to
 * this component alone, by id prefix, instead of counting a class the other views also use.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        items : [{
            activeView         : 'month',
            calendarStoreConfig: {autoLoad: false},
            eventStoreConfig   : {autoLoad: false},
            flex               : 1,
            id                 : 'calendar-month-under-test',
            module             : Calendar,
            modelData          : {
                currentDate : new Date('2027-02-01T12:00:00'),
                weekStartDay: 0
            },
            monthComponentConfig: {id: 'calendar-month-view'},
            views               : ['month']
        }]
    },
    name: 'CalendarMonthTestApp'
});
