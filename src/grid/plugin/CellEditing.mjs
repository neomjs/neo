import NeoArray  from '../../util/Array.mjs';
import Plugin    from '../../plugin/Base.mjs';
import TextField from '../../form/field/Text.mjs';

/**
 * @summary Edits grid cells in place: one logical edit session, embodied in whichever pooled cell renders it.
 *
 * A grid keeps no cell per record. {@link Neo.grid.Body} recycles a fixed pool of {@link Neo.grid.Row} instances,
 * and each Row a fixed pool of cell slots, so a cell's DOM node is a projection that another record or column
 * reuses as soon as the grid scrolls. An edit is therefore keyed by what does not move — the record id and the
 * `dataField` — and never by a row, cell or body id.
 *
 * This plugin owns that session and one editor field for it. {@link Neo.grid.Row#applyRendererOutput} embeds the
 * editor into the cell that currently renders the session, on every render, so the editor follows the record:
 *
 * - a scroll that keeps the cell rendered keeps the editor, and its focus;
 * - a scroll that rebinds the row, or moves the column out of the mounted window, drops the embodiment — the field
 *   and its draft live on in the App Worker;
 * - the next render of that cell embodies the editor again.
 *
 * Losing the projection is neutral: scrolling never commits and never cancels.
 *
 * Keys route through {@link Neo.grid.View}, the grid's single key registry: Enter and F2 edit the selected cell
 * (keyboard activation needs a cell-selecting model), Enter in the editor commits, and Escape cancels. A
 * double-click edits any editable cell. Activating another cell, or moving focus out of the editor, commits a valid
 * draft first; an invalid draft keeps its edit open. A column opts in through
 * {@link Neo.grid.column.Base#editable_}, and {@link Neo.grid.column.Base#editor} configures its field.
 * @class Neo.grid.plugin.CellEditing
 * @extends Neo.plugin.Base
 */
