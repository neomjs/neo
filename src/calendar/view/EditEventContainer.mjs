import Button        from '../../button/Base.mjs';
import CalendarStore from '../store/Calendars.mjs';
import ColorField    from '../../form/field/Color.mjs';
import DateUtil      from '../../util/Date.mjs';
import FormContainer from '../../form/Container.mjs';
import TextField     from '../../form/field/Text.mjs';
import TimeField     from '../../form/field/Time.mjs';

/**
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
            intlFormat_time     : data => data.intlFormat_time,
            minimumEventDuration: data => data.minimumEventDuration,
            startTime           : data => data.startTime
        },
        /**
         * @member {Object|null} calendarFieldConfig=null
         */
        calendarFieldConfig: null,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} endTime_='24:00'
         */
        endTime_: '24:00',
        /**
         * @member {Object|null} endTimeFieldConfig=null
         */
        endTimeFieldConfig: null,
        /**
         * Bound to the view model.
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
         */
        record_: null,
        /**
         * Only full hours are valid for now
         * format: 'hh:mm'
         * @member {String} startTime_='00:00'
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
        value && this.getField('title').then(field => field.focus())
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.calendar.model.Event} value
     * @param {Neo.calendar.model.Event} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (value && oldValue) {
            let me                  = this,
                timeFormat          = me.intlFormat_time,
                {calendarId, title} = value;

            me.getField('endTime')  .then(field => field.minValue = me.getEndTimeMinValue(value));
            me.getField('startTime').then(field => field.maxValue = me.getStartTimeMaxValue(value));

            me.reset({
                calendarId,
                endTime  : timeFormat.format(value.endDate),
                startTime: timeFormat.format(value.startDate),
                title
            })
        } else if (value) {
            this.createItems()
        }
    }

    /**
     *
     */
    createItems() {
        let me         = this,
            {record}   = me,
            timeFormat = me.intlFormat_time,
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
                        return 'var(--event-yellow-border-color)';
                    }

                    return `var(--event-${value}-color)`
                },

                store: {
                    module  : CalendarStore,
                    sourceId: me.model.getStore('calendars').id
                },

                ...me.calendarFieldConfig
            }, {
                labelText: 'Start Time',
                maxValue : me.getStartTimeMaxValue(record),
                minValue : me.startTime,
                name     : 'startTime',
                value    : timeFormat.format(record.startDate),
                ...timeFieldDefaults,
                ...me.startTimeFieldConfig
            }, {
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
     * @param {Object} data
     */
    onCalendarFieldChange(data) {
        if (!Neo.isEmpty(data.value)) {
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
        let me = this;

        // we need a short delay, since a TimeField picker could be open
        await me.timeout(100);

        me.mounted && me.unmount()
    }

    /**
     * @param {Object} data
     */
    onTimeFieldChange(data) {
        let me     = this,
            name   = data.component.name,
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
        if (!Neo.isEmpty(data.value)) {
            this.record.title = data.value
        }
    }
}

export default Neo.setupClass(EditEventContainer);
