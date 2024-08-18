import MainContainerModel from '../../../src/calendar/view/MainContainerModel.mjs';
import Viewport           from '../../../src/container/Viewport.mjs';
import WeekComponent      from '../../../src/calendar/view/week/Component.mjs';

/**
 * @class Neo.examples.calendar.weekview.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.calendar.weekview.MainContainer'
         * @protected
         */
        className: 'Neo.examples.calendar.weekview.MainContainer',
        /**
         * Value for the container.Base layout_ config
         * @member {Object} layout={ntype: 'fit'}
         */
        layout: {ntype: 'fit'},
        /**
         * Value for the component.Base model_ config
         * The calendar view model relies on the connected view to have the calendarStoreConfig_ & eventStoreConfig_
         * configs. We have two options here:
         * 1. Extend Neo.calendar.view.week.Component and add the configs and view model there.
         * 2. Just drop them into a parent view.
         * @member {Neo.calendar.view.MainContainerModel} model=MainContainerModel
         */
        model: {
            module: MainContainerModel,
            data  : {
                currentDate: new Date('2024-07-21')
            }
        },
        /**
         * Config options for Neo.calendar.store.Calendars.
         * The calendar view model relies on it.
         * @member {Object} calendarStoreConfig_
         */
        calendarStoreConfig_: {
            autoLoad: true,
            url     : '../../examples/calendar/basic/data/calendars.json'
        },
        /**
         * Config options for Neo.calendar.store.Events.
         * The calendar view model relies on it.
         * @member {Object} eventStoreConfig_
         */
        eventStoreConfig_: {
            autoLoad: true,
            url     : '../../examples/calendar/basic/data/events.json'
        },
        /**
         * Value for the container.Base items_ config
         * @member {Object[]} items
         */
        items: [{
            module: WeekComponent
        }]
    }

    /**
     * The styles for calendar events are located inside the MainContainer CSS output.
     * We want to fetch the CSS without requiring to load the related JS module.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.worker.App.insertThemeFiles(this.appName, null, 'Neo.calendar.view.MainContainer')
    }
}

export default Neo.setupClass(MainContainer);
