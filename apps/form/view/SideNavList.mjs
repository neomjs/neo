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
            {tag: 'i', cls: ['neo-list-icon', 'far', 'fa-circle']},
            {html: itemText}
        ];
    }

    /**
     * Saves activeIndex & activeTitle into the closest view model
     * @param {String[]} items
     */
    onSelect(items) {
        let me     = this,
            record = me.store.get(me.getItemRecordId(items[0]));

        me.getModel().setData({
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
                maxIndex++;
            }
        });

        this.getModel().data.maxIndex = maxIndex;

        super.onStoreLoad()
    }
}

Neo.applyClassConfig(SideNavList);

export default SideNavList;
