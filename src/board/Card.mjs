import Component                       from '../component/Base.mjs';
import NeoArray                        from '../util/Array.mjs';
import TextField                       from '../form/field/Text.mjs';
import {getTitleField, renderCardItem} from './CardItems.mjs';

/**
 * @summary One card of a board: the component of one record, rendered from the board's card items, with inline title
 * editing and the menu button that opens the board's shared {@link Neo.board.CardEditor}.
 * @description Render-all columns keep the instance for the record's life; sliced columns create visible cards and
 * retain only a bounded offscreen set. `board.getCard` returns null offscreen in sliced mode; `column.scrollToRecord`
 * renders the requested record again. Its id derives from the board and the record key (`<board>__card__<key>`), so a
 * whitebox test or an agent resolves it without an index. The record's `color` paints `--neo-board-card-accent-color`; the rest
 * is the items' work ({@link Neo.board.CardItems}).
 *
 * Double-clicking `.neo-board-card-title` or pressing `F2` on a focused card replaces the title node with a
 * `Neo.form.field.Text` (`neo-board-card-inline-editor`): `Enter` or blur commits `record.set({title})` when the
 * value changed, while `Escape` restores the title node without writing. Clicking `.neo-board-card-menu-button` or
 * pressing `Enter` on the focused card opens the board's shared {@link Neo.board.CardEditor}.
 * @class Neo.board.Card
 * @extends Neo.component.Base
 */
