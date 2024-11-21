import List from '../../../list/Base.mjs';

/**
 * @class Neo.calendar.view.calendars.ColorsList
 * @extends Neo.list.Base
 */
class ColorsList extends List {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.calendars.ColorsList'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.ColorsList',
        /**
         * @member {String[]} baseCls=['neo-calendars-colors-list','neo-list']
         */
        baseCls: ['neo-calendars-colors-list', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.colors'
        },
        /**
         * Set this to true in case a keyboard navigation should immediately select the focussed item
         * @member {Boolean} selectOnFocus=true
         */
        selectOnFocus: true,
        /**
         * @member {Boolean} useWrapperNode=false
         */
        useWrapperNode: false,
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
        {tag: 'ul', cn: [], tabIndex: '0'}
    }

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
            me.selectionModel?.select(me.getItemId(record[me.getKeyProperty()]))
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
        }}
    }

    /**
     * @returns {Object}
     */
    getVdomRoot() {
        return this.vdom
    }

    /**
     * @returns {Object}
     */
    getVnodeRoot() {
        return this.vnode
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me      = this,
            {value} = me;

        value && me.afterSetValue(value, null)
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
        })
    }
}

export default Neo.setupClass(ColorsList);
