import NeoArray  from '../../util/Array.mjs';
import Plugin    from '../../plugin/Base.mjs';
import TextField from '../../form/field/Text.mjs';

/**
 * @summary Edits a list item's text in place: F2 or a double-click opens a text field over it.
 *
 * Works on `Neo.list.Base` and every list that extends it, `Neo.tree.List` included. Enter or leaving the field
 * writes the new text to the record's `displayField`, and the list renders it from the store; Escape leaves the
 * record unchanged. Focus returns to the item either way.
 *
 * The field's own validation vetoes a name, as in `Neo.grid.plugin.CellEditing`: an invalid value keeps the edit
 * open and the record unchanged. {@link #editor} configures the field, its `validator` included.
 *
 * While an edit runs, the list's keyboard navigation pauses, so the arrow keys, Home, End and Enter move the
 * caret and commit instead of moving between items. A click inside the field stays in it: it places the caret
 * instead of reaching the list as an item click, which would toggle a tree folder or the selection.
 * @class Neo.list.plugin.ItemEditing
 * @extends Neo.plugin.Base
 */
class ItemEditing extends Plugin {
    static config = {
        /**
         * @member {String} className='Neo.list.plugin.ItemEditing'
         * @protected
         */
        className: 'Neo.list.plugin.ItemEditing',
        /**
         * @member {String} ntype='plugin-list-item-editing'
         * @protected
         */
        ntype: 'plugin-list-item-editing',
        /**
         * Configs for the editor field, a `Neo.form.field.Text` unless they name another `module`
         * @member {Object|null} editor=null
         */
        editor: null
    }

    /**
     * The edit in progress: `{content, editor, itemId, node, record, textNode}`
     * @member {Object|null} session=null
     * @protected
     */
    session = null

    /**
     * The owner's F2 key binding, kept to remove it again
     * @member {Object|null} #f2Key=null
     */
    #f2Key = null
    /**
     * The owner's double-click listener, kept to remove it again
     * @member {Object[]|null} #ownerDomListeners=null
     */
    #ownerDomListeners = null

    /**
     * Ends an edit without writing it: the item shows its text again.
     */
    cancelEdit() {
        this.session && this.#endEdit()
    }

    /**
     * Writes the edit to the record. The field's validation vetoes it: an invalid value keeps the edit open.
     * @returns {Boolean} false while the value is invalid
     */
    completeEdit() {
        let me        = this,
            {session} = me,
            field, oldValue, value;

        if (!session) {
            return true
        }

        if (!session.editor.validate(false)) {
            return false
        }

        field    = me.owner.displayField;
        oldValue = session.record[field];
        value    = session.editor.value;

        me.#endEdit();

        if (value !== oldValue) {
            if (session.record.isRecord) {
                // The store reports the change, and the list renders the item again
                session.record.set({[field]: value})
            } else {
                // A collection of plain objects reports nothing
                session.record[field] = value;
                me.owner.createItems()
            }
        }

        return true
    }

    /**
     * @param {...*} args
     */
    destroy(...args) {
        let me               = this,
            {owner, session} = me;

        // An owner being destroyed takes its items, keys and listeners with it: only the editor is left to go. A
        // plugin destroyed on its own leaves a list that lives on, so the edit ends and the bindings come off.
        if (owner.isDestroying) {
            me.session = null;
            session?.editor.destroy(!!session.editor.parent, true)
        } else {
            session && me.#endEdit();
            me.#f2Key && owner.keys?.removeKey(me.#f2Key);
            me.#ownerDomListeners && owner.removeDomListeners(me.#ownerDomListeners)
        }

        super.destroy(...args)
    }

    /**
     * The node inside an item that carries its text: the item itself for a plain list, the content node of a tree
     * item. It is the first node, the item first, that has `html` or `text`.
     * @param {Object} node An item's vdom
     * @returns {Object|null}
     */
    getTextNode(node) {
        if (Object.hasOwn(node, 'html') || Object.hasOwn(node, 'text')) {
            return node
        }

        for (const child of node.cn || []) {
            const result = child && this.getTextNode(child);

            if (result) {
                return result
            }
        }

        return null
    }

    /**
     * A click or double-click inside the field belongs to the field. Its listener stops the event before it reaches
     * the list (`bubble: false`), and there is nothing else to do.
     */
    onEditorClick() {
    }

