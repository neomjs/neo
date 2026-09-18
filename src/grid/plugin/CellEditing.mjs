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
 * - the next render of that cell embodies the editor again;
 * - a column lock change holds the editor out of every cell until the bodies have swapped columns.
 *
 * Losing the projection is neutral: scrolling never commits and never cancels.
 *
 * Keys route through {@link Neo.grid.View}, the grid's single key registry: Enter and F2 edit the selected cell
 * (keyboard activation needs a cell-selecting model), Enter in the editor commits, Escape cancels, and Tab or
 * Shift+Tab commits and edits the next or previous editable cell. A double-click edits any editable cell. Activating
 * another cell, or moving focus out of the editor, commits a valid draft first; an invalid draft keeps its edit
 * open. A column opts in through
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
     * is edited. {@link Neo.grid.Row#applyRendererOutput} reads it; only this plugin writes it. `held` counts the lock
     * changes holding the editor out of every cell ({@link #holdEdit}), `blurOwed` marks the leave the first of them
     * causes, and `wasEmbodied` says whether a cell has shown the editor yet — a session born suspended has that
     * still ahead of it.
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
        value && this.cancelEdit('disabled');

        // Whether the grid edits at all decides every cell's aria-readonly
        oldValue !== undefined && this.owner.repaintCells()
    }

    /**
     * Discards the draft and ends the session. The editor's destruction returns focus to where the edit took it from.
     *
     * No cancel is silent: the grid fires `cellEditCancel` with `{dataField, reason, record}` once the session is
     * over, so a listener may start the next edit. `reason` is `'escape'`, `'notEditable'` (the column stopped being
     * editable), `'disabled'`, `'destroy'` (the plugin went, its grid lives on), `'projectionLoss'`
     * ({@link #onBodyRender}) or `'api'` for a caller that names none; `record` is null once the store no longer
     * holds it. A grid destroyed with its plugin fires nothing: nobody is left to hear it.
     * @param {String} [reason='api']
     */
    cancelEdit(reason='api') {
        let me        = this,
            {session} = me,
            record;

        if (session) {
            record = me.getRecord(session);

            me.setSession(null);
            me.repaint(session);
            me.destroyEditor(session.editor);

            me.owner.fire('cellEditCancel', {dataField: session.dataField, reason, record})
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

        record = me.getRecord(session);
        me.setSession(null);

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
            me.setSession(null);
            session && me.destroyEditor(session.editor)
        } else {
            me.cancelEdit('destroy')
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
     * The editable cell `step` cells along from the session's, in the column order the arrow keys walk
     * ({@link Neo.selection.grid.BaseModel#dataFields}): a row's last editable cell is followed by the next record's
     * first, and its first preceded by the previous record's last. A logical target — record and `dataField` — so a
     * commit that re-sorts the store cannot move it.
     * @param {Object} session
     * @param {Number} step 1 or -1
     * @returns {{dataField: String, record: Object}|null} null past either end of the store
     * @protected
     */
    getAdjacentEditableCell(session, step) {
        let me         = this,
            {owner}    = me,
            {store}    = owner,
            dataFields = owner.columns.items.filter(column => column.editable).map(column => column.dataField),
            index      = dataFields.indexOf(session.dataField) + step,
            record     = me.getRecord(session),
            rowIndex   = record ? store.indexOf(record) : -1;

        // A record the store no longer shows has no neighbours
        if (rowIndex < 0) {
            return null
        }

        if (index < 0 || index >= dataFields.length) {
            rowIndex += step;
            index     = step > 0 ? 0 : dataFields.length - 1
        }

        record = rowIndex >= 0 && store.getAt(rowIndex);

        return record ? {dataField: dataFields[index], record} : null
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
            {fn: 'onF2Key',     key: 'F2',     scope},
            {fn: 'onTabKey',    key: 'Tab',    scope}
        ]
    }

    /**
     * Holds the editor out of every cell until the matching {@link #releaseEdit}. A column changing body shifts the
     * cells beside it too, and a render that moves the editor between cells can lose its node, so a lock change
     * renders it out first, and the body rendering the column embeds it anew. Removing the focused editor blurs it,
     * and that one leave is owed to the lock change.
     * @returns {Promise<void>} settles once the editor is out of the DOM
     */
    holdEdit() {
        let me        = this,
            {session} = me,
            editor;

        // Only the first of overlapping lock changes renders the editor out
        if (!session || session.held++) {
            return Promise.resolve()
        }

        editor           = session.editor;
        session.blurOwed = editor.containsFocus;

        // The Row the editor's parent names embeds it, whichever body its column is moving to
        return editor.vnode ? me.repaintRow(editor.parent) : Promise.resolve()
    }

    /**
     * Whether the session's cell is rendered right now: not held, its record inside the row pool, and its column locked
     * or inside the body's mounted column window. Read from the App Worker's own projection state, so it answers for
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

        if (session.held || !column || !record || !me.getRow(record, column)) {
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
     * Called by every {@link Neo.grid.Body} once a render pass is through — the one place where an embodiment can
     * go. Losing it is neutral by default: the session waits, suspended, for the pass that renders its cell again.
     *
     * A column whose editor cannot be suspended ({@link Neo.grid.column.Base#cancelEditOnProjectionLoss}) cancels the
     * edit instead, with `reason: 'projectionLoss'`. Only an embodiment that existed can be lost — a session born
     * suspended, on its way into sight, is not.
     * @protected
     */
    onBodyRender() {
        let me        = this,
            {session} = me;

        if (!session) {
            return
        }

        if (me.isEmbodied(session)) {
            session.wasEmbodied = true
        } else if (session.wasEmbodied && me.owner.columns.get(session.dataField)?.cancelEditOnProjectionLoss) {
            me.cancelEdit('projectionLoss')
        }
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
        !column.editable && this.session?.dataField === column.dataField && this.cancelEdit('notEditable')
    }

    /**
     * Focus leaving the embodied editor — to another cell, or out of the grid — commits a valid draft. Losing the
     * embodiment to a scroll blurs the editor too, and is neutral, as is the blur a lock change owes.
     * @protected
     */
    onEditorFocusLeave() {
        let me        = this,
            {session} = me;

        if (session?.blurOwed) {
            session.blurOwed = false
        } else if (session && me.isEmbodied(session)) {
            me.completeEdit()
        }
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
        this.cancelEdit('escape')
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
     * Tab in the editor commits and edits the next editable cell, Shift+Tab the previous one. An invalid draft keeps
     * its editor. A cell-selecting model follows the edit, so the arrow keys continue from where it ends, and the
     * View scrolls the new cell into sight the way it does for them.
     *
     * Past the last editable cell, and before the first, the edit commits and ends with focus on the View. With no
     * session the main thread cancels no Tab, so the next one is the browser's own and leaves the grid.
     *
     * The key arrives from the editor, or — while the session's editor is not embodied, or not focused — from the
     * View itself, whose Tab {@link #setSession} claimed. There an invalid draft cannot simply stay where it is: its
     * cell is scrolled back into sight, and the editor takes focus once it is embodied again.
     * @param {Object} data
     * @protected
     */
    onTabKey(data) {
        let me               = this,
            {owner, session} = me,
            {store, view}    = owner,
            {selectionModel} = view,
            columnIndex, dataFields, rowIndex, target;

        // Tab on any other node inside the View keeps its default, and is not this edit's
        if (!session || !(owner.body.isEditorEvent(data) || data.path?.[0]?.id === view.id)) {
            return
        }

        // Read before the commit ends the session, and before a re-sort can move the record
        dataFields  = owner.columns.items.map(column => column.dataField);
        columnIndex = dataFields.indexOf(session.dataField);
        rowIndex    = store.indexOf(me.getRecord(session));
        target      = me.getAdjacentEditableCell(session, data.shiftKey ? -1 : 1);

        if (!me.completeEdit()) {
            let {editor} = session;

            if (me.isEmbodied(session)) {
                editor.focus()
            } else {
                editor.on('mounted', () => editor.focus(), me, {once: true});

                rowIndex >= 0 && view.scrollByRows(rowIndex, 0);
                owner.scrollByColumns(columnIndex, 0)
            }
        } else if (target) {
            let {dataField, record} = target;

            selectionModel?.selectsCells && selectionModel.select(view.getLogicalCellId(record, dataField));

            // Both scroll only a target that is out of sight — which the session's own row is, too, while it is suspended
            view.scrollByRows(store.indexOf(record), 0);
            owner.scrollByColumns(columnIndex, dataFields.indexOf(dataField) - columnIndex);

            me.startEdit(record, dataField, true)
        }
    }

    /**
     * Ends a {@link #holdEdit}: once the last lock change releases it, the body rendering the column embeds the
     * editor again.
     */
    releaseEdit() {
        let me        = this,
            {session} = me;

        session?.held && !--session.held && me.repaint(session)
    }

    /**
     * Re-renders the Row that shows the session's cell, if any, so the editor enters or leaves it.
     * @param {Object} session
     * @protected
     */
    repaint(session) {
        let me     = this,
            column = me.owner.columns.get(session.dataField),
            record = me.getRecord(session);

        column && record && me.repaintRow(me.getRow(record, column))
    }

    /**
     * Re-renders a Row. The promise owns the render's outcome, since no caller reports it: a Row destroyed with its
     * grid rejects with `Neo.isDestroyed`, an expected end to this render; anything else is a failure.
     * @param {Neo.grid.Row|null} row
     * @returns {Promise<void>} settles once the render has landed
     * @protected
     */
    repaintRow(row) {
        if (!row) {
            return Promise.resolve()
        }

        row.createVdom(true, false);

        return row.promiseUpdate().catch(reason => {
            reason !== Neo.isDestroyed && console.error('grid.plugin.CellEditing: repaint failed', {id: row.id, reason})
        })
    }

    /**
     * The single write to {@link #session}. While a session is open, Tab on the View belongs to the edit: the main
     * thread cancels its default for the View's node, so a Tab pressed while the editor is not embodied — its cell
     * scrolled out of the row pool or the column window — reaches {@link #onTabKey} instead of leaving the grid
     * with the draft open. With no session the View's Tab is the browser's own again.
     * @param {Object|null} session
     * @protected
     */
    setSession(session) {
        let me     = this,
            {view} = me.owner,
            wasSet = !!me.session;

        me.session = session;

        if (!!session !== wasSet && view) {
            Neo.main.DomEvents[session ? 'registerPreventDefaultKeys' : 'unregisterPreventDefaultKeys']({
                id      : view.id,
                keys    : ['Tab'],
                windowId: view.windowId
            })
        }
    }

    /**
     * Edits a cell: a valid draft of another cell is committed first, and the editor is embodied, then focused once
     * it mounts. Activating the cell already being edited only returns focus to its editor.
     *
     * Enter in the editor is the grid's commit, so a picker editor starts with
     * {@link Neo.form.field.Picker#showPickerOnEnter} off: its own Enter would open a picker for the edit it ends.
     * @param {Object} record
     * @param {String} dataField
     * @param {Boolean} [allowSuspended=false] true starts the edit on a cell whose Row is not rendered: the session is
     * born suspended, and the Row embodies it on the render that brings the record into the pool
     * @returns {Boolean} false when the cell is not editable, not rendered, or an invalid draft blocks
     */
    startEdit(record, dataField, allowSuspended=false) {
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

        if (!row && !allowSuspended || !me.completeEdit()) {
            return false
        }

        editor = Neo.create({
            module           : TextField,
            showPickerOnEnter: false,
            ...column.editor,
            appName  : owner.appName,
            cls      : NeoArray.union(column.editor?.cls || [], ['neo-grid-editor']),
            hideLabel: true,
            // The Row embedding the editor takes it over as its parent; until one does, its body stands in
            parentId: (row || me.getBody(column)).id,
            theme   : (row || owner).theme,
            value   : record.get(dataField),
            windowId: owner.windowId
        });

        editor.on('focusLeave', me.onEditorFocusLeave, me);

        // Only the editor's own mount proves its input is in the DOM: a Row render already in flight settles the
        // repaint's promise before the render inserting the editor lands. An edit ending sooner destroys the editor,
        // and this listener with it.
        //
        // Selecting belongs to the ACTIVATION, which is why it sits here and not beside the `focus()` above: that one
        // re-focuses an edit already open, and a caret the user placed is theirs to keep. A field with no text to
        // select — a CheckBox editor extends `form.field.Base`, not `Text` — has no `selectText` and skips it.
        editor.on('mounted', () => {
            editor.focus();
            editor.selectText?.()
        }, me, {once: true});

        me.setSession({blurOwed: false, dataField, editor, held: 0, recordId});
        me.session.wasEmbodied = me.isEmbodied(me.session);
        me.repaint(me.session);

        return true
    }
}

export default Neo.setupClass(CellEditing);
