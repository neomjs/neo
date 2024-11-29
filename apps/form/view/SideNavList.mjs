import List from '../../../src/list/Base.mjs';

/**
 * @class Form.view.SideNavList
 * @extends Neo.list.Base
 */
class SideNavList extends List {
    static config = {
        /**
         * @member {String} className='Form.view.SideNavList'
         * @protected
         */
        className: 'Form.view.SideNavList',
        /**
         * @member {String[]} baseCls=['form-side-nav-list','neo-list']
         * @protected
         */
        baseCls: ['form-side-nav-list', 'neo-list'],
        /**
         * @member {Boolean} itemsFocusable=true
         */
        itemsFocusable: true,
        /**
         * @member {Boolean} useHeaders=true
         */
        useHeaders: true
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let itemText = record[this.displayField];

        return record.isHeader ? itemText : [
            {tag: 'i', cls: this.getIconCls(record)},
            {html: itemText}
        ];
    }

    /**
     * @param {Object} record
     * @returns {String[]}
     */
    getIconCls(record) {
        let cls = ['neo-list-icon'];

        if (record.formState === 'valid') {
            return [...cls, 'neo-color-green', 'far', 'fa-circle-check'];
        }

        if (record.formState === 'invalid') {
            return [...cls, 'neo-color-red', 'far', 'fa-circle-xmark'];
        }

        if (record.formState === 'inProgress') {
            return [...cls, 'neo-color-blue', 'fas', 'fa-circle-half-stroke'];
        }

        // clean
        return [...cls, 'neo-color-blue', 'far', 'fa-circle'];
    }

    /**
     * Saves activeIndex & activeTitle into the closest stateProvider
     * @param {String[]} items
     */
    onSelect(items) {
        let me     = this,
            record = me.store.get(me.getItemRecordId(items[0]));

        me.getStateProvider().setData({
            activeIndex: record.cardIndex,
            activeTitle: record.name
        })
    }

    /**
     * Saves the amount of non-header items into the closest view model
     */
    onStoreLoad() {
        let maxIndex = -1;

        this.store.items.forEach(record => {
            if (!record.isHeader) {
                maxIndex++
            }
        });

        this.getStateProvider().data.maxIndex = maxIndex;

        super.onStoreLoad()
    }
}

export default Neo.setupClass(SideNavList);
