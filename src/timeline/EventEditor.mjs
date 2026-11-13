import Button        from '../button/Base.mjs';
import Dialog        from '../dialog/Base.mjs';
import FormContainer from '../form/Container.mjs';
import NumberField   from '../form/field/Number.mjs';
import SelectField   from '../form/field/Select.mjs';
import TextField     from '../form/field/Text.mjs';
import Toolbar       from '../toolbar/Base.mjs';
import TimeAxis      from './TimeAxis.mjs';

/**
 * @summary Reusable modal editor for a timeline record.
 * @description Validates and diffs the form before calling an optional owner `commitTimelineEdit` hook;
 * otherwise it applies the changes to the record. The hook may return `false` or
 * `{status: 'refused', message}` to retain the draft and show an error.
 *
 * @class Neo.timeline.EventEditor
 * @extends Neo.dialog.Base
 */
class EventEditor extends Dialog {
    static config = {
        /**
         * @member {String} className='Neo.timeline.EventEditor'
         * @protected
         */
        className: 'Neo.timeline.EventEditor',
        /**
         * @member {String} ntype='timeline-event-editor'
         * @protected
         */
        ntype: 'timeline-event-editor',
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
         * Optional DOM id of the `.neo-timeline-bar` element this editor was opened from.
         * @member {String|null} barId_=null
         * @reactive
         */
        barId_: null,
        /**
         * @member {String[]} baseCls=['neo-timeline-event-editor','neo-dialog','neo-panel','neo-container']
         * @protected
         */
        baseCls: ['neo-timeline-event-editor', 'neo-dialog', 'neo-panel', 'neo-container'],
        /**
         * Reuse the dialog across events/tasks on the owning timeline container.
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
         * The owner may provide `commitTimelineEdit(record, changes, metadata)`.
         * @member {Neo.component.Base|null} owner=null
         */
        owner: null,
        /**
         * The event or task record currently bound to the editor form.
         * @member {Neo.data.Model|Object|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * @member {Boolean} resizable=false
         */
        resizable: false,
        /**
         * Whether to display the `resourceId` selector field.
         * @member {Boolean} showResourceField_=true
         * @reactive
         */
        showResourceField_: true,
        /**
         * @member {String} title='Edit event'
         */
        title: 'Edit event',
        /**
         * @member {Boolean} trapFocus=true
         */
        trapFocus: true
    }

    /**
     * Map of field name -> `Neo.form.field.Base` instance inside {@link #form}.
     * @member {Map<String, Neo.form.field.Base>} fieldMap=new Map()
     */
    fieldMap = new Map()

    /**
     * The footer toolbar holding Cancel and Save buttons.
     * @member {Neo.toolbar.Base|null} footerToolbar=null
     */
    footerToolbar = null

    /**
     * The inner form container.
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
     * @summary Resolves the component context for `animateShow` / `animateHide`, falling back to {@link #owner}
     * when `animateTargetId` points at a plain `.neo-timeline-bar` VDOM node inside a grid row.
     * @returns {Neo.component.Base|null}
     */
    get animateTarget() {
        return Neo.getComponent(this.animateTargetId) || this.owner || this
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        const me = this;

        me.createForm();
        me.record && me.syncFormFields(me.record)
    }

    /**
     * @summary Synchronizes `animateTargetId` when `barId` changes.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetBarId(value, oldValue) {
        this.animateTargetId = value || null
    }

    /**
     * @summary Populates the form fields whenever `record` changes.
     * @param {Neo.data.Model|Object|null} value
     * @param {Neo.data.Model|Object|null} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        this.form && this.syncFormFields(value)
    }

    /**
     * @summary Updates visibility of the `resourceId` field when `showResourceField` changes.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetShowResourceField(value, oldValue) {
        const resField = this.fieldMap.get('resourceId');
        if (resField) {
            resField.hidden = !this.shouldShowResourceField()
        }
    }

    /**
     * @summary Discards any unsaved edits, clears validation errors, and hides the dialog without writing to the record.
     */
    cancel() {
        const me = this;

        me.clearErrors();
        me.record && me.syncFormFields(me.record);
        me.hide()
    }

    /**
     * @summary Clears any active validation error states across the editor's form fields.
     */
    clearErrors() {
        this.fieldMap.forEach(field => {
            if (field?.error) {
                field.error = null
            }
        })
    }

