import {default as BaseDragZone} from '../../draggable/DragZone.mjs';

/**
 * @class Neo.calendar.draggable.DragZone
 * @extends Neo.draggable.DragZone
 */
class DragZone extends BaseDragZone {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.draggable.DragZone'
         * @protected
         */
        className: 'Neo.calendar.draggable.DragZone',
        /**
         * @member {String} ntype='calendar-dragzone'
         * @protected
         */
        ntype: 'calendar-dragzone',
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false
    }}
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};