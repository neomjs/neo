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
     * @param {Boolean} [silent=false]
     */
    createItems(silent=false) {
        let me   = this,
            vdom = me.vdom,
            listItem;

        vdom.cn = [];

        me.store.items.forEach(record => {
            listItem = Neo.create({
                appName       : me.appName,
                checked       : record.active,
                cls           : ['neo-checkboxfield', `neo-color-${record.color}`],
                fieldValue    : record[me.store.keyProperty],
                listeners     : {change: me.onCheckboxChange, scope: me},
                valueLabelText: record.name,
                ...me.itemDefaults
            });

            vdom.cn.push({
                tag     : 'li',
                cls     : [me.itemCls],
                id      : me.getItemId(record[me.getKeyProperty()]),
                cn      : [listItem.vdom],
                tabIndex: -1
            });
        });

        if (silent) {
            me._vdom = vdom;
        } else {
            me.promiseVdomUpdate().then(() => {
                me.fire('createItems');
            });
        }
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
