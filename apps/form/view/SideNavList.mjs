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
         * @member {Boolean} useHeaders=true
         */
        useHeaders: true
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
