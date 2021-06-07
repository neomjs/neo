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
         * @member {Neo.calendar.view.week.Component|null} owner=null
         */
        owner: null,
        /**
         * @member {Neo.calendar.model.Event|null} record_=null
         */
        record_: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me     = this,
            owner  = me.owner,
            record = me.record,
            timeAxis = owner.timeAxis;

        me.items = [{
            module              : TextField,
            clearToOriginalValue: true,
            flag                : 'title-field',
            flex                : 'none',
            labelPosition       : 'inline',
            labelText           : 'Event Title',
            listeners           : {change: me.onTitleFieldChange, scope: me},
            name                : 'title',
            required            : true,
            value               : record.title
        }, {
            module              : TimeField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelPosition       : 'inline',
            labelText           : 'Start Time',
            listeners           : {change: me.onTimeFieldChange, scope: me},
            maxValue            : timeAxis.endTime,
            minValue            : timeAxis.startTime,
            name                : 'startDate',
            stepSize            : 15 * 60,
            value               : owner.intlFormat_time.format(record.startDate),
            width               : '9em'
        }, {
            module              : TimeField,
            clearToOriginalValue: true,
            flex                : 'none',
            labelPosition       : 'inline',
            labelText           : 'End Time',
            listeners           : {change: me.onTimeFieldChange, scope: me},
            maxValue            : timeAxis.endTime,
            minValue            : timeAxis.startTime,
            name                : 'endDate',
            stepSize            : 15 * 60,
            value               : owner.intlFormat_time.format(record.endDate),
            width               : '9em'
        }];
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
            this.down({flag:'title-field'}).focus();
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

            me.setValues({
                endTime  : me.owner.intlFormat_time.format(value.endDate),
                startTime: me.owner.intlFormat_time.format(value.startDate),
                title    : value.title
            });
        }
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
        let date  = this.record[data.component.name],
            value = data.value.split(':').map(e => Number(e));

        date.setHours(value[0]);
        date.setMinutes(value[1]);
        this.owner.updateEvents();
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
