import Button                    from '../../../src/button/Base.mjs';
import Calendar                  from '../../../src/calendar/view/MainContainer.mjs';
import MainContainerController   from './MainContainerController.mjs';
import Toolbar                   from '../../../src/toolbar/Base.mjs';
import Viewport                  from '../../../src/container/Viewport.mjs';
import {calendars, createEvents} from './teamWeek.mjs';

/**
 * @summary The calendar on a team's week around today, from 8 AM to 7 PM so that the week's meetings are in view when it
 * opens, with a line that says how to move and resize an event. At a phone's width the controller swaps in the day view
 * and folds the side panel away.
 * @class Neo.examples.calendar.basic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className  : 'Neo.examples.calendar.basic.MainContainer',
        autoMount  : true,
        cls        : ['neo-examples-calendar-maincontainer', 'neo-viewport'],
        controller : MainContainerController,
        layout     : {ntype: 'vbox', align: 'stretch'},
        listeners  : {resize: 'onResize'},
        monitorSize: true,

        items: [{
            module : Toolbar,
            flex   : 'none',
            padding: 20,
            reference: 'headerToolbar',

            style: {
                backgroundColor: '#f2f2f2',
                padding        : '10px 5px 10px 10px'
            },

            items: [{
                ntype: 'component',
                cls  : ['neo-header'],
                html : '<i class="fa fa-calendar"></i>neo.mjs Calendar'
            }, {
                ntype: 'component',
                cls  : ['neo-examples-calendar-hint'],
                text : 'Drag an event to move it, drag its lower edge to resize it'
            }, '->', {
                module   : Button,
                handler  : 'onSwitchThemeButtonClick',
                height   : 27,
                iconCls  : 'fa fa-moon',
                reference: 'theme-button',
                text     : 'Theme Dark'
            }, {
                module : Button,
                height : 27,
                iconCls: 'fab fa-github',
                style  : {marginLeft: '5px'},
                text   : 'GitHub',
                url    : 'https://github.com/neomjs/neo/tree/dev/src/calendar'
            }]
        }, {
            module   : Calendar,
            flex     : 1,
            reference: 'calendar',

            calendarStoreConfig: {data: calendars},
            eventStoreConfig   : {data: createEvents()},
            modelData          : {endTime: '19:00', startTime: '08:00'}
        }]
    }
}

export default Neo.setupClass(MainContainer);
