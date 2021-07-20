import BaseContainer from '../../../container/Base.mjs';
import List          from './List.mjs';

/**
 * @class Neo.calendar.view.calendars.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.Container'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.Container',
        /**
         * @member {String} ntype='calendar-calendars-container'
         * @protected
         */
        ntype: 'calendar-calendars-container',
        /**
         * @member {Object} bind
         */
        bind: {
            calendarStore: 'stores.calendars'
        },
        /**
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore: null,
        /**
         * @member {String[]} cls=['neo-calendar-calendarscontainer', 'neo-container']
         */
        cls: ['neo-calendar-calendarscontainer', 'neo-container'],
        /**
         * @member {Object[]} items
         */
        items: [{
            module: List
        }, {
            ntype       : 'button',
            cls         : ['neo-add-calendar-button', 'neo-button'],
            flex        : 'none',
            handler     : 'onAddCalendarButtonClick',
            handlerScope: 'this',
            style       : {marginTop: 'auto'},
            text        : 'Add Calendar'
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     *
     * @param {Object} data
     */
    onAddCalendarButtonClick(data) {
        console.log('onAddCalendarButtonClick', data);
    }
}

Neo.applyClassConfig(Container);

export {Container as default};
