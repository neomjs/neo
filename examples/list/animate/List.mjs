import BaseList from '../../../src/list/Base.mjs';

/**
 * @class Neo.examples.list.animate.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static config = {
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
         * @member {String[]} cls=['neo-examples-list-animate']
         */
        cls: ['neo-examples-list-animate'],
        /**
         * Value in px
         * @member {Number} itemHeight=200
         */
        itemHeight: 200,
        /**
         * @member {String} itemTagName='div'
         */
        itemTagName: 'div',
        /**
         * Value in px
         * @member {Number} itemWidth=300
         */
        itemWidth: 300
    }

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
        ]
    }
}

export default Neo.setupClass(List);
