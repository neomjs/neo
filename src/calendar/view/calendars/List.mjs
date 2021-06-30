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
            module           : CheckBoxField,
            enableLabelClicks: false,
            flex             : 'none',
            hideLabel        : true,
            hideValueLabel   : false
        }
    }}

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me       = this,
            id       = record[me.store.keyProperty],
            items    = me.items || [],
            checkBox = items[index],

        config = {
            checked       : record.active,
            cls           : ['neo-checkboxfield', `neo-color-${record.color}`],
            fieldValue    : id,
            id            : me.getComponentId(id),
            valueLabelText: record.name
        };

        if (checkBox) {
            checkBox.setSilent(config);
        } else {
            items[index] = checkBox = Neo.create({
                appName  : me.appName,
                listeners: {change: me.onCheckboxChange, scope: me},
                parentId : me.id,
                ...me.itemDefaults,
                ...config
            });
        }

        me.items = items;

        return [checkBox.vdom, {tag: 'i', cls: ['neo-edit-icon', 'fas fa-edit'], id: me.getEditIconId(id)}];
    }

    /**
     *
     * @param {Number|String} recordId
     * @returns {String}
     */
    getEditIconId(recordId) {
        return `${this.id}__${recordId}`;
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
        // The click even arrives before the CheckBox onInputValueChange() gets triggered.
        // We need a short delay to ensure the vdom of the list item contains the new checked state
        setTimeout(() => {
            super.onClick(data);
        }, 20);

        if (data.path[0].cls.includes('neo-edit-icon')) {
            let me                    = this,
                listItemRect          = data.path[1].rect,
                mainContainer         = me.up('calendar-maincontainer'), // todo: add a reference
                editCalendarContainer = mainContainer.editCalendarContainer,
                mounted               = editCalendarContainer.mounted,
                record                = me.store.get(me.getItemRecordId(data.path[1].id)),
                style                 = editCalendarContainer.style;

            Object.assign(style, {
                left: `${listItemRect.right + 13}px`,
                top : `${listItemRect.top   - 10}px`,
            });

            editCalendarContainer[mounted ? 'set' : 'setSilent']({
                currentView: me,
                parentId   : mainContainer.id,
                record     : record,
                style      : style
            });

            if (!mounted) {
                editCalendarContainer.render(true);
            }
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
