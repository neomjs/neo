import Base from '../component/Base.mjs';

/**
 * @class Neo.draggable.DragProxyComponent
 * @extends Neo.component.Base
 */
class DragProxyComponent extends Base {
    static config = {
        /**
         * @member {String} className='Neo.draggable.DragProxyComponent'
         * @protected
         */
        className: 'Neo.draggable.DragProxyComponent',
        /**
         * @member {String} ntype='dragproxy'
         * @protected
         */
        ntype: 'dragproxy',
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {Boolean} autoRender=true
         */
        autoRender: true,
        /**
         * @member {String[]} baseCls=['neo-dragproxy']
         */
        baseCls: ['neo-dragproxy'],
        /**
         * @member {Boolean} moveInMainThread=true
         */
        moveInMainThread: true
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value && this.moveInMainThread) {
            let {appName, id, windowId} = this;

            Neo.main.addon.DragDrop.setDragProxyElement({appName, id, windowId})
        }
    }
}

export default Neo.setupClass(DragProxyComponent);