class CellEditing extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.grid.plugin.CellEditing'
         * @protected
         */
        className: 'Neo.grid.plugin.CellEditing',
        /**
         * @member {String} ntype='plugin-grid-cell-editing'
         * @protected
         */
        ntype: 'plugin-grid-cell-editing',
        /**
         * True cancels an active edit and ignores every activation.
         * @member {Boolean} disabled_=false
         * @reactive
         */
        disabled_: false
    }

    /**
     * The active edit: the logical cell (`recordId`, `dataField`) and the `editor` field for it. `null` while nothing
     * is edited. {@link Neo.grid.Row#applyRendererOutput} reads it; only this plugin writes it.
     * @member {Object|null} session=null
     * @protected
     */
    session = null

    /**
     * Triggered after the disabled config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDisabled(value, oldValue) {
        value && this.cancelEdit();

        // Whether the grid edits at all decides every cell's aria-readonly
        oldValue !== undefined && this.owner.repaintCells()
    }

    /**
     * Discards the draft and ends the session. The editor's destruction returns focus to where the edit took it from.
     */
    cancelEdit() {
        let me        = this,
            {session} = me;

        if (session) {
            me.session = null;
            me.repaint(session);
            me.destroyEditor(session.editor)
        }
    }

    /**
     * Writes a valid, changed draft to its record and ends the session. An invalid draft shows its error and keeps
     * the edit open.
     * @returns {Boolean} false while the draft is invalid
     */
    completeEdit() {
        let me        = this,
            {session} = me;

        if (!session) {
            return true
        }

        let {dataField, editor} = session,
            record;

        if (!editor.validate(false)) {
            return false
        }

        record     = me.getRecord(session);
        me.session = null;

        // A write repaints the record's rows through the store, and the explicit repaint covers an unchanged draft
        editor.isDirty && record?.set({[dataField]: editor.getSubmitValue()});
        me.repaint(session);
        me.destroyEditor(editor);

        return true
    }

    /**
     * Gives up activation and ends an open edit without writing it. A grid that outlives its plugin edits no cell, so
     * it repaints them: none stays read-only.
     * @param {Array} args
     */
    destroy(...args) {
        let me               = this,
            {owner, session} = me,
            {keys}           = owner.view || {};

        owner.un('cellDoubleClick', me.onCellDoubleClick, me);
        keys && !keys.isDestroyed && keys.removeKeys(me.getViewKeys());

        // A grid being destroyed takes the editor's cell with it, and its store and bodies are already gone, so
        // there is nothing left to render against. A plugin destroyed on its own leaves a Row that lives on, and
        // an input nothing owns would stay in its cell until an unrelated render replaced it: cancel repaints it.
        if (owner.isDestroying) {
            me.session = null;
            session && me.destroyEditor(session.editor)
        } else {
            me.cancelEdit()
        }

        super.destroy(...args);

        owner.isDestroying || owner.repaintCells()
    }

    /**
     * Destroys an editor through the Row it was embedded in, while that Row lives. Until the Row's own render lands,
     * the vnode it keeps still names the editor, and an ancestor render collected earlier can land first and walk into
     * that name. Destroying through the Row unlinks the name there. A Row already destroyed with its grid holds nothing
     * to unlink.
     * @param {Neo.form.field.Text} editor
     * @protected
     */
    destroyEditor(editor) {
        editor.destroy(!!editor.parent, true)
    }

    /**
     * Edits the cell the View's selection model holds selected, if any.
     * @protected
     */
    editSelectedCell() {
        let {view} = this.owner,
            cellId = view.selectedCells[0],
            record = cellId && view.getRecordFromLogicalId(cellId);

        record && this.startEdit(record, view.getDataField(cellId))
    }

    /**
     * The body rendering a column: locked columns live in their own bodies.
     * @param {Neo.grid.column.Base} column
     * @returns {Neo.grid.Body|null}
     * @protected
     */
    getBody(column) {
        let {owner} = this;

        return (column.locked === 'start' ? owner.bodyStart : column.locked === 'end' ? owner.bodyEnd : owner.body) || null
    }

    /**
     * @param {Object} session
     * @returns {Neo.data.Model|null}
     * @protected
     */
    getRecord({recordId}) {
        return this.owner.store.get(recordId)
    }

    /**
     * The Row currently rendering a record in a column's body, or null while the record is outside the row pool.
     * @param {Object} record
     * @param {Neo.grid.column.Base} column
     * @returns {Neo.grid.Row|null}
     * @protected
     */
    getRow(record, column) {
        let row = this.getBody(column)?.getRow(record);

        return row?.record === record ? row : null
    }

    /**
     * @returns {Object[]}
     * @protected
     */
    getViewKeys() {
        let scope = this.id;

        return [
            {fn: 'onEnterKey',  key: 'Enter',  scope},
            {fn: 'onEscapeKey', key: 'Escape', scope},
            {fn: 'onF2Key',     key: 'F2',     scope}
        ]
    }

    /**
     * Whether the session's cell is rendered right now: its record inside the row pool, and its column locked or
     * inside the body's mounted column window. Read from the App Worker's own projection state, so it answers for
     * the render that dropped or restored the embodiment, whatever order its DOM events arrive in.
     * @param {Object} session
     * @returns {Boolean}
     * @protected
     */
    isEmbodied(session) {
        let me     = this,
            column = me.owner.columns.get(session.dataField),
            record = me.getRecord(session),
            body, index;

        if (!column || !record || !me.getRow(record, column)) {
            return false
        }

        if (column.locked) {
            return true
        }

        body  = me.getBody(column);
        index = body.columnPositions.indexOf(session.dataField);

        return index >= body.mountedColumns[0] && index <= body.mountedColumns[1]
    }

    /**
     * @param {Object} data
     * @param {String} data.dataField
     * @param {Object} data.record
     * @protected
     */
    onCellDoubleClick({dataField, record}) {
        record && dataField && this.startEdit(record, dataField)
    }

    /**
     * Ends the edit when a column stops being editable.
     * @param {Neo.grid.column.Base} column
     */
    onColumnEditableChange(column) {
        !column.editable && this.session?.dataField === column.dataField && this.cancelEdit()
    }

    /**
     * Focus leaving the embodied editor — to another cell, or out of the grid — commits a valid draft. Losing the
     * embodiment to a scroll blurs the editor too, and is neutral.
     * @protected
     */
    onEditorFocusLeave() {
        let {session} = this;

        session && this.isEmbodied(session) && this.completeEdit()
    }

    /**
     * Enter in the editor commits; Enter on the View edits the selected cell.
     * @param {Object} data
     * @protected
     */
    onEnterKey(data) {
        let me = this;

        if (me.owner.body.isEditorEvent(data)) {
            me.completeEdit()
        } else {
            me.editSelectedCell()
        }
    }

    /**
     * Escape is the one discard: it cancels the session, embodied or not.
     * @protected
     */
    onEscapeKey() {
        this.cancelEdit()
    }

    /**
     * @param {Object} data
     * @protected
     */
    onF2Key(data) {
        !this.owner.body.isEditorEvent(data) && this.editSelectedCell()
    }

    /**
     * Wires activation once the owner, and with it grid.View's key registry, exists.
     */
    onOwnerConstructed() {
        super.onOwnerConstructed();

        let me      = this,
            {owner} = me;

        owner.on('cellDoubleClick', me.onCellDoubleClick, me);
        owner.view.keys.add(me.getViewKeys())
    }

    /**
     * Re-renders the Row that shows the session's cell, if any, so the editor enters or leaves it.
     *
     * Nothing waits for the render, so its promise owns its outcome: a Row destroyed with its grid rejects with
     * `Neo.isDestroyed`, an expected end to this render; anything else is a failure with no caller to report to.
     * @param {Object} session
     * @protected
     */
    repaint(session) {
        let me     = this,
            column = me.owner.columns.get(session.dataField),
            record = me.getRecord(session),
            row    = column && record && me.getRow(record, column);

        if (row) {
            row.createVdom(true, false);

            row.promiseUpdate().catch(reason => {
                reason !== Neo.isDestroyed && console.error('grid.plugin.CellEditing: repaint failed', {id: row.id, reason})
            })
        }
    }

    /**
     * Edits a cell: a valid draft of another cell is committed first, and the editor is embodied, then focused once
     * it mounts. Activating the cell already being edited only returns focus to its editor.
     * @param {Object} record
     * @param {String} dataField
     * @returns {Boolean} false when the cell is not editable, not rendered, or an invalid draft blocks
     */
    startEdit(record, dataField) {
        let me        = this,
            {owner}   = me,
            column    = owner.columns.get(dataField),
            recordId  = owner.view.getRecordId(record),
            {session} = me,
            editor, row;

        if (me.disabled || !column?.editable) {
            return false
        }

        if (session?.recordId === recordId && session.dataField === dataField) {
            me.isEmbodied(session) && session.editor.focus();
            return true
        }

        row = me.getRow(record, column);

        if (!row || !me.completeEdit()) {
            return false
        }

        editor = Neo.create({
            module   : TextField,
            ...column.editor,
            appName  : owner.appName,
            cls      : NeoArray.union(column.editor?.cls || [], ['neo-grid-editor']),
            hideLabel: true,
            parentId : row.id,
            theme    : row.theme,
            value    : record.get(dataField),
            windowId : owner.windowId
        });

        editor.on('focusLeave', me.onEditorFocusLeave, me);

        // Only the editor's own mount proves its input is in the DOM: a Row render already in flight settles the
        // repaint's promise before the render inserting the editor lands. An edit ending sooner destroys the editor,
        // and this listener with it.
        editor.on('mounted', () => editor.focus(), me, {once: true});

        me.session = {dataField, editor, recordId};
        me.repaint(me.session);

        return true
    }
}

export default Neo.setupClass(CellEditing);
