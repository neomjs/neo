import List from '../../../src/list/Base.mjs';

/**
 * @summary Every permission the backend can grant, with a switch showing whether the account holds it.
 *
 * `granted` is bound to the root provider's `permissions`, the same value that drives the apps store's filter, so
 * the switches and the desktop can never disagree.
 * @class WebDesktop.view.PermissionList
 * @extends Neo.list.Base
 */
class PermissionList extends List {
    static config = {
        /**
         * @member {String} className='WebDesktop.view.PermissionList'
         * @protected
         */
        className: 'WebDesktop.view.PermissionList',
        /**
         * The root state provider owns the store
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * @member {String[]} baseCls=['webdesktop-permission-list','neo-list']
         * @protected
         */
        baseCls: ['webdesktop-permission-list', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {
            granted: data => data.permissions,
            store  : 'stores.permissions'
        },
        /**
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {String} displayField='text'
         */
        displayField: 'text',
        /**
         * The permission keys the signed-in account holds
         * @member {String[]} granted_=[]
         * @reactive
         */
        granted_: []
    }

    /**
     * Triggered after the granted config got changed
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    afterSetGranted(value, oldValue) {
        oldValue !== undefined && this.store?.getCount() > 0 && this.createItems()
    }

    /**
     * @param {WebDesktop.model.Permission} record
     * @returns {Object}
     */
    createItemContent(record) {
        return {
            cls: this.granted.includes(record.id) ? ['webdesktop-granted'] : [],
            cn : [{
                cls  : ['webdesktop-permission-icon'],
                style: {'--webdesktop-app-color': record.color},
                cn   : [{tag: 'i', cls: record.iconCls.split(' ')}]
            }, {
                cls: ['webdesktop-permission-text'],
                cn : [
                    {cls: ['webdesktop-permission-name'], text: record.text},
                    {cls: ['webdesktop-permission-key'],  text: record.id}
                ]
            }, {
                cls: ['webdesktop-switch']
            }]
        }
    }
}

export default Neo.setupClass(PermissionList);
