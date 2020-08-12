import Base from '../core/Base.mjs';

/**
 * @class Neo.draggable.DragZone
 * @extends Neo.core.Base
 */
class DragZone extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.draggable.DragZone'
         * @protected
         */
        className: 'Neo.draggable.DragZone',
        /**
         * @member {String} ntype='dragzone'
         * @protected
         */
        ntype: 'dragzone',
        /**
         * @member {Neo.component.Base|null} dragElement=null
         * @protected
         */
        dragElement: null
    }}
}

Neo.applyClassConfig(DragZone);

export {DragZone as default};