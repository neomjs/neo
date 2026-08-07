import Model    from './Model.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * A selection model intended to use for Neo.component.Helix
 * @class Neo.selection.HelixModel
 * @extends Neo.selection.Model
 */
class HelixModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.HelixModel'
         * @protected
         */
        className: 'Neo.selection.HelixModel',
        /**
         * @member {String} ntype='selection-helixmodel'
         * @protected
         */
        ntype: 'selection-helixmodel',
        /**
         * @member {String} cls='neo-selection-helixmodel'
         * @protected
         */
        cls: 'neo-selection-helixmodel',
        /**
         * True to stay in the same column when navigating with the up and down keys,
         * otherwise you will navigate to the next / prev column when moving out
         * @member {boolean} stayInColumn=false
         */
        stayInColumn: false
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

        // Same correction as GalleryModel.onContainerClick, for the same reason: the previous
        // Neo.applyDeltas list wrote the DOM and left the vdom still annotated, so the two trees
        // disagreed about what was selected. deannotateItem removes both neo-selected and
        // aria-selected, and the differ carries it.
        me.items.forEach(item => {
            me.deannotateItem(view.getVdomChild(me.getItemVdomId(item)))
        });

        me.items.splice(0, me.items.length);

        // Same ordering contract as GalleryModel.onContainerClick: settle the DOM, then fire. The
        // event carried a DOM-is-current guarantee under the old applyDeltas().then(...) shape, and
        // a synchronous fire after a void update() would silently withdraw it.
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
            if (data.path[i].cls.includes('neo-helix-item')) {
                key = view.getItemId(data.path[i].id);
                this.select(key);

                view.fire('select', {
                    record: view.store.get(key) || view.store.items.find(r => view.getRecordId(r) === key)
                });

                break
            }
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyColumn(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyRow(-1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyRow(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyColumn(-1)
    }

    /**
     * @param {Number} step=1
     */
    onNavKeyColumn(step=1) {
        let me                   = this,
            {stayInColumn, view} = me,
            {store}              = view,
            selected             = me.items[0],
            countRecords         = view.maxItems ? Math.min(view.maxItems, store.getCount()) : store.getCount(),
            itemsPerRow          = parseInt(360 / view.itemAngle),
            index, record;

        step *= itemsPerRow;

        if (selected) {
            record = store.get(selected) || store.items.find(r => view.getRecordId(r) === selected);
            index  = store.indexOf(record) + step
        } else {
            index = 0
        }

        if (index < 0) {
            if (!stayInColumn) {
                index++
            }
            while (index < (countRecords - itemsPerRow)) {
                index += itemsPerRow
            }
        } else if (index >= countRecords) {
            if (!stayInColumn) {
                index--
            }
            while (index >= itemsPerRow) {
                index -= itemsPerRow
            }
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
        let me           = this,
            {view}       = me,
            {store}      = view,
            selected     = me.items[0],
            countRecords = view.maxItems ? Math.min(view.maxItems, store.getCount()) : store.getCount(),
            index, record;

        if (selected) {
            record = store.get(selected) || store.items.find(r => view.getRecordId(r) === selected);
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
     * {@link Neo.selection.HelixModel#select select()} tracks the **logical** record id, while
     * `Helix#createItem` keys each item node as `getItemVnodeId(recordId)` → `${view.id}__${recordId}`.
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
     * @param {Boolean} [toggleSelection=true]
     */
    select(itemId, toggleSelection=true) {
        let me         = this,
            view       = me.view,
            items      = me.items,
            oldItems   = [...items],
            deltas     = [],
            isSelected;

        // a select() call can happen before the view is registered
        if (!view) {
            return;
        }

        if (view.useInternalId && view.store?.count > 0) {
            let record = view.store.get(itemId);
            if (record) {
                itemId = view.getRecordId(record);
            }
        }

        isSelected = toggleSelection === false ? false : items.includes(itemId);

        if (!view.mounted) {
            view.on('mounted', () => {
                me.timeout(300).then(() => {
                    me.select(itemId, toggleSelection)
                })
            }, me, {once: true})
        }

        if (me.singleSelect) {
            items.forEach(item => {
                if (item.id !== itemId) {
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

            items.splice(0, items.length);
        }

        deltas.push({
            id : view.getItemVnodeId(itemId),
            cls: {
                add   : isSelected ? [] : ['neo-selected'],
                remove: isSelected ? ['neo-selected'] : []
            }
        });

        // The delta reaches the DOM immediately; this puts the SAME annotation on the vdom, which is what
        // `restoreSelection` reads after a rebuild. Without it the vdom never carries the selection, so
        // `aria-selected` is absent until a restore INVENTS it — and a sort that introduces ARIA for the
        // first time has not preserved anything. One annotation owner, both paths, both directions.
        const node = view.getVdomChild(view.getItemVnodeId(itemId));

        isSelected ? me.deannotateItem(node) : me.annotateItem(node);

        NeoArray[isSelected ? 'remove' : 'add'](items, itemId);

        // console.log('select', itemId, isSelected, items);

        view.mounted && Neo.applyDeltas(view.windowId, deltas).then(() => {
            view.onSelect?.(items);
            me.fire('selectionChange', items, oldItems);
        });
    }

    /**
     * @returns {Object}
     */
    toJSON() {
        return {
            ...super.toJSON(),
            stayInColumn: this.stayInColumn
        }
    }

    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
        ]);

        super.unregister();
    }
}

export default Neo.setupClass(HelixModel);
