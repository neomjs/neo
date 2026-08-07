import Model    from './Model.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * A selection model intended to use for Neo.component.Gallery
 * @class Neo.selection.GalleryModel
 * @extends Neo.selection.Model
 */
class GalleryModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.GalleryModel'
         * @protected
         */
        className: 'Neo.selection.GalleryModel',
        /**
         * @member {String} ntype='selection-gallerymodel'
         * @protected
         */
        ntype: 'selection-gallerymodel',
        /**
         * @member {String} cls='neo-selection-gallerymodel'
         * @protected
         */
        cls: 'neo-selection-gallerymodel',
        /**
         * True to stay in the same column when navigating with the up and down keys,
         * otherwise you will navigate to the next / prev column when moving out
         * @member {Boolean} stayInRow=false
         */
        stayInRow: false
    }

    /**
     * Override to not apply a domListener
     */
    addDomListener() {}

    /**
     *
     */
    onContainerClick() {
        let me       = this,
            {view}   = me,
            oldItems = [...me.items];

        // Was a hand-rolled delta list pushed through Neo.applyDeltas. That writes the DOM directly
        // and never touches the vdom, so clearing the selection left every item still carrying
        // neo-selected AND aria-selected in the vdom — invisible until the next differ pass, which
        // would then have re-asserted the styling this method exists to remove. deannotateItem owns
        // both halves of the annotation, so routing through it keeps the two trees agreeing.
        me.items.forEach(item => {
            me.deannotateItem(view.getVdomChild(me.getItemVdomId(item)))
        });

        me.items.splice(0, me.items.length);

        // promiseUpdate(), not update(): the ordering is part of the contract, not a detail. The
        // previous Neo.applyDeltas(...).then(...) fired selectionChange only after the DOM had
        // settled, so a listener could read the cleared state. update() returns void and starts an
        // async worker cycle, so firing after it synchronously would hand every listener the DOM as
        // it was BEFORE the clear — a regression invisible to any assertion that only checks the
        // final state.
        view.promiseUpdate().then(() => {
            me.fire('selectionChange', me.items, oldItems)
        })
    }

    /**
     * @param {Object} data
     */
    onItemClick(data) {
        let i      = 0,
            len    = data.path.length,
            {view} = this,
            key;

        for (; i < len; i++) {
            if (data.path[i].cls.includes('neo-gallery-item')) {
                key = view.getItemId(data.path[i].id);
                this.select(key);

                view.fire('select', {
                    record: view.store.get(key)
                });

                break
            }
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this[this.view.orderByRow ? 'onNavKeyRow' : 'onNavKeyColumn'](1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this[this.view.orderByRow ? 'onNavKeyColumn' : 'onNavKeyRow'](-1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this[this.view.orderByRow ? 'onNavKeyColumn' : 'onNavKeyRow'](1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this[this.view.orderByRow ? 'onNavKeyRow' : 'onNavKeyColumn'](-1)
    }

    /**
     * @param {Number} step=1
     */
    onNavKeyColumn(step=1) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            selected     = me.items[0],
            countRecords = view.maxItems ? Math.min(view.maxItems, store.getCount()) : store.getCount(),
            index, record;

        if (selected) {
            record = store.get(selected);
            index  = store.indexOf(record) + step
        } else {
            index = 0
        }

        if (index < 0) {
            index = countRecords - 1
        } else if (index >= countRecords) {
            index = 0
        }

        record = store.getAt(index);

        me.select(view.getRecordId(record));

        view.fire('select', {
            record
        })
    }

    /**
     * @param {Number} step=1
     */
    onNavKeyRow(step=1) {
        let me                  = this,
            {stayInRow, view}   = me,
            {amountRows, store} = view,
            selected            = me.items[0],
            countRecords        = view.maxItems ? Math.min(view.maxItems, store.getCount()) : store.getCount(),
            index, record;

        if (view.orderByRow) {
            amountRows = Math.ceil(view.store.getCount() / amountRows)
        }

        step *= amountRows;

        if (selected) {
            record = store.get(selected);
            index  = store.indexOf(record) + step
        } else {
            index = 0
        }

        if (index < 0) {
            if (!stayInRow) {
                index++
            }
            while (index < (countRecords - amountRows)) {
                index += amountRows
            }
        } else if (index >= countRecords) {
            if (!stayInRow) {
                index--
            }
            while (index >= amountRows) {
                index -= amountRows
            }
        }

        record = store.getAt(index);

        me.select(view.getRecordId(record));

        view.fire('select', {
            record
        })
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me;

        view.on({
            containerClick: me.onContainerClick,
            itemClick     : me.onItemClick,
            scope         : me
        });

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        )
    }

    /**
     * @summary Resolves a tracked record id to the prefixed vnode id the view's items actually carry.
     *
     * {@link Neo.selection.GalleryModel#select select()} tracks the **logical** record id, while
     * `Gallery#createItem` keys each item node as `getItemVnodeId(recordId)` → `${view.id}__${recordId}`.
     * The base implementation is identity, which resolves nothing against this view.
     *
     * @param {String} item Tracked record id
     * @returns {String}
     * @protected
     */
    getItemVdomId(item) {
        return this.view?.getItemVnodeId(item) ?? item
    }

    /**
     * @param {String} itemId
     */
    select(itemId) {
        let me            = this,
            {items, view} = me,
            oldItems      = [...items],
            deltas        = [],
            vnodeId;

        // a select() call can happen before the view is registered
        if (!view) {
            // will get picked up by view.afterSetMounted()
            NeoArray['add'](items, itemId);
            return
        }

        if (view.useInternalId && view.store?.count > 0) {
            let record = view.store.get(itemId);
            if (record) {
                itemId = view.getRecordId(record);
            }
        }

        vnodeId = view.getItemVnodeId(itemId);

        if (me.singleSelect) {
            me.items.forEach(item => {
                if (item !== itemId) {
                    deltas.push({
                        id : view.getItemVnodeId(item),
                        cls: {
                            add   : [],
                            remove: ['neo-selected']
                        }
                    });

                    me.deannotateItem(view.getVdomChild(view.getItemVnodeId(item)))
                }
            });

            items.splice(0, items.length)
        }

        deltas.push({
            id : vnodeId,
            cls: {
                add: ['neo-selected']
            }
        });

        // The delta reaches the DOM immediately; this puts the SAME annotation on the vdom, which is what
        // `restoreSelection` reads after a rebuild. Without it the vdom never carries the selection at all,
        // so `aria-selected` is absent until a restore INVENTS it — and a sort that introduces ARIA for the
        // first time has not preserved anything. One annotation owner, both paths.
        me.annotateItem(view.getVdomChild(vnodeId));

        NeoArray['add'](items, itemId);

        if (deltas.length > 0 && view.mounted) {
            Neo.applyDeltas(view.windowId, deltas).then(() => {
                view.onSelect?.(items);
                me.fire('selectionChange', items, oldItems)
            })
        } else if (view.mounted) {
            view.onSelect?.(items);
            me.fire('selectionChange', items, oldItems)
        }
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            stayInRow: this.stayInRow
        }
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(GalleryModel);
