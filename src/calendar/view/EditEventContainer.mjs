import Container from '../../container/Base.mjs';
import TextField from '../../form/field/Text.mjs';
import TimeField from '../../form/field/Time.mjs';

/**
 * @class Neo.calendar.view.EditEventContainer
 * @extends Neo.container.Base
 */
class EditEventContainer extends Container {
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
            module       : TextField,
            flag         : 'title-field',
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Event Title',
            value        : record.title
        }, {
            module       : TimeField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Start Time',
            maxValue     : timeAxis.endTime,
            minValue     : timeAxis.startTime,
            value        : owner.intlFormat_time.format(record.startDate)
        }, {
            module       : TimeField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'End Time',
            maxValue     : timeAxis.endTime,
            minValue     : timeAxis.startTime,
            value        : owner.intlFormat_time.format(record.endDate)
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
            this.down({flag:'title-field'}).value = value.title;
        }
    }

    /**
     *
     * @param {Object} data
     */
    onFocusLeave(data) {
        this.unmount();
    }
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