class Card extends Component {
    static config = {
        /**
         * @member {String} className='Neo.board.Card'
         * @protected
         */
        className: 'Neo.board.Card',
        /**
         * @member {String} ntype='board-card'
         * @protected
         */
        ntype: 'board-card',
        /**
         * @member {String[]} baseCls=['neo-board-card']
         * @protected
         */
        baseCls: ['neo-board-card'],
        /**
         * The board this card belongs to
         * @member {Neo.board.Container|null} board=null
         */
        board: null,
        /**
         * The items rendered into the card body; null renders the board's `cardItems`
         * @member {Object[]|null} cardItems_=null
         */
        cardItems_: null,
        /**
         * The record this card renders
         * @member {Object|null} record_=null
         */
        record_: null,
        /**
         * @member {String} role='listitem'
         */
        role: 'listitem',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: 0, 'aria-roledescription': 'card', 'aria-selected': 'false', cn: []}
    }

    /**
     * The inline `Neo.form.field.Text` created lazily when the user edits the card's title
     * @member {Neo.form.field.Text|null} inlineEditor=null
     */
    inlineEditor = null
    /**
     * True while the inline title editor is active
     * @member {Boolean} isEditingTitle=false
     */
    isEditingTitle = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {click   : me.onMenuButtonClick,  delegate: '.neo-board-card-menu-button', scope: me},
            {dblclick: me.onTitleDoubleClick, delegate: '.neo-board-card-title',       scope: me},
            {dblclick: me.onCardDoubleClick,  scope   : me},
            {keydown : me.onCardKeyDown,      scope   : me}
        ])
    }

    /**
     * @summary Re-renders the body when the item set changes after construction
     * @param {Object[]|null} value
     * @param {Object[]|null} oldValue
     * @protected
     */
    afterSetCardItems(value, oldValue) {
        oldValue !== undefined && this.record && this.renderItems()
    }

    /**
     * @summary Renders the record on assignment
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        value && this.renderItems()
    }

    /**
     * @summary Cancels the active inline title edit and restores the title node without writing to the record
     * @returns {Boolean} True when an active edit was cancelled
     */
    cancelTitleEdit() {
        let me = this;

        if (!me.isEditingTitle) {
            return false
        }

        me.isEditingTitle = false;
        me.inlineEditor?.setSilent({value: String(me.record?.[me.getTitleField()] ?? '')});
        me.updateDepth = -1;
        me.renderItems();

        return true
    }

    /**
     * @summary Commits the active inline title edit: calls `record.set({[titleField]: value})` once when changed, or
     * restores the title node without writing when unchanged.
     * @returns {Boolean} True when the record was updated
     */
    commitTitleEdit() {
        let me = this;

        if (!me.isEditingTitle || !me.inlineEditor) {
            return false
        }

        const
            field     = me.getTitleField(),
            nextValue = String(me.inlineEditor.value ?? ''),
            prevValue = String(me.record?.[field] ?? ''),
            changed   = Boolean(me.record && nextValue !== prevValue);

        me.isEditingTitle = false;
        me.updateDepth    = -1;

        if (changed) {
            if (typeof me.record.set === 'function') {
                me.record.set({[field]: nextValue});
                if (!me.board?.store) {
                    me.renderItems()
                }
            } else {
                me.record[field] = nextValue;
                me.renderItems()
            }
            return true
        }

        me.renderItems();
        return false
    }

    /**
     * @summary Destroys the inline title editor before tearing down the card
     * @param {...*} args
     */
    destroy(...args) {
        this.inlineEditor?.destroy();
        this.inlineEditor = null;
        super.destroy(...args)
    }

    /**
     * @summary The items this card renders: its own, else the board's
     * @returns {Object[]}
     */
    getCardItems() {
        return this.cardItems || this.board?.cardItems || []
    }

    /**
     * @summary Resolves the field name used by the card's `title` item
     * @returns {String}
     */
    getTitleField() {
        return getTitleField(this.getCardItems())
    }

    /**
     * @summary Activates the card when double-clicked outside the inline title or menu button
     * @param {Object} [data]
     */
    onCardDoubleClick(data) {
        let me     = this,
            {path} = data || {};

        if (me.isEditingTitle) {
            return
        }

        if (path?.some(node =>
            node.cls?.includes('neo-board-card-title') ||
            node.cls?.includes('neo-board-card-inline-editor') ||
            node.cls?.includes('neo-board-card-menu-button')
        )) {
            return
        }

        if (me.board) {
            me.board.activateCard(me)
        } else {
            me.openEditor()
        }
    }

    /**
     * @summary Handles keyboard shortcuts on the card (`F2` starts inline title edit; `Enter` opens the card editor or
     * commits the inline edit; `Escape` cancels the inline edit)
     * @param {Object} data
     */
    onCardKeyDown(data) {
        let me          = this,
            {key, path} = data || {},
            inlineId    = me.inlineEditor?.id,
            fromInline  = Boolean(path?.some(node => (inlineId && node.id === inlineId) || node.cls?.includes('neo-board-card-inline-editor')));

        if (fromInline) {
            data && (data.cancelBubble = true);
            return
        }

        if (me.isEditingTitle) {
            if (key === 'Enter') {
                data && (data.cancelBubble = true);
                me.commitTitleEdit()
            } else if (key === 'Escape') {
                data && (data.cancelBubble = true);
                me.cancelTitleEdit()
            }
            return
        }

        if (key === 'F2') {
            me.startTitleEdit()
        } else if (key === 'Enter') {
            if (me.board?.selectionModel && data?.component) {
                return
            }

            if (me.board) {
                me.board.activateCard(me)
            } else {
                me.openEditor()
            }
        }
    }

    /**
     * @summary Focuses and selects the inline title input once its VNode lands in the DOM
     */
    onInlineEditorMounted() {
        let me = this;

        if (me.isEditingTitle && me.inlineEditor) {
            me.inlineEditor.focus();
            me.inlineEditor.selectText?.()
        }
    }

    /**
     * @summary Commits the inline title edit when focus leaves the inline text field
     * @param {Object} [data]
     */
    onInlineFocusLeave(data) {
        this.isEditingTitle && this.commitTitleEdit()
    }

    /**
     * @summary Handles `Enter` and `Escape` inside the inline title text field
     * @param {Object} data
     */
    onInlineKeyDown(data) {
        const {key} = data || {};

        if (key === 'Enter') {
            this.commitTitleEdit()
        } else if (key === 'Escape') {
            this.cancelTitleEdit()
        }
    }

    /**
     * @summary Opens the board's shared card editor from the card's menu button
     * @param {Object} [data]
     */
    onMenuButtonClick(data) {
        this.openEditor()
    }

    /**
     * @summary The board tells the card its record changed; the card re-renders.
     * @param {Object[]} fields `{name, oldValue, value}` per changed field
     */
    onRecordChange(fields) {
        this.renderItems()
    }

    /**
     * @summary Starts inline title editing on double-click of the title node
     * @param {Object} [data]
     */
    onTitleDoubleClick(data) {
        this.startTitleEdit()
    }

    /**
     * @summary Opens the owning board's shared {@link Neo.board.CardEditor} bound to this card and its record
     * @returns {Neo.board.CardEditor|null}
     */
    openEditor() {
        return this.board?.openCardEditor(this) || null
    }

    /**
     * @summary Builds the card body from the record and the card items, appends the menu button when the card belongs
     * to a board, and paints the accent color.
     * @description Every item node carries a stable id (`<card>__<type>[__<field>]`), so a re-render of the same
     * item set is a diff of text and classes on the same nodes, never a remove + insert — the pattern that doubled
     * the column badge under two updates in flight.
     */
    renderItems() {
        let me             = this,
            {record, vdom} = me,
            style          = {...me.style},
            color          = record?.color;

        vdom.cn = me.getCardItems().map(item => {
            if (me.isEditingTitle && me.inlineEditor && item?.type === 'title') {
                return me.inlineEditor.createVdomReference()
            }

            const node = renderCardItem(record, item, me);

            if (node) {
                node.id = `${me.id}__${item.type}${item.field ? `__${String(item.field).replace(/[^A-Za-z0-9_-]/g, '-')}` : ''}`
            }

            return node
        }).filter(Boolean);

        if (me.board && vdom.cn.length) {
            vdom.cn.push({
                tag         : 'button',
                type        : 'button',
                id          : `${me.id}__menu`,
                cls         : ['neo-board-card-menu-button'],
                'aria-label': 'Edit card',
                text        : '⋯'
            })
        }

        if (color) {
            style['--neo-board-card-accent-color'] = color
        } else {
            delete style['--neo-board-card-accent-color']
        }

        const
            isOverdue = vdom.cn.some(node => node?.cls?.includes?.('neo-board-card-due-date-overdue')),
            cls       = [...me.cls];

        NeoArray.toggle(cls, 'neo-board-card-overdue', isOverdue);

        me.set({cls, style});
        me.update()
    }

    /**
     * @summary Replaces the card's title node with an inline `Neo.form.field.Text` (`neo-board-card-inline-editor`)
     * initialized to the record's current title.
     * @returns {Neo.form.field.Text|null}
     */
    startTitleEdit() {
        let me = this;

        if (!me.record) {
            return null
        }

        if (me.isEditingTitle && me.inlineEditor) {
            return me.inlineEditor
        }

        const
            field        = me.getTitleField(),
            initialValue = String(me.record[field] ?? '');

        if (!me.inlineEditor) {
            me.inlineEditor = Neo.create(TextField, {
                appName  : me.appName,
                clearable: false,
                cls      : ['neo-board-card-inline-editor'],
                hideLabel: true,
                id       : `${me.id}__inline-editor`,
                listeners: {
                    focusLeave: me.onInlineFocusLeave,
                    mounted   : me.onInlineEditorMounted,
                    scope     : me
                },
                parentId: me.id,
                value   : initialValue,
                windowId: me.windowId
            });

            me.inlineEditor.addDomListeners({
                keydown: me.onInlineKeyDown,
                scope  : me
            })
        } else {
            me.inlineEditor.setSilent({value: initialValue})
        }

        me.isEditingTitle = true;
        me.updateDepth    = -1;
        me.renderItems();
        me.inlineEditor.mounted && me.onInlineEditorMounted();

        return me.inlineEditor
    }
}

export default Neo.setupClass(Card);
