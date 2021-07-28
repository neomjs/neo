import Base from './Base.mjs';

/**
 * @class Neo.list.Color
 * @extends Neo.list.Base
 */
class Color extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Color'
         * @protected
         */
        className: 'Neo.list.Color',
        /**
         * @member {String} ntype='colorlist'
         * @protected
         */
        ntype: 'colorlist',
        /**
         * @member {String[]} cls=['neo-color-list','neo-list']
         */
        cls: ['neo-color-list', 'neo-list']
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me         = this,
            isSelected = me.selectionModel.isSelected(me.getItemId(record[me.store.keyProperty]));

        return [{
            tag  : 'i',
            cls  : ['neo-icon', 'fas', 'fa-check-square', `fa-${isSelected ? 'check-' : ''}square`],
            style: {
                color: record[me.displayField]
            }
        }, {
            vtype: 'text',
            html : record[me.displayField]
        }];
    }

    /**
     *
     * @param {String[]} items
     */
    onSelect(items) {
        this.createItems();
    }
}

Neo.applyClassConfig(Color);

export {Color as default};
