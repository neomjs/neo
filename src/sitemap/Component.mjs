import Base            from '../component/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Store           from './Store.mjs';

/**
 * @class Neo.sitemap.Component
 * @extends Neo.component.Base
 */
class Component extends Base {
    /**
     * Valid values for itemHideMode
     * @member {String[]} itemHideModes=['removeDom','visibility']
     * @protected
     * @static
     */
    static itemHideModes = ['removeDom', 'visibility']

    static config = {
        /*
         * @member {String} className='Neo.sitemap.Component'
         * @protected
         */
        className: 'Neo.sitemap.Component',
        /*
         * @member {String} ntype='sitemap'
         * @protected
         */
        ntype: 'sitemap',
        /*
         * @member {String[} baseCls=['neo-sitemap']
         */
        baseCls: ['neo-sitemap'],
        /**
         * Valid values: removeDom, visibility
         * Defines if the component items should use css visibility:'hidden' or vdom:removeDom
         * @member {String} hideMode_='removeDom'
         */
        itemHideMode_: 'removeDom',
        /*
         * @member {Neo.sitemap.Store|null} store_=null
         */
        store_: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click: me.onItemHandlerClick, delegate: '.neo-action-handler', scope: me},
            {click: me.onItemClick,        delegate: '.neo-action',         scope: me}
        ]);
    }

    /**
     * Triggered after the store config got changed
     * @param {Neo.sitemap.Store|null} value
     * @param {Neo.sitemap.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        let listeners = {
            filter      : 'onStoreFilter',
            load        : 'onStoreLoad',
            recordChange: 'onStoreRecordChange',
            scope       : this
        };

        oldValue?.un(listeners);
        value   ?.on(listeners);

        value?.getCount() > 0 && this.createItems();
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
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        oldValue?.destroy();
        return ClassSystemUtil.beforeSetInstance(value, Store);
    }

    /**
     *
     */
    createItems() {
        let me          = this,
            records     = me.store.items,
            columnIndex = -1,
            vdom        = me.vdom,
            action, column, item, record;

        vdom.cn = [];

        for (record of records) {
            if (record.column !== columnIndex) {
                columnIndex++;

                column = {
                    ...me.itemDefaults,
                    cls: ['neo-sitemap-column'],
                    cn : [],
                    id : `${me.id}__column-${columnIndex}`
                };

                vdom.cn.push(column);
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

            column.cn.push(item);
        }

        me.update();
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getItemId(recordId) {
        return `${this.id}__${recordId}`;
    }

    /**
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            model    = this.store.model,
            keyField = model?.getField(model.keyProperty),
            keyType  = keyField?.type.toLowerCase();

        if (keyType === 'integer' || keyType === 'number') {
            itemId = parseInt(itemId);
        }

        return itemId;
    }

    /**
     * Override as needed (e.g. unmounting an overlay)
     * @param {Object} data
     */
    onItemClick(data) {}

    /**
     * @param {Object} data
     */
    onItemHandlerClick(data) {
        let me     = this,
            record = me.store.get(me.getRecordId(data.path[0].id));

        me[record.action](record);
    }

    /**
     *
     */
    onStoreFilter() {
        this.createItems();
    }

    /**
     *
     */
    onStoreLoad() {
        this.createItems();
    }

    /**
     *
     */
    onStoreRecordChange() {
        this.createItems();
    }
}

Neo.setupClass(Component);

export default Component;
