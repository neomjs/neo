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

    /**
     *
     * @param {Object} data
     */
    onDragEnd(data) {
        this.removeBodyCursorCls();
    }

    /**
     *
     * @param {Object} data
     */
    onDragMove(data) {

    }

    /**
     *
     * @param {Object} data
     */
    onDragStart(data) {
        this.addBodyCursorCls();
    }
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
