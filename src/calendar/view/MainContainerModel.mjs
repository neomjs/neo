import CalendarStore from '../store/Calendars.mjs';
import Component     from '../../../src/model/Component.mjs';

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
            enableEventResizingAcrossOppositeEdge: true
        }
    }}

    onComponentConstructed() {
        let me = this,
            component = me.component;

        console.log(component.calendarStoreConfig);

        /**
         * @member {Object} stores
         */
        me.stores = {
            /**
             * @member {Object} stores.calendar
             */
            calendar: {
                module: CalendarStore,
                ...component.calendarStoreConfig || {}
            }
        };
    }
}

Neo.applyClassConfig(MainContainerModel);

export {MainContainerModel as default};
