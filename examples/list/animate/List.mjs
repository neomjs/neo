import BaseList from '../../../src/list/Base.mjs';

/**
 * @class Neo.examples.list.animate.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        className  : 'Neo.examples.list.animate.List',
        animate    : true,
        itemTagName: 'div'
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        return [
            {html: record.firstname},
            {html: record.lastname}
        ];
    }
}

Neo.applyClassConfig(List);

export {List as default};
