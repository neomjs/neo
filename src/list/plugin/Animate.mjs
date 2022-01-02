import Base from '../../plugin/Base.mjs';

/**
 * @class Neo.list.plugin.Animate
 * @extends Neo.plugin.Base
 */
class Animate extends Base {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.plugin.Animate'
         * @protected
         */
        className: 'Neo.list.plugin.Animate',
        /**
         * Read only
         * @member {Number|null} columns=null
         */
        columns: null,
        /**
         * Value in px
         * @member {Number} itemHeight=200
         */
        itemHeight: 200,
        /**
         * Value in px
         * @member {Number} itemMargin=10
         */
        itemMargin: 10,
        /**
         * Value in px
         * @member {Number} itemWidth=300
         */
        itemWidth: 300,
        /**
         * @member {DOMRect|null} ownerRect=null
         */
        ownerRect: null,
        /**
         * Read only
         * @member {Number|null} rows=null
         */
        rows: null
    }}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me    = this,
            owner = me.owner;

        me.adjustCreateItem();

        owner.onStoreFilter = me.onStoreFilter.bind(me);

        owner.store.on({
            sort : me.onSort,
            scope: me
        });
    }

    /**
     *
     */
    adjustCreateItem() {
        let me    = this,
            owner = me.owner;

        me.ownerCreateItem = owner.createItem.bind(owner);
        owner.createItem   = me.createItem.bind(owner, me);
    }

    /**
     * @param {Neo.list.plugin.Animate} me
     * @param {Object} record
     * @param {Number} index
     * @returns {Object}
     */
    createItem(me, record, index) {
        let item       = me.ownerCreateItem(record, index),
            itemHeight = me.itemHeight,
            itemWidth  = me.itemWidth,
            margin     = me.itemMargin,
            style      = item.style || {},
            column, row, x, y;

        if (!me.ownerRect) {
            return null;
        }

        column = index % me.columns;
        row    = Math.floor(index / me.columns);
        x      = column * (margin + itemWidth)  + margin;
        y      = row    * (margin + itemHeight) + margin;

        Object.assign(style, {
            height   : `${itemHeight}px`,
            position : 'absolute',
            transform: `translate(${x}px, ${y}px)`,
            width    : `${itemWidth}px`
        });

        item.style = style;

        return item;
    }

    /**
     *
     */
    onOwnerMounted() {
        let me = this;

        me.owner.getDomRect().then(rect => {
            Object.assign(me, {
                columns  : Math.floor(rect.width / me.itemWidth),
                ownerRect: rect,
                rows     : Math.floor(rect.height / me.itemHeight)
            });
        });
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    onSort(data) {
        let me          = this,
            hasChange   = false,
            keyProperty = data.scope.keyProperty,
            owner       = me.owner,
            newVdomCn   = [],
            vdom        = owner.vdom,
            vdomMap     = vdom.cn.map(e => e.id),
            fromIndex, itemId;

        if (vdomMap.length > 0) {
            data.items.forEach((item, index) => {
                itemId    = owner.getItemId(item[keyProperty]);
                fromIndex = vdomMap.indexOf(itemId);

                newVdomCn.push(vdom.cn[fromIndex]);

                if (fromIndex !== index) {
                    hasChange = true;
                }
            });

            if (hasChange) {
                owner.vdom.cn = newVdomCn;

                owner.promiseVdomUpdate().then(() => {
                    // we need to ensure to get this call into the next animation frame
                    setTimeout(() => {
                        owner.createItems();
                    }, 50);
                });
            }
        }
    }

    /**
     * @param {Neo.data.Store} store
     */
    onStoreFilter(store) {
        console.log('onFilter', store);
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};
