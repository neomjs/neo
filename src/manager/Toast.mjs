import Base     from './Base.mjs';
import NeoArray from "../util/Array.mjs";

/**
 * See Neo.dialog.Toast for examples
 * @class Neo.manager.Toast
 * @extends Neo.manager.Base
 * @singleton
 */
class Toast extends Base {
    static config = {
        /**
         * @member {String} className='Neo.manager.Toast'
         * @protected
         */
        className: 'Neo.manager.Toast',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Using a default margin between the item
     * If you switch the distance to the top or bottom you have to change this value accordingly
     * @member {Number} defaultMargin=16
     */
    defaultMargin = 16
    /**
     * Currently only 1 is supported, because they would overlap
     * @member {Number} maxToasts=3
     */
    maxToasts = 3
    /**
     * Counts the currently running Toasts per area
     * @member {Object} running
     */
    running = {
        bc: [], bl: [], br: [],
        tc: [], tl: [], tr: []
    }
    /**
     * If you prefer your own class to open, override here
     * @member {String} toastClass='Neo.component.Toast'
     */
    toastClass = 'Neo.component.Toast'

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);
        Neo.toast = this.createToast.bind(this);
    }

    /**
     * Create the Toast definition and pass it to the Collection
     * @param {Object} toast
     * @returns {String|null}
     */
    createToast(toast) {
        let me = this;

        if (toast.position && !me.running[toast.position]) {
            Neo.logError('[Neo.manager.Toast] Supported values for slideDirection are: tl, tc, tr, bl, bc, br');
            return null
        }

        if (!toast.msg || !toast.appName) {
            !toast.msg     && Neo.logError('[Neo.manager.Toast] Toast has to define a msg');
            !toast.appName && Neo.logError('[Neo.manager.Toast] Toast has to define an appName. Typically me.appName.');
            return null
        }

        toast = Neo.create({
            className: this.toastClass,
            ...toast
        });

        toast.on({
            mounted: me.updateItemsInPosition,
            scope  : me
        })

        return toast.id
    }

    /**
     * Find the first toast based on the maximum allowed toasts
     * @returns {*}
     * @private
     */
    findFirstToast() {
        let me = this,
            firstToast, item;

        me.filters = [{property: 'running', value: false}];

        for (item of me.map.values()) {
            if (me.running[item.position].length < me.maxToasts) {
                firstToast = item;
                firstToast.running = true;
                break
            }
        }

        me.clearFilters();

        return firstToast
    }

    /**
     * @param {Object} item
     */
    register(item) {
        super.register(item);
        this.runQueue()
    }

    /**
     * Removes a task from collection.
     * @param {String} toastId
     */
    removeToast(toastId) {
        let me    = this,
            toast = me.get(toastId),
            position;

        if (!toast) {
            return
        }

        position = toast.position;

        // decrease total of displayed toasts for a position
        NeoArray.remove(me.running[position], toastId);

        me.updateItemsInPosition(toastId)
    }

    /**
     * Runs a ToastManager to show an item from collection.
     */
    runQueue() {
        let me = this,
            toast;

        if (me.getCount() > 0) {
            toast = me.findFirstToast();

            toast && me.showToast(toast)
        }
    }

    /**
     * @param {Neo.component.Toast} toast
     */
    showToast(toast) {
        toast.render(true);

        // increase total of displayed toasts for a position
        this.running[toast.position].unshift(toast.id);

        // todo: we could use a mounted listener
        setTimeout(() => {
            this.updateItemsInPosition(toast.id)
        }, 50)
    }

    /**
     * Removes a collection item passed by reference or key
     * @param {Object|String} item
     */
    unregister(item) {
        super.unregister(item);
        this.runQueue()
    }

    /**
     * To handle multiple toasts we handle the exact position
     * from the top or bottom
     * @param {String} id
     * @returns {Promise<void>}
     */
    async updateItemsInPosition(id) {
        let me            = this,
            toast         = me.get(id),
            {position}    = toast,
            positionArray = me.running[position],
            acc           = 0,
            margin        = me.defaultMargin,
            moveTo        = position.substring(0, 1) === 't' ? 'top' : 'bottom',
            component, componentId, index, moveObj, rects;

        rects = await toast.getDomRect(positionArray);

        for ([index, componentId] of positionArray.entries()) {
            component = Neo.getComponent(componentId);
            moveObj   = {};

            acc = acc + margin;
            moveObj[moveTo] = acc + 'px';
            component.style = moveObj;
            component.update();

            // Sometimes the index is already reduced
            // so the last index might not be available
            if(rects[index]) {
                acc = acc + rects[index].height
            }
        }
    }
}

export default Neo.setupClass(Toast);
