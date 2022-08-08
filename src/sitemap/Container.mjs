import Base            from '../container/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import ItemStore       from './store/Items.mjs';

/**
 * @class Neo.sitemap.Container
 * @extends Neo.container.Base
 */
class Container extends Base {
    static getStaticConfig() {return {
        /**
         * Valid values for itemHideMode
         * @member {String[]} itemHideModes=['removeDom','visibility']
         * @protected
         * @static
         */
        itemHideModes: ['removeDom', 'visibility']
    }}

    static getConfig() {return {
        /*
         * @member {String} className='Neo.sitemap.Container'
         * @protected
         */
        className: 'Neo.sitemap.Container',
        /*
         * @member {String} ntype='sitemap'
         * @protected
         */
        ntype: 'sitemap',
        /*
         * @member {String[} cls=['neo-sitemap','neo-container']
         */
        cls: ['neo-sitemap', 'neo-container'],
        /*
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            ntype: 'component',
            cls  : ['neo-sitemap-column', 'neo-container']
        },
        /**
         * Valid values: removeDom, visibility
         * Defines if the component items should use css visibility:'hidden' or vdom:removeDom
         * @member {String} hideMode_='removeDom'
         */
        itemHideMode_: 'removeDom',
        /*
         * @member {Neo.sitemap.store.Items|null} itemStore_=null
         */
        itemStore_: null,
        /**
         * @member {Object} layout={ntype:'hbox',align:'stretch'}
         */
        layout: {ntype: 'hbox', align: 'stretch'}
    }}

    /**
     * Triggered after the itemStore config got changed
     * @param {Neo.sitemap.store.Items|null} value
     * @param {Neo.sitemap.store.Items|null} oldValue
     * @protected
     */
    afterSetItemStore(value, oldValue) {
        let me = this;

        value?.on({
            filter      : 'onItemStoreFilter',
            load        : 'onItemStoreLoad',
            recordChange: 'onItemStoreRecordChange',
            scope       : me
        });

        value?.getCount() > 0 && me.createColumns();
    }

    /**
     * Triggered before the itemHideMode config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetItemHideMode(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'itemHideMode');
    }

    /**
     * Triggered before the itemStore config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetItemStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, ItemStore);
    }

    /**
     *
     */
    createColumns() {
        let me          = this,
            records     = me.itemStore.items,
            columnIndex = -1,
            items       = [],
            action, column, item, record;

        for (record of records) {
            if (record.column !== columnIndex) {
                columnIndex++;
                column = {vdom: {cn: []}};
                items.push(column);
            }

            action = record.action;

            item = {
                tag : 'a',
                cls : ['neo-action', `neo-level-${record.level}`],
                id  : me.getItemId(record.id),
                html: record.name
            };

            if (action && action !== '') {
                switch (record.actionType) {
                    case 'handler': {
                        item.cls.push('neo-action-handler');
                        break;
                    }
                    case 'route': {
                        item.href = `#${record.action}`;
                        break;
                    }
                    case 'url': {
                        item.href   = record.action;
                        item.target = '_blank';
                    }
                }
            }

            record.disabled && item.cls.push('neo-disabled');

            if (record.hidden) {
                if (me.itemHideMode === 'removeDom') {
                    item.removeDom = true;
                } else {
                    item.cls.push('neo-hidden');
                }
            }

            column.vdom.cn.push(item);
        }

        me.items = items;
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getItemId(recordId) {
        return `${this.id}__${recordId}`;
    }

    /**
     *
     */
    onItemStoreFilter() {
        console.log('onItemStoreFilter');
    }

    /**
     *
     */
    onItemStoreLoad() {
        console.log('onItemStoreLoad');
    }

    /**
     *
     */
    onItemStoreRecordChange() {
        console.log('onItemStoreRecordChange');
    }
}

Neo.applyClassConfig(Container);

export default Container;
