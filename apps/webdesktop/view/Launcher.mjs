import List     from '../../../src/list/Base.mjs';
import SortZone from '../../../src/draggable/list/SortZone.mjs';

/**
 * @summary The desktop's app icons, grouped. A view on the apps store's visible projection.
 *
 * It renders whatever the store keeps: the permission filter decides, never this view. Groups render as headers
 * (`useHeaders`), apps as icon tiles.
 *
 * Icons reorder within their group. A drag (`Neo.draggable.list.SortZone`) and Ctrl+Shift+Left or Right
 * (Cmd+Shift on macOS) both write the apps' `order`, and the launcher renders the store's sort.
 * @class WebDesktop.view.Launcher
 * @extends Neo.list.Base
 */
class Launcher extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.Launcher'
         * @protected
         */
        className: 'WebDesktop.view.Launcher',
        /**
         * The root state provider owns the store
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['webdesktop-launcher','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-launcher', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {store: 'stores.apps'},
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
            dragProxyConfig: {cls: ['neo-list', 'webdesktop-launcher-proxy']},
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
     * @param {WebDesktop.model.App} record
     * @returns {Object[]|String}
     */
    createItemContent(record) {
        if (record.isHeader) {
            return record.text
        }

        return [{
            cls  : ['webdesktop-app-icon'],
            style: {'--webdesktop-app-color': record.color},
            cn   : [{tag: 'i', cls: record.iconCls.split(' ')}]
        }, {
            cls : ['webdesktop-app-label'],
            text: record.text
        }]
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
     * @returns {WebDesktop.model.App|null} The app of the first app item on the path
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
}

export default Neo.setupClass(Launcher);
