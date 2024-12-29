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

        me.view.on('cellClick', me.onCellClick, me)
    }

    /**
     * @param args
     */
    destroy(...args) {
        let me = this;

        me.view.un('cellClick', me.onCellClick, me);

        super.destroy(...args)
    }

    /**
     * @param {Object} eventPath
     * @returns {String|null} cellId
     */
    static getCellId(eventPath) {
        let id   = null,
            i    = 0,
            len  = eventPath.length;

        for (; i < len; i++) {
            if (eventPath[i].cls.includes('neo-grid-cell')) {
                id = eventPath[i].id;
                break
            }
        }

        return id
    }

    /**
     * todo: move to grid.Container or view
     * @param {String} cellId
     * @param {Object[]} columns
     * @returns {Number} index
     */
    static getColumnIndex(cellId, columns) {
        let idArray       = cellId.split('__'),
            currentColumn = idArray[2],
            dataFields    = columns.map(c => c.dataField);

        return dataFields.indexOf(currentColumn)
    }

    /**
     * @param {Object} data
     */
    onCellClick(data) {
        let me = this,
            id = data.data.currentTarget,
            columnNodeIds, index, tbodyNode;

        if (id) {
            index         = ColumnModel.getColumnIndex(id, me.view.items[0].items);
            tbodyNode     = VDomUtil.find(me.view.vdom, {cls: 'neo-grid-view'}).vdom;
            columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, index);

            me.select(columnNodeIds)
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1)
    }

    /**
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1)
    }

    /**
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me            = this,
            idArray       = ColumnModel.getCellId(data.path).split('__'),
            currentColumn = idArray[2],
            {view}        = me,
            fields        = view.columns.map(c => c.dataField),
            newIndex      = (fields.indexOf(currentColumn) + step) % fields.length,
            columnNodeIds, id, tbodyNode;

        while (newIndex < 0) {
            newIndex += fields.length
        }

        idArray[2] = fields[newIndex];
        id = idArray.join('__');

        tbodyNode     = VDomUtil.find(me.view.vdom, {cls: 'neo-grid-view'}).vdom;
        columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, newIndex);

        me.select(columnNodeIds);
        view.focus(id) // we have to focus one cell to ensure the keynav keeps working
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
