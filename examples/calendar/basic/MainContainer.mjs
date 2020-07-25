import Button                  from '../../../src/component/Button.mjs';
import {default as Calendar}   from '../../../src/calendar/MainContainer.mjs';
import MainContainerController from './MainContainerController.mjs';
import Toolbar                 from '../../../src/container/Toolbar.mjs';
import Viewport                from '../../../src/container/Viewport.mjs';

/**
 * @class CalendarBasic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'CalendarBasic.MainContainer',
        ntype    : 'calendar-basic-maincontainer',

        autoMount : true,
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
                html : '<i class="fa fa-calendar"></i>neo.mjs Calendar (Sneak Preview)'
            }, '->', {
                module : Button,
                handler: 'onSwitchThemeButtonClick',
                height : 27,
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }]
        }, {
            module   : Calendar,
            reference: 'calendar',
            flex     : 1,

            eventStoreConfig: {
                autoLoad: true,
                url     : '../../examples/calendar/basic/data/events.json'
            }
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};