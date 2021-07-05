import List from './Base.mjs';

/**
 * @class Neo.list.Menu
 * @extends Neo.list.Base
 */
class Menu extends List {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Menu'
         * @protected
         */
        className: 'Neo.list.Menu',
        /**
         * @member {String} ntype='menu'
         * @protected
         */
        ntype: 'menu',
        /**
         * @member {String[]} cls=['neo-menu','neo-list']
         */
        cls: ['neo-menu', 'neo-list']
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me = this,
            id = record[me.store.keyProperty];

        return [
            {tag: 'span', html: record[me.displayField]},
            {tag: 'i', cls: ['neo-edit-icon', 'fas fa-edit'], id: me.getEditIconId(id)}
        ];
    }

    /**
     *
     * @param {Number|String} recordId
     * @returns {String}
     */
    getEditIconId(recordId) {
        return `${this.id}__${recordId}`;
    }
}

Neo.applyClassConfig(Menu);

export {Menu as default};
