import Button             from '../../../src/button/Base.mjs';
import MainContainerModel from '../../../src/calendar/view/MainContainerModel.mjs';
import Toolbar            from '../../../src/container/Toolbar.mjs';
import Viewport           from '../../../src/container/Viewport.mjs';
import WeekComponent      from '../../../src/calendar/view/week/Component.mjs';

/**
 * @class Neo.examples.calendar.weekview.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'Neo.examples.calendar.weekview.MainContainer',
        autoMount: true,
        cls      : ['neo-examples-calendar-maincontainer', 'neo-viewport'],
        layout   : {ntype: 'fit'},
        model    : MainContainerModel,

        calendarStoreConfig_: {
            autoLoad: true,
            url     : '../../examples/calendar/basic/data/calendars.json'
        },

        eventStoreConfig_: {
            autoLoad: true,
            url     : '../../examples/calendar/basic/data/events.json'
        },

        items: [{
            module     : WeekComponent,
            currentDate: new Date('2021-07-20'),
            flex       : 1,
            reference  : 'calendar'
        }]
    }}

    /**
     *
     * @param config
     */
    constructor(config) {
        super(config);
        Neo.worker.App.insertThemeFiles(this.appName, null, 'Neo.calendar.view.MainContainer');
    }
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};
