import CircleComponent from '../component/Circle.mjs';
import Component       from './Component.mjs';

/**
 * @class Neo.list.Circle
 * @extends Neo.list.Component
 */
class Circle extends Component {
    static config = {
        /**
         * @member {String} className='Neo.list.Circle'
         * @protected
         */
        className: 'Neo.list.Circle',
        /**
         * @member {String} ntype='circle-list'
         * @protected
         */
        ntype: 'circle-list',
        /**
         * @member {String[]} baseCls=['neo-circle-list','neo-list']
         */
        baseCls: ['neo-circle-list', 'neo-list'],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module: CircleComponent
        },
        /**
         * Defaults to px
         * @member {Number|null} itemHeight=300
         */
        itemHeight: 300,
        /**
         * Defaults to px
         * @member {Number|null} itemWidth=300
         */
        itemWidth: 300,
        /**
         * @member {String} urlField='url'
         */
        urlField: 'url'
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me       = this,
            items    = me.items || [],
            listItem = items[index],

            config = {
                id   : me.getComponentId(index),
                title: record[me.displayField],
                url  : record[me.urlField]
            };

        if (listItem) {
            listItem.setSilent(config);
        } else {
            items[index] = listItem = Neo.create({
                appName    : me.appName,
                height     : me.itemHeight,
                innerRadius: me.itemHeight / 2 - 64,
                itemSize   : 40,
                parentId   : me.id,
                tabIndex   : -1,
                width      : me.itemWidth,
                ...me.itemDefaults,
                ...config
            });
        }

        me.items = items;

        return [listItem.vdom];
    }
}

Neo.setupClass(Circle);

export default Circle;
