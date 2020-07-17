import {default as Container} from '../container/Base.mjs';

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
         * @member {Object[]} items
         * @protected
         */
        items: [{
            ntype: 'component',
            vdom : {innerHTML: 'calendar'}
        }]
    }}
}

Neo.applyClassConfig(MainContainer);

export {MainContainer as default};