import {default as Container} from '../container/Base.mjs';
import Toolbar                from '../container/Toolbar.mjs';

/**
 * @class Neo.calendar.MainContainer
 * @extends Neo.container.Base
 */
class MainContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.MainContainer'
         * @protected
         */
        className: 'Neo.calendar.MainContainer',
        /**
         * @member {String} ntype='calendar-maincontainer'
         * @protected
         */
        ntype: 'calendar-maincontainer',
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         * @protected
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : ['->', {
                text: 'Day'
            }, {
                text: 'Week'
            }, {
                text: 'Month'
            }]
        }, {
            module: Container,
            flex  : 1
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};