import Button                from '../../../src/component/Button.mjs';
import {default as Calendar} from '../../../src/calendar/MainContainer.mjs';
import Toolbar               from '../../../src/container/Toolbar.mjs';
import Viewport              from '../../../src/container/Viewport.mjs';

/**
 * @class CalendarBasic.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static getConfig() {return {
        className: 'CalendarBasic.MainContainer',
        ntype    : 'calendar-basic-maincontainer',

        autoMount: true,
        layout   : {ntype: 'vbox', align: 'stretch'},

        items: [{
            module : Toolbar,
            flex   : 'none',
            padding: 20,

            style: {
                backgroundColor: '#f2f2f2',
                padding        : '10px 5px 10px 10px'
            },

            items: ['->', {
                module : Button,
                iconCls: 'fa fa-moon',
                text   : 'Theme Dark'
            }]
        }, {
            module: Calendar,
            flex  : 1
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};