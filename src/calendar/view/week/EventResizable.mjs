import Resizable from '../../../plugin/Resizable.mjs';

/**
 * @class Neo.calendar.view.week.EventResizable
 * @extends Neo.container.Base
 */
class EventResizable extends Resizable {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.week.EventResizable'
         * @protected
         */
        className: 'Neo.calendar.view.week.EventResizable'
    }}
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
