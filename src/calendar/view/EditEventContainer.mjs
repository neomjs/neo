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
            record = me.record;

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
            value        : '09:30'
        }, {
            module       : TimeField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'End Time',
            value        : '16:00'
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
     *
     * @param {Object} data
     */
    onFocusLeave(data) {
        this.unmount();
    }
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
