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

        Object.assign(this.owner.eventDragZone, {
            keepEndDate  : false,
            keepStartDate: false
        });
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
        let me = this;

        this.addBodyCursorCls();
        this.owner.eventDragZone[me.currentNodeName === 'top' ? 'keepStartDate' : 'keepEndDate'] = true;
    }
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
