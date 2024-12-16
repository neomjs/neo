import Plugin    from '../../plugin/Base.mjs';
import TextField from '../../form/field/Text.mjs';
import VdomUtil  from '../../util/VDom.mjs';

/**
 * @class Neo.table.plugin.CellEditing
 * @extends Neo.plugin.Base
 */
class CellEditing extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.table.plugin.CellEditing'
         * @protected
         */
        className: 'Neo.table.plugin.CellEditing'
    }

    /**
     * Storing editor instances per column
     * @member {Object} editors={}
     */
    editors = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.owner.on({
            cellDoubleClick: me.onCellDoubleClick,
            scope          : me
        })
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataField
     * @param {Object} data.record
     * @param {Neo.table.View} data.view
     */
    onCellDoubleClick({data, dataField, record, view}) {
        let me       = this,
            cellId   = view.getCellId(record, dataField),
            cell     = VdomUtil.find(view.vdom, cellId),
            cellNode = cell.parentNode.cn[cell.index],
            editor   = me.editors[dataField];

        if (!editor) {
            me.editors[dataField] = editor = Neo.create({
                module   : TextField,
                appName  : me.appName,
                hideLabel: true,
                parentId : view.id,
                value    : record[dataField],
                windowId : me.windowId
            })
        } else {
            editor.setSilent({value: record[dataField]})
        }

        cellNode.cn = [editor.createVdomReference()];
        delete cellNode.innerHTML;

        view.updateDepth = 2;

        view.promiseUpdate().then(() => {
            editor.focus()
        })
    }
}

export default Neo.setupClass(CellEditing);
