import Base    from '../../plugin/Base.mjs';
import CssUtil from '../../util/Css.mjs';

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
        rows: null,
        /**
         * Time in ms. Please ensure to match the CSS based value, in case you change the default.
         * @member {Number} transitionDuration_=500
         */
        transitionDuration_: 500,
        /**
         * The id of the setTimeout() call which gets triggered after a transition is done.
         * @member {Number|null} transitionTimeoutId=null
         */
        transitionTimeoutId: null
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
            sort : me.onStoreSort,
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
     * Triggered after the transitionDuration config got changed.
     *
     * We do not want to apply the style to each list item itself,
     * so we are using Neo.util.Css
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetTransitionDuration(value, oldValue) {
        Neo.isNumber(oldValue) && CssUtil.deleteRules(`#${this.owner.id} .neo-list-item`);

        CssUtil.insertRules([
            `#${this.owner.id} .neo-list-item {`,
                `transition: opacity ${value}ms ease-in-out, transform ${value}ms ease-in-out`,
            '}'
        ].join(''));
    }

    /**
     * @param {Neo.list.plugin.Animate} me
     * @param {Object} record
     * @param {Number} index
     * @returns {Object}
     */
    createItem(me, record, index) {
        let item     = me.ownerCreateItem(record, index),
            position = me.getItemPosition(record, index),
            style    = item.style || {};

        if (!me.ownerRect) {
            return null;
        }

        Object.assign(style, {
            height   : `${me.itemHeight}px`,
            position : 'absolute',
            transform: `translate(${position.x}px, ${position.y}px)`,
            width    : `${me.itemWidth}px`
        });

        item.style = style;

        return item;
    }

    /**
     * @param {Object} record
     * @param {Number} index
     * @returns {{x: Number, y: Number}}
     */
    getItemPosition(record, index) {
        let me     = this,
            column = index % me.columns,
            margin = me.itemMargin,
            row    = Math.floor(index / me.columns),
            x      = column * (margin + me.itemWidth)  + margin,
            y      = row    * (margin + me.itemHeight) + margin;

        return {x, y};
    }

    /**
     * @param {Object} obj
     * @param {String[]} map
     * @param {Boolean} intercept
     * @returns {Number}
     */
    getItemIndex(obj, map, intercept) {
        if (!intercept) {
            return obj.index;
        }

        let owner = this.owner,
            key   = owner.store.keyProperty;

        return map.indexOf(owner.getItemId(obj.record[key]));
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
     * @param {Boolean} data.isFiltered
     * @param {Object[]} data.items
     * @param {Object[]} data.oldItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreFilter(data) {
        let me                  = this,
            owner               = me.owner,
            key                 = owner.store.keyProperty,
            hasAddedItems       = false,
            addedItems          = [],
            movedItems          = [],
            removedItems        = [],
            transitionTimeoutId = me.transitionTimeoutId,
            intercept           = !!transitionTimeoutId,
            vdom                = owner.vdom,
            index, item, map, position;

        if (transitionTimeoutId) {
            clearTimeout(transitionTimeoutId);
            me.transitionTimeoutId = null;
        }

        map = intercept ? vdom.cn.map(e => e.id) : [];

        data.items.forEach((record, index) => {
            item = {index, record};

            if (!data.oldItems.includes(record)) {
                // flag items which are still inside the DOM (running remove OP)
                if (intercept && map.includes(owner.getItemId(record[key]))) {
                    item.reAdded = true;
                }

                addedItems.push(item);
            } else {
                movedItems.push(item);
            }
        });

        data.oldItems.forEach((record, index) => {
            if (!data.items.includes(record)) {
                removedItems.push({index, record});
            }
        });

        addedItems.forEach(obj => {
            if (!obj.reAdded) {
                index = me.getItemIndex(obj, map, intercept);

                if (index > -1) {
                    hasAddedItems = true;

                    vdom.cn.splice(index, 0, me.createItem(me, obj.record, obj.index));

                    obj.item = vdom.cn[index];
                    obj.item.style.opacity = 0;
                }
            }
        });

        if (hasAddedItems) {
            owner.vdom = vdom;
        }

        // ensure to get into the next animation frame
        setTimeout(() => {
            // get the latest version of the vdom, since this is a delayed callback
            vdom = owner.vdom;

            // new items are already added into the vdom, while old items are not yet removed
            // => we need a map to ensure getting the correct index
            map = vdom.cn.map(e => e.id);

            addedItems.forEach(obj => {
                index = me.getItemIndex(obj, map, intercept);

                if (index > -1) {
                    // we can change the opacity for re-added items too => the vdom engine will ignore this
                    vdom.cn[index].style.opacity = 1;
                }
            });

            movedItems.forEach(obj => {
                index = me.getItemIndex(obj, map, true); // honor removed items, even without interceptions

                if (index > -1) {
                    position = me.getItemPosition(obj.record, obj.index);

                    Object.assign(vdom.cn[index].style, {
                        opacity  : 1,
                        transform: `translate(${position.x}px, ${position.y}px)`
                    });
                }
            });

            removedItems.forEach(obj => {
                index = me.getItemIndex(obj, map, intercept);

                if (index > -1) {
                    obj.item = vdom.cn[index];
                    obj.item.style.opacity = 0;
                }
            });

            owner.vdom = vdom;

            me.triggerTransitionCallback();
        }, 50);
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    onStoreSort(data) {
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

                owner.vdom = vdom;

                // we need to ensure to get this call into the next animation frame
                setTimeout(() => {
                    owner.createItems();
                }, 50);
            }
        }
    }

    /**
     *
     */
    triggerTransitionCallback() {
        let me = this;

        me.transitionTimeoutId = setTimeout(() => {
            me.transitionTimeoutId = null;

            me.owner.createItems();
        }, me.transitionDuration);
    }
}

Neo.applyClassConfig(Animate);

export {Animate as default};
