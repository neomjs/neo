import Resizable from '../../../../plugin/Resizable.mjs';

/**
 * @class Neo.calendar.view.week.plugin.EventResizable
 * @extends Neo.plugin.Resizable
 */
class EventResizable extends Resizable {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.week.plugin.EventResizable'
         * @protected
         */
        className: 'Neo.calendar.view.week.plugin.EventResizable',
        /**
         * @member {String} ntype='plugin-calendar-week-eventresizable'
         * @protected
         */
        ntype: 'plugin-calendar-week-eventresizable'
    }

    /**
     * @param {Object} data
     */
    onDragEnd(data) {
        let me = this;

        me.isDragging = false;
        me.removeBodyCursorCls();
        me.removeAllNodes();
    }

    /**
     * @param {Object} data
     */
    onDragMove(data) {

    }

    /**
     * @param {Object} data
     */
    onDragStart(data) {
        let me = this;

        me.isDragging = true;
        me.addBodyCursorCls();
        me.owner.eventDragZone[me.currentNodeName === 'top' ? 'keepEndDate' : 'keepStartDate'] = true
    }

    /**
     * Only show the resize handles in case dragging is enabled.
     * @param {Object} data
     */
    onMouseMove(data) {
        if (this.owner.data.events.enableDrag) {
            super.onMouseMove(data)
        }
    }
}

export default Neo.setupClass(EventResizable);
