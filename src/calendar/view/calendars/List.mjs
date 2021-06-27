import BaseList      from '../../../list/Base.mjs';
import CheckBoxField from '../../../form/field/CheckBox.mjs';

/**
 * @class Neo.calendar.view.calendars.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.calendars.List'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.List',
        /**
         * @member {String} ntype='calendar-calendars-list'
         * @protected
         */
        ntype: 'calendar-calendars-list',
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.calendars'
        },
        /**
         * @member {String[]} cls=['neo-calendars-list','neo-list']
         */
        cls: ['neo-calendars-list', 'neo-list'],
        /**
         * @member {Object} itemDefaults
         * @protected
         */
        itemDefaults: {
            module        : CheckBoxField,
            flex          : 'none',
            hideLabel     : true,
            hideValueLabel: false
        }
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @returns {Object[]|String} Either an vdom cn array or a html string
     */
    createItemContent(record) {
        let me = this,

        listItem = Neo.create({
            appName       : me.appName,
            checked       : record.active,
            cls           : ['neo-checkboxfield', `neo-color-${record.color}`],
            fieldValue    : record[me.store.keyProperty],
            listeners     : {change: me.onCheckboxChange, scope: me},
            parentId      : me.id,
            valueLabelText: record.name,
            ...me.itemDefaults
        });

        return [listItem.vdom];
    }

    /**
     *
     */
    destroy(...args) {
        let me = this,
            itemId;

        me.store.items.forEach(record => {
            itemId = me.getItemId(record[me.getKeyProperty()]);
            Neo.getComponent(itemId).destroy();
        });

        super.destroy(...args);
    }

    /**
     *
     * @param {Object} data
     */
    onCheckboxChange(data) {
        this.store.get(data.component.fieldValue).active = data.value;
    }
}

Neo.applyClassConfig(List);

export {List as default};
