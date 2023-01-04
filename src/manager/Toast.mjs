import Base from './Base.mjs';

/**
 * See Neo.dialog.Toast for example
 *
 * @class Neo.manager.Toast
 * @extends Neo.manager.Base
 * @singleton
 */
class ToastManager extends Base {
    /**
     * This is the default config for the Neo.dialog.Toast
     * @member {{running: boolean, closable: boolean, slideDirection: string, cls: [string], position: string, title: null, timeout: number, maxWidth: number}}
     */
    defaultToastConfig = {
        closable: false,
        cls: ['neo-toast'],
        maxWidth: 250,
        position: 'tr',
        running: false,
        slideDirection: 'down',
        timeout: 3000,
        title: null
    }
    /**
     * If you prefer your own class to open, override here
     * @member {String} toastClass='Neo.dialog.Toast'
     */
    toastClass = 'Neo.dialog.Toast'
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
        tr: 0, tc: 0, tl: 0,
        br: 0, bc: 0, bl: 0
    }

    static getConfig() {return {
        /**
         * @member {String} className='Neo.manager.ToastManager'
         * @protected
         */
        className: 'Neo.manager.ToastManager',
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

        this.runQue();
    }

    /**
     * Removes a collection item passed by reference or key
     * @param {Object|String} item
     */
    unregister(item) {
        super.unregister(item);

        this.runQue();
    }

    /**
     * Create the Toast definition and pass it to the Collection
     *
     * @param {Object} toast
     * @returns {Object}
     */
    createToast(toast) {
        let me = this;

        if(!toast.msg || !toast.appName) {
            Neo.logError('[Neo.util.ToastManager] Toast has to define a msg');
            Neo.logError('[Neo.util.ToastManager] Toast has to define an appName. Typically me.appName.');
            return;
        }

        let id = Neo.core.IdGenerator.getId('toastmanager-toast');

        toast = {
            id: id,
            toastManagerId : id,
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
        // decrease total of displayed toasts for a position
        this.running[this.map.get(toastId).position]--;
        this.unregister(toastId);
    }

    /**
     * Runs a ToastManager to show an item from collection.
     */
    runQue() {
        const me = this;

        if(me.getCount === 0) return;

        let toast = me.findFirstToast();

        if(toast) {
            me.showToast(toast);
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
        const me = this;
        let firstToast;

        me.filters = [{property: 'running', value: false}];
        me.filter();

        for (let item of me.map.values()){
            if(me.running[item.position] < me.maxToasts) {
                firstToast = item;
                break;
            }
        }

        me.clearFilters();

        return firstToast;
    }
}

Neo.applyClassConfig(ToastManager);

let instance = Neo.create(ToastManager);

Neo.applyToGlobalNs(instance);

export default instance;