    /**
     * @summary Builds the inner `Neo.form.Container`, standard timeline fields (`title`, `startDate`, `endDate`,
     * `percentDone`, `resourceId`), and the Cancel/Save footer toolbar.
     */
    createForm() {
        const
            me                  = this,
            {appName, windowId} = me,
            titleField          = me.getTitleField(),
            startDateField      = me.getStartDateField(),
            endDateField        = me.getEndDateField(),
            percentDoneField    = me.getPercentDoneField(),
            standardFields      = [
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__${titleField}`,
                    labelText: 'Title',
                    name     : titleField,
                    required : true
                },
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__${startDateField}`,
                    labelText: 'Start date',
                    name     : startDateField,
                    required : true
                },
                {
                    module   : TextField,
                    clearable: false,
                    id       : `${me.id}__field__${endDateField}`,
                    labelText: 'End date',
                    name     : endDateField,
                    required : true
                },
                {
                    module        : NumberField,
                    clearable     : false,
                    disabledChars : null,
                    id            : `${me.id}__field__${percentDoneField}`,
                    labelText     : 'Progress (%)',
                    maxValue      : 100,
                    minValue      : 0,
                    name          : percentDoneField,
                    useSpinButtons: false
                },
                {
                    module      : SelectField,
                    displayField: 'name',
                    hidden      : !me.shouldShowResourceField(),
                    id          : `${me.id}__field__resourceId`,
                    labelText   : 'Resource',
                    name        : 'resourceId',
                    options     : me.getResourceOptions(me.record),
                    valueField  : 'id'
                }
            ];

        me.form = Neo.create({
            module  : FormContainer,
            appName,
            cls     : ['neo-timeline-event-editor-form'],
            flex    : 1,
            id      : `${me.id}__form`,
            items   : standardFields,
            parentId: me.id,
            windowId
        });

        me.form.items.forEach(field => {
            me.fieldMap.set(field.name, field)
        });

        // Register canonical aliases when owner field names are customized
        me.fieldMap.set('title',       me.fieldMap.get(titleField));
        me.fieldMap.set('startDate',   me.fieldMap.get(startDateField));
        me.fieldMap.set('endDate',     me.fieldMap.get(endDateField));
        me.fieldMap.set('percentDone', me.fieldMap.get(percentDoneField));

