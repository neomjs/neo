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
        className: 'Neo.table.plugin.CellEditing',
        /**
         * @member {String[]} editorCls=['neo-table-editor']
         */
        editorCls: ['neo-table-editor']
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
            focusLeave     : me.onFocusLeave,
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
     * @param {Object} record
     * @param {String} dataField
     * @returns {Promise<void>}
     */
    async mountEditor(record, dataField) {
        let me                  = this,
            {appName, windowId} = me,
            {view}              = me.owner,
            cellId              = view.getCellId(record, dataField),
            cellNode            = VdomUtil.find(view.vdom, cellId).vdom,
            column              = me.owner.headerToolbar.getColumn(dataField),
            editor              = me.editors[dataField];

        if (me.mountedEditor) {
            await me.unmountEditor()
        }

        if (!column.editable) {
            return
        }

        if (!editor) {
            me.editors[dataField] = editor = Neo.create({
                module   : TextField,
                appName,
                cls      : me.editorCls,
                dataField,
                hideLabel: true,
                parentId : view.id,
                record,
                value    : record[dataField],
                windowId,

                keys: {
                    Enter : 'onEditorKeyEnter',
                    Escape: 'onEditorKeyEscape',
                    Tab   : 'onEditorKeyTab',
                    scope : me
                },

                ...column.editor
            })
        } else {
            editor.setSilent({record, value: record[dataField]})
        }

        me.mountedEditor = editor;

        cellNode.cn = [editor.createVdomReference()];
        delete cellNode.innerHTML;

        view.updateDepth = -1;

        await view.promiseUpdate();
        editor.focus()
    }

    /**
     *
     * @param {Object} data
     * @param {Object} data.data
     * @param {String} data.dataField
     * @param {Object} data.record
     * @param {Neo.table.View} data.view
     * @returns {Promise<void>}
     */
    async onCellDoubleClick({data, dataField, record, view}) {
        await this.mountEditor(record, dataField)
    }

    /**
     * @param {Object} path
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyEnter(path, field) {
        await this.submitEditor()
    }

    /**
     * @param {Object} path
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyEscape(path, field) {
        await this.unmountEditor()
    }

    /**
     * @param {Object} path
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyTab(path, field) {
        let me       = this,
            {store}  = me.owner,
            oldIndex = store.indexOf(field.record),
            index    = (oldIndex + 1) % store.getCount(),
            record   = store.getAt(index);

        await me.submitEditor();
        await me.mountEditor(record, field.dataField);
    }

    /**
     * @returns {Promise<void>}
     */
    async onFocusLeave() {
        await this.unmountEditor()
    }

    /**
     * If the field is valid:
     * Updates the record field, in case the value of the editor changed,
     * otherwise unmounts the editor
     * @returns {Promise<void>}
     */
    async submitEditor() {
        let field = this.mountedEditor;

        if (field?.isValid()) {
            let fieldValue = field.record[field.dataField];

            // We only get a record change event => UI update, in case there is a real change
            if (fieldValue !== field.value) {
                field.record[field.dataField] = field.getSubmitValue();

                // Short delay to ensure the update OP is done
                await this.timeout(50)
            } else {
                await this.unmountEditor()
            }
        }
    }

    /**
     * @returns {Promise<void>}
     */
    async unmountEditor() {
        if (!this.mountedEditor) {
            return
        }

        let me        = this,
            record    = me.mountedEditor.record,
            tableView = me.owner.view,
            rowIndex  = tableView.store.indexOf(record);

        me.mountedEditor = null;

        tableView.vdom.cn[rowIndex] = tableView.createTableRow({record, rowIndex});
        await tableView.promiseUpdate()
    }
}

export default Neo.setupClass(CellEditing);
