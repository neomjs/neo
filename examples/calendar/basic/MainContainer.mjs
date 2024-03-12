import Button                  from '../../../src/button/Base.mjs';
import Calendar                from '../../../src/calendar/view/MainContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/toolbar/Base.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class Neo.examples.calendar.basic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        className : 'Neo.examples.calendar.basic.MainContainer',
        autoMount : true,
        cls       : ['neo-examples-calendar-maincontainer', 'neo-viewport'],
        controller: MainContainerController,
        layout    : {ntype: 'vbox', align: 'stretch'},

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
            }, '->', {
                module : Button,
                handler: 'onSwitchThemeButtonClick',
                height : 27,
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
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

            calendarStoreConfig: {
                autoLoad: true,
                url     : '../../examples/calendar/basic/data/calendars.json'
            },

            eventStoreConfig: {
                autoLoad: true,
                url     : '../../examples/calendar/basic/data/events.json'
            },

            modelData: {
                currentDate: new Date('2021-07-20')
            }
        }]
    }
}

Neo.setupClass(MainContainer);

export default MainContainer;
