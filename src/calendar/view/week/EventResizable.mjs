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
        Neo.main.DomAccess.setStyle({
            appName: this.appName,
            id     : 'document.body',
            style  : {cursor: null}
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
        Neo.main.DomAccess.setStyle({
            appName: this.appName,
            id     : 'document.body',
            style  : {cursor: `${Resizable.cursorPositions[Resizable.positions.indexOf(this.currentNodeName)]}-resize !important`}
        });
    }
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
