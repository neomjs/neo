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
         * True lets a click on an already-selected item deselect it — the removable-selection
         * affordance a multi-select list needs (a multi-select whose selections are irrevocable
         * is half a control). Only consulted while `singleSelect` is false: single-select keeps
         * its click-reselects semantics untouched. Defaults to false, so every existing consumer
         * keeps the shipped behavior unless it opts in.
         * @member {Boolean} toggleOnClick=false
         */
        toggleOnClick: false
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
    onListClick({currentTarget}) {
        let me     = this,
            {view} = me,
            id     = view.getItemRecordId(currentTarget),
            record = view.store.get(id);

        if (!view.disableSelection && record) {
            // isSelected() compares raw against the vdom-id collection, so the record maps through
            // getSelectionItemId first — the same conversion select() and deselect() apply on entry.
            if (!me.singleSelect && me.toggleOnClick && me.isSelected(me.getSelectionItemId(record))) {
                me.deselect(record)
            } else {
                me.select(record)
            }
        }
    }

    /**
     * @param {Object} data
     */
    onListNavigate(data) {
        let {view}  = this,
            {store} = view,
            record, recordId;

        if (data.activeItem) {
            recordId = view.getItemRecordId(data.activeItem);
            record   = store.get(recordId);
        }

        if (!record) {
            record = store.getAt(Math.min(data.activeIndex, store.getCount()))
        }

        data.record      = record;
        view._focusIndex = store.indexOf(record); // silent update, no need to refocus

        view.fire('itemNavigate', data)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me;

        view.addDomListeners([{
            click: me.onListClick,
            scope: me,

            // Should be `.${view.itemCls}:not(.neo-disabled,.neo-list-header)`
            // TODO parse delegate selectors
            delegate: path => {
                for (let i = 0, { length } = path; i < length; i++) {
                    const { cls } = path[i];

                    if (cls.includes(view.itemCls) && !cls.includes('neo-disabled') && !cls.includes('neo-list-header')) {
                        return i;
                    }
                }
            }
        }, {
            neonavigate : me.onListNavigate,
            scope       : me
        }]);

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
        let {view} = this,
            record = view?.store.getAt(index),
            itemId = record && view.getItemId(view.getRecordId(record));

        itemId && this.select(itemId)
    }

    /**
     *
     */
    unregister() {
        let me         = this,
            {id, view} = me;

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

export default Neo.setupClass(ListModel);
