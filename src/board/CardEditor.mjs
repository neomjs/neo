import Button          from '../button/Base.mjs';
import DateField       from '../form/field/Date.mjs';
import DateUtil        from '../util/Date.mjs';
import Dialog          from '../dialog/Base.mjs';
import FormContainer   from '../form/Container.mjs';
import NumberField     from '../form/field/Number.mjs';
import SelectField     from '../form/field/Select.mjs';
import TextAreaField   from '../form/field/TextArea.mjs';
import TextField       from '../form/field/Text.mjs';
import Toolbar         from '../toolbar/Base.mjs';
import {getTitleField} from './CardItems.mjs';

/**
 * @summary The board's shared card editor dialog: one instance per board, holding a `Neo.form.Container` bound to the
 * active card's record and committing all changed fields in a single write.
 * @description `Neo.board.CardEditor` extends {@link Neo.dialog.Base} with `closeAction: 'hide'` so one dialog
 * instance serves the entire board (`editor.record = card.record`). When opened from a rendered card,
 * `animateTargetId` points at `card.id` so the dialog animates from and back to that card in the live browser.
 *
 * On {@link #save}, the editor diffs the form's current field values against the record:
 * - If the board's `statusField` or `laneField` changed, it routes the commit through
 *   `board.moveCard({record, status, lane, index: -1, fields: changed})`, which appends the card to the target column
 *   and merges all other changed fields into one `record.set()` call.
 * - Otherwise, if one or more fields changed, it calls `record.set(changed)` once.
 * - If nothing changed, or on {@link #cancel} / `Escape`, it writes nothing.
 * @class Neo.board.CardEditor
 * @extends Neo.dialog.Base
 */
