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
     * Storing the currently mounted editor
     * @member {Neo.form.field.Base|null} mountedEditor=null
     */
    mountedEditor = null

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
     * @param {args} args
     */
    destroy(...args) {
        Object.values(this.editors).forEach(editor => {
            editor.destroy(false, true)
        });

        super.destroy(...args)
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataField
     * @param {Object} data.record
     * @param {Neo.table.View} data.view
     */
    async onCellDoubleClick({data, dataField, record, view}) {
        let me       = this,
            cellId   = view.getCellId(record, dataField),
            cell     = VdomUtil.find(view.vdom, cellId),
            cellNode = cell.parentNode.cn[cell.index],
            editor   = me.editors[dataField];

        if (me.mountedEditor) {
            await me.unmountEditor(me.mountedEditor.record)
        }

        if (!editor) {
            me.editors[dataField] = editor = Neo.create({
                module   : TextField,
                appName  : me.appName,
                dataField,
                hideLabel: true,
                parentId : view.id,
                record,
                value    : record[dataField],
                windowId : me.windowId,

                keys: {
                    Enter : 'onEditorKeyEnter',
                    Escape: 'onEditorKeyEscape',
                    scope : me
                }
            })
        } else {
            editor.setSilent({
                dataField,
                record,
                value: record[dataField]
            })
        }

        me.mountedEditor = editor;

        cellNode.cn = [editor.createVdomReference()];
        delete cellNode.innerHTML;

        view.updateDepth = 2;

        view.promiseUpdate().then(() => {
            editor.focus()
        })
    }

    /**
     * @param {Object} path
     * @param {Neo.form.field.Base} field
     */
    onEditorKeyEnter(path, field) {
        if (field.isValid()) {
            field.record[field.dataField] = field.value
        }
    }

    /**
     * @param {Object} path
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyEscape(path, field) {
        await this.unmountEditor(field.record)
    }

    /**
     * @param record
     * @returns {Promise<void>}
     */
    async unmountEditor(record) {
        let tableView = this.owner.view,
            rowIndex  = tableView.store.indexOf(record);

        this.mountedEditor = null;

        tableView.vdom.cn[rowIndex] = tableView.createTableRow({record, rowIndex});
        await tableView.promiseUpdate()
    }
}

export default Neo.setupClass(CellEditing);
