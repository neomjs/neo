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
        let id = this.getItemId(record.id);

        return [
            {cls: ['neo-list-item-content'], id: `${id}__content`, cn: [
                {tag: 'img', id: `${id}__image`, src: `${Neo.config.resourcesPath}examples/${record.image}`},
                {cls: ['neo-list-item-text'], id: `${id}__content_wrapper`, cn: [
                    {html: record.firstname, id: `${id}__firstname`},
                    {cls: ['neo-lastname'],  id: `${id}__lastname`, html: record.lastname},
                    {cls: ['neo-is-online'], id: `${id}__isonline`, removeDom: !record.isOnline}
                ]}
            ]}
        ];
    }
}

Neo.applyClassConfig(List);

export default List;
