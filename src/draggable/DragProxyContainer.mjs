import BaseContainer      from '../container/Base.mjs';
import DragProxyComponent from './DragProxyComponent.mjs';

/**
 * @class Neo.draggable.DragProxyContainer
 * @extends Neo.container.Base
 */
class DragProxyContainer extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.draggable.DragProxyContainer'
         * @protected
         */
        className: 'Neo.draggable.DragProxyContainer',
        /**
         * @member {String} ntype='dragproxycontainer'
         * @protected
         */
        ntype: 'dragproxycontainer',
        /**
         * @member {Boolean} autoInitVnode=true
         */
        autoInitVnode: true,
        /**
         * @member {Boolean} autoMount=true
         */
        autoMount: true,
        /**
         * @member {String[]} baseCls=['neo-dragproxy']
         */
        baseCls: ['neo-dragproxy'],
        /**
         * @member {Object} layout='fit'
         * @reactive
         */
        layout: 'fit',
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

    /**
     * Triggered after the windowId config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetWindowId(value, oldValue) {
        super.afterSetWindowId(value, oldValue);

        // We want to reuse the styling of the DragProxyComponent, since both use the same baseCls.
        // Instead of duplicating the scss file, we are forcing the ThemeEngine to load the component file.
        if (value) {
            Neo.currentWorker.insertThemeFiles(value, DragProxyComponent.prototype)
        }
    }

    /**
     * We do NOT want to destroy child items, since they get re-used.
     * @param {...*} args
     */
    destroy(...args) {
        this.items = [];
        super.destroy(...args)
    }
}

export default Neo.setupClass(DragProxyContainer);
