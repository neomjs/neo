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
        itemsFocusable: true
    }

    /**
     * @summary A step's number, its name, and an icon for the state its last validation left it in.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        return [
            {tag: 'span', cls: ['form-side-nav-number'], text: String(record.cardIndex + 1)},
            {tag: 'span', cls: ['form-side-nav-name'],   text: record.name},
            {tag: 'i',    cls: this.getIconCls(record)}
        ]
    }

    /**
     * @param {Object} record
     * @returns {String[]}
     */
    getIconCls(record) {
        let cls = ['form-side-nav-state', `form-side-nav-state-${record.formState}`];

        if (record.formState === 'valid') {
            return [...cls, 'far', 'fa-circle-check']
        }

        if (record.formState === 'invalid') {
            return [...cls, 'fas', 'fa-circle-exclamation']
        }

        return cls
    }

    /**
     * @summary Opens the selected step. The list navigates freely: Next and Create account validate. A selection the
     * `activeIndex` binding made mirrors the open step, whose message must stay.
     * @param {String[]} items
     */
    onSelect(items) {
        let me     = this,
            record = me.store.get(me.getItemRecordId(items[0]));

        if (record.cardIndex !== me.getStateProvider().data.activeIndex) {
            me.getController().showStep(record.cardIndex)
        }
    }

    /**
     * @summary Publishes the index of the last step to the state provider.
     */
    onStoreLoad() {
        this.getStateProvider().data.maxIndex = this.store.count - 1;
        super.onStoreLoad()
    }
}

export default Neo.setupClass(SideNavList);
