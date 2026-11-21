import List from './List.mjs';

/**
 * @summary Presents the host's current theme as a radio selection using the standard menu's navigation and dismissal.
 * @class Neo.menu.ThemeSwitcher
 * @extends Neo.menu.List
 * @private
 */
class ThemeSwitcher extends List {
    static config = {
        /**
         * @member {String} className='Neo.menu.ThemeSwitcher'
         * @protected
         */
        className: 'Neo.menu.ThemeSwitcher',
        /**
         * @member {String} role='menu'
         * @protected
         */
        role: 'menu'
    }

    /** @member {Object|null} #pointer=null @private */
    #pointer = null

    /**
     * @summary Keeps the trigger expanded state and the menu's keyboard entry in sync with mounting.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        const me     = this,
              button = me.parentComponent;

        if (button?.menuList === me) {
            button.syncMenuAria();

            if (value) {
                const record = me.store.get(button.activeTheme) || me.store.getAt(0);

                record && me.focus(me.getItemId(me.getRecordId(record)))
            }
        }
    }

    /**
     * @summary Projects the effective theme independently of transient menu focus.
     * @param {Object} record
     * @param {Number} index
     * @param {Number} [poolIndex=index]
     * @returns {Object|null}
     * @protected
     */
    createItem(record, index, poolIndex=index) {
        const item = super.createItem(record, index, poolIndex);

        if (item) {
            delete item['aria-selected'];
            item.role            = 'menuitemradio';
            item['aria-checked'] = String(record.id === this.parentComponent?.activeTheme)
        }

        return item
    }

    /**
     * @summary Carries the pointer origin through the standard menu's shared pointer/Enter dispatch.
     * @param {Object} node
     * @param {Object} data
     * @protected
     */
    onItemClick(node, data) {
        this.#pointer = data;

        try {
            super.onItemClick(node, data)
        } finally {
            this.#pointer = null
        }
    }

    /**
     * @summary Applies the chosen theme before the standard leaf command closes the menu.
     * @param {String} nodeId
     * @protected
     */
    onKeyDownEnter(nodeId) {
        const me     = this,
              record = nodeId && me.store.get(me.getItemRecordId(nodeId));

        if (record) {
            me.parentComponent?.selectTheme(record.id, me.#pointer);
            super.onKeyDownEnter(nodeId)
        }
    }
}

export default Neo.setupClass(ThemeSwitcher);
