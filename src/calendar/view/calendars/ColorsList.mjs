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
         * @member {Object} bind
         */
        bind: {
            store: 'stores.colors'
        },
        /**
         * @member {String[]} cls=['neo-calendars-colors-list','neo-list']
         */
        cls: ['neo-calendars-colors-list', 'neo-list'],
        /**
         * The list gets used as a form field, so we are adjusting the selection based on this config
         * @member {String} value_=null
         */
        value_: null,
        /**
         * Added a tabIndex to enable tabbing through the form
         * @member {Object} _vdom={tag:'ul',cn:[],tabIndex:'0'}
         */
        _vdom:
        {cls: 'neo-list-wrapper', cn: [
            {tag: 'ul', cn: [], tabIndex: '0'}
        ]}
    }}

    /**
     * Triggered after the value config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetValue(value, oldValue) {
        let me = this,
            record;

        if (value && oldValue !== undefined && !me.disableSelection) {
            record = me.store.find('name', value)[0];
            me.selectionModel?.select(me.getItemId(record[me.getKeyProperty()]));
        }
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        return {style: {
            backgroundColor: `var(--event-${record.name}-color)`,
            color          : `var(--event-${record.name}-color)` // needed for the box-shadow (CSS currentColor)
        }};
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me    = this,
            value = me.value;

        value && me.afterSetValue(value, null);
    }

    /**
     * Gets triggered from selection.Model: select()
     * @param {String[]} items
     */
    onSelect(items) {
        let me       = this,
            recordId = me.getItemRecordId(items[0]);

        me.fire('change', {
            record: me.store.get(recordId)
        });
    }
}

Neo.applyClassConfig(ColorsList);

export default ColorsList;
