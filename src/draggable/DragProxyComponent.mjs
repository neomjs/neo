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
         * @member {String[]} cls=['neo-dragproxy']
         */
        cls: ['neo-dragproxy'],
        /**
         * @member {Boolean} moveInMainThread=true
         */
        moveInMainThread: true
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.on('mounted', me.onMounted, me)
    }

    /**
     * @param {String} id
     */
    onMounted(id) {
        if (this.moveInMainThread) {
            let {appName, id, windowId} = this;

            Neo.main.addon.DragDrop.setDragProxyElement({
                appName,
                id,
                windowId
            })
        }
    }
}

export default Neo.setupClass(DragProxyComponent);
