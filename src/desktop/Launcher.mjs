import List     from '../list/Base.mjs';
import SortZone from '../draggable/list/SortZone.mjs';

/**
 * @summary A web desktop's app icons, grouped: a view on the visible projection of a `Neo.desktop.store.Apps`.
 *
 * It renders whatever its store keeps, so the store's filter decides which apps show, never this view. Groups render
 * as headers (`useHeaders`), apps as icon tiles. A double-click, Enter, or a tap on a touch device fires `openApp`.
 *
 * Icons reorder within their group. A drag (`Neo.draggable.list.SortZone`) and Ctrl+Shift+Left or Right (Cmd+Shift on
 * macOS) both write the apps' `order`, and the launcher renders the store's sort.
 *
 * {@link #arrangementKey} keeps an arrangement per key, e.g. per account, in `localStorage` through the
 * `Neo.main.addon.LocalStorage` main thread addon. A subclass keeps it elsewhere by overriding {@link #readArrangement}
 * and {@link #saveArrangement}.
 * @class Neo.desktop.Launcher
 * @extends Neo.list.Base
 */
class Launcher extends List {
    static config = {
        /**
         * @member {String} className='Neo.desktop.Launcher'
         * @protected
         */
        className: 'Neo.desktop.Launcher',
        /**
         * The key of the saved arrangement, `null` to save nothing. A new key restores its arrangement, or the catalog
         * order when none is saved or the read fails, and each new order is saved under it. The launcher holds its
         * render until that arrangement is in place, so a consumer sets the key before the filter it belongs to, e.g.
         * before an account's grants.
         * @member {String|null} arrangementKey_=null
         * @reactive
         */
        arrangementKey_: null,
        /**
         * @member {String[]} baseCls=['neo-desktop-launcher','neo-list']
         * @protected
         */
        baseCls: ['neo-desktop-launcher', 'neo-list'],
        /**
         * @member {String} displayField='text'
         */
        displayField: 'text',
        /**
         * @member {Boolean} draggable=true
         */
        draggable: true,
        /**
         * The icons sit in rows, so the halves of an icon decide before or after
         * @member {Object} dragZoneConfig
         */
        dragZoneConfig: {
            module         : SortZone,
            dragProxyConfig: {cls: ['neo-list', 'neo-desktop-launcher-proxy']},
            sortDirection  : 'horizontal'
        },
        /**
         * @member {Object} keys
         */
        keys: {
            Enter: 'onKeyDownEnter',
            Left : 'onKeyDownLeft',
            Right: 'onKeyDownRight'
        },
        /**
         * @member {Boolean} useHeaders=true
         */
        useHeaders: true
    }

