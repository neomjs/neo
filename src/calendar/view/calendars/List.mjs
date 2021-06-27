import CheckBoxField from '../../../form/field/CheckBox.mjs';
import ComponentList from '../../../list/Component.mjs';

/**
 * @class Neo.calendar.view.calendars.List
 * @extends Neo.list.Component
 */
class List extends ComponentList {
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
     * @param {Number} index
     * @returns {Object[]|String} Either an vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me       = this,
            id       = record[me.store.keyProperty],
            items    = me.items || [],
            listItem = items[index],

        config = {
            checked       : record.active,
            cls           : ['neo-checkboxfield', `neo-color-${record.color}`],
            fieldValue    : id,
            id            : me.getComponentId(id),
            valueLabelText: record.name
        };

        if (listItem) {
            listItem.set(config);
        } else {
            items[index] = listItem = Neo.create({
                appName  : me.appName,
                listeners: {change: me.onCheckboxChange, scope: me},
                parentId : me.id,
                ...me.itemDefaults,
                ...config
            });
        }

        me.items = items;

        return [listItem.vdom, {tag: 'i', cls: ['neo-edit-icon', 'fas fa-edit']}];
    }

    /**
     *
     * @param {Object} data
     */
    onCheckboxChange(data) {
        this.store.get(data.component.fieldValue).active = data.value;
    }

    /**
     *
     * @param {Object} data
     */
    onClick(data) {
        super.onClick(data);

        if (data.path[0].cls.includes('neo-edit-icon')) {
            let record = this.store.get(this.getItemRecordId(data.path[1].id));

            console.log('edit icon click', record.name);
        }
    }

    /**
     *
     * @param {String} itemId
     */
    onKeyDownEnter(itemId) {
        let me       = this,
            recordId = me.getItemRecordId(itemId),
            checkBox = me.items[me.store.indexOf(recordId)];

        checkBox.checked = !checkBox.checked;
    }
}

Neo.applyClassConfig(List);

export {List as default};
