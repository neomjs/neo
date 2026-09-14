import BaseModel from './BaseModel.mjs';

/**
 * @class Neo.selection.grid.CellModel
 * @extends Neo.selection.grid.BaseModel
 */
class CellModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.CellModel'
         * @protected
         */
        className: 'Neo.selection.grid.CellModel',
        /**
         * @member {String} ntype='selection-grid-cellmodel'
         * @protected
         */
        ntype: 'selection-grid-cellmodel',
        /**
         * @member {String} cls='neo-selection-cellmodel'
         * @protected
         */
        cls: 'neo-selection-cellmodel',
        /**
         * @member {Boolean} selectsCells=true
         * @protected
         */
        selectsCells: true
    }

    /**
     *
     */
    addDomListener() {
        let me            = this,
            {view}        = me,
            {parent}      = view,
            gridContainer = view.gridContainer || parent, // Fallback if no specific Multi-Body structure
            listener      = {cellClick: me.onCellClick, scope: me};

        gridContainer.on(listener)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me            = this,
            {view}        = me,
            parent        = view?.parent,
            gridContainer = view?.gridContainer || parent;

        gridContainer?.un('cellClick', me.onCellClick, me);

        super.destroy(...args)
    }

    /**
     * Resolves a record from a logical cell ID, through the lookup a DOM event takes, so an integer key resolves too.
     * @param {String} logicalId
     * @returns {Neo.data.Record|null}
     */
    getRecord(logicalId) {
        return this.view.getRecordFromLogicalId(logicalId)
    }

    /**
     * Toggles the clicked cell. A model that {@link #selectsColumns} toggles the cell's column with it.
     * @param {Object} data
     */
    onCellClick(data) {
        let me                  = this,
            {view}              = me,
            {dataField, record} = data,
            logicalId;

        // The single View-owned model listens once on the gridContainer, so each cell click is
        // processed exactly once regardless of which body fired it.

        if (record && dataField) {
            logicalId = view.getLogicalCellId(record, dataField);

            me.selectsColumns && me.setSelectedColumns(me.isSelected(logicalId) ? [] : [dataField]);
            me.toggleSelection(logicalId)
        }
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
    onKeyDownLeft(data) {
        !this.hasEditorFocus(data) && this.onNavKeyColumn(-1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        !this.hasEditorFocus(data) && this.onNavKeyColumn(1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownUp(data) {
        !this.hasEditorFocus(data) && this.onNavKeyRow(-1)
    }

    /**
     * Moves the cell selection `step` columns along. A model that {@link #selectsColumns} moves the column with it.
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            {store}            = view,
            currentColumn, currentIndex, newIndex, record;

        me.selectsColumns && me.stepSelectedColumn(step);

        if (me.hasSelection()) {
            currentColumn = view.getDataField(me.items[0]);
            record        = me.getRecord(me.items[0])
        } else {
            currentColumn = dataFields[0];
            record        = store.getAt(0)
        }

        if (!record) {
            return
        }

        currentIndex = dataFields.indexOf(currentColumn);
        newIndex     = (currentIndex + step) % dataFields.length;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        me.select(view.getLogicalCellId(record, dataFields[newIndex]));

        view.parent.scrollByColumns(currentIndex, step)
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
            dataField, newIndex;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(me.getRecord(me.items[0]));
            dataField    = view.getDataField(me.items[0])
        } else {
            dataField = me.dataFields[0]
        }

        if (countRecords < 1) {
            return
        }

        newIndex = (currentIndex + step) % countRecords;

        while (newIndex < 0) {
            newIndex += countRecords
        }

        me.select(view.getLogicalCellId(store.getAt(newIndex), dataField));
        view.scrollByRows(currentIndex, step)
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me,
            scope      = id;

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope}
        )
    }

    /**
     *
     */
    unregister() {
        let me         = this,
            {id, view} = me,
            scope      = id;

        view.keys?.removeKeys([
            {fn: 'onKeyDownDown'  ,key: 'Down'  ,scope},
            {fn: 'onKeyDownLeft'  ,key: 'Left'  ,scope},
            {fn: 'onKeyDownRight' ,key: 'Right' ,scope},
            {fn: 'onKeyDownUp'    ,key: 'Up'    ,scope}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(CellModel);
