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
         * @member {String[]} cls=['neo-calendars-list','neo-list']
         */
        cls: ['neo-calendars-colors-list', 'neo-list']
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]|String} Either an vdom cn array or a html string
     */
    createItemContent(record, index) {
        return [{cls: ['neo-color-item'], style: {backgroundColor: record.color}}];
    }
}

Neo.applyClassConfig(ColorsList);

export {ColorsList as default};
