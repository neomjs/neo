import BaseToolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.tab.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static config = {
        /**
         * @member {String} className='Neo.tab.header.Toolbar'
         * @protected
         */
        className: 'Neo.tab.header.Toolbar',
        /**
         * @member {String} ntype='tab-header-toolbar'
         * @protected
         */
        ntype: 'tab-header-toolbar',
        /**
         * @member {String[]} baseCls=['neo-tab-header-toolbar','neo-toolbar']
         */
        baseCls: ['neo-tab-header-toolbar', 'neo-toolbar'],
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         * @reactive
         */
        useActiveTabIndicator_: true
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        let me = this;

        if (value && !me.sortZone) {
            import('../../draggable/tab/header/toolbar/SortZone.mjs').then(module => {
                let {appName, id, windowId} = me;

                me.sortZone = Neo.create({
                    module             : module.default,
                    appName,
                    boundaryContainerId: id,
                    owner              : me,
                    windowId,
                    ...me.sortZoneConfig
                })
            })
        }
    }

    /**
     * Triggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            me.items.forEach(item => {
                // silent updates
                item._useActiveTabIndicator = value;
                item.updateUseActiveTabIndicator(true)
            });

            me.update()
        }
    }

    /**
     * @protected
     */
    createItems() {
        let me       = this,
            defaults = me.itemDefaults || {};

        defaults.useActiveTabIndicator = me.useActiveTabIndicator;
        me.itemDefaults = defaults;

        super.createItems()
    }

    /**
     * Returns the layout config matching to the dock position
     * @returns {Object} layoutConfig
     * @protected
     */
    getLayoutConfig() {
        let layoutConfig;

        switch (this.dock) {
            case 'bottom':
            case 'top':
                layoutConfig = {
                    align    : 'center',
                    direction: 'row',
                    pack     : 'start'
                };
                break
            case 'left':
                layoutConfig = {
                    align    : 'center',
                    direction: 'column-reverse',
                    pack     : 'end'
                };
                break
            case 'right':
                layoutConfig = {
                    align    : 'center',
                    direction: 'column',
                    pack     : 'start'
                };
                break
        }

        return layoutConfig
    }

    /**
     * Moves an existing item to a new index
     * @param {Number} fromIndex
     * @param {Number} toIndex
     * @returns {Neo.component.Base}
     */
    moveTo(fromIndex, toIndex) {
        let returnValue = super.moveTo(fromIndex, toIndex);

        if (fromIndex !== toIndex) {
            this.items.forEach((item, index) => {
                item.index = index
            })
        }

        return returnValue
    }
}

export default Neo.setupClass(Toolbar);
