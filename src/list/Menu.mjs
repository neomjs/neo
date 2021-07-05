import CheckBoxField from '../form/field/CheckBox.mjs';
import ComponentList from './Component.mjs';

/**
 * @class Neo.list.Menu
 * @extends Neo.list.Component
 */
class Menu extends ComponentList {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.list.Menu'
         * @protected
         */
        className: 'Neo.list.Menu',
        /**
         * @member {String} ntype='menu'
         * @protected
         */
        ntype: 'menu',
        /**
         * @member {String[]} cls=['neo-menu','neo-list']
         */
        cls: ['neo-menu', 'neo-list'],
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
                cls           : ['neo-checkboxfield'],
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
     * @param {String} itemId
     */
    onKeyDownEnter(itemId) {
        let me       = this,
            recordId = me.getItemRecordId(itemId),
            checkBox = me.items[me.store.indexOf(recordId)];

        checkBox.checked = !checkBox.checked;
    }
}

Neo.applyClassConfig(Menu);

export {Menu as default};
