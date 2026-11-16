import List from '../../../src/list/Base.mjs';

/**
 * @summary The desktop's app icons, grouped. A view on the apps store's visible projection.
 *
 * It renders whatever the store keeps: the permission filter decides, never this view. Groups render as headers
 * (`useHeaders`), apps as icon tiles.
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
         * @member {Object} keys={Enter:'onKeyDownEnter'}
         */
        keys: {
            Enter: 'onKeyDownEnter'
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
     * Fires `openApp` for the app item on an event path, if there is one.
     * @param {Object[]} path
     * @protected
     */
    fireOpenApp(path) {
        let me   = this,
            item = path.find(node => node.cls?.includes(me.itemCls) && !node.cls.includes('neo-list-header'));

        item && me.fire('openApp', {record: me.store.get(me.getItemRecordId(item.id))})
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
}

export default Neo.setupClass(Launcher);
