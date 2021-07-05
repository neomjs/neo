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
        let me     = this,
            id     = record[me.store.keyProperty],
            vdomCn = [{tag: 'span', cls: ['neo-content'], html: record[me.displayField]}];

        if (record.iconCls && record.iconCls !== '') {
            vdomCn.unshift({tag: 'i', cls: ['neo-icon', record.iconCls], id: me.getIconId(id)});
        }

        if (me.hasChildren(record)) {
            vdomCn.push({tag: 'i', cls: ['neo-arrow-icon', 'fas fa-chevron-right'], id: me.getArrowIconId(id)});
        }

        return vdomCn;
    }

    /**
     *
     * @param {String} nodeId
     * @param {Object} record
     */
    createSubMenu(nodeId, record) {
        console.log('createSubMenu', nodeId, record);
    }

    /**
     *
     * @param {Number|String} recordId
     * @returns {String}
     */
    getArrowIconId(recordId) {
        return `${this.id}__arrow_icon__${recordId}`;
    }

    /**
     *
     * @param {Number|String} recordId
     * @returns {String}
     */
    getIconId(recordId) {
        return `${this.id}__icon__${recordId}`;
    }

    /**
     * Checks if a record has items
     * @param {Object} record
     * @returns {Boolean}
     */
    hasChildren(record) {
        return Array.isArray(record.items) && record.items.length > 0;
    }

    /**
     *
     * @param {String[]} items
     */
    onSelect(items) {
        let me     = this,
            nodeId = items[0],
            record = me.store.get(me.getItemRecordId(nodeId));

        if (me.hasChildren(record)) {
            me.createSubMenu(nodeId, record);
        }
    }
}

Neo.applyClassConfig(Menu);

export {Menu as default};
