import Base    from '../../plugin/Base.mjs';
import CssUtil from '../../util/Css.mjs';

/**
 * @class Neo.list.plugin.Animate
 * @extends Neo.plugin.Base
 */
class Animate extends Base {
    /**
     * Valid values for transitionEasing
     * @member {String[]} transitionEasings=['ease','ease-in','ease-out','ease-in-out','linear']
     * @protected
     * @static
     */
    static transitionEasings = ['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear']

    static config = {
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
         * @member {Number} itemMargin=10
         */
        itemMargin: 10,
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
         * The easing used for fadeIn, fadeOut and position changes.
         * Valid values: 'ease','ease-in','ease-out','ease-in-out','linear'
         * @member {String} transitionEasing_='ease-in-out'
         */
        transitionEasing_: 'ease-in-out',
        /**
         * The id of the setTimeout() call which gets triggered after a transition is done.
         * @member {Number|null} transitionTimeoutId=null
         */
        transitionTimeoutId: null
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me    = this,
            owner = me.owner;

        if (!owner.itemHeight || !owner.itemWidth) {
            console.error('list.plugin.Animate requires fixed itemHeight and itemWidth values', owner);
        }

        me.adjustCreateItem();

        owner.onStoreFilter = me.onStoreFilter.bind(me);
        owner.onStoreSort   = me.onStoreSort  .bind(me);

        this.updateTransitionDetails(false);
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
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetTransitionDuration(value, oldValue) {
        this.isConstructed && this.updateTransitionDetails(Neo.isNumber(oldValue));
    }

    /**
     * Triggered after the transitionEasing config got changed.
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetTransitionEasing(value, oldValue) {
        this.isConstructed && this.updateTransitionDetails(!!oldValue);
    }

    /**
     * Triggered before the transitionEasing config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    beforeSetTransitionEasing(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'transitionEasing');
    }

    /**
     * @param {Neo.list.plugin.Animate} me
     * @param {Object} record
     * @param {Number} index
     * @returns {Object}
     */
    createItem(me, record, index) {
        let item     = me.ownerCreateItem(record, index),
            owner    = me.owner,
            position = me.getItemPosition(record, index),
            style    = item.style || {};

        if (!me.ownerRect) {
            return null;
        }

        Object.assign(style, {
            height   : `${owner.itemHeight}px`,
            position : 'absolute',
            transform: `translate(${position.x}px, ${position.y}px)`,
            width    : `${owner.itemWidth}px`
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
            owner  = me.owner,
            row    = Math.floor(index / me.columns),
            x      = column * (margin + owner.itemWidth)  + margin,
            y      = row    * (margin + owner.itemHeight) + margin;

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
            key   = owner.getKeyProperty();

        return map.indexOf(owner.getItemId(obj.record[key]));
    }

    /**
     *
     */
    onOwnerMounted() {
        let me    = this,
            owner = me.owner;

        owner.getDomRect().then(rect => {
            Object.assign(me, {
                columns  : Math.floor(rect.width / owner.itemWidth),
                ownerRect: rect,
                rows     : Math.floor(rect.height / owner.itemHeight)
            });

            // if the store got loaded before this plugin is ready, create the items now
            owner.store.getCount() > 0 && owner.createItems();
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
            key                 = owner.getKeyProperty(),
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

        hasAddedItems && owner.update();

        // ensure to get into the next animation frame
        setTimeout(() => {
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

            owner.update();
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
        let me = this;

        if (Neo.list.Component && me.owner instanceof Neo.list.Component) {
            me.sortComponentList(data);
        } else {
            me.sortBaseList(data);
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    sortBaseList(data) {
        let me            = this,
            hasChange     = false,
            owner         = me.owner,
            key           = owner.getKeyProperty(),
            newVdomCn     = [],
            previousKeys  = data.previousItems.map(e => e[key]),
            vdom          = owner.vdom,
            fromIndex;

        if (vdom.cn.length > 0) {
            data.items.forEach((item, index) => {
                fromIndex = previousKeys.indexOf(item[key]);

                newVdomCn.push(vdom.cn[fromIndex]);

                if (fromIndex !== index) {
                    hasChange = true;
                }
            });

            if (hasChange) {
                vdom.cn = newVdomCn;
                owner.update();

                // we need to ensure to get this call into the next animation frame
                setTimeout(() => {
                    owner.createItems();
                }, 50);
            }
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.items
     * @param {Object[]} data.previousItems
     * @param {Neo.data.Store} data.scope
     */
    sortComponentList(data) {
        let me           = this,
            owner        = me.owner,
            key          = owner.getKeyProperty(),
            previousKeys = data.previousItems.map(e => e[key]),
            vdom         = owner.vdom,
            fromIndex, item, position;

        owner.sortItems(data);

        previousKeys = owner.items.map(e => owner.getItemRecordId(e[key]));

        if (vdom.cn.length > 0) {
            data.items.forEach((record, index) => {
                fromIndex = previousKeys.indexOf(record[key]);
                item      = vdom.cn[fromIndex];
                position  = me.getItemPosition(record, index);

                item.style.transform = `translate(${position.x}px, ${position.y}px)`;
            });

            owner.update();
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

    /**
     * We do not want to apply the style to each list item itself,
     * so we are using Neo.util.Css
     * @param {Boolean} deleteRule
     * @protected
     */
    updateTransitionDetails(deleteRule) {
        let me       = this,
            duration = me.transitionDuration,
            easing   = me.transitionEasing,
            id       = me.owner.id;

        deleteRule && CssUtil.deleteRules(me.appName, `#${id} .neo-list-item`);

        CssUtil.insertRules(me.appName, [
            `#${id} .neo-list-item {`,
                `transition: opacity ${duration}ms ${easing}, transform ${duration}ms ${easing}`,
            '}'
        ].join(''))
    }
}

Neo.setupClass(Animate);

export default Animate;
