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
        cls: 'neo-selection-rowmodel'
    }

    /**
     *
     */
    addDomListener() {
        let me = this;

        me.view.parent.on('rowClick', me.onRowClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.parent.un('rowClick', me.onRowClick, me);

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
                view.fire('select', {record})
            }
        }
    }

    /**
     * @param {Object} data
     */
    onRowClick({data}) {
        let me     = this,
            {view} = me,
            record = me.getRecord(data.path),
            recordId;

        if (record) {
            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                recordId = view.getRecordId(record);

                me.toggleRowSelection(recordId);

                view.fire(me.isSelectedRow(recordId) ? 'select' : 'deselect', {record})
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

    /**
     * @param {Record} record
     */
    updateAnnotations(record) {
        let me               = this,
            {view}           = me,
            {store}          = view,
            recordId         = view.getRecordId(record),
            isSelected       = me.isSelectedRow(recordId),
            annotationsField = view.selectedRecordField;

        if (me.singleSelect) {
            if (isSelected) {
                record[annotationsField] = false
            } else {
                me.selectedRows.forEach(recordId => {
                    // We can use setSilent(), since the last change will trigger a view update
                    store.get(recordId).setSilent({[annotationsField]: false})
                });

                record[annotationsField] = true
            }
        } else {
            record[annotationsField] = !record[annotationsField]
        }
    }
}

export default Neo.setupClass(RowModel);
