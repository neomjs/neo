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
        Neo.currentWorker.promiseMessage('main', {
            action : 'updateDom',
            appName: this.appName,
            deltas : {
                id : 'document.body',
                cls: {
                    add   : [],
                    remove: [`neo-cursor-${Resizable.cursorPositions[Resizable.positions.indexOf(this.currentNodeName)]}-resize`]
                }
            }
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
        Neo.currentWorker.promiseMessage('main', {
            action : 'updateDom',
            appName: this.appName,
            deltas : {
                id : 'document.body',
                cls: {
                    add   : [`neo-cursor-${Resizable.cursorPositions[Resizable.positions.indexOf(this.currentNodeName)]}-resize`],
                    remove: []
                }
            }
        });
    }
}

Neo.applyClassConfig(EventResizable);

export {EventResizable as default};
