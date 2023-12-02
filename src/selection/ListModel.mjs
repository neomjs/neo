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
        ntype: 'selection-listmodel'
    }

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownEscape(data) {}

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownDown(data) {}

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownEnter(data) {}

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownLeft(data) {}

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownRight(data) {}

    /**
     * Placeholder method to get overridden by class extension list menu.ListModel
     * @param {Object} data
     */
    onKeyDownUp(data) {}

    onListClick({ target }) {
        let me               = this,
            view             = me.view,
            store            = view.store;
debugger;
        activeIndex = Math.min(activeIndex, store.getCount() - 1)

        const
            record = store.getAt(activeIndex),
            itemId = view.getItemId(record[me.view.getKeyProperty()]);

        me.select(itemId);
        view.fire('itemNavigate', record)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        view.addDomListeners({
            click    : me.onListClick,
            delegate : `.${view.itemCls}:not(.neo-disabled,.neo-list-header)`,
            scope    : me
        })

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'   ,key: 'Down'   ,scope: id},
            {fn: 'onKeyDownEnter'  ,key: 'Enter'  ,scope: id},
            {fn: 'onKeyDownEscape' ,key: 'Escape' ,scope: id},
            {fn: 'onKeyDownLeft'   ,key: 'Left'   ,scope: id},
            {fn: 'onKeyDownRight'  ,key: 'Right'  ,scope: id},
            {fn: 'onKeyDownUp'     ,key: 'Up'     ,scope: id}
        )
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

        super.unregister()
    }
}

Neo.applyClassConfig(ListModel);

export default ListModel;
