import Base         from './Base.mjs';
import NeoArray     from "../util/Array.mjs";

/**
 * See Neo.dialog.Toast for examples
 * @class Neo.manager.Toast
 * @extends Neo.manager.Base
 * @singleton
 */
class Toast extends Base {
    /**
     * This is the default config for the Neo.dialog.Toast
     * @member {Object}
     */
    defaultToastConfig = {
        closable      : false,
        cls           : ['neo-toast'],
        maxWidth      : 250,
        position      : 'tr',
        running       : false,
        slideDirection: 'right',
        timeout       : 3000,
        title         : null
    }
    /**
     * Using a default margin between the item
     * If you switch the distance to the top or bottom
     * you have to change this value accordingly
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
     * @member {String} toastClass='Neo.dialog.Toast'
     */
    toastClass = 'Neo.dialog.Toast'

    static getConfig() {return {
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
    }}

    construct(config) {
        super.construct(config);
        Neo.toast = this.createToast.bind(this);
    }

    /**
     * Create the Toast definition and pass it to the Collection
     *
     * @param {Object} toast
     * @returns {Object}
     */
    createToast(toast) {
        if (toast.position && !this.running[toast.position]) {
            Neo.logError('[Neo.manager.Toast] Supported values for slideDirection are: tl, tc, tr, bl, bc, br');
            return null;
        }
        if (!toast.msg || !toast.appName) {
            !toast.msg     && Neo.logError('[Neo.manager.Toast] Toast has to define a msg');
            !toast.appName && Neo.logError('[Neo.manager.Toast] Toast has to define an appName. Typically me.appName.');
            return null;
        }

        let me = this,
            id;

        id = Neo.core.IdGenerator.getId('toastmanager-toast');

        toast = {
            id,
            ...me.defaultToastConfig,
            ...toast
        };

        me.register(toast);

        return toast.toastManagerId;
    }

    /**
     * Find the first toast based on the maximum allowed toasts
     *
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
                break;
            }
        }

        me.clearFilters();

        return firstToast;
    }

    /**
     * @param {Object} item
     */
    register(item) {
        super.register(item);
        this.runQueue();
    }

    /**
     * Removes a task from collection.
     *
     * @param {String} toastId
     */
    removeToast(toastId) {
        let me = this,
            mapItem = me.get(toastId),
            position;

        if (!mapItem) return;
        position = mapItem.position;
        // decrease total of displayed toasts for a position
        NeoArray.remove(me.running[position], toastId);
        me.updateItemsInPosition(toastId);
        me.unregister(toastId);
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
     * Neo.create a new toast add listeners
     * and add it to the running array
     *
     * @param {Object} toast
     */
    showToast(toast) {
        let me = this,
            toastConfig = Neo.clone(toast),
            position = toastConfig.position;

        let newItem = Neo.create(me.toastClass, toastConfig);
        // add a listener
        newItem.on({
            mounted: me.updateItemsInPosition,
            scope: me
        })
        // increase total of displayed toasts for a position
        me.running[position].push(toast.id);
    }

    /**
     * Removes a collection item passed by reference or key
     *
     * @param {Object|String} item
     */
    unregister(item) {
        super.unregister(item);
        this.runQueue();
    }

    /**
     * To handle multiple toasts we handle the exact position
     * from the top or bottom
     *
     * @param {string} id
     * @returns {Promise<void>}
     */
    async updateItemsInPosition(id) {
        let me = this,
            position = me.get(id).position,
            positionArray = me.running[position],
            acc = 0,
            margin = me.defaultMargin,
            moveTo = position.substring(0,1) === 't' ? 'top' : 'bottom';

        for (const componentId of positionArray) {
            let component = Neo.getComponent(componentId),
                rect = await component.getDomRect(),
                moveObj = {};

            acc = acc + margin
            moveObj[moveTo] = acc + 'px';
            component.style = moveObj;
            component.update();
            acc = acc + rect.height;
        }
    }
}

Neo.applyClassConfig(Toast);

let instance = Neo.create(Toast);

Neo.applyToGlobalNs(instance);

export default instance;
