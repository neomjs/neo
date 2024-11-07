import Model    from '../Model.mjs';
import VDomUtil from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.ColumnModel
 * @extends Neo.selection.Model
 */
class ColumnModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.table.ColumnModel'
         * @protected
         */
        className: 'Neo.selection.table.ColumnModel',
        /**
         * @member {String} ntype='selection-table-columnmodel'
         * @protected
         */
        ntype: 'selection-table-columnmodel',
        /**
         * @member {String} cls='neo-selection-columnmodel'
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

        super.destroy(...args);
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
            if (eventPath[i].tagName === 'td') {
                id = eventPath[i].id;
                break
            }
        }

        return id
    }

    /**
     * todo: move to table.Container or view
     * @param {String} cellId
     * @param {Array} columns
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
            tbodyNode     = VDomUtil.find(me.view.vdom, {tag: 'tbody'}).vdom;
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
            dataFields    = view.columns.map(c => c.dataField),
            newIndex      = (dataFields.indexOf(currentColumn) + step) % dataFields.length,
            columnNodeIds, id, tbodyNode;

        while (newIndex < 0) {
            newIndex += dataFields.length
        }

        idArray[2] = dataFields[newIndex];
        id = idArray.join('__');

        tbodyNode     = VDomUtil.find(me.view.vdom, {tag: 'tbody'}).vdom;
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
