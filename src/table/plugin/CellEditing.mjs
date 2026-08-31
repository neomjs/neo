import Plugin    from '../../plugin/Base.mjs';
import TextField from '../../form/field/Text.mjs';
import VdomUtil  from '../../util/VDom.mjs';

/**
 * @summary Inline cell editing for table & grid containers, written against the View focus anchor.
 *
 * DOM focus never sits on a cell: the owning view (grid.View, or the table body where no view
 * exists) is the single focus anchor, and cells are addressed through the selection model. Every
 * seam here follows from that: keys register on the anchor's registry, the edit target resolves
 * from the selection model rather than from a key event's target, and settling an editor returns
 * focus to the anchor so keyboard navigation continues where the gesture left off.
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
         * @reactive
         */
        disabled_: false,
        /**
         * @member {String[]} editorCls=['neo-table-editor']
         */
        editorCls: ['neo-table-editor'],
        /**
         * True returns DOM focus to the owner's focus anchor after an editor settles, so
         * keyboard navigation continues from the edited cell's selection.
         * @member {Boolean} focusCells=true
         */
        focusCells: true
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
            // Grids host the selection model on the VIEW (the focus anchor); tables keep it on
            // the container. The model host is where selectionModelChange fires, too.
            modelHost        = owner.view ?? owner,
            {selectionModel} = modelHost;

        owner.on({
            cellDoubleClick: me.onCellDoubleClick,
            focusLeave     : me.onFocusLeave,
            scope          : me
        });

        modelHost.on({
            selectionModelChange: me.onSelectionModelChange,
            scope               : me
        });

        // Connect an already registered selectionModel instance
        if (Neo.typeOf(selectionModel) === 'NeoInstance') {
            me.onSelectionModelChange({value: selectionModel})
        }

        // The focus anchor's registry, NOT the body's: keydown events target the focused
        // element, and grid.View (where present) is the single focus anchor — key handlers
        // registered on the body are unreachable there. Tables have no view and anchor on
        // the body, so the fallback keeps their registry unchanged.
        let anchor = me.getFocusAnchor(),
            keys   = {
                Enter: 'onTableKeyDown',
                Space: 'onTableKeyDown',
                scope: me
            };

        if (anchor.keys?.add) {
            anchor.keys.add(keys)
        } else {
            anchor.keys = keys
        }
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
     * The physical cell node id {@link #mountEditor} patches the editor into. Table body ids
     * derive from the record directly; grid bodies pool their rows and derive from the row
     * INDEX, so the grid plugin overrides this seam.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getCellNodeId(record, dataField) {
        return this.owner.body.getCellId(record, dataField)
    }

    /**
     * The component holding DOM focus for the owner: the view where one exists (grid), the body
     * otherwise (table).
     * @returns {Neo.component.Base}
     */
    getFocusAnchor() {
        let {owner} = this;

        return owner.view || owner.body
    }

    /**
     * The id the active selection model uses for the given cell. Grid cell models speak logical
     * ids (`<recordId>__<dataField>`), table cell models the physical node id — both bodies
     * expose the matching builder.
     * @param {Object} record
     * @param {String} dataField
     * @returns {String}
     */
    getSelectionCellId(record, dataField) {
        let {body} = this.owner;

        return body.getLogicalCellId?.(record, dataField) || body.getCellId(record, dataField)
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
            {body}              = me.owner,
            cellId              = me.getCellNodeId(record, dataField),
            cellNode            = VdomUtil.find(body.vdom, cellId)?.vdom,
            column              = me.owner.headerToolbar.getColumn(dataField),
            editor              = me.editors[dataField],
            value               = record[dataField],
            keys;

        if (me.mountedEditor) {
            await me.unmountEditor();
            await me.timeout(10);

            // The row redraw rebuilt its cell nodes — the earlier resolution is stale
            cellNode = VdomUtil.find(body.vdom, cellId)?.vdom
        }

        if (!column.editable || !cellNode) {
            return
        }

        if (!editor) {
            me.editors[dataField] = editor = Neo.create({
                module   : TextField,
                appName,
                cls      : me.editorCls,
                dataField,
                hideLabel: true,
                parentId : body.id,
                record,
                value,
                windowId,

                ...column.editor
            });

            keys = {
                Enter : 'onEditorKeyEnter',
                Escape: 'onEditorKeyEscape',
                Tab   : 'onEditorKeyTab',
                scope : me
            };

            if (editor.keys) {
                editor.keys.add(keys)
            } else {
                editor.keys = keys
            }
        } else {
            editor.originalConfig.value = value;
            editor.setSilent({record, value})
        }

        me.mountedEditor = editor;

        cellNode.cn = [editor.createVdomReference()];
        delete cellNode.html;

        body.updateDepth = -1;

        await body.promiseUpdate();

        await me.timeout(30);

        // children:true descends to the input element: the field's outer div is not focusable,
        // so focusing the component id alone is a silent no-op at the DomAccess layer.
        editor.focus(editor.id, true)
    }

    /**
     *
     * @param {Object} data
     * @param {Neo.table.Body} data.body
     * @param {Object}         data.data
     * @param {String}         data.dataField
     * @param {Object}         data.record
     * @returns {Promise<void>}
     */
    async onCellDoubleClick({body, data, dataField, record}) {
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
     * A cell selection moving off the edited cell settles the editor: committing when the field
     * is valid & dirty, unmounting otherwise — an abandoned editor must not linger in a cell the
     * selection has left. Selecting the edited cell itself (every mount flow selects first) is a
     * no-op.
     * @param {Object} data
     * @param {String[]} data.selection
     * @returns {Promise<void>}
     */
    async onSelectionChange({selection}) {
        let me     = this,
            editor = me.mountedEditor,
            editedCellIds;

        if (editor) {
            // The model speaks logical ids under `useInternalId: false` and physical node ids
            // otherwise — the edited cell counts as still-selected in either dialect.
            editedCellIds = [
                me.getSelectionCellId(editor.record, editor.dataField),
                me.getCellNodeId(editor.record, editor.dataField)
            ];

            if (!selection?.some(id => editedCellIds.includes(id))) {
                await me.submitEditor()
            }
        }
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
        let me   = this,
            cell = me.resolveSelectedCell();

        if (!me.mountedEditor && cell) {
            await me.mountEditor(cell.record, cell.dataField)
        }
    }

    /**
     * Resolves the edit target from the ACTIVE selection, never from an event target: under the
     * View focus anchor, key events target the anchor element, so the selected cell exists only
     * in the selection model. Grid cell models answer logical ids (`<recordId>__<dataField>`),
     * table cell models physical node ids — both forms resolve here.
     * @returns {{dataField: String, record: Object}|null}
     */
    resolveSelectedCell() {
        let {owner} = this,
            model   = (owner.view ?? owner).selectionModel || owner.selectionModel,
            cellId, dataField, parts, record;

        if (!model?.ntype?.includes('cell') || !model.hasSelection()) {
            return null
        }

        cellId    = model.getSelection()[0];
        record    = owner.body.getRecord(cellId);
        dataField = owner.body.getCellDataField(cellId);

        if (!record || !dataField) {
            parts = cellId.split('__');

            if (parts.length === 2) {
                record    ??= owner.store.get(parts[0]);
                dataField ||= parts[1]
            }
        }

        return record && dataField ? {dataField, record} : null
    }

    /**
     * Re-renders the row a settled editor occupied, removing the editor's vdom reference. The
     * table body owns its row vdom directly; grid bodies pool row components, so the grid
     * plugin overrides this seam with the pooled redraw.
     * @param {Object} record
     * @returns {Promise<void>}
     */
    async redrawRow(record) {
        let {body}   = this.owner,
            rowIndex = body.store.indexOf(record);

        body.getVdomRoot().cn[rowIndex] = body.createRow({record, rowIndex});
        await body.promiseUpdate()
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

            // Cells are not focusable — DOM focus returns to the anchor, whose keys drive the
            // next Enter/Space edit on the selection this method just placed.
            me.focusCells && me.getFocusAnchor().focus()
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

        let me     = this,
            record = me.mountedEditor.record;

        me.mountedEditor = null;

        await me.redrawRow(record)
    }
}

export default Neo.setupClass(CellEditing);
