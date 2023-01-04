import Base from './Base.mjs';

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
        slideDirection: 'down',
        timeout       : 3000,
        title         : null
    }
    /**
     * Currently only 1 is supported, because they would overlap
     * @member {1} maxToasts=1
     */
    maxToasts = 1
    /**
     * Counts the currently running Toasts per area
     * @member {Object} running
     */
    running = {
        bc: 0, bl: 0, br: 0,
        tc: 0, tl: 0, tr: 0
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
     * @param {Object} item
     */
    register(item) {
        super.register(item);
        this.runQueue();
    }

    /**
     * Removes a collection item passed by reference or key
     * @param {Object|String} item
     */
    unregister(item) {
        super.unregister(item);
        this.runQueue();
    }

    /**
     * Create the Toast definition and pass it to the Collection
     *
     * @param {Object} toast
     * @returns {Object}
     */
    createToast(toast) {
        let me = this,
            id;

        if (!toast.msg || !toast.appName) {
            !toast.msg     && Neo.logError('[Neo.manager.Toast] Toast has to define a msg');
            !toast.appName && Neo.logError('[Neo.manager.Toast] Toast has to define an appName. Typically me.appName.');
            return null;
        }

        id = Neo.core.IdGenerator.getId('toastmanager-toast');

        toast = {
            id,
            toastManagerId: id,
            ...me.defaultToastConfig,
            ...toast
        };

        me.register(toast);

        return toast.toastManagerId;
    }

    /**
     * Removes a task from collection.
     * @param {String} toastId
     */
    removeToast(toastId) {
        let me = this;

        // decrease total of displayed toasts for a position
        me.running[me.map.get(toastId).position]--;
        me.unregister(toastId);
    }

    /**
     * Runs a ToastManager to show an item from collection.
     */
    runQueue() {
        let me = this,
            toast;

        if (me.getCount > 0) {
            toast = me.findFirstToast();

            toast && me.showToast(toast)
        }
    }

    showToast(toast) {
        let toastConfig = Neo.clone(toast);
        // increase total of displayed toasts for a position
        this.running[toastConfig.position]++
        // Neo.create does not allow to pass an id
        delete toastConfig.id;
        Neo.create(this.toastClass, toastConfig);
    }

    /**
     * Find the first toast based on the maximum allowed toasts
     * @returns {*}
     */
    findFirstToast() {
        let me = this,
            firstToast, item;

        me.filters = [{property: 'running', value: false}];
        me.filter();

        for (item of me.map.values()) {
            if (me.running[item.position] < me.maxToasts) {
                firstToast = item;
                break;
            }
        }

        me.clearFilters();

        return firstToast;
    }
}

Neo.applyClassConfig(Toast);

let instance = Neo.create(Toast);

Neo.applyToGlobalNs(instance);

export default instance;
