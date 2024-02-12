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

    /**
     * @param {Object} data
     */
    onListClick({ currentTarget }) {
        const { view } = this;

        if (!view.disableSelection) {
            const record = view.store.get(view.getItemRecordId(currentTarget));

            if (record) {
                this.select(record);
            }
        }
    }

    /**
     * @param {Object} data
     */
    onListNavigate(data) {
        const
            { view }  = this,
            { store } = view;

        data.record      = store.getAt(Math.min(data.activeIndex, store.getCount()));
        view._focusIndex = store.indexOf(data.record); // silent update, no need to refocus

        view.fire('itemNavigate', data)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        view.addDomListeners([{
            click    : me.onListClick,

            // Should be `.${view.itemCls}:not(.neo-disabled,.neo-list-header)`
            // TODO parse delegate selectors
            delegate : path => {
                for (let i = 0, { length } = path; i < length; i++) {
                    const { cls } = path[i];

                    if (cls.includes(view.itemCls) && !cls.includes('neo-disabled') && !cls.includes('neo-list-header')) {
                        return i;
                    }
                }
            },
            scope    : me
        }, {
            neonavigate : me.onListNavigate,
            scope    : me
        }])

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
