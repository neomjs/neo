import BaseModel from './BaseModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.selection.grid.RowModel
 * @extends Neo.selection.grid.BaseModel
 */
class RowModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.RowModel'
         * @protected
         */
        className: 'Neo.selection.grid.RowModel',
        /**
         * @member {String} ntype='selection-grid-rowmodel'
         * @protected
         */
        ntype: 'selection-grid-rowmodel',
        /**
         * @member {String} cls='neo-selection-rowmodel'
         * @protected
         */
        cls: 'neo-selection-rowmodel'
    }

    /**
     *
     */
    addDomListener() {
        let me = this;

        me.view.gridContainer.on('rowClick', me.onRowClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.gridContainer.un('rowClick', me.onRowClick, me);

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKeyRow(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKeyRow(-1)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            currentIndex = 0,
            newIndex, newRecord, rowId;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(view.getRecordByRowId(me.items[0]))
        }

        newIndex = (currentIndex + step) % store.getCount();

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        newRecord = store.getAt(newIndex);
        rowId     = view.getRowId(newRecord);

        if (rowId) {
            me.select(rowId);

            view.fire('select', {
                record: store.getAt(newIndex)
            })
        }
    }

    /**
     * @param {Object} data
     */
    onRowClick(data) {
        let me     = this,
            id     = data.data.currentTarget,
            {view} = me,
            isSelected, record;

        if (id) {
            me.toggleSelection(id);

            isSelected = me.isSelected(id);
            record     = view.getRecord(id);

            !isSelected && view.onDeselect?.(record);

            view.fire(isSelected ? 'select' : 'deselect', {
                record
            })
        }
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let {id, view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown', key: 'Down', scope: id},
            {fn: 'onKeyDownUp',   key: 'Up',   scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(RowModel);
