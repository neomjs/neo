import BaseList from '../../../src/list/Base.mjs';

/**
 * @class Neo.examples.list.animate.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.examples.list.animate.List'
         * @protected
         */
        className: 'Neo.examples.list.animate.List',
        /**
         * @member {Boolean} animate=true
         */
        animate: true,
        /**
         * @member {String[]} cls=['neo-examples-list-animate','neo-list-container','neo-list']
         */
        cls: ['neo-examples-list-animate', 'neo-list-container', 'neo-list'],
        /**
         * @member {String} itemTagName='div'
         */
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
            {cls: ['neo-list-item-content'], cn: [
                {tag: 'img', src: `../../../resources/examples/${record.image}`},
                {html: record.firstname},
                {html: record.lastname}
            ]}
        ];
    }
}

Neo.applyClassConfig(List);

export {List as default};
