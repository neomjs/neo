import BaseToolbar from '../../toolbar/Base.mjs';

/**
 * @class Neo.tab.header.Toolbar
 * @extends Neo.toolbar.Base
 */
class Toolbar extends BaseToolbar {
    static config = {
        /**
         * Tab-header actions are focus-gated by default. Persistent actions opt out explicitly with
         * `showOnFocus: false` (or the deprecated `contextual: false`).
         * @member {Object} actionDefaults={showOnFocus:true}
         */
        actionDefaults: {
            showOnFocus: true
        },
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
     * @returns {Promise<any>}
     */
    loadSortZoneModule() {
        return import('../../draggable/tab/header/toolbar/SortZone.mjs')
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

            me.getTabButtons().forEach(item => {
                // silent updates
                item._useActiveTabIndicator = value;
                item.updateUseActiveTabIndicator(true)
            });

            me.update()
        }
    }

    /**
     * Resolves a semantic tab insertion index to the raw toolbar position immediately before the
     * action group.
     * @param {Number} index
     * @returns {Number}
     */
    getTabInsertIndex(index) {
        let me      = this,
            buttons = me.getTabButtons(),
            target  = buttons[index],
            spacer;

        if (target) {
            return me.items.indexOf(target)
        }

        spacer = me.getActionSpacer();

        return spacer ? me.items.indexOf(spacer) : me.items.length
    }

    /**
     * Returns only semantic tab-header buttons, excluding the action group and spacer.
     * @returns {Neo.tab.header.Button[]}
     */
    getTabButtons() {
        return (this.items || []).filter(item => this.isTabButton(item))
    }

    /**
     * The single semantic membership answer shared with the tab SortZone. A tab-styled action is
     * still an action and must never become card chrome or a drag target.
     * @param {*} item
     * @returns {Boolean}
     */
    isTabButton(item) {
        return item?.isToolbarAction !== true
            && item?.isToolbarActionSpacer !== true
            && item?.baseCls?.includes('neo-tab-header-button')
    }

    /**
     * Inserts a tab button at a semantic tab index.
     * @param {Number} index
     * @param {Object|Neo.tab.header.Button} item
     * @param {Boolean} [silent=false]
     * @param {Boolean} [removeFromPreviousParent=true]
     * @returns {Neo.tab.header.Button}
     */
    insertTab(index, item, silent=false, removeFromPreviousParent=true) {
        let bounded = Math.max(0, Math.min(Number(index) || 0, this.getTabButtons().length));

        return this.insert(this.getTabInsertIndex(bounded), item, silent, removeFromPreviousParent)
    }

    /**
     * @summary Returns the layout config matching the dock position.
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
                    direction: 'column',
                    pack     : 'start'
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
        let me         = this,
            buttons    = me.getTabButtons(),
            fromButton = buttons[fromIndex],
            toButton   = buttons[toIndex],
            returnValue;

        if (!fromButton || !toButton) {
            return null
        }

        returnValue = super.moveTo(me.items.indexOf(fromButton), me.items.indexOf(toButton));

        if (fromIndex !== toIndex) {
            me.getTabButtons().forEach((item, index) => {
                item.index = index
            })
        }

        return returnValue
    }

    /**
     * Removes a tab button at a semantic tab index.
     * @param {Number} index
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     * @param {Boolean} [keepMounted=false]
     * @returns {Neo.tab.header.Button|null}
     */
    removeTabAt(index, destroyItem=true, silent=false, keepMounted=false) {
        let button = this.getTabButtons()[index];

        return button ? this.remove(button, destroyItem, silent, keepMounted) : null
    }
}

export default Neo.setupClass(Toolbar);
