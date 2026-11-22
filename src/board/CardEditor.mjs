import Button          from '../button/Base.mjs';
import CheckBox        from '../form/field/CheckBox.mjs';
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
import {isDescriptor}  from '../core/ConfigSymbols.mjs';

/**
 * The model field types a Number field edits
 * @type {Set<String>}
 */
const numberTypes = new Set(['float', 'int', 'integer', 'number']);

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
 *
 * The form follows the board's model. A standard field (title, description, status, lane, assignees, tags, progress,
 * color, due date) is built when the model declares it and an edit can write it, the title and status always, and the
 * model's other writable fields follow under labels read from their names. A store with another model rebuilds the
 * form on the next open. {@link #fields} names the form's fields instead.
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
         * A map of field name -> labelText overrides. Defaults to the standard English labels for the nine standard
         * fields (`assignees`, `color`, `description`, `dueDate`, `lane`, `progress`, `status`, `tags`, `title`).
         * Merged shallowly so callers can pass `{status: 'Stage'}` without losing the others.
         * @example
         * {module: CardEditor, fieldLabels: {assignees: 'Recruiter', status: 'Stage', tags: 'Role', title: 'Name'}}
         * @member {Object} fieldLabels_
         * @reactive
         */
        fieldLabels_: {
            [isDescriptor]: true,
            merge         : 'shallow',
            value         : {
                assignees  : 'Assignees',
                color      : 'Color',
                description: 'Description',
                dueDate    : 'Due date',
                lane       : 'Lane',
                progress   : 'Progress',
                status     : 'Status',
                tags       : 'Tags',
                title      : 'Title'
            }
        },
        /**
         * The form's fields, in order. A name picks the standard field of that name, or the field the board's model
         * declares under it; an object is a field config of its own (`{module, name, labelText, ...}`). `null` builds
         * the standard fields the model declares, then the model's other fields. A board passes it through
         * `cardEditorConfig`.
         * @member {Array<String|Object>|null} fields=null
         */
        fields: null,
        /**
         * A compact form of card fields has no use for maximize: the header keeps its close action only.
         * @member {Object} headerConfig={actions: ['close']}
         */
        headerConfig: {actions: ['close']},
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
     * The model the form's fields were built for. A derived form whose board store brings another model is rebuilt
     * on the next {@link #syncFormFields}.
     * @member {Neo.data.Model|null} formModel=null
     */
    formModel = null
    /**
     * Snapshot of normalized initial field values when {@link #record} is bound, so untouched fields never report a
     * synthetic diff.
     * @member {Object} initialValues={}
     */
    initialValues = {}
    /**
     * The name of the standard lane field while the form holds it: the control that follows the board's swimlanes,
     * hidden and left out of the save while the board has none. A field that {@link #fields} supplies as a config of
     * its own is an ordinary field, whatever its name.
     * @member {String|null} laneControlName=null
     */
    laneControlName = null

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
     * @summary Updates existing form field labels in place when `fieldLabels` changes at runtime, preserving current
     * field values and the save comparison baseline
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     */
    afterSetFieldLabels(value, oldValue) {
        let me = this;

        if (oldValue !== undefined) {
            me.fieldMap.forEach((field, name) => {
                field.labelText = me.getFieldLabel(name)
            })
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
     * @summary Merges runtime `fieldLabels` updates shallowly over the current label map
     * @param {Object} value
     * @param {Object} oldValue
     * @returns {Object}
     * @protected
     */
    beforeSetFieldLabels(value, oldValue) {
        return oldValue ? {...oldValue, ...value} : value
    }

    /**
     * @summary Fills the form with its fields, {@link #getFieldConfigs} and then {@link #ensureModelFields}, for the
     * model of the board's current store. The fields of an earlier build retire first, with the date pickers they own.
     */
    buildFields() {
        let me     = this,
            {form} = me;

        me.fieldMap.forEach(field => {
            field.dateSelector?.destroy?.()
        });

        me.fieldMap.clear();
        form.removeAll(true);

        me.formModel = me.board?.store?.model || null;
        form.add(me.getFieldConfigs());

        form.items.forEach(field => {
            me.fieldMap.set(field.name, field)
        });

        me.ensureModelFields()
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
     * @summary Builds the form container, its fields ({@link #buildFields}) and the Save/Cancel footer
     */
    createForm() {
        let me                  = this,
            {appName, windowId} = me;

        me.form = Neo.create({
            module  : FormContainer,
            appName,
            cls     : ['neo-board-card-editor-form'],
            flex    : 1,
            id      : `${me.id}__form`,
            parentId: me.id,
            windowId
        });

        me.buildFields();

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
     * @summary The config of a form field for a field of the model: a Number field for number types, a Date field
     * for `Date`, a CheckBox for `Boolean` and a Text field for the rest, labelled from its name (`startDate` reads
     * "Start date").
     * @param {String} name
     * @param {Object|null} [fieldDef] The model's field definition, when the model declares the field
     * @returns {Object}
     */
    createModelFieldConfig(name, fieldDef) {
        let me      = this,
            rawType = String(fieldDef?.type || '').toLowerCase(),
            module  = numberTypes.has(rawType) ? NumberField : rawType === 'date' ? DateField : rawType === 'boolean' ? CheckBox : TextField,
            config  = {
                module,
                appName  : me.appName,
                id       : `${me.id}__field__${name}`,
                labelText: me.getFieldLabel(name),
                name,
                windowId : me.windowId
            };

        if (module === NumberField) {
            Object.assign(config, {clearable: false, disabledChars: null, useSpinButtons: false})
        } else if (module === DateField) {
            Object.assign(config, {clearable: false, triggers: []})
        } else if (module === TextField) {
            config.clearable = false
        }

        return me.labelOnTop(config)
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
     * @summary Adds a form field ({@link #createModelFieldConfig}) for each field of the board's model the form does
     * not hold yet: the key, the order field and calculated fields stay out. A form that {@link #fields} names takes
     * none.
     */
    ensureModelFields() {
        let me          = this,
            {board}     = me,
            modelFields = board?.store?.model?.fields || [],
            keyProperty = board?.store?.keyProperty || board?.store?.model?.keyProperty || 'id',
            orderField  = board?.orderField || 'order';

        if (me.fields) {
            return
        }

        modelFields.forEach(fieldDef => {
            const name = fieldDef?.name;

            if (!name || name === keyProperty || name === orderField || fieldDef.calculate || me.fieldMap.has(name)) {
                return
            }

            const field = me.form.add(me.createModelFieldConfig(name, fieldDef));
            me.fieldMap.set(name, field)
        })
    }

    /**
     * @summary Converts a record field value into the representation stored on its form field. A `Date` becomes the
     * `yyyy-mm-dd` a Date field holds, so a date the user leaves alone compares equal and writes nothing.
     * @param {String} name
     * @param {*} value
     * @returns {*}
     */
    formatFieldValue(name, value) {
        const field = this.fieldMap.get(name);

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

        if (value instanceof Date && (name === 'dueDate' || field instanceof DateField)) {
            return DateUtil.convertToyyyymmdd(value)
        }

        if (field instanceof NumberField) {
            return value == null || value === '' ? null : Number(value)
        }

        if (field instanceof CheckBox) {
            return Boolean(value)
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
            if (name === me.laneControlName && !laneField) {
                return
            }

            const
                currentRaw = me.getFieldValue(name),
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
     * @summary The configs of the form's fields, in order: {@link #fields} when set, otherwise the standard fields
     * ({@link #getStandardFieldConfigs}) the board's model declares and lets an edit write, calculated ones staying
     * out. The title and status fields are always built, and a model that declares no fields keeps every standard
     * field. Records {@link #laneControlName}: the standard lane field is the lane control, a config of the same name
     * is not.
     * @returns {Object[]}
     */
    getFieldConfigs() {
        let me          = this,
            {board}     = me,
            model       = board?.store?.model,
            declared    = model?.fieldsMap?.size ? model.fieldsMap : null,
            standard    = me.getStandardFieldConfigs(),
            laneControl = standard.find(config => config.name === (board?.laneField || 'lane')),
            alwaysBuilt = [me.getTitleField(), board?.statusField || 'status'],
            configs;

        if (me.fields) {
            configs = me.fields.map(entry => Neo.isString(entry)
                ? standard.find(config => config.name === entry) || me.createModelFieldConfig(entry, model?.getField(entry))
                : {id: `${me.id}__field__${entry.name}`, ...entry})
        } else {
            configs = standard.filter(({name}) => !declared || alwaysBuilt.includes(name) || declared.has(name) && !declared.get(name).calculate)
        }

        me.laneControlName = configs.includes(laneControl) ? laneControl.name : null;

        return configs.map(config => me.labelOnTop(config))
    }

    /**
     * @summary Resolves the `labelText` for `name` from {@link #fieldLabels}, falling back to the role key for custom
     * `title`, `status` or `lane` fields and to the decamelized field name for model-derived fields
     * @param {String} name
     * @returns {String}
     */
    getFieldLabel(name) {
        let me          = this,
            labels      = me.fieldLabels,
            titleField  = me.getTitleField(),
            statusField = me.board?.statusField || 'status',
            laneField   = me.board?.laneField || 'lane';

        if (name === titleField) {
            return labels[titleField] ?? labels.title
        }
        if (name === statusField) {
            return labels[statusField] ?? labels.status
        }
        if (name === laneField) {
            return labels[laneField] ?? labels.lane
        }

        return labels[name] ?? Neo.capitalize(Neo.decamel(name).replace(/-/g, ' '))
    }

    /**
     * @summary Returns the current value of the form field `name`; a CheckBox answers whether it is checked
     * @param {String} name
     * @returns {*}
     */
    getFieldValue(name) {
        const field = this.getField(name);

        return field instanceof CheckBox ? field.checked : field?.value
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
     * @summary The configs of the standard fields, in form order: the title, description, status, lane, assignees,
     * tags, progress, color and due date of `Neo.board.CardModel`, the title, status and lane under the names the board
     * reads
     * @returns {Object[]}
     */
    getStandardFieldConfigs() {
        let me          = this,
            labels      = me.fieldLabels,
            titleField  = me.getTitleField(),
            statusField = me.board?.statusField || 'status',
            laneField   = me.board?.laneField || 'lane';

        return [
            {
                module   : TextField,
                clearable: false,
                id       : `${me.id}__field__${titleField}`,
                labelText: labels[titleField] ?? labels.title,
                name     : titleField
            },
            {
                module   : TextAreaField,
                clearable: false,
                id       : `${me.id}__field__description`,
                labelText: labels.description,
                name     : 'description'
            },
            {
                module      : SelectField,
                displayField: 'name',
                id          : `${me.id}__field__${statusField}`,
                labelText   : labels[statusField] ?? labels.status,
                name        : statusField,
                options     : me.getStatusOptions(me.record),
                valueField  : 'id'
            },
            {
                module      : SelectField,
                displayField: 'name',
                hidden      : !me.board?.laneField,
                id          : `${me.id}__field__${laneField}`,
                labelText   : labels[laneField] ?? labels.lane,
                name        : laneField,
                options     : me.getLaneOptions(me.record),
                valueField  : 'id'
            },
            {
                module   : TextField,
                clearable: false,
                id       : `${me.id}__field__assignees`,
                labelText: labels.assignees,
                name     : 'assignees'
            },
            {
                module   : TextField,
                clearable: false,
                id       : `${me.id}__field__tags`,
                labelText: labels.tags,
                name     : 'tags'
            },
            {
                module        : NumberField,
                clearable     : false,
                disabledChars : null,
                id            : `${me.id}__field__progress`,
                labelText     : labels.progress,
                maxValue      : 100,
                minValue      : 0,
                name          : 'progress',
                useSpinButtons: false
            },
            {
                module   : TextField,
                clearable: false,
                id       : `${me.id}__field__color`,
                labelText: labels.color,
                name     : 'color'
            },
            {
                module   : DateField,
                clearable: false,
                id       : `${me.id}__field__dueDate`,
                labelText: labels.dueDate,
                name     : 'dueDate',
                triggers : []
            }
        ]
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
     * @summary A text-like field's config with its label on top, where the native status select draws its own. A
     * config that names its `labelPosition` keeps it. The test reads the prototype chain: `instanceof` against a Neo
     * class does not answer for a prototype.
     * @param {Object} config
     * @returns {Object}
     * @protected
     */
    labelOnTop(config) {
        const proto = config.module?.prototype;

        return proto && (proto === TextField.prototype || TextField.prototype.isPrototypeOf(proto)) ? {labelPosition: 'top', ...config} : config
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

        if (field instanceof CheckBox) {
            return Boolean(rawValue)
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
     * @description A reload or a replacement store can retire {@link #record} while the editor is open. Save then
     * writes nothing: the editor rebinds to the board's current Record of the same key and stays open with its values,
     * or hides when the key is gone, and the board announces either outcome.
     * @returns {Object|null} The committed changes, or null when nothing was written
     */
    save() {
        let me              = this,
            {board, record} = me,
            current         = board && record ? (board.store && board.getSourceRecord(board.getKey(record))) || null : record,
            changes, keys, lane, laneChanged, laneField, status, statusChanged, statusField;

        if (current !== record) {
            board.announce(current ? 'The card changed before it was saved, so nothing was saved' : 'The card is gone, so nothing was saved');

            if (current) {
                me.card   = board.getCard(current);
                me.record = current
            } else {
                me.hide()
            }

            return null
        }

        changes     = me.getChanges();
        keys        = Object.keys(changes);
        statusField = board?.statusField || 'status';
        laneField   = board?.laneField || null;

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
     * @summary Sets the value of form field `name`; a CheckBox is checked for a truthy value
     * @param {String} name
     * @param {*} value
     */
    setFieldValue(name, value) {
        const field = this.getField(name);

        if (field instanceof CheckBox) {
            field.checked = Boolean(value)
        } else if (field) {
            field.value = value
        }
    }

    /**
     * @summary Populates all form fields and option stores from `record` and records `initialValues`. A derived form
     * whose board store brings another model than the one it was built for is rebuilt first ({@link #buildFields}); a
     * form that {@link #fields} names keeps its fields.
     * @param {Object|null} record
     */
    syncFormFields(record) {
        let me          = this,
            {board}     = me,
            statusField = board?.statusField || 'status',
            statusInput, laneInput;

        if (!me.fields && me.formModel !== (board?.store?.model || null)) {
            me.buildFields()
        }

        me.ensureModelFields();
        me.initialValues = {};

        statusInput = me.fieldMap.get(statusField);
        if (statusInput) {
            statusInput.options = me.getStatusOptions(record)
        }

        laneInput = me.laneControlName && me.fieldMap.get(me.laneControlName);
        laneInput?.set({
            hidden : !board?.laneField,
            options: me.getLaneOptions(record)
        });

        me.fieldMap.forEach((field, name) => {
            const formatted = record ? me.formatFieldValue(name, record[name]) : '';

            me.initialValues[name] = formatted;
            me.setFieldValue(name, formatted)
        })
    }
}

export default Neo.setupClass(CardEditor);
