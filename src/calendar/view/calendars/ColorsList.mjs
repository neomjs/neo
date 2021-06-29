import List from '../../../list/Base.mjs';

/**
 * @class Neo.calendar.view.calendars.ColorsList
 * @extends Neo.list.Base
 */
class ColorsList extends List {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.ColorsList'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.ColorsList',
        /**
         * @member {String} ntype='calendar-colors-list'
         * @protected
         */
        ntype: 'calendar-colors-list',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.calendars'
        },
        /**
         * @member {String[]} cls=['neo-calendars-colors-list','neo-list']
         */
        cls: ['neo-calendars-colors-list', 'neo-list']
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        return {style: {
            backgroundColor: `var(--event-${record.color}-color)`,
            color          : `var(--event-${record.color}-color)` // needed for the box-shadow (CSS currentColor)
        }};
    }
}

Neo.applyClassConfig(ColorsList);

export {ColorsList as default};
