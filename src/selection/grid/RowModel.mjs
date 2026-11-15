import BaseModel from './BaseModel.mjs';

/**
 * Row selection model for `Neo.grid.View`. When {@link #modifierClickEvents} is `true`, modifier clicks fire
 * `altSelect` > `ctrlSelect` > `metaSelect` > `shiftSelect` on `view` with `{data, record}` instead of toggling.
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
         * @member {Boolean} modifierClickEvents=false
         */
        modifierClickEvents: false,
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
        this.canNavigate(data) && this.onNavKeyRow(1)
    }

    /**
     * WAI-ARIA treegrid: `Left` collapses the selected, expanded parent row
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.canNavigate(data) && this.toggleSelectedTreeNode(false)
    }

    /**
     * WAI-ARIA treegrid: `Right` expands the selected, collapsed parent row
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.canNavigate(data) && this.toggleSelectedTreeNode(true)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.canNavigate(data) && this.onNavKeyRow(-1)
    }

    /**
     * Hands the single selected row of a tree grid to {@link Neo.grid.Container#toggleTreeNode}.
     * Nothing happens outside a tree grid, with no or more than one selected row, on a leaf, or when the row
     * already is in the requested state. The selection stays as it is in every case.
     * @param {Boolean} expand `true` to expand, `false` to collapse
     * @returns {Boolean} `true` if the row changed its expansion state
     * @protected
     */
    toggleSelectedTreeNode(expand) {
        let me            = this,
            gridContainer = me.view?.gridContainer,
            {selectedRows} = me;

        if (!gridContainer?.isTreeGrid || selectedRows.length !== 1) {
            return false
        }

        return gridContainer.toggleTreeNode(me.getRowRecord(selectedRows[0]), expand)
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
     * @summary Fires modifier-key select events when `modifierClickEvents` is enabled, or toggles row selection.
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
            if (me.modifierClickEvents && data.altKey) {
                view.fire('altSelect', {data, record})
            } else if (me.modifierClickEvents && data.ctrlKey) {
                view.fire('ctrlSelect', {data, record})
            } else if (me.modifierClickEvents && data.metaKey) {
                view.fire('metaSelect', {data, record})
            } else if (me.modifierClickEvents && data.shiftKey) {
                view.fire('shiftSelect', {data, record})
            } else if (me.hasAnnotations(record)) {
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
            {fn: 'onKeyDownDown',  key: 'Down',  scope: id},
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id},
            {fn: 'onKeyDownUp',    key: 'Up',    scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown',  key: 'Down',  scope: id},
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id},
            {fn: 'onKeyDownUp',    key: 'Up',    scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(RowModel);
