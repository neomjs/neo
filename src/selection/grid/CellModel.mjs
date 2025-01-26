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
     * @param {Object} data
     */
    onCellClick(data) {
        this.toggleSelection(data.data.currentTarget)
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
    onKeyDownLeft(data) {
        this.onNavKeyColumn(-1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(1)
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
    onNavKeyColumn(step) {
        let me         = this,
            {view}     = me,
            {store}    = view,
            dataFields = view.parent.columns.map(c => c.dataField),
            currentColumn, id, newIndex, record;

        if (me.hasSelection()) {
            currentColumn = me.items[0].split('__')[2];
            record        = view.getRecord(me.items[0])
        } else {
            currentColumn = dataFields[0];
            record        = store.getAt(0)
        }

        newIndex = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        id = view.getCellId(record, dataFields[newIndex]);

        me.select(id)
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            currentIndex = 0,
            dataField    = view.parent.columns[0].dataField,
            id, newIndex, newRecord;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(view.getRecord(me.items[0]));
            dataField    = me.items[0].split('__')[2];
        }

        newIndex = (currentIndex + step) % store.getCount();

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        newRecord = store.getAt(newIndex);
        id        = view.getCellId(newRecord, dataField);

        me.select(id)
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
