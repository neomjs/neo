import BaseContainer from '../../../container/Base.mjs';
import List          from './List.mjs';

/**
 * @class Neo.calendar.view.calendars.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.calendars.Container'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.Container',
        /**
         * @member {String[]} baseCls=['neo-calendar-calendarscontainer','neo-container']
         */
        baseCls: ['neo-calendar-calendarscontainer', 'neo-container'],
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
         * @member {Object[]} items
         */
        items: [{
            module: List,
            owner : '@config:owner' // passing the owner config downwards
        }, {
            ntype       : 'button',
            cls         : ['neo-add-calendar-button'],
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
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Neo.calendar.view.MainContainer|null} owner=null
         * @protected
         */
        owner: null
    }

    /**
     * @param {Object} data
     */
    onAddCalendarButtonClick(data) {
        this.calendarStore.add({
            active: true,
            color : 'red',
            name  : 'New Calendar'
        });
    }
}

export default Neo.setupClass(Container);
