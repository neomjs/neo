import CalendarsStore from '../store/Calendars.mjs';
import EventsStore    from '../store/Events.mjs';
import Component      from '../../../src/model/Component.mjs';

/**
 * @class Neo.calendar.view.MainContainerModel
 * @extends Neo.model.Component
 */
class MainContainerModel extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.MainContainerModel'
         * @protected
         */
        className: 'Neo.calendar.view.MainContainerModel',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {Boolean} data.allowEventEditing=true
             */
            allowEventEditing: true,
            /**
             * @member {Boolean} data.enableEventResizingAcrossOppositeEdge=true
             */
            enableEventResizingAcrossOppositeEdge: true,
            /**
             * Only full hours are valid for now
             * format: 'hh:mm'
             * @member {String} data.endTime='24:00'
             */
            endTime: '24:00',
            /**
             * Only full hours are valid for now
             * format: 'hh:mm'
             * @member {String} data.startTime='00:00'
             */
            startTime: '00:00'
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me        = this,
            component = me.component;

        /**
         * @member {Object} stores
         */
        me.stores = {
            /**
             * config object for {Neo.calendar.store.Calendars}
             * @member {Object} stores.calendars
             */
            calendars: {
                module: CalendarsStore,
                ...component.calendarStoreConfig || {}
            },
            /**
             * config object for {Neo.calendar.store.Events}
             * @member {Object} stores.events
             */
            events: {
                module: EventsStore,
                ...component.eventStoreConfig || {}
            }
        };
    }
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};
