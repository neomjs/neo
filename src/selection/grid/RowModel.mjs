import BaseModel from './BaseModel.mjs';

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
        cls: 'neo-selection-rowmodel',
        /**
         * @member {Boolean} selectsRows=true
         * @protected
         */
        selectsRows: true
    }

    /**
     *
     */
    addDomListener() {
        let me     = this,
            target = me.view.gridContainer || me.view.parent;

        target.on('rowClick', me.onRowClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me     = this,
            target = me.view?.gridContainer || me.view?.parent;

        target?.un('rowClick', me.onRowClick, me);

        super.destroy(...args)
    }

    /**
     * @param {Object} data
     */
    onKeyDownDown(data) {
        !this.hasEditorFocus(data) && this.onNavKeyRow(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        !this.hasEditorFocus(data) && this.onNavKeyRow(-1)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            countRecords = store.getCount(),
            recordId     = me.selectedRows[0] || view.getRecordId(store.getAt(0)),
            record       = me.getRowRecord(recordId),
            index        = store.indexOf(record),
            newIndex     = (index + step) % countRecords;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        record = store.getAt(newIndex);

        if (me.hasAnnotations(record)) {
            me.updateAnnotations(record)
        } else {
            recordId = view.getRecordId(record);

            if (recordId) {
                me.selectRow(recordId);

                view.scrollByRows(index, step);
                view.fire('select', {record});
                me.fireRowSelectionChange()
            }
        }
    }

    /**
     * @param {Object} event
     */
    onRowClick(event) {
        let me     = this,
            {view} = me,
            {data} = event,
            record = event.record || me.getRecord(data.path),
            recordId;

        // The single View-owned model listens once on the gridContainer, so each row click is
        // processed exactly once regardless of which body fired it.

        if (record) {
            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                recordId = view.getRecordId(record);

                me.toggleRowSelection(recordId);

                view.fire(me.isSelectedRow(recordId) ? 'select' : 'deselect', {record});
                me.fireRowSelectionChange()
            }
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
