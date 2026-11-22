import Calendar                  from '../../../src/calendar/view/MainContainer.mjs';
import Component                 from '../../../src/component/Base.mjs';
import Container                 from '../../../src/container/Base.mjs';
import MainContainerController   from './MainContainerController.mjs';
import ThemeSwitcher             from '../../../src/button/ThemeSwitcher.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';
import {calendars, createEvents} from './teamYear.mjs';

/**
 * @summary A team's year at a glance: the calendar opens on the year view, with today marked and the days that have
 * events shaded. A click on a day opens that day's events. A line above the calendar says so, beside the theme switch.
 * @class Neo.examples.calendar.year.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.calendar.year.MainContainer'
         * @protected
         */
        className: 'Neo.examples.calendar.year.MainContainer',
        /**
         * @member {String[]} cls=['neo-examples-calendar-year']
         * @reactive
         */
        cls: ['neo-examples-calendar-year'],
        /**
         * @member {Neo.controller.Component} controller=MainContainerController
         * @reactive
         */
        controller: MainContainerController,
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Container,
            cls   : ['neo-examples-calendar-year-header'],
            flex  : 'none',
            layout: {ntype: 'hbox', align: 'center'},

            items: [{
                module: Component,
                flex  : 1,
                vdom  : {tag: 'header', cn: [
                    {tag: 'h1', cls: ['neo-examples-calendar-year-title'], text: 'The team\'s year'},
                    {tag: 'p',  cls: ['neo-examples-calendar-year-hint'],  text: 'Shaded days have events, the stronger the shade the busier the day. Click a day to open it.'}
                ]}
            }, {
                module: ThemeSwitcher,
                flex  : 'none'
            }]
        }, {
            module    : Calendar,
            activeView: 'year',
            flex      : 1,
            listeners : {cardLoaded: 'onCalendarCardLoaded'},
            reference : 'calendar',
            // The year view brings its own navigation and takes the whole width; the menu button opens the side panel
            sideBarExpanded: false,

            calendarStoreConfig: {data: calendars},
            eventStoreConfig   : {data: createEvents()}
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @reactive
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object} listeners={resize:'onResize'}
         */
        listeners: {resize: 'onResize'},
        /**
         * @member {Boolean} monitorSize=true
         */
        monitorSize: true
    }
}

export default Neo.setupClass(MainContainer);
