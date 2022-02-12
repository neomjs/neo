import CircleComponent from '../component/Circle.mjs';
import Component       from './Component.mjs';

/**
 * @class Neo.list.Circle
 * @extends Neo.list.Component
 */
class Circle extends Component {
    static getConfig() {return {
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
         * @member {String[]} cls=['neo-circle-list','neo-list']
         */
        cls: ['neo-circle-list', 'neo-list'],
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module : CircleComponent
        },
        /**
         * Defaults to px
         * @member {Number|null} itemHeight=250
         */
        itemHeight: 250,
        /**
         * Defaults to px
         * @member {Number|null} itemWidth=250
         */
        itemWidth: 250
    }}

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
                id  : me.getComponentId(index),
                text: record[me.displayField]
            };

        if (listItem) {
            listItem.setSilent(config);
        } else {
            items[index] = listItem = Neo.create({
                appName  : me.appName,
                parentId : me.id,
                tabIndex : -1,
                ...me.itemDefaults,
                ...config
            });
        }

        me.items = items;

        return [listItem.vdom];
    }
}

Neo.applyClassConfig(Circle);

export default Circle;