    /**
     * True while a render waits for a restore
     * @member {Boolean} #held=false
     */
    #held = false
    /**
     * The restore in flight. A newer one replaces it, so the latest key wins, whichever read answers first.
     * @member {Object|null} #restore=null
     */
    #restore = null
    /**
     * True while a restore writes its arrangement: that write is no new order, so nothing is saved
     * @member {Boolean} #restoring=false
     */
    #restoring = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners({
            dblclick: me.onItemDblClick,
            scope   : me
        })
    }

    /**
     * Triggered after the arrangementKey config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetArrangementKey(value, oldValue) {
        this.restoreArrangement()
    }

    /**
     * Triggered after the store config got changed. A new store takes the arrangement of the current key.
     * @param {Neo.desktop.store.Apps|null} value
     * @param {Neo.desktop.store.Apps|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let me = this;

        // on() and un() consume keys like `scope` from the passed object, so each call gets its own
        oldValue && !oldValue.isDestroyed && oldValue.un({rowsChange: me.onStoreRowsChange, scope: me});
        value?.on({rowsChange: me.onStoreRowsChange, scope: me});

        super.afterSetStore(value, oldValue);

        // The construction runs afterSetArrangementKey() after this hook
        oldValue !== undefined && me.restoreArrangement()
    }

    /**
     * @param {Neo.desktop.model.App} record
     * @returns {Object[]|String}
     */
    createItemContent(record) {
        if (record.isHeader) {
            return record.text
        }

        return [{
            cls  : ['neo-desktop-app-icon'],
            style: {'--desktop-app-color': record.color},
            cn   : [{tag: 'i', cls: record.iconCls ? record.iconCls.split(' ') : []}]
        }, {
            cls : ['neo-desktop-app-label'],
            text: record.text
        }]
    }

    /**
     * A restore in flight holds the render, so the store's filter and sort show in the arrangement of the latest key
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me = this;

        if (me.#restore) {
            me.#held = true
        } else {
            me.#held = false;
            super.createItems(silent)
        }
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        let me = this;

        me.store?.un({rowsChange: me.onStoreRowsChange, scope: me});

        super.destroy(...args)
    }

    /**
     * Fires `openApp` for the app item on an event path, if there is one.
     * @param {Object[]} path
     * @protected
     */
    fireOpenApp(path) {
        let record = this.getAppRecord(path);

        record && this.fire('openApp', {record})
    }

    /**
     * @param {Object[]} path An event path
     * @returns {Neo.desktop.model.App|null} The app of the first app item on the path
     */
    getAppRecord(path) {
        let me   = this,
            item = path.find(node => node.cls?.includes(me.itemCls) && !node.cls.includes('neo-list-header'));

        return item ? me.store.get(me.getItemRecordId(item.id)) : null
    }

    /**
     * Moves the focused app one place within its group, through the same commit as a drop, and keeps the focus on it.
     * @param {Object} data The keydown data
     * @param {Number} step -1 moves back, 1 forward
     * @protected
     */
    async moveFocusedApp(data, step) {
        let me     = this,
            record = (data.ctrlKey || data.metaKey) && data.shiftKey && me.getAppRecord(data.path),
            siblings, target;

        if (record) {
            siblings = me.store.items.filter(item => item.parentId === record.parentId);
            target   = siblings[siblings.indexOf(record) + step];

            if (target && me.dragZone?.moveRecord(record, target, step < 0)) {
                await me.promiseUpdate();
                me.focus(me.getItemId(record))
            }
        }
    }

    /**
     * A tap (a finger or a pen) opens an app, since it has no double-click; a mouse click only selects. The click's own
     * `pointerType` decides, so a touch-capable computer used with a mouse still selects. A browser that reports no
     * pointer on a click leaves it `undefined`, and the device decides (`Neo.config.hasTouchEvents`).
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        super.onItemClick(node, data);

        let {pointerType} = data,
            isTap         = pointerType === undefined ? Neo.config.hasTouchEvents : pointerType === 'touch' || pointerType === 'pen';

        isTap && this.fireOpenApp(data.path)
    }

    /**
     * A double-click opens an app; a single click only selects it, as on a desktop.
     * @param {Object} data
     */
    onItemDblClick(data) {
        this.fireOpenApp(data.path)
    }

    /**
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        this.fireOpenApp(data.path)
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.moveFocusedApp(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.moveFocusedApp(data, 1)
    }

    /**
     * A restore in flight holds the render. A filter also rewrites its records' sibling stats, and their item updates
     * would land in the held items by the new projection's index, so they wait for the re-render too.
     * @param {Object} data
     * @protected
     */
    onStoreRecordChange(data) {
        this.#restore ? this.#held = true : super.onStoreRecordChange(data)
    }

    /**
     * Saves a new order under {@link #arrangementKey}. A drop or a key move writes `order` in one batch; a restore saves
     * nothing, and neither does an order written while a restore is in flight, which the restore replaces.
     * @param {Object}   data
     * @param {String[]} data.fields
     * @protected
     */
    onStoreRowsChange({fields}) {
        let me               = this,
            {arrangementKey} = me;

        if (arrangementKey && !me.#restore && !me.#restoring && fields.includes('order')) {
            me.saveArrangement(arrangementKey, me.store.getArrangement())
        }
    }

    /**
     * Reads the arrangement saved under a key. It is a preference: a failed read or an unreadable value gives `{}`, the
     * catalog order.
     * @param {String} key
     * @returns {Promise<Object>} Parent key → child keys, or `{}`
     */
    async readArrangement(key) {
        try {
            let {value}     = await Neo.main.addon.LocalStorage.readLocalStorageItem({key, windowId: this.windowId}),
                arrangement = value && JSON.parse(value);

            return Neo.isObject(arrangement) ? arrangement : {}
        } catch {
            return {}
        }
    }

    /**
     * Restores the arrangement of {@link #arrangementKey} into the store, then renders what it held
     * @returns {Promise<void>}
     * @protected
     */
    async restoreArrangement() {
        let me                      = this,
            {arrangementKey, store} = me,
            restore                 = me.#restore = arrangementKey && store ? {} : null,
            arrangement;

        if (restore) {
            arrangement = await me.readArrangement(arrangementKey);

            if (me.#restore !== restore || me.isDestroyed) {
                return
            }

            me.#restore   = null;
            me.#restoring = true;

            try {
                store.arrange(arrangement)
            } finally {
                me.#restoring = false
            }
        }

        me.#held && me.createItems()
    }

    /**
     * Saves an arrangement under a key
     * @param {String} key
     * @param {Object} arrangement Parent key → child keys
     */
    saveArrangement(key, arrangement) {
        Neo.main.addon.LocalStorage.updateLocalStorageItem({key, value: JSON.stringify(arrangement), windowId: this.windowId})
    }
}

export default Neo.setupClass(Launcher);
