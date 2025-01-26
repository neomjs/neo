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
        let me                 = this,
            {dataFields, view} = me,
            {store}            = view,
            currentColumn, newIndex, record;

        if (me.hasSelection()) {
            currentColumn = view.getDataField(me.items[0]);
            record        = view.getRecord(me.items[0])
        } else {
            currentColumn = dataFields[0];
            record        = store.getAt(0)
        }

        newIndex = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        me.select(view.getCellId(record, dataFields[newIndex]))
    }

    /**
     * @param {Number} step
     */
    onNavKeyRow(step) {
        let me           = this,
            {view}       = me,
            {store}      = view,
            currentIndex = 0,
            dataField, newIndex;

        if (me.hasSelection()) {
            currentIndex = store.indexOf(view.getRecord(me.items[0]));
            dataField    = view.getDataField(me.items[0])
        } else {
            dataField = me.dataFields[0]
        }

        newIndex = (currentIndex + step) % store.getCount();

        while (newIndex < 0) {
            newIndex += store.getCount()
        }

        me.select(view.getCellId(store.getAt(newIndex), dataField))
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
