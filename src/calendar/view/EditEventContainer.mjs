import Container from '../../container/Base.mjs';
import TextField from '../../form/field/Text.mjs';

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
            flex         : 'none',
            labelPosition: 'inline',
            labelText    : 'Event Title',
            value        : record.title
        }]
    }
}

Neo.applyClassConfig(EditEventContainer);

export {EditEventContainer as default};
