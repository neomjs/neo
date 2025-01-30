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
     * @param {Record} record
     * @returns {Boolean}
     */
    hasAnnotations(record) {
        return !!Object.getOwnPropertyDescriptor(record.__proto__, this.view.selectedRecordField)
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
            countRecords = store.getCount(),
            currentIndex = 0,
            newIndex, record, rowId;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(view.getRecordByRowId(me.items[0]))
        }

        newIndex = (currentIndex + step) % countRecords;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        record = store.getAt(newIndex);

        if (me.hasAnnotations(record)) {
            me.updateAnnotations(record)
        } else {
            rowId = view.getRowId(record);

            if (rowId) {
                me.select(rowId);
                view.fire('select', {record})
            }
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
            record = view.getRecord(id);

            if (me.hasAnnotations(record)) {
                me.updateAnnotations(record)
            } else {
                me.toggleSelection(id);

                isSelected = me.isSelected(id);

                !isSelected && view.onDeselect?.(record);

                view.fire(isSelected ? 'select' : 'deselect', {record})
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
            rowId            = view.getRowId(record),
            isSelected       = me.isSelected(rowId),
            annotationsField = view.selectedRecordField;

        if (me.singleSelect) {
            if (isSelected) {
                record[annotationsField] = false
            } else {
                me.items.forEach(rowId => {
                    // We can use setSilent(), since the last change will trigger a view update
                    view.getRecordByRowId(rowId).setSilent({[annotationsField]: false})
                });

                record[annotationsField] = true
            }
        } else {
            record[annotationsField] = !record[annotationsField]
        }
    }
}

export default Neo.setupClass(RowModel);
