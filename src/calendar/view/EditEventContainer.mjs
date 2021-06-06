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
        record_: null,
        /**
         * @member {Neo.form.field.Text|null} titleField=null
         * @protected
         */
        titleField: null
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me     = this,
            record = me.record;

        me.titleField = Neo.create({
            module       : TextField,
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Event Title',
            value        : record.title
        });

        me.items = [me.titleField, {
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
        if (value) {
            super.afterSetMounted(value, oldValue);
            this.focus(this.titleField.getInputEl().id);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onFocusLeave(data) {
        let vdom = this.vdom;
        vdom.removeDom = true;
        this.vdom = vdom;
    }
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
