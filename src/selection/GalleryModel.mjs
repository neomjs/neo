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
            oldItems = [...me.items],
            deltas   = [];

        me.items.forEach(item => {
            deltas.push({
                id : view.getItemVnodeId(item),
                cls: {
                    add   : [],
                    remove: ['neo-selected']
                }
            });
        });

        me.items.splice(0, me.items.length);

        Neo.applyDeltas(view.appName, deltas).then(() => {
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
            countRecords = store.getCount(),
            index, record;

        if (selected) {
            index = store.indexOf(selected) + step
        } else {
            index = 0
        }

        if (index < 0) {
            index = countRecords - 1
        } else if (index >= countRecords) {
            index = 0
        }

        record = store.getAt(index);

        me.select(record[store.keyProperty]);

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
            countRecords        = store.getCount(),
            index, record;

        if (view.orderByRow) {
            amountRows = Math.ceil(view.store.getCount() / amountRows)
        }

        step *= amountRows;

        if (selected) {
            index = store.indexOf(selected) + step
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

        me.select(record[store.keyProperty]);

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
     * @param {String} itemId
     */
    select(itemId) {
        let me            = this,
            {items, view} = me,
            oldItems      = [...items],
            deltas        = [],
            vnodeId       = view?.getItemVnodeId(itemId);

        // a select() call can happen before the view is registered
        if (!view) {
            // will get picked up by view.afterSetMounted()
            NeoArray['add'](items, itemId);
            return
        }

        if (me.singleSelect) {
            me.items.forEach(item => {
                if (item !== itemId) {
                    deltas.push({
                        id : view.getItemVnodeId(item),
                        cls: {
                            add   : [],
                            remove: ['neo-selected']
                        }
                    })
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

        NeoArray['add'](items, itemId);

        if (deltas.length > 0 && view.mounted) {
            Neo.applyDeltas(view.appName, deltas).then(() => {
                view.onSelect?.(items);
                me.fire('selectionChange', items, oldItems)
            })
        } else if (view.mounted) {
            view.onSelect?.(items);
            me.fire('selectionChange', items, oldItems)
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
