import BaseModel from './BaseModel.mjs';

/**
 * @class Neo.selection.grid.ColumnModel
 * @extends Neo.selection.grid.BaseModel
 */
class ColumnModel extends BaseModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.grid.ColumnModel'
         * @protected
         */
        className: 'Neo.selection.grid.ColumnModel',
        /**
         * @member {String} ntype='selection-grid-columnmodel'
         * @protected
         */
        ntype: 'selection-grid-columnmodel',
        /**
         * @member {String} cls='neo-selection-columnmodel'
         * @protected
         */
        cls: 'neo-selection-columnmodel',
        /**
         * @member {String[]} selectedColumns=[]
         */
        selectedColumns: []
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
     * @returns {Boolean}
     */
    hasSelection() {
        return this.selectedColumns.length > 0
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me     = this,
            {view} = me,
            cellId = data.data.currentTarget;

        if (cellId) {
            me.selectedColumns = [view.getDataField(cellId)];
            view.createViewData()
        }
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
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            currentColumn, index;

        if (me.hasSelection()) {
            currentColumn = me.selectedColumns[0]
        } else {
            currentColumn = dataFields[0]
        }

        index = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (index < 0) {
            index += dataFields.length
        }

        me.selectedColumns = [dataFields[index]];
        view.createViewData()
    }

    /**
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let {id, view} = this;

        view.keys?._keys.push(
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id}
        )
    }

    /**
     *
     */
    unregister() {
        let {id, view} = this;

        view.keys?.removeKeys([
            {fn: 'onKeyDownLeft',  key: 'Left',  scope: id},
            {fn: 'onKeyDownRight', key: 'Right', scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(ColumnModel);
