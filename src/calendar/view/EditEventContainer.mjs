import FormContainer from '../../form/Container.mjs';
import TextField     from '../../form/field/Text.mjs';
import TimeField     from '../../form/field/Time.mjs';

/**
 * @class Neo.calendar.view.EditEventContainer
 * @extends Neo.form.Container
 */
class EditEventContainer extends FormContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.EditEventContainer'
         * @protected
         */
        className: 'Neo.calendar.view.EditEventContainer',
        /**
         * @member {String} ntype='calendar-edit-event-container'
         * @protected
         */
        ntype: 'calendar-edit-event-container',
        /**
         * @member {String[]} cls=['neo-calendar-edit-event-container']
         */
        cls: ['neo-calendar-edit-event-container'],
        /**
         * @member {Object|null} endTimeFieldConfig=null
         */
        endTimeFieldConfig: null,
        /**
         * @member {Neo.calendar.view.week.Component|null} owner=null
         */
        owner: null,
        /**
         * @member {Neo.calendar.model.Event|null} record_=null
         */
        record_: null,
        /**
         * @member {Object|null} startTimeFieldConfig=null
         */
        startTimeFieldConfig: null,
        /**
         * @member {Object|null} titleFieldConfig=null
         */
        titleFieldConfig: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        // focus trap, see: https://github.com/neomjs/neo/issues/2306
        this.vdom.tabIndex = -1;
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
            this.getField('title').focus();
        }
    }

    /**
     * Triggered after the record config got changed
     * @param {Neo.calendar.model.Event} value
     * @param {Neo.calendar.model.Event} oldValue
     * @protected
     */
    afterSetRecord(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.getField('endDate')  .minValue = me.getEndTimeMinValue(value);
            me.getField('startDate').maxValue = me.getStartTimeMaxValue(value);

            me.reset({
                endDate  : me.owner.intlFormat_time.format(value.endDate),
                startDate: me.owner.intlFormat_time.format(value.startDate),
                title    : value.title
            });
        }
    }

    /**
     *
     */
    createItems() {
        let me       = this,
            owner    = me.owner,
            record   = me.record,
            timeAxis = owner.timeAxis,
            timeFieldDefaults = {
                module              : TimeField,
                clearToOriginalValue: true,
                flex                : 'none',
                labelPosition       : 'inline',
                listeners           : {change: me.onTimeFieldChange, scope: me},
                stepSize            : 15 * 60,
                width               : '9em'
            };

        me.items = [{
            module              : TextField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelPosition       : 'inline',
            labelText           : 'Event Title',
            listeners           : {change: me.onTitleFieldChange, scope: me},
            name                : 'title',
            required            : true,
            value               : record.title,
            ...me.titleFieldConfig || {}
        }, {
            labelText: 'Start Time',
            maxValue : me.getStartTimeMaxValue(record),
            minValue : timeAxis.startTime,
            name     : 'startDate',
            value    : owner.intlFormat_time.format(record.startDate),
            ...timeFieldDefaults,
            ...me.startTimeFieldConfig || {}
        }, {
            labelText: 'End Time',
            maxValue : timeAxis.endTime,
            minValue : me.getEndTimeMinValue(record),
            name     : 'endDate',
            value    : owner.intlFormat_time.format(record.endDate),
            ...timeFieldDefaults,
            ...me.endTimeFieldConfig || {}
        }];

        super.createItems();
    }

    /**
     *
     * @param {Neo.calendar.model.Event} record
     * @returns {String}
     */
    getEndTimeMinValue(record) {
        let date = new Date(record.startDate.valueOf());

        date.setMinutes(date.getMinutes() + this.owner.minimumEventDuration);

        return this.owner.intlFormat_time.format(date);
    }

    /**
     *
     * @param {Neo.calendar.model.Event} record
     * @returns {String}
     */
    getStartTimeMaxValue(record) {
        let date = new Date(record.endDate.valueOf());

        date.setMinutes(date.getMinutes() - this.owner.minimumEventDuration);

        return this.owner.intlFormat_time.format(date);
    }

    /**
     *
     * @param {Object} data
     */
    onFocusLeave(data) {
        // we need a short delay, since a TimeField picker could be open
        setTimeout(() => {
            this.unmount();
        }, 100)
    }

    /**
     *
     * @param {Object} data
     */
    onTimeFieldChange(data) {
        let me     = this,
            name   = data.component.name,
            record = me.record,
            date   = me.record[name],
            value  = data.value.split(':').map(e => Number(e));

        date.setHours(value[0]);
        date.setMinutes(value[1]);

        me.owner.updateEvents();

        if (name === 'endDate') {
            me.getField('startDate').maxValue = me.getStartTimeMaxValue(record);
        } else {
            me.getField('endDate')  .minValue = me.getEndTimeMinValue(record);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onTitleFieldChange(data) {
        if (!Neo.isEmpty(data.value)) {
            this.record.title = data.value;
            this.owner.updateEvents();
        }
    }
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
