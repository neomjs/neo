import Model from '../Model.mjs';
import {default as VDomUtil} from '../../util/VDom.mjs';

/**
 * @class Neo.selection.table.ColumnModel
 * @extends Neo.selection.Model
 */
class ColumnModel extends Model {
    static getConfig() {return {
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
         * @member {String} cls='selection-columnmodel'
         * @protected
         */
        cls: 'neo-selection-columnmodel'
    }}

    /**
     *
     */
    addDomListener() {
        let me           = this,
            view         = me.view,
            domListeners = view.domListeners;

        domListeners.push({
            click   : me.onCellClick,
            delegate: '.neo-table-cell',
            scope   : me
        });

        view.domListeners = domListeners;
    }

    /**
     *
     * @param {Object} eventPath
     * @return {String|null} cellId
     */
    static getCellId(eventPath) {
        let id   = null,
            i    = 0,
            len  = eventPath.length;

        for (; i < len; i++) {
            if (eventPath[i].tagName === 'td') {
                id = eventPath[i].id;
                break;
            }
        }

        return id;
    }

    /**
     * todo: move to table.Container or view
     * @param {String} cellId
     * @param {Array} columns
     * @return {Number} index
     */
    static getColumnIndex(cellId, columns) {
        let idArray       = cellId.split('__'),
            currentColumn = idArray[2],
            dataFields    = columns.map(c => c.dataField);

        return dataFields.indexOf(currentColumn);
    }

    /**
     *
     * @param {Object} data
     */
    onCellClick(data) {
        let me   = this,
            id   = ColumnModel.getCellId(data.path),
            columnNodeIds, index, tbodyNode;

        if (id) {
            index         = ColumnModel.getColumnIndex(id, me.view.items[0].items);
            tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {tag: 'tbody'}).vdom;
            columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, index);

            me.select(columnNodeIds);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        this.onNavKeyColumn(data, -1);
    }

    /**
     *
     * @param {Object} data
     */
    onKeyDownRight(data) {
        this.onNavKeyColumn(data, 1);
    }

    /**
     *
     * @param {Object} data
     * @param {Number} step
     */
    onNavKeyColumn(data, step) {
        let me            = this,
            idArray       = ColumnModel.getCellId(data.path).split('__'),
            currentColumn = idArray[2],
            view          = me.view,
            dataFields    = view.columns.map(c => c.dataField),
            newIndex      = (dataFields.indexOf(currentColumn) + step) % dataFields.length,
            columnNodeIds, id, tbodyNode;

        while (newIndex < 0) {
            newIndex += dataFields.length;
        }

        idArray[2] = dataFields[newIndex];
        id = idArray.join('__');

        tbodyNode     = VDomUtil.findVdomChild(me.view.vdom, {tag: 'tbody'}).vdom;
        columnNodeIds = VDomUtil.getColumnNodesIds(tbodyNode, newIndex);

        me.select(columnNodeIds);
        view.focus(id); // we have to focus one cell to ensure the keynav keeps working
    }

    /**
     *
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys._keys.push({
                fn   : 'onKeyDownLeft',
                key  : 'Left',
                scope: id
            }, {
                fn   : 'onKeyDownRight',
                key  : 'Right',
                scope: id
            });
        }
    }


    /**
     *
     */
    unregister() {
        let me   = this,
            id   = me.id,
            view = me.view;

        if (view.keys) {
            view.keys.removeKeys([{
                fn   : 'onKeyDownLeft',
                key  : 'Left',
                scope: id
            }, {
                fn   : 'onKeyDownRight',
                key  : 'Right',
                scope: id
            }]);
        }

        super.unregister();
    }
}

Neo.applyClassConfig(ColumnModel);

export {ColumnModel as default};