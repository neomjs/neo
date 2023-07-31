import Model from './Model.mjs';

/**
 * @class Neo.selection.ListModel
 * @extends Neo.selection.Model
 */
class ListModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.ListModel'
         * @protected
         */
        className: 'Neo.selection.ListModel',
        /**
         * @member {String} ntype='selection-listmodel'
         * @protected
         */
        ntype: 'selection-listmodel',
        /**
         * @member {Boolean} stayInList=true
         */
        stayInList: true
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        !this.view.disableSelection && this.onNavKey(data, 1);
    }

    /**
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let view = this.view;

        !view.disableSelection && view.onKeyDownEnter?.(this.getSelection()[0]);
    }

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownEscape(data) {}

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onKeyDownUp(data);
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onKeyDownDown(data);
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        !this.view.disableSelection && this.onNavKey(data, -1);
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        let me               = this,
            view             = me.view,
            store            = view.store,
            maxItems         = store.getCount(),
            preventSelection = false,
            index, item, itemId, node, record, recordId;

        for (node of data.path) {
            if (node.cls.includes(view.itemCls)) {
                item = node.id;
                break;
            }
        }

        item = item || me.items?.[0];

        if (item) {
            recordId = view.getItemRecordId(item);
            index    = store.indexOf(recordId) + step;
            record   = store.getAt(index);

            while (record?.[view.disabledField] === true || record?.isHeader === true) {
                index += step;
                record = store.getAt(index)
            }

            if (index < 0) {
                if (me.stayInList) {
                    index = maxItems - 1;
                } else {
                    preventSelection = true;
                    me.deselectAll();
                    view.fire('selectPreFirstItem');
                }
            } else if (index >= maxItems) {
                if (me.stayInList) {
                    index = 0;

                    while (store.getAt(index)?.isHeader === true) {
                        index++;
                    }
                } else {
                    preventSelection = true;
                    me.deselectAll();
                    view.fire('selectPostLastItem');
                }
            }
        } else {
            index = 0;
        }

        if (!preventSelection) {
            record = store.getAt(index);
            itemId = view.getItemId(record[me.view.getKeyProperty()]);

            me.select(itemId);
            view.focus(itemId);
            view.fire('itemNavigate', record);
        }
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'   ,key: 'Down'   ,scope: id},
            {fn: 'onKeyDownEnter'  ,key: 'Enter'  ,scope: id},
            {fn: 'onKeyDownEscape' ,key: 'Escape' ,scope: id},
            {fn: 'onKeyDownLeft'   ,key: 'Left'   ,scope: id},
            {fn: 'onKeyDownRight'  ,key: 'Right'  ,scope: id},
            {fn: 'onKeyDownUp'     ,key: 'Up'     ,scope: id}
        );
    }

    /**
     * @param {Number} index
     */
    selectAt(index) {
        let view      = this.view,
            recordKey = view?.store.getKeyAt(index),
            itemId    = recordKey && view.getItemId(recordKey);

        if (itemId) {
            this.select(itemId);
            view.focus(itemId);
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
            {fn: 'onKeyDownDown'   ,key: 'Down'   ,scope: id},
            {fn: 'onKeyDownEnter'  ,key: 'Enter'  ,scope: id},
            {fn: 'onKeyDownEscape' ,key: 'Escape' ,scope: id},
            {fn: 'onKeyDownLeft'   ,key: 'Left'   ,scope: id},
            {fn: 'onKeyDownRight'  ,key: 'Right'  ,scope: id},
            {fn: 'onKeyDownUp'     ,key: 'Up'     ,scope: id}
        ]);

        super.unregister();
    }
}

Neo.applyClassConfig(ListModel);

export default ListModel;
