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
         * @member {Boolean} useHeaders=true
         */
        useHeaders: true
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
