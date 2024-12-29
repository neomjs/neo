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
         * @member {String} ntype='plugin-table-cell-editing'
         * @protected
         */
        ntype: 'plugin-table-cell-editing',
        /**
         * @member {String} cellCls='neo-table-cell'
         */
        cellCls: 'neo-table-cell',
        /**
         * @member {Boolean} disabled_=false
         */
        disabled_: false,
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

        let me               = this,
            {owner}          = me,
            {selectionModel} = owner;

        owner.on({
            cellDoubleClick     : me.onCellDoubleClick,
            focusLeave          : me.onFocusLeave,
            selectionModelChange: me.onSelectionModelChange,
            scope               : me
        });

        // Connect an already registered selectionModel instance
        if (Neo.typeOf(selectionModel) === 'NeoInstance') {
            me.onSelectionModelChange({value: selectionModel})
        }

        owner.keys.add({
            Enter: 'onTableKeyDown',
            Space: 'onTableKeyDown',
            scope: me
        })
    }

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        oldValue && this.unmountEditor()
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
        if (this.disabled) {
            return
        }

        let me                  = this,
            {appName, windowId} = me,
            {view}              = me.owner,
            cellId              = view.getCellId(record, dataField),
            cellNode            = VdomUtil.find(view.vdom, cellId).vdom,
            column              = me.owner.headerToolbar.getColumn(dataField),
            editor              = me.editors[dataField],
            value               = record[dataField];

        if (me.mountedEditor) {
            await me.unmountEditor();
            await me.timeout(10)
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
                value,
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
            editor.originalConfig.value = value;
            editor.setSilent({record, value})
        }

        me.mountedEditor = editor;

        cellNode.cn = [editor.createVdomReference()];
        delete cellNode.innerHTML;

        view.updateDepth = -1;

        await view.promiseUpdate();

        await me.timeout(10);

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
     * @param {Object} data
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyEnter(data, field) {
        let me = this;

        await me.submitEditor();
        await me.timeout(20);
        me.selectCell(data)
    }

    /**
     * @param {Object} data
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyEscape(data, field) {
        let me = this;

        await me.unmountEditor();
        await me.timeout(20);
        me.selectCell(data)
    }

    /**
     * @param {Object} event
     * @param {Neo.form.field.Base} field
     * @returns {Promise<void>}
     */
    async onEditorKeyTab(event, field) {
        let me           = this,
            {store}      = me.owner,
            oldIndex     = store.indexOf(field.record),
            countRecords = store.getCount(),
            index        = (oldIndex + (event.altKey ? -1 : 1) + countRecords) % countRecords,
            record       = store.getAt(index);

        await me.submitEditor();
        await me.mountEditor(record, field.dataField)
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onFocusLeave(data) {
        await this.unmountEditor()
    }

    /**
     * @param {Object} data
     */
    onSelectionChange(data) {
        // todo: Once we separate cell selections & focus, we can use this event to mount editors
        // console.log('onSelectionChange', data);
    }

    /**
     * @param {Object} data
     */
    onSelectionModelChange(data) {
        let selectionModel = data.value;

        if (selectionModel.ntype.includes('cell')) {
            selectionModel.on('selectionChange', this.onSelectionChange, this)
        }
    }

    /**
     * @param {Object} data
     * @returns {Promise<void>}
     */
    async onTableKeyDown(data) {
        let me        = this,
            {target}  = data,
            tableView = me.owner.view,
            dataField, record;

        if (!me.mountedEditor && target.cls?.includes('neo-selected')) {
            dataField = tableView.getCellDataField(target.id);
            record    = tableView.getRecord(target.id);

            await me.mountEditor(record, dataField)
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.path
     */
    selectCell({path}) {
        let me               = this,
            {selectionModel} = me.owner,
            i                = 0,
            len              = path.length,
            cellId;

        for (; i < len; i++) {
            if (path[i].cls?.includes(me.cellCls)) {
                cellId = path[i].id;
                break
            }
        }

        if (cellId) {
            selectionModel?.deselect(cellId, true); // the cell might still count as selected => silent deselect first
            selectionModel?.select(cellId);
            me.owner.focus(cellId)
        }
    }

    /**
     * If the field is valid:
     * Updates the record field, in case the value of the editor changed,
     * otherwise unmounts the editor
     * @returns {Promise<void>}
     */
    async submitEditor() {
        let me    = this,
            field = me.mountedEditor;

        if (field?.isValid()) {
            if (field.isDirty) {
                me.mountedEditor = null;
                field.record[field.dataField] = field.getSubmitValue()
            } else {
                await me.unmountEditor()
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

        tableView.vdom.cn[rowIndex] = tableView.createRow({record, rowIndex});
        await tableView.promiseUpdate()
    }
}

export default Neo.setupClass(CellEditing);
