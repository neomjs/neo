import {default as Container}     from '../../container/Base.mjs';
import {default as CheckBoxField} from '../../form/field/CheckBox.mjs';

/**
 * @class Neo.calendar.view.CalendarsContainer
 * @extends Neo.container.Base
 */
class CalendarsContainer extends Container {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.CalendarsContainer'
         * @protected
         */
        className: 'Neo.calendar.view.CalendarsContainer',
        /**
         * @member {String} ntype='calendar-calendarscontainer'
         * @protected
         */
        ntype: 'calendar-calendarscontainer',
        /**
         * @member {Neo.calendar.store.Calendars|null} calendarStore_=null
         */
        calendarStore_: null,
        /**
         * @member {String[]} cls=['neo-calendar-calendarscontainer', 'neo-container']
         */
        cls: ['neo-calendar-calendarscontainer', 'neo-container'],
        /**
         * @member {Object} itemDefaults
         * @protected
         */
        itemDefaults: {
            module        : CheckBoxField,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false,
        },
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         * @protected
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }}

    /**
     *
     * @param {Object[]} data
     */
    onStoreLoad(data) {
        let me    = this,
            items = [];

        if (!me.mounted && me.rendering) {
            const listenerId = me.on('rendered', () => {
                me.un('rendered', listenerId);
                me.onStoreLoad(data);
            });
        } else {
            data.forEach(item => {
                items.push({
                    checked       : item.active,
                    valueLabelText: item.name
                });
            });

            me._items = items;

            me.parseItemConfigs(items);
            me.createItems();
        }
    }
}

Neo.applyClassConfig(CalendarsContainer);

export {CalendarsContainer as default};