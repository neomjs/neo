import Calendar from '../../../../../src/calendar/view/MainContainer.mjs';
import Viewport from '../../../../../src/container/Viewport.mjs';

/**
 * @summary E2E fixture: the full calendar on fixed July 2024 data, active on Sunday 21 July.
 *
 * The calendar e2e specs assert that week's header and drag that data's events, so they need a calendar that never
 * moves with the clock. `examples/calendar/basic` opens on today; this fixture keeps the data it opened on before.
 * A spec can add calendar configs, such as `sideBarExpanded: false`, as `calendarConfig` in this app's neo-config.
 */
export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        layout: {ntype: 'vbox', align: 'stretch'},
        items : [{
            module: Calendar,
            flex  : 1,

            calendarStoreConfig: {
                autoLoad: true,
                url     : '../../test/playwright/component/apps/calendar-basic/data/calendars.json'
            },

            eventStoreConfig: {
                autoLoad: true,
                url     : '../../test/playwright/component/apps/calendar-basic/data/events.json'
            },

            modelData: {
                currentDate: new Date('2024-07-21')
            },

            ...Neo.config.calendarConfig
        }]
    },
    name: 'CalendarBasicTestApp'
});