class CardEditor extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.board.CardEditor'
         * @protected
         */
        className: 'Neo.board.CardEditor',
        /**
         * @member {String} ntype='board-card-editor'
         * @protected
         */
        ntype: 'board-card-editor',
        /**
         * @member {Boolean} autoInitVnode=false
         */
        autoInitVnode: false,
        /**
         * @member {Boolean} autoMount=false
         */
        autoMount: false,
        /**
         * @member {Boolean} autoShow=false
         */
        autoShow: false,
        /**
         * @member {String[]} baseCls=['neo-board-card-editor','neo-dialog','neo-panel','neo-container']
         * @protected
         */
        baseCls: ['neo-board-card-editor', 'neo-dialog', 'neo-panel', 'neo-container'],
        /**
         * The owning board
         * @member {Neo.board.Container|null} board=null
         */
        board: null,
        /**
         * The card this editor was last opened from
         * @member {Neo.board.Card|null} card_=null
         */
        card_: null,
        /**
         * Reuse the dialog across cards on the board
         * @member {String} closeAction='hide'
         */
        closeAction: 'hide',
        /**
         * @member {Boolean} draggable=false
         */
        draggable: false,
        /**
         * @member {Boolean} hidden=true
         */
        hidden: true,
        /**
         * @member {Boolean} modal=true
         */
        modal: true,
        /**
         * The record currently bound to the editor form
         * @member {Object|null} record_=null
         */
        record_: null,
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * @member {String} title='Edit card'
         */
        title: 'Edit card',
        /**
         * @member {Boolean} trapFocus=true
         */
        trapFocus: true
    }

    /**
     * Map of field name -> `Neo.form.field.Base` instance inside {@link #form}
     * @member {Map<String, Neo.form.field.Base>} fieldMap=new Map()
     */
    fieldMap = new Map()
    /**
     * The footer toolbar holding Cancel and Save buttons
     * @member {Neo.toolbar.Base|null} footerToolbar=null
     */
    footerToolbar = null
    /**
     * The inner form container
     * @member {Neo.form.Container|null} form=null
     */
    form = null
    /**
     * Snapshot of normalized initial field values when {@link #record} is bound, so untouched fields never report a
     * synthetic diff.
     * @member {Object} initialValues={}
     */
    initialValues = {}

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.createForm();
        me.record && me.syncFormFields(me.record)
    }

    /**
     * @summary Updates `animateTargetId` and `record` when a card is assigned
     * @param {Neo.board.Card|null} value
     * @param {Neo.board.Card|null} oldValue
     * @protected
     */
    afterSetCard(value, oldValue) {
        this.animateTargetId = value?.id || null;
        if (value?.record && this.record !== value.record) {
            this.record = value.record
        }
    }

    /**
     * @summary Populates the form fields whenever `record` changes
     * @param {Object|null} value
     * @param {Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.form && this.syncFormFields(value)
    }

    /**
     * @summary Discards any unsaved edits and hides the dialog without writing to the record
     */
    cancel() {
        let me = this;

        me.record && me.syncFormFields(me.record);
        if (me.board && me.record) {
            me.card = me.board.getCard(me.record)
        }
        me.hide()
    }

    /**
     * @summary Builds the form container, its standard fields, any additional model fields, and the Save/Cancel footer
     */
    createForm() {
        let me                  = this,
            {appName, windowId} = me,
            titleField          = me.getTitleField(),
            statusField         = me.board?.statusField || 'status',
            laneField           = me.board?.laneField || 'lane',
            standardFields      = [
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__${titleField}`,
                    labelText: 'Title',
                    name     : titleField
                },
                {
                    module   : TextAreaField,
                    clearable: false,
                    id       : `${me.id}__field__description`,
                    labelText: 'Description',
                    name     : 'description'
                },
                {
                    module      : SelectField,
                    displayField: 'name',
                    id          : `${me.id}__field__${statusField}`,
                    labelText   : 'Status',
                    name        : statusField,
                    options     : me.getStatusOptions(me.record),
                    valueField  : 'id'
                },
                {
                    module      : SelectField,
                    displayField: 'name',
                    hidden      : !me.board?.laneField,
                    id          : `${me.id}__field__${laneField}`,
                    labelText   : 'Lane',
                    name        : laneField,
                    options     : me.getLaneOptions(me.record),
                    valueField  : 'id'
                },
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__assignees`,
                    labelText: 'Assignees',
                    name     : 'assignees'
                },
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__tags`,
                    labelText: 'Tags',
                    name     : 'tags'
                },
                {
                    module        : NumberField,
                    clearable     : false,
                    disabledChars : null,
                    id            : `${me.id}__field__progress`,
                    labelText     : 'Progress',
                    maxValue      : 100,
                    minValue      : 0,
                    name          : 'progress',
                    useSpinButtons: false
                },
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__color`,
                    labelText: 'Color',
                    name     : 'color'
                },
                {
                    module   : DateField,
                    clearable: false,
                    id       : `${me.id}__field__dueDate`,
                    labelText: 'Due date',
                    name     : 'dueDate',
                    triggers : []
                }
            ];

        me.form = Neo.create({
            module  : FormContainer,
            appName,
            cls     : ['neo-board-card-editor-form'],
            flex    : 1,
            id      : `${me.id}__form`,
            items   : standardFields,
            parentId: me.id,
            windowId
        });

        me.form.items.forEach(field => {
            me.fieldMap.set(field.name, field)
        });

        me.ensureModelFields();

        me.footerToolbar = Neo.create({
            module  : Toolbar,
            appName,
            cls     : ['neo-board-card-editor-footer', 'neo-toolbar'],
            dock    : 'bottom',
            flex    : 'none',
            id      : `${me.id}__footer`,
            parentId: me.id,
            windowId,
            items   : [{
                module      : Button,
                cls         : ['neo-board-card-editor-cancel'],
                handler     : 'onCancelButtonClick',
                handlerScope: me,
                id          : `${me.id}__cancel`,
                text        : 'Cancel'
            }, {
                module      : Button,
                cls         : ['neo-board-card-editor-save'],
                handler     : 'onSaveButtonClick',
                handlerScope: me,
                id          : `${me.id}__save`,
                text        : 'Save'
            }]
        });

        me.add(me.form);
        me.headers = [...(me.headers || []), me.footerToolbar]
    }

    /**
     * @summary Cleans up child pickers and fields on teardown
     * @param {...*} args
     */
    destroy(...args) {
        this.fieldMap.forEach(field => {
            field.dateSelector?.destroy?.()
        });
        this.fieldMap.clear();
        super.destroy(...args)
    }

    /**
     * @summary Adds form fields for any custom model fields not covered by the default set; unknown field types render
     * as `Neo.form.field.Text`.
     */
    ensureModelFields() {
        let me          = this,
            {board}     = me,
            modelFields = board?.store?.model?.fields || [],
            keyProperty = board?.store?.keyProperty || board?.store?.model?.keyProperty || 'id',
            orderField  = board?.orderField || 'order';

        modelFields.forEach(fieldDef => {
            const name = fieldDef?.name;

            if (!name || name === keyProperty || name === orderField || me.fieldMap.has(name)) {
                return
            }

            const
                rawType = String(fieldDef.type || '').toLowerCase(),
                module  = rawType === 'int' || rawType === 'integer' || rawType === 'float' || rawType === 'number'
                    ? NumberField
                    : rawType === 'date'
                        ? DateField
                        : TextField,
                config  = {
                    module,
                    appName  : me.appName,
                    clearable: false,
                    id       : `${me.id}__field__${name}`,
                    labelText: name,
                    name,
                    windowId : me.windowId
                };

            if (module === NumberField) {
                config.disabledChars  = null;
                config.useSpinButtons = false
            } else if (module === DateField) {
                config.triggers = []
            }

            const field = me.form.add(config);
            me.fieldMap.set(name, field)
        })
    }

    /**
     * @summary Converts a record field value into the representation stored on its form field
     * @param {String} name
     * @param {*} value
     * @returns {*}
     */
    formatFieldValue(name, value) {
        if (name === 'assignees') {
            if (Array.isArray(value)) {
                return value.map(person => typeof person === 'string' ? person : person?.name ?? '').filter(Boolean).join(', ')
            }
            return value ?? ''
        }

        if (name === 'tags') {
            if (Array.isArray(value)) {
                return value.join(', ')
            }
            return value ?? ''
        }

        if (name === 'progress') {
            return value == null || value === '' ? null : Number(value)
        }

        if (name === 'dueDate' && value instanceof Date) {
            return DateUtil.convertToyyyymmdd(value)
        }

        const field = this.fieldMap.get(name);

        if (field instanceof NumberField) {
            return value == null || value === '' ? null : Number(value)
        }

        return value ?? ''
    }

    /**
     * @summary Computes the delta object between the form's current field values and the bound record
     * @returns {Object} Only the fields whose values changed
     */
    getChanges() {
        let me        = this,
            {record}  = me,
            changes   = {},
            laneField = me.board?.laneField || null;

        if (!record) {
            return changes
        }

        me.fieldMap.forEach((field, name) => {
            if (name === (me.board?.laneField || 'lane') && !laneField) {
                return
            }

            const
                currentRaw = field.value,
                initialRaw = me.initialValues[name];

            if (me.isSameFieldValue(currentRaw, initialRaw)) {
                return
            }

            const parsed = me.parseFieldValue(name, currentRaw, record[name]);

            if (!me.isSameRecordValue(parsed, record[name])) {
                changes[name] = parsed
            }
        });

        return changes
    }

    /**
     * @summary Returns the form field for `name`
     * @param {String} name
     * @returns {Neo.form.field.Base|null}
     */
    getField(name) {
        return this.fieldMap.get(name) || null
    }

    /**
     * @summary Returns the current value of the form field `name`
     * @param {String} name
     * @returns {*}
     */
    getFieldValue(name) {
        return this.getField(name)?.value
    }

    /**
     * @summary Builds the options list for the `lane` Select field from the board's columns and store
     * @param {Object|null} [record=this.record]
     * @returns {Object[]}
     */
    getLaneOptions(record=this.record) {
        let me        = this,
            {board}   = me,
            laneField = board?.laneField,
            seen      = new Map();

        if (!laneField) {
            return []
        }

        board.getColumnConfigs().forEach(config => {
            const lane = config.laneValue;
            if (lane != null && !seen.has(lane)) {
                seen.set(lane, {id: lane, name: String(lane)})
            }
        });

        board.store?.items.forEach(item => {
            const lane = item[laneField];
            if (lane != null && !seen.has(lane)) {
                seen.set(lane, {id: lane, name: String(lane)})
            }
        });

        if (record?.[laneField] != null && !seen.has(record[laneField])) {
            seen.set(record[laneField], {id: record[laneField], name: String(record[laneField])})
        }

        return [...seen.values()]
    }

    /**
     * @summary Builds the options list for the `status` Select field from the board's columns
     * @param {Object|null} [record=this.record]
     * @returns {Object[]}
     */
    getStatusOptions(record=this.record) {
        let me          = this,
            {board}     = me,
            statusField = board?.statusField || 'status',
            seen        = new Map();

        board?.getColumnConfigs().forEach(config => {
            if (config.status != null && !seen.has(config.status)) {
                seen.set(config.status, {id: config.status, name: String(config.title ?? config.status)})
            }
        });

        if (record?.[statusField] != null && !seen.has(record[statusField])) {
            seen.set(record[statusField], {id: record[statusField], name: String(record[statusField])})
        }

        return [...seen.values()]
    }

    /**
     * @summary Resolves the field name used by the active card's or board's `title` item
     * @returns {String}
     */
    getTitleField() {
        return getTitleField(this.card?.getCardItems?.() || this.board?.cardItems)
    }

    /**
     * @summary Compares two form-level values for equality
     * @param {*} a
     * @param {*} b
     * @returns {Boolean}
     */
    isSameFieldValue(a, b) {
        if (a === b) {
            return true
        }
        if ((a == null || a === '') && (b == null || b === '')) {
            return true
        }
        if (Array.isArray(a) && Array.isArray(b)) {
            return a.length === b.length && a.every((item, index) => item === b[index])
        }
        return false
    }

    /**
     * @summary Compares a parsed field value against the current record value
     * @param {*} nextValue
     * @param {*} prevValue
     * @returns {Boolean}
     */
    isSameRecordValue(nextValue, prevValue) {
        if (nextValue === prevValue) {
            return true
        }
        if ((nextValue == null || nextValue === '') && (prevValue == null || prevValue === '')) {
            return true
        }
        if (Array.isArray(nextValue) && Array.isArray(prevValue)) {
            return nextValue.length === prevValue.length && nextValue.every((item, index) => item === prevValue[index])
        }
        return false
    }

    /**
     * @summary Cancel button handler
     * @param {Object} data
     */
    onCancelButtonClick(data) {
        this.cancel()
    }

    /**
     * @summary Escape key handler: cancels without writing
     */
    onKeyDownEscape() {
        this.cancel()
    }

    /**
     * @summary Save button handler
     * @param {Object} data
     */
    onSaveButtonClick(data) {
        this.save()
    }

    /**
     * @summary Binds the editor to `card` (and `record`) and shows the dialog
     * @param {Neo.board.Card|null} card
     * @param {Object|null} [record=card?.record]
     * @returns {Neo.board.CardEditor}
     */
    openForCard(card, record=card?.record) {
        let me = this;

        me.card            = card || null;
        me.animateTargetId = card?.id || null;
        me.record          = record || null;
        me.syncFormFields(me.record);
        me.show();

        return me
    }

    /**
     * @summary Parses a form field's raw value back into the record's field shape
     * @param {String} name
     * @param {*} rawValue
     * @param {*} currentRecordValue
     * @returns {*}
     */
    parseFieldValue(name, rawValue, currentRecordValue) {
        if (name === 'assignees' || name === 'tags') {
            if (Array.isArray(rawValue)) {
                return [...rawValue]
            }
            if (rawValue == null || rawValue === '') {
                return []
            }
            return String(rawValue).split(',').map(part => part.trim()).filter(Boolean)
        }

        const field = this.fieldMap.get(name);

        if (name === 'progress' || field instanceof NumberField) {
            return rawValue === '' || rawValue == null ? null : Number(rawValue)
        }

        if (rawValue === '' && currentRecordValue === null) {
            return null
        }

        return rawValue
    }

    /**
     * @summary Diffs the form values against {@link #record} and commits in one write:
     * routes status or lane changes through `board.moveCard({record, status, lane, index: -1, fields: changed})`,
     * otherwise calls `record.set(changed)` once, and writes nothing when nothing changed.
     * @returns {Object|null} The committed changes, or null when nothing was written
     */
    save() {
        let me              = this,
            {board, record} = me,
            changes         = me.getChanges(),
            keys            = Object.keys(changes),
            statusField     = board?.statusField || 'status',
            laneField       = board?.laneField || null,
            lane, laneChanged, status, statusChanged;

        if (!record || !keys.length) {
            if (board && record) {
                me.card = board.getCard(record)
            }
            me.hide();
            return null
        }

        statusChanged = Object.hasOwn(changes, statusField) && changes[statusField] !== record[statusField];
        laneChanged   = Boolean(laneField && Object.hasOwn(changes, laneField) && changes[laneField] !== record[laneField]);

        if ((statusChanged || laneChanged) && board) {
            status = statusChanged ? changes[statusField] : record[statusField];
            lane   = laneField ? (laneChanged ? changes[laneField] : record[laneField]) : null;

            board.moveCard({
                record,
                status,
                lane,
                index : -1,
                fields: changes
            })
        } else {
            record.set(changes)
        }

        if (board) {
            me.card = board.getCard(record)
        }
        me.hide();

        return changes
    }

    /**
     * @summary Sets the value of form field `name`
     * @param {String} name
     * @param {*} value
     */
    setFieldValue(name, value) {
        const field = this.getField(name);

        if (field) {
            field.value = value
        }
    }

    /**
     * @summary Populates all form fields and option stores from `record` and records `initialValues`
     * @param {Object|null} record
     */
    syncFormFields(record) {
        let me          = this,
            {board}     = me,
            statusField = board?.statusField || 'status',
            laneField   = board?.laneField || 'lane',
            statusInput, laneInput;

        me.ensureModelFields();
        me.initialValues = {};

        statusInput = me.fieldMap.get(statusField);
        if (statusInput) {
            statusInput.options = me.getStatusOptions(record)
        }

        laneInput = me.fieldMap.get(laneField);
        laneInput?.set({
            hidden : !board?.laneField,
            options: me.getLaneOptions(record)
        });

        me.fieldMap.forEach((field, name) => {
            const formatted = record ? me.formatFieldValue(name, record[name]) : '';

            me.initialValues[name] = formatted;
            field.value            = formatted
        })
    }
}

export default Neo.setupClass(CardEditor);
