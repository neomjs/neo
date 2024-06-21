import Base from './Base.mjs';

/**
 * @class Neo.list.Color
 * @extends Neo.list.Base
 */
class Color extends Base {
    static config = {
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
         * @member {String[]} baseCls=['neo-color-list','neo-list']
         */
        baseCls: ['neo-color-list', 'neo-list'],
        /**
         * The data.Model field which contains the color value
         * @member {String} colorField='name'
         */
        colorField: 'name',
        /**
         * Override the formatter to apply a custom background-color styling.
         * E.g. using CSS vars for different themes
         * @member {Function} colorField=(scope,data)=>data[scope.colorField]
         */
        colorFormatter: (scope,data) => data[scope.colorField]
    }

    /**
     * form.field.Color needs to trigger a silent vdom update
     * @member {Boolean} silentSelectUpdate=false
     * @protected
     */
    silentSelectUpdate = false

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me         = this,
            id         = record[me.store.keyProperty],
            isSelected = me.selectionModel.isSelected(me.getItemId(id));

        return [{
            tag  : 'i',
            cls  : ['neo-icon', 'fas', `fa-${isSelected ? 'check-' : ''}square`],
            id   : me.getListItemIconId(id),
            style: {
                color: me.colorFormatter(me, record)
            }
        }, {
            vtype: 'text',
            html : record[me.displayField],
            id   : me.getListItemVtextId(id)
        }]
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getListItemIconId(recordId) {
        return `${this.id}__icon__${recordId}`
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getListItemVtextId(recordId) {
        return `${this.id}__vtext__${recordId}`
    }

    /**
     * @param {String[]} items
     */
    onSelect(items) {
        let me = this;

        me.createItems(me.silentSelectUpdate);

        !me.silentSelect && me.focus(items[0])
    }
}

Neo.setupClass(Color);

export default Color;
