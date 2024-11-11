import CheckBoxField from '../../../form/field/CheckBox.mjs';
import ComponentList from '../../../list/Component.mjs';

/**
 * @class Neo.calendar.view.calendars.List
 * @extends Neo.list.Component
 */
class List extends ComponentList {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.calendars.List'
         * @protected
         */
        className: 'Neo.calendar.view.calendars.List',
        /**
         * @member {String[]} baseCls=['neo-calendars-list','neo-list']
         */
        baseCls: ['neo-calendars-list', 'neo-list'],
        /**
         * @member {Object} bind
         */
        bind: {
            store: 'stores.calendars'
        },
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module        : CheckBoxField,
            flex          : 'none',
            hideLabel     : true,
            iconCls       : ['fas', 'fa-square'],
            iconClsChecked: ['fas', 'fa-check-square']
        },
        /**
         * @member {Neo.calendar.view.MainContainer|null} owner=null
         * @protected
         */
        owner: null
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me       = this,
            id       = record[me.getKeyProperty()],
            items    = me.items || [],
            checkBox = items[index],

        config = {
            checked       : record.active,
            cls           : [`neo-color-${record.color}`],
            fieldValue    : id,
            id            : me.getComponentId(index),
            valueLabelText: record.name
        };

        if (checkBox) {
            checkBox.setSilent(config)
        } else {
            items[index] = checkBox = Neo.create({
                appName  : me.appName,
                listeners: {change: me.onCheckboxChange, scope: me},
                parentId : me.id,
                windowId : me.windowId,
                ...me.itemDefaults,
                ...config
            })
        }

        me.items       = items;
        me.updateDepth = 2;

        return [
            checkBox.createVdomReference(),
            {tag: 'i', cls: ['neo-edit-icon', 'fas fa-edit'], id: me.getEditIconId(index)}
        ]
    }

    /**
     * @param {Number} index
     * @returns {String}
     */
    getEditIconId(index) {
        return `${this.id}__${index}__edit-icon`
    }

    /**
     * @param {Object} data
     */
    onCheckboxChange(data) {
        this.store.get(data.component.fieldValue).active = data.value
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        // The click even arrives before the CheckBox onInputValueChange() gets triggered.
        // We need a short delay to ensure the vdom of the list item contains the new checked state
        this.timeout(20).then(() => {
            super.onClick(data)
        });

        if (data.path[0].cls.includes('neo-edit-icon')) {
            let me                    = this,
                listItemRect          = data.path[1].rect,
                mainContainer         = me.owner,
                editCalendarContainer = mainContainer.editCalendarContainer,
                {mounted, style}      = editCalendarContainer,
                record                = me.store.get(me.getItemRecordId(data.path[1].id));

            Object.assign(style, {
                left: `${listItemRect.right + 13}px`,
                top : `${listItemRect.top   - 10}px`
            });

            editCalendarContainer[mounted ? 'set' : 'setSilent']({
                parentId: mainContainer.id,
                record,
                style
            });

            if (!mounted) {
                editCalendarContainer.render(true)
            } else {
                editCalendarContainer.afterSetMounted(true, false)
            }
        }
    }

    /**
     * @param {String} itemId
     */
    onKeyDownEnter(itemId) {
        let me       = this,
            recordId = me.getItemRecordId(itemId),
            checkBox = me.items[me.store.indexOf(recordId)];

        checkBox.checked = !checkBox.checked
    }

    /**
     * @param {String[]} items
     */
    onSelect(items) {
        this.getModel().setData('activeCalendarId', this.getItemRecordId(items[0]))
    }

    /**
     * Disabling the super class logic for now, since the collection.Base mutation event already covers the sorting
     * @param {Object} data
     */
    sortItems(data) {

    }
}

export default Neo.setupClass(List);
