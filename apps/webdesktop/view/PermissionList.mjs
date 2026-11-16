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
        granted_: [],
        /**
         * @member {String} role='listbox'
         */
        role: 'listbox',
        /**
         * @member {Object} _vdom
         * @protected
         */
        _vdom: {tag: 'ul', 'aria-label': 'Permissions', 'aria-multiselectable': true, cn: []}
    }

    /**
     * @member {String} itemRole='option'
     */
    itemRole = 'option'

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
     * A row is an option whose selection is its grant, as in `Neo.list.ValuePicker`, so assistive technology reads the
     * state the switch paints.
     * @param {WebDesktop.model.Permission} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object|null}
     */
    createItem(record, index, poolIndex=index) {
        let item = super.createItem(record, index, poolIndex);

        item && (item['aria-selected'] = this.granted.includes(record.id));

        return item
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