    /**
     * Leaving the field commits it, unless its value is invalid
     */
    onEditorFocusLeave() {
        this.completeEdit()
    }

    /**
     * @param {Object} data The key event, with its path
     */
    onF2Key(data) {
        let node = this.#getItemNode(data.path);

        node && this.startEdit(node.id)
    }

    /**
     * @param {Object} data The event, with its path
     */
    onItemDoubleClick(data) {
        let node = this.#getItemNode(data.path);

        node && this.startEdit(node.id)
    }

    /**
     *
     */
    onOwnerConstructed() {
        super.onOwnerConstructed();

        let me      = this,
            {owner} = me;

        me.#f2Key = {fn: 'onF2Key', key: 'F2', scope: me.id};
        owner.keys?._keys.push(me.#f2Key);

        me.#ownerDomListeners = [{dblclick: me.onItemDoubleClick, delegate: '.' + owner.itemCls, scope: me}];
        owner.addDomListeners(me.#ownerDomListeners)
    }

    /**
     * Opens the editor over an item's text. An edit already open elsewhere commits first.
     * @param {String} itemId The item's vdom id
     * @returns {Boolean} false when the item cannot be edited, or an invalid edit stays open
     */
    startEdit(itemId) {
        let me       = this,
            {owner}  = me,
            {store}  = owner,
            key      = owner.getItemRecordId(itemId),
            record   = store.get(key) || store.get(store.getCanonicalKey(key)),
            node     = owner.getVdomChild(itemId),
            textNode = node && me.getTextNode(node),
            editor;

        if (!record || !textNode || record.isHeader || record[owner.disabledField]) {
            return false
        }

        if (me.session?.itemId === itemId) {
            return true
        }

        if (!me.completeEdit()) {
            return false
        }

        editor = Neo.create({
            module: TextField,
            ...me.editor,
            appName  : owner.appName,
            cls      : NeoArray.union(me.editor?.cls || [], ['neo-list-item-editor']),
            hideLabel: true,
            keys     : {Enter: 'completeEdit', Escape: 'cancelEdit', scope: me.id},
            parentId : owner.id,
            theme    : owner.theme,
            value    : record[owner.displayField],
            windowId : owner.windowId
        });

        editor.addDomListeners({click: me.onEditorClick, dblclick: me.onEditorClick, bubble: false, scope: me});

        editor.on({
            focusLeave: me.onEditorFocusLeave,
            scope     : me
        });

        editor.on('mounted', () => {
            editor.focus();
            editor.selectText?.()
        }, me, {once: true});

        // The navigator would turn the arrow keys, Home, End and Enter into item moves and clicks
        owner.hasNavigator && Neo.main.addon.Navigator.unsubscribe(owner.navigator);

        me.session = {
            content: {cn: textNode.cn, html: textNode.html, text: textNode.text},
            editor,
            itemId,
            node,
            record,
            textNode
        };

        delete textNode.html;
        delete textNode.text;
        textNode.cn = [editor.createVdomReference()];

        NeoArray.add(node.cls = node.cls || [], 'neo-list-item-editing');

        owner.update();

        return true
    }

    /**
     * Shows the item's text again, resumes the navigation and returns focus to the item
     */
    #endEdit() {
        let me                          = this,
            {owner, session}            = me,
            {content, node, textNode}   = session;

        me.session = null;

        Object.entries(content).forEach(([name, value]) => {
            if (value === undefined) {
                delete textNode[name]
            } else {
                textNode[name] = value
            }
        });

        NeoArray.remove(node.cls, 'neo-list-item-editing');

        owner.update();

        if (owner.hasNavigator && owner.mounted) {
            Neo.main.addon.Navigator.subscribe(owner.navigator);
            owner.focus(session.itemId)
        }

        // Through its parent, as `Neo.grid.plugin.CellEditing#destroyEditor` does: a render collected earlier may
        // still name the editor
        session.editor.destroy(!!session.editor.parent, true)
    }

    /**
     * @param {Object[]} [path=[]]
     * @returns {Object|undefined} The item node in an event path
     */
    #getItemNode(path=[]) {
        let {owner} = this;

        return path.find(node => node.cls?.includes(owner.itemCls) && node.id?.startsWith(owner.id + '__'))
    }
}

export default Neo.setupClass(ItemEditing);
