import {default as Calendar} from '../../../src/calendar/MainContainer.mjs';
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
        layout   : {ntype: 'fit'},

        items: [{
            module: Calendar
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};