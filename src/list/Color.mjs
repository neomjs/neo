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
        let me = this;

        return [{
            tag  : 'i',
            cls  : ['neo-icon', 'fas', 'fa-check-square'],
            style: {
                color: record[me.displayField]
            }
        }, {
            vtype: 'text',
            html : record[me.displayField]
        }];
    }
}

Neo.applyClassConfig(Color);

export {Color as default};
