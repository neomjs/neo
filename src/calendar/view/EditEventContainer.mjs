import Button        from '../../button/Base.mjs';
import CalendarStore from '../store/Calendars.mjs';
import CheckBox      from '../../form/field/CheckBox.mjs';
import ColorField    from '../../form/field/Color.mjs';
import DateUtil      from '../../util/Date.mjs';
import FormContainer from '../../form/Container.mjs';
import TextField     from '../../form/field/Text.mjs';
import TimeField     from '../../form/field/Time.mjs';

/**
 * @summary Inline floating editor form for calendar event title, calendar, all-day flag, and start/end times.
 * @class Neo.calendar.view.EditEventContainer
 * @extends Neo.form.Container
 */
class EditEventContainer extends FormContainer {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.EditEventContainer'
         * @protected
         */
        className: 'Neo.calendar.view.EditEventContainer',
        /**
         * @member {String[]} baseCls=['neo-calendar-edit-event-container']
         */
        baseCls: ['neo-calendar-edit-event-container'],
        /**
         * @member {Object} bind
         */
        bind: {
            endTime             : data => data.endTime,
            intlFormat_time     : data => data.timeFormatter,
            minimumEventDuration: data => data.minimumEventDuration,
            startTime           : data => data.startTime
        },
        /**
         * @member {Object|null} allDayFieldConfig=null
         */
        allDayFieldConfig: null,
        /**
         * @member {Object|null} calendarFieldConfig=null
         */
        calendarFieldConfig: null,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} endTime_='24:00'
         * @reactive
         */
        endTime_: '24:00',
        /**
         * @member {Object|null} endTimeFieldConfig=null
         */
        endTimeFieldConfig: null,
        /**
         * Bound to the state provider.
         * @member {Intl.DateTimeFormat|null} intlFormat_time=null
         * @protected
         */
        intlFormat_time: null,
        /**
         * @member {Neo.calendar.view.week.Component|null} owner=null
         */
        owner: null,
        /**
         * @member {Neo.calendar.model.Event|null} record_=null
         * @reactive
         */
        record_: null,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} startTime_='00:00'
         * @reactive
         */
        startTime_: '00:00',
        /**
         * @member {Object|null} startTimeFieldConfig=null
         */
        startTimeFieldConfig: null,
        /**
         * @member {Object|null} titleFieldConfig=null
         */
        titleFieldConfig: null
    }

    /**
     * Monotonic counter cancelling stale {@link #onFocusLeave} delayed unmount callbacks when the editor re-opens.
     * @member {Number} #focusLeaveGeneration=0
     * @private
     */
    #focusLeaveGeneration = 0
    /**
     * Suppresses record writes from field `change` listeners while {@link #syncRecordFields} populates a new record.
     * @member {Boolean} #isSyncingRecord=false
     * @private
     */
    #isSyncingRecord = false

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        // focus trap, see: https://github.com/neomjs/neo/issues/2306
        this.vdom.tabIndex = -1
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (value) {
            this.#focusLeaveGeneration++;
            this.down({name: 'title'})?.focus()
        }
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.calendar.model.Event} value
     * @param {Neo.calendar.model.Event} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (value) {
            this.#focusLeaveGeneration++;

            if (oldValue) {
                this.syncRecordFields(value)
            } else {
                this.createItems()
            }
        }
    }

    /**
     * @summary Synchronously populates form fields from `record` without clobbering `CheckBox#value` or mutating `record` via `change` listeners.
     * @param {Neo.calendar.model.Event} record
     * @protected
     */
    syncRecordFields(record) {
        let me            = this,
            allDay        = Boolean(record.allDay),
            timeFormat    = me.intlFormat_time,
            allDayField   = me.down({name: 'allDay'}),
            calendarField = me.down({name: 'calendarId'}),
            endField      = me.down({name: 'endTime'}),
            startField    = me.down({name: 'startTime'}),
            titleField    = me.down({name: 'title'});

        me.#isSyncingRecord = true;

        try {
            if (titleField) {
                titleField.reset(record.title)
            }

            if (calendarField) {
                calendarField.reset(record.calendarId)
            }

            if (allDayField) {
                allDayField.checked = allDay
            }

            if (startField) {
                startField.hidden   = allDay;
                startField.maxValue = me.getStartTimeMaxValue(record);
                startField.reset(timeFormat.format(record.startDate))
            }

            if (endField) {
                endField.hidden   = allDay;
                endField.minValue = me.getEndTimeMinValue(record);
                endField.reset(timeFormat.format(record.endDate))
            }
        } finally {
            me.#isSyncingRecord = false
        }
    }

    /**
     *
     */
    createItems() {
        let me                = this,
            {record}          = me,
            timeFormat        = me.intlFormat_time,
            timeFieldDefaults = {
                module              : TimeField,
                clearToOriginalValue: true,
                flex                : 'none',
                labelPosition       : 'inline',
                listeners           : {change: me.onTimeFieldChange, scope: me},
                stepSize            : 15 * 60,
                width               : '9em'
            };

        if (record) {
            me.items = [{
                module              : TextField,
                clearToOriginalValue: true,
                flex                : 'none',
                labelPosition       : 'inline',
                labelText           : 'Title',
                listeners           : {change: me.onTitleFieldChange, scope: me},
                name                : 'title',
                required            : true,
                value               : record.title,
                ...me.titleFieldConfig
            }, {
                module              : ColorField,
                clearToOriginalValue: true,
                colorField          : 'color',
                displayField        : 'name',
                flex                : 'none',
                forceSelection      : true,
                labelPosition       : 'inline',
                labelText           : 'Calendar',
                listeners           : {change: me.onCalendarFieldChange, scope: me},
                name                : 'calendarId',
                required            : true,
                triggerAction       : 'all',
                value               : record.calendarId,

                colorFormatter: (scope,data) => {
                    let value = data[scope.colorField];

                    if (value === 'yellow') {
                        return 'var(--neo-event-yellow-border-color)';
                    }

                    return `var(--neo-event-${value}-color)`
                },

                store: {
                    module  : CalendarStore,
                    sourceId: me.stateProvider.getStore('calendars').id
                },

                ...me.calendarFieldConfig
            }, {
                module    : CheckBox,
                checked   : Boolean(record.allDay),
                flex      : 'none',
                hideLabel : true,
                listeners : {change: me.onAllDayFieldChange, scope: me},
                name      : 'allDay',
                style     : {marginBottom: '.5em'},
                valueLabel: 'All day',
                ...me.allDayFieldConfig
            }, {
                hidden   : Boolean(record.allDay),
                labelText: 'Start Time',
                maxValue : me.getStartTimeMaxValue(record),
                minValue : me.startTime,
                name     : 'startTime',
                value    : timeFormat.format(record.startDate),
                ...timeFieldDefaults,
                ...me.startTimeFieldConfig
            }, {
                hidden   : Boolean(record.allDay),
                labelText: 'End Time',
                maxValue : me.endTime,
                minValue : me.getEndTimeMinValue(record),
                name     : 'endTime',
                value    : timeFormat.format(record.endDate),
                ...timeFieldDefaults,
                ...me.endTimeFieldConfig
            }, {
                module : Button,
                cls    : ['neo-button', 'neo-red'],
                handler: me.onDeleteButtonClick.bind(me),
                iconCls: 'fas fa-trash-alt',
                style  : {marginTop: '3em'},
                text   : 'Delete'
            }];

            super.createItems()
        }
    }

    /**
     * @param {Neo.calendar.model.Event} record
     * @returns {String}
     */
    getEndTimeMinValue(record) {
        let date = new Date(record.startDate.valueOf());

        date.setMinutes(date.getMinutes() + this.minimumEventDuration);

        return this.intlFormat_time.format(date);
    }

    /**
     * @param {Neo.calendar.model.Event} record
     * @returns {String}
     */
    getStartTimeMaxValue(record) {
        let date = new Date(record.endDate.valueOf());

        date.setMinutes(date.getMinutes() - this.minimumEventDuration);

        return this.intlFormat_time.format(date)
    }

    /**
     * @summary Toggles the record's `allDay` flag and shows or hides time inputs.
     * @param {Object} data
     */
    onAllDayFieldChange(data) {
        let me = this;

        if (me.#isSyncingRecord) {
            return
        }

        let allDay = Boolean(data.value);

        if (me.record) {
            me.record.allDay = allDay
        }

        me.syncTimeFieldsVisibility(allDay)
    }

    /**
     * @summary Shows or hides start/end time fields based on whether the event is marked all-day.
     * @param {Boolean} allDay
     * @protected
     */
    syncTimeFieldsVisibility(allDay) {
        let hidden     = Boolean(allDay),
            startField = this.down({name: 'startTime'}),
            endField   = this.down({name: 'endTime'});

        if (startField) startField.hidden = hidden;
        if (endField)   endField.hidden   = hidden
    }

    /**
     * @param {Object} data
     */
    onCalendarFieldChange(data) {
        if (!this.#isSyncingRecord && !Neo.isEmpty(data.value)) {
            this.record.calendarId = data.value[data.component.store.keyProperty]
        }
    }

    /**
     * todo: we could add a confirm dialog
     * @param {Object} data
     */
    onDeleteButtonClick(data) {
        let me = this;

        me.getStateProvider().getStore('events').remove(me.record);
        me.unmount()
    }

    /**
     * @param {Object} data
     */
    async onFocusLeave(data) {
        let me         = this,
            generation = ++me.#focusLeaveGeneration;

        // we need a short delay, since a TimeField picker could be open
        await me.timeout(100);

        if (me.#focusLeaveGeneration === generation && me.mounted && !me.containsFocus) {
            me.unmount()
        }
    }

    /**
     * @param {Object} data
     */
    onTimeFieldChange(data) {
        let me = this;

        if (me.#isSyncingRecord) {
            return
        }

        let name   = data.component.name,
            field  = name === 'endTime' ? 'endDate' : 'startDate',
            record = me.record,
            date   = DateUtil.clone(me.record[field]),
            value  = data.value.split(':').map(e => Number(e));

        date.setHours(value[0]);
        date.setMinutes(value[1]);

        record[field] = date;

        if (name === 'endTime') {
            me.getField('startTime').then(field => field.maxValue = me.getStartTimeMaxValue(record))
        } else {
            me.getField('endTime')  .then(field => field.minValue = me.getEndTimeMinValue(record))
        }
    }

    /**
     * @param {Object} data
     */
    onTitleFieldChange(data) {
        if (!this.#isSyncingRecord && !Neo.isEmpty(data.value)) {
            this.record.title = data.value
        }
    }
}

export default Neo.setupClass(EditEventContainer);
