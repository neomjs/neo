import Base from './Base.mjs';

/**
 * A base class for lists which will use component based list items
 * @class Neo.list.Component
 * @extends Neo.list.Base
 */
class Component extends Base {
    static config = {
        /**
         * @member {String} className='Neo.list.Component'
         * @protected
         */
        className: 'Neo.list.Component',
        /**
         * @member {String} ntype='component-list'
         * @protected
         */
        ntype: 'component-list',
        /**
         * @member {Neo.component.Base[]|null} items=null
         */
        items: null
    }

    /**
     * Triggered after the appName config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetAppName(value, oldValue) {
        super.afterSetAppName(value, oldValue);

        value && this.items?.forEach(item => {
            item.appName = value
        })
    }

    /**
     *
     */
    destroy(...args) {
        let items = this.items || [];

        items.forEach(item => {
            item.destroy()
        });

        super.destroy(...args)
    }

    /**
     * @param {Number} index
     * @returns {String}
     */
    getComponentId(index) {
        return `${this.id}__${index}__component`
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getItemId(recordId) {
        return `${this.id}__${this.store.indexOf(recordId)}`
    }

    /**
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId = vnodeId.split('__')[1];
        return this.store.getAt(parseInt(itemId))[this.getKeyProperty()]
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreSort(data) {
        this.sortItems(data);
        super.onStoreSort(data)
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    sortItems(data) {
        let me       = this,
            newItems = [],
            fromIndex, key, previousKeys;

        if (me.items) {
            key          = me.getKeyProperty();
            previousKeys = data.previousItems.map(e => e[key]);

            data.items.forEach(item => {
                fromIndex = previousKeys.indexOf(item[key]);
                newItems.push(me.items[fromIndex])
            });

            me.items = newItems
        }
    }
}

export default Neo.setupClass(Component);
