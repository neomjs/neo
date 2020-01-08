import Model    from './Model.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * A selection model intended to use for Neo.component.Helix
 * @class Neo.selection.HelixModel
 * @extends Neo.selection.Model
 */
class HelixModel extends Model {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.selection.HelixModel'
         * @private
         */
        className: 'Neo.selection.HelixModel',
        /**
         * @member {String} ntype='selection-helixmodel'
         * @private
         */
        ntype: 'selection-helixmodel',
        /**
         * True to stay in the same column when navigating with the up and down keys,
         * otherwise you will navigate to the next / prev column when moving out
         * @member {boolean} stayInColumn=false
         */
        stayInColumn: false
    }}

    /**
     * Override to not apply a domListener
     */
    addDomListener() {}

    /**
     *
     */
    onContainerClick() {
        let me       = this,
            view     = me.view,
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

        Neo.currentWorker.promiseMessage('main', {
            action: 'updateDom',
            deltas: deltas
        }).then(() => {
            me.fire('selectionChange', me.items, oldItems);
        });
    }

    /**
     *
     * @param {Object} data
     */
    onItemClick(data) {
        let i   = 0,
            len = data.path.length;

        for (; i < len; i++) {
            if (data.path[i].cls.includes('neo-helix-item')) {
                this.select(this.view.getItemId(data.path[i].id));
                break;
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyColumn(1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyRow(-1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyRow(1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyColumn(-1);
    }

    /**
     *
     * @param {Number} step=1
     */
    onNavKeyColumn(step=1) {
        let me           = this,
            view         = me.view,
            store        = view.store,
            selected     = me.items[0],
            countRecords = store.getCount(),
            itemsPerRow  = parseInt(360 / view.itemAngle),
            stayInColumn = me.stayInColumn,
            index;

        step *= itemsPerRow;

        if (selected) {
            index = store.indexOf(selected) + step;
        } else {
            index = 0;
        }

        if (index < 0) {
            if (!stayInColumn) {
                index++;
            }
            while (index < (countRecords - itemsPerRow)) {
                index += itemsPerRow;
            }
        } else if (index >= countRecords) {
            if (!stayInColumn) {
                index--;
            }
            while (index >= itemsPerRow) {
                index -= itemsPerRow;
            }
        }

        me.select(store.getKeyAt(index));
    }

    /**
     *
     * @param {Number} step=1
     */
    onNavKeyRow(step=1) {
        let me           = this,
            view         = me.view,
            store        = view.store,
            selected     = me.items[0],
            countRecords = store.getCount(),
            index;

        if (selected) {
            index = store.indexOf(selected) + step;
        } else {
            index = 0;
        }

        if (index < 0) {
            index = countRecords - 1;
        } else if (index >= countRecords) {
            index = 0;
        }

        me.select(store.getKeyAt(index));
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        view.on({
            containerClick: me.onContainerClick,
            itemClick     : me.onItemClick,
            scope         : me
        });

        if (view.keys) {
            view.keys._keys.push(
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            );
        }
    }

    /**
     *
     * @param {String} itemId
     */
    select(itemId) {
        let me         = this,
            view       = me.view,
            isSelected = me.items.includes(itemId),
            oldItems   = [...me.items],
            deltas     = [];

        if (me.singleSelect) {
            me.items.forEach(item => {
                if (item.id !== itemId) {
                    deltas.push({
                        id : view.getItemVnodeId(item),
                        cls: {
                            add   : [],
                            remove: ['neo-selected']
                        }
                    });
                }
            });

            me.items.splice(0, me.items.length);
        }

        deltas.push({
            id : view.getItemVnodeId(itemId),
            cls: {
                add   : isSelected ? [] : ['neo-selected'],
                remove: isSelected ? ['neo-selected'] : []
            }
        });

        NeoArray[isSelected ? 'remove' : 'add'](me.items, itemId);

        // console.log('select', itemId, isSelected, me.items);

        Neo.currentWorker.promiseMessage('main', {
            action: 'updateDom',
            deltas: deltas
        }).then(() => {
            me.fire('selectionChange', me.items, oldItems);
        });
    }

    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys.removeKeys([
                {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope: id},
                {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope: id},
                {fn: 'onKeyDownRight' ,key: 'Right' ,scope: id},
                {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope: id}
            ]);
        }

        super.unregister();
    }
}

Neo.applyClassConfig(HelixModel);

export {HelixModel as default};