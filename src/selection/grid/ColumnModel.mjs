import BaseModel from './BaseModel.mjs';
import VDomUtil  from '../../util/VDom.mjs';

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
         * @member {String} cls='selection-columnmodel'
         * @protected
         */
        cls: 'neo-selection-columnmodel'
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
        let me     = this,
            {view} = me,
            cellId = data.data.currentTarget,
            columnNodeIds, dataField, index;

        if (cellId) {
            dataField     = view.getDataField(cellId);
            index         = view.getColumn(dataField, true);
            columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom.cn[0], index);

            me.select(columnNodeIds)
        }
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
     * @param {Number} step
     */
    onNavKeyColumn(step) {
        let me                 = this,
            {dataFields, view} = me,
            columnNodeIds, currentColumn, index;

        if (me.hasSelection()) {
            currentColumn = view.getDataField(me.items[0])
        } else {
            currentColumn = dataFields[0]
        }

        index = (dataFields.indexOf(currentColumn) + step) % dataFields.length;

        while (index < 0) {
            index += dataFields.length
        }

        columnNodeIds = VDomUtil.getColumnNodesIds(view.vdom.cn[0], index);

        me.select(columnNodeIds)
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
