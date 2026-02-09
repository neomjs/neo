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
        cls: 'neo-selection-cellmodel'
    }

    /**
     *
     */
    addDomListener() {
        let me = this;

        me.view.parent.on('cellClick', me.onCellClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.parent.un('cellClick', me.onCellClick, me);

        super.destroy(...args)
    }

    /**
     * Resolves a record from a logical cell ID.
     * @param {String} logicalId
     * @returns {Neo.data.Record|null}
     */
    getRecord(logicalId) {
        let me        = this,
            {view}    = me,
            {store}   = view,
            dataField = view.getDataField(logicalId),
            // logicalId format: recordId__dataField
            recordId  = logicalId.substring(0, logicalId.length - dataField.length - 2);

        return store.get(recordId)
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me        = this,
            {view}    = me,
            {dataField, record} = data;

        if (record && dataField) {
            me.toggleSelection(view.getLogicalCellId(record, dataField))
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
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            {store}            = view,
            currentColumn, currentIndex, newIndex, record;

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