        me.footerToolbar = Neo.create({
            module  : Toolbar,
            appName,
            cls     : ['neo-timeline-event-editor-footer', 'neo-toolbar'],
            dock    : 'bottom',
            flex    : 'none',
            id      : `${me.id}__footer`,
            parentId: me.id,
            windowId,
            items   : [{
                module      : Button,
                cls         : ['neo-timeline-event-editor-cancel'],
                handler     : 'onCancelButtonClick',
                handlerScope: me,
                id          : `${me.id}__cancel`,
                text        : 'Cancel'
            }, {
                module      : Button,
                cls         : ['neo-timeline-event-editor-save'],
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
     * @summary Cleans up `fieldMap` on teardown.
     * @param {...*} args
     */
    destroy(...args) {
        this.fieldMap.clear();
        super.destroy(...args)
    }

    /**
     * @summary Formats a valid `Date` instance in the owner's timeline clock as `'YYYY-MM-DDTHH:mm'`
     * (or `'YYYY-MM-DDTHH:mm:ss'` when seconds are non-zero).
     * @param {Date} date
     * @returns {String}
     */
    formatLocalDateTime(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            return ''
        }

        const wall = (this.owner?.timeAxis || TimeAxis).wallTime(date);
        return wall.toISOString().slice(0, wall.getUTCSeconds() ? 19 : 16)
    }

    /**
     * @summary Converts a record field value into the representation stored on its form field.
     * @param {String} name
     * @param {*} value
     * @returns {*}
     */
    formatFieldValue(name, value) {
        const
            me               = this,
            startDateField   = me.getStartDateField(),
            endDateField     = me.getEndDateField(),
            percentDoneField = me.getPercentDoneField();

        if (name === startDateField || name === endDateField || name === 'startDate' || name === 'endDate') {
            if (value instanceof Date) {
                return me.formatLocalDateTime(value)
            }
            return value == null ? '' : String(value)
        }

        if (name === percentDoneField || name === 'percentDone') {
            return value == null || value === '' ? 0 : Number(value)
        }

        const field = me.fieldMap.get(name);

        if (field instanceof NumberField) {
            return value == null || value === '' ? null : Number(value)
        }

        return value ?? ''
    }

    /**
     * @summary Computes the delta object between the form's current field values and the bound record.
     * @param {Object} [parsedDates={}]
     * @param {Date} [parsedDates.startDate]
     * @param {Date} [parsedDates.endDate]
     * @returns {Object} Only the fields whose values changed
     */
    getChanges({startDate, endDate}={}) {
        const
            me               = this,
            {record}         = me,
            changes          = {},
            titleField       = me.getTitleField(),
            startDateField   = me.getStartDateField(),
            endDateField     = me.getEndDateField(),
            percentDoneField = me.getPercentDoneField();

        if (!record) {
            return changes
        }

        const
            titleInput = me.getField(titleField),
            startInput = me.getField(startDateField),
            endInput   = me.getField(endDateField),
            pctInput   = me.getField(percentDoneField),
            resInput   = me.getField('resourceId');

        if (titleInput && !me.isSameFieldValue(titleInput.value, me.initialValues[titleField])) {
            const nextTitle = titleInput.value == null ? '' : String(titleInput.value);
            if (nextTitle !== (record[titleField] ?? '')) {
                changes[titleField] = nextTitle
            }
        }

        if (startInput && !me.isSameFieldValue(startInput.value, me.initialValues[startDateField])) {
            const
                nextStart   = startDate instanceof Date ? startDate : me.parseDateValue(startInput.value),
                rawPrev     = record[startDateField],
                prevStartMs = rawPrev instanceof Date ? rawPrev.getTime() : new Date(rawPrev).getTime();

            if (nextStart && !Number.isNaN(nextStart.getTime()) && nextStart.getTime() !== prevStartMs) {
                changes[startDateField] = nextStart
            }
        }

        if (endInput && !me.isSameFieldValue(endInput.value, me.initialValues[endDateField])) {
            const
                nextEnd   = endDate instanceof Date ? endDate : me.parseDateValue(endInput.value),
                rawPrev   = record[endDateField],
                prevEndMs = rawPrev instanceof Date ? rawPrev.getTime() : new Date(rawPrev).getTime();

            if (nextEnd && !Number.isNaN(nextEnd.getTime()) && nextEnd.getTime() !== prevEndMs) {
                changes[endDateField] = nextEnd
            }
        }

        if (pctInput && !me.isSameFieldValue(pctInput.value, me.initialValues[percentDoneField])) {
            const
                rawPct  = pctInput.value,
                nextPct = rawPct === '' || rawPct == null ? 0 : Math.min(100, Math.max(0, Number(rawPct) || 0)),
                prevPct = record[percentDoneField] ?? 0;

            if (nextPct !== prevPct) {
                changes[percentDoneField] = nextPct
            }
        }

        if (resInput && me.shouldShowResourceField() && !me.isSameFieldValue(resInput.value, me.initialValues.resourceId)) {
            const
                nextRes = resInput.value,
                prevRes = record.resourceId;

            if (nextRes !== undefined && String(nextRes ?? '') !== String(prevRes ?? '')) {
                changes.resourceId = nextRes
            }
        }

        return changes
    }

    /**
     * @summary Resolves the `endDateField` name from {@link #owner}.
     * @returns {String}
     */
    getEndDateField() {
        return this.owner?.endDateField || 'endDate'
    }

    /**
     * @summary Returns the form field for `name`.
     * @param {String} name
     * @returns {Neo.form.field.Base|null}
     */
    getField(name) {
        return this.fieldMap.get(name) || null
    }

    /**
     * @summary Returns the current value of the form field `name`.
     * @param {String} name
     * @returns {*}
     */
    getFieldValue(name) {
        return this.getField(name)?.value
    }

    /**
     * @summary Returns a snapshot object of all current form field values keyed by canonical and configured names.
     * @returns {Object}
     */
    getFieldValues() {
        const
            me               = this,
            titleField       = me.getTitleField(),
            startDateField   = me.getStartDateField(),
            endDateField     = me.getEndDateField(),
            percentDoneField = me.getPercentDoneField(),
            values           = {
                [titleField]      : me.getFieldValue(titleField),
                [startDateField]  : me.getFieldValue(startDateField),
                [endDateField]    : me.getFieldValue(endDateField),
                [percentDoneField]: me.getFieldValue(percentDoneField),
                title             : me.getFieldValue(titleField),
                startDate         : me.getFieldValue(startDateField),
                endDate           : me.getFieldValue(endDateField),
                percentDone       : me.getFieldValue(percentDoneField)
            };

        if (me.shouldShowResourceField()) {
            values.resourceId = me.getFieldValue('resourceId')
        }

        return values
    }

    /**
     * @summary Resolves the `percentDoneField` name from {@link #owner}.
     * @returns {String}
     */
    getPercentDoneField() {
        return this.owner?.percentDoneField || 'percentDone'
    }

    /**
     * @summary Builds the `{id, name}` options list for the `resourceId` SelectField from `owner.store`.
     * @param {Neo.data.Model|Object|null} [record=this.record]
     * @returns {Array<{id: *, name: String}>}
     */
    getResourceOptions(record=this.record) {
        const
            me    = this,
            owner = me.owner,
            seen  = new Map();

        if (!me.shouldShowResourceField()) {
            return []
        }

        const
            resKeyField = owner?.resourceIdField || 'id',
            items       = owner?.store?.items || [];

        items.forEach(item => {
            const
                id   = owner?.timelineColumn?.getResourceId?.(item) ?? item?.[resKeyField] ?? item?.id,
                name = item?.name ?? item?.title ?? (id != null ? String(id) : '');

            if (id != null && !seen.has(id)) {
                seen.set(id, {id, name: String(name)})
            }
        });

        if (record?.resourceId != null && !seen.has(record.resourceId)) {
            seen.set(record.resourceId, {id: record.resourceId, name: String(record.resourceId)})
        }

        return [...seen.values()]
    }

    /**
     * @summary Resolves the `startDateField` name from {@link #owner}.
     * @returns {String}
     */
    getStartDateField() {
        return this.owner?.startDateField || 'startDate'
    }

    /**
     * @summary Resolves the `titleField` name from {@link #owner}.
     * @returns {String}
     */
    getTitleField() {
        return this.owner?.titleField || 'title'
    }

    /**
     * @summary Compares two form-level values for equality.
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
        if (a instanceof Date && b instanceof Date) {
            return a.getTime() === b.getTime()
        }
        return false
    }

    /**
     * @summary Cancel button handler.
     * @param {Object} data
     */
    onCancelButtonClick(data) {
        this.cancel()
    }

    /**
     * @summary Escape key handler: cancels without writing to the bound record.
     */
    onKeyDownEscape() {
        this.cancel()
    }

    /**
     * @summary Save button handler.
     * @param {Object} data
     */
    onSaveButtonClick(data) {
        this.save()
    }

    /**
     * @summary Binds the editor to `record` (and optional rendered `barId`) and shows the dialog.
     * @param {Neo.data.Model|Object|null} record
     * @param {String|null} [barId=null]
     * @returns {Neo.timeline.EventEditor}
     */
    openForRecord(record, barId=null) {
        const me = this;

        me.barId           = barId || null;
        me.animateTargetId = barId || null;
        me.record          = record || null;
        me.clearErrors();
        me.syncFormFields(me.record);
        me.show();

        return me
    }

    /**
     * @summary Parses a date field value (`Date`, timestamp, `'YYYY-MM-DD'` local day key, local `'YYYY-MM-DDTHH:mm(:ss)'`
     * string, or explicit-offset/UTC ISO datetime string) into a `Date` instance.
     * @param {Date|String|Number|null} rawValue
     * @returns {Date}
     */
    parseDateValue(rawValue) {
        if (rawValue instanceof Date) {
            return new Date(rawValue.getTime())
        }
        if (typeof rawValue === 'number') {
            return new Date(rawValue)
        }
        if (typeof rawValue === 'string') {
            const trimmed = rawValue.trim();
            if (!trimmed) {
                return new Date(NaN)
            }
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
                return (this.owner?.timeAxis || TimeAxis).parseDayKey(trimmed)
            }
            const localMatch = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(trimmed);
            if (localMatch) {
                const axis = this.owner?.timeAxis;
                if (axis) {
                    return axis.fromWallTime(new Date(trimmed.replace(' ', 'T') + 'Z'))
                }
                return new Date(
                    Number(localMatch[1]),
                    Number(localMatch[2]) - 1,
                    Number(localMatch[3]),
                    Number(localMatch[4]),
                    Number(localMatch[5]),
                    Number(localMatch[6] || 0),
                    Number((localMatch[7] || '0').padEnd(3, '0'))
                )
            }
            return new Date(trimmed)
        }
        return new Date(NaN)
    }

    /**
     * @summary Validates and commits changed fields through the owner hook or the record.
     * @returns {Object|Boolean|null}
     */
    save() {
        const
            me              = this,
            {owner, record} = me,
            startDateField  = me.getStartDateField(),
            endDateField    = me.getEndDateField(),
            startInput      = me.getField(startDateField),
            endInput        = me.getField(endDateField);

        if (!record) {
            me.hide();
            return null
        }

        const
            startDate = me.parseDateValue(startInput?.value),
            endDate   = me.parseDateValue(endInput?.value);

        if (!startDate || Number.isNaN(startDate.getTime())) {
            if (startInput) {
                startInput.error = 'Invalid start date'
            }
            return false
        }

        if (!endDate || Number.isNaN(endDate.getTime())) {
            if (endInput) {
                endInput.error = 'Invalid end date'
            }
            return false
        }

        if (endDate.getTime() < startDate.getTime()) {
            if (endInput) {
                endInput.error = 'End date must not precede start date'
            }
            return false
        }

        me.clearErrors();

        const
            changes = me.getChanges({startDate, endDate}),
            keys    = Object.keys(changes);

        if (!keys.length) {
            me.hide();
            return null
        }

        let result;
        if (typeof owner?.commitTimelineEdit === 'function') {
            result = owner.commitTimelineEdit(record, changes, {source: 'editor'});
            if (result === false || result?.status === 'refused') {
                const field = me.getField(keys[0]);
                if (field) field.error = result?.message || 'The edit could not be saved.';
                return false
            }
        } else {
            record.set(changes)
        }

        me.hide();

        return result ?? changes
    }

    /**
     * @summary Sets the value of form field `name`.
     * @param {String} name
     * @param {*} value
     */
    setFieldValue(name, value) {
        const
            me    = this,
            field = me.getField(name);

        if (field) {
            if (
                (name === 'startDate' || name === 'endDate' || name === me.getStartDateField() || name === me.getEndDateField()) &&
                value instanceof Date
            ) {
                field.value = me.formatLocalDateTime(value)
            } else {
                field.value = value
            }
        }
    }

    /**
     * @summary Batch-updates multiple form field values from an object map.
     * @param {Object} [values={}]
     * @returns {Neo.timeline.EventEditor}
     */
    setFieldValues(values={}) {
        if (values && typeof values === 'object') {
            for (const [name, value] of Object.entries(values)) {
                this.setFieldValue(name, value)
            }
        }
        return this
    }

    /**
     * @summary Returns whether the resource selector is enabled.
     * @returns {Boolean}
     */
    shouldShowResourceField() {
        return Boolean(this.showResourceField)
    }

    /**
     * @summary Populates all form fields and option stores from `record` and records `initialValues`.
     * @param {Neo.data.Model|Object|null} record
     */
    syncFormFields(record) {
        const
            me               = this,
            titleField       = me.getTitleField(),
            startDateField   = me.getStartDateField(),
            endDateField     = me.getEndDateField(),
            percentDoneField = me.getPercentDoneField(),
            resInput         = me.fieldMap.get('resourceId');

        me.initialValues = {};

        // Ensure canonical aliases stay mapped to the owner's configured field names
        me.fieldMap.set('title',       me.fieldMap.get(titleField)       || me.fieldMap.get('title'));
        me.fieldMap.set('startDate',   me.fieldMap.get(startDateField)   || me.fieldMap.get('startDate'));
        me.fieldMap.set('endDate',     me.fieldMap.get(endDateField)     || me.fieldMap.get('endDate'));
        me.fieldMap.set('percentDone', me.fieldMap.get(percentDoneField) || me.fieldMap.get('percentDone'));

        if (resInput) {
            resInput.set({
                hidden : !me.shouldShowResourceField(),
                options: me.getResourceOptions(record)
            })
        }

        const uniqueFields = new Set(me.form?.items || []);

        uniqueFields.forEach(field => {
            const
                name      = field.name,
                rawValue  = record ? record[name] : null,
                formatted = record ? me.formatFieldValue(name, rawValue) : '';

            me.initialValues[name] = formatted;
            field.value            = formatted
        });

        me.initialValues.title       = me.initialValues[titleField];
        me.initialValues.startDate   = me.initialValues[startDateField];
        me.initialValues.endDate     = me.initialValues[endDateField];
        me.initialValues.percentDone = me.initialValues[percentDoneField]
    }
}

export default Neo.setupClass(EventEditor);
