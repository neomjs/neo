import CheckBoxField from '../../form/field/CheckBox.mjs';
import Container     from '../../container/Base.mjs';

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
         * @member {Object} bind
         */
        bind: {
            calendarStore: 'stores.calendars'
        },
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
     * Triggered after the calendarStore config got changed
     * @param {Neo.calendar.store.Calendars|null} value
     * @param {Neo.calendar.store.Calendars|null} oldValue
     * @protected
     */
    afterSetCalendarStore(value, oldValue) {
        let me = this;

        oldValue && oldValue.un('load', me.onCalendarStoreLoad, me);
        value    && value   .on('load', me.onCalendarStoreLoad, me);
    }

    /**
     *
     * @param {Object[]} data
     */
    onCalendarStoreLoad(data) {
        let me    = this,
            items = [];

        if (!me.mounted && me.rendering) {
            const listenerId = me.on('rendered', () => {
                me.un('rendered', listenerId);
                me.onCalendarStoreLoad(data);
            });
        } else {
            data.forEach(record => {
                items.push({
                    checked       : record.active,
                    fieldValue    : record[me.calendarStore.keyProperty],
                    listeners     : {change: me.onCheckboxChange, scope: me},
                    valueLabelText: record.name
                });
            });

            me._items = items;

            me.parseItemConfigs(items);
            me.createItems();
        }
    }

    /**
     *
     * @param {Object} data
     */
    onCheckboxChange(data) {
        this.calendarStore.get(data.component.fieldValue).active = data.value;
    }
}

Neo.applyClassConfig(CalendarsContainer);

export {CalendarsContainer as default};
