import BaseContainer from '../container/Base.mjs';
import BodyContainer from './BodyContainer.mjs';
import HeaderButton  from './header/Button.mjs';
import HeaderToolbar from './header/Toolbar.mjs';
import NeoArray      from '../util/Array.mjs';
import Strip         from './Strip.mjs';

/**
 * @summary Manages a tabbed interface with a header toolbar and a content body.
 *
 * This class acts as the main orchestrator for a tabbed view. It uses a flexbox layout to arrange its
 * two primary children: a `Neo.tab.header.Toolbar` for the tab buttons and a `Neo.tab.BodyContainer`.
 * The `BodyContainer` is configured with a `card` layout. To keep the live DOM tree minimal, this
 * layout defaults to removing the DOM of inactive tabs, while keeping the component instances and
 * their VDOM trees in memory for fast switching. This behavior can be changed via the `removeInactiveCards` config.
 *
 * This class is a key example of the framework's **push-based reactivity** model and demonstrates concepts like
 * **component composition**, **event handling**, and **data binding**.
 *
 * @see Neo.examples.tab.Container
 * @class Neo.tab.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    /**
     * Valid values for tabBarPosition
     * @member {String[]} tabBarPositions=['top','right','bottom','left']
     * @protected
     * @static
     */
    static tabBarPositions = ['top', 'right', 'bottom', 'left']

    static config = {
        /**
         * @member {String} className='Neo.tab.Container'
         * @protected
         */
        className: 'Neo.tab.Container',
        /**
         * @member {String} ntype='tab-container'
         * @protected
         */
        ntype: 'tab-container',
        /**
         * You can use null to not mount any items initially
         * @member {Number|null} activeIndex_=0
         * @reactive
         */
        activeIndex_: 0,
        /**
         * True will activate a tab which gets dynamically inserted / added after the TabContainer is mounted
         * @member {Boolean} activateInsertedTabs=false
         */
        activateInsertedTabs: false,
        /**
         * @member {String[]} baseCls=['neo-tab-container'],
         * @protected
         */
        baseCls: ['neo-tab-container'],
        /**
         * Default configs for the tab.BodyContainer
         * @member {Object|null} bodyContainer=null
         */
        bodyContainer: null,
        /**
         * @member {String|null} bodyContainerId=null
         */
        bodyContainerId: null,
        /**
         * true enables sorting tabs via drag&drop.
         * The config gets passed to the header toolbar
         * @member {Boolean} dragResortable=false
         * @reactive
         */
        dragResortable: false,
        /**
         * Default configs for the tab.HeaderToolbar
         * @member {Object|null} headerToolbar=null
         */
        headerToolbar: null,
        /**
         * @member {Object|null} layout=null
         * @reactive
         */
        layout: null,
        /**
         * True to not apply a background effect to the tab header container
         * @member {Boolean} plain_=true
         * @reactive
         */
        plain_: true,
        /**
         * Remove the DOM of inactive cards (TabContainer Body).
         * This will keep the instances & vdom trees
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true,
        /**
         * @member {String|null} tabBarId=null
         */
        tabBarId: null,
        /**
         * Default configs for the tab.Strip
         * @member {Object|null} tabStrip=null
         */
        tabStrip: null,
        /**
         * @member {String|null} tabStripId=null
         */
        tabStripId: null,
        /**
         * The position of the tab header toolbar.
         * Valid values are top, right, bottom, left.
         * @member {String} tabBarPosition_='top'
         * @reactive
         */
        tabBarPosition_: 'top',
        /**
         * adds tabContainerCls + '-plain' is case plain is set to true
         * @member {String} tabContainerCls='neo-tab-container'
         */
        tabContainerCls: 'neo-tab-container',
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         * @reactive
         */
        useActiveTabIndicator_: true
    }

    /**
     * Adds one or more tab items to the end of the container.
     * @param {Object|Object[]} item The configuration object for a new tab or an array of such objects.
     * @returns {Neo.component.Base|Neo.component.Base[]} The newly created component(s).
     */
    add(item) {
        return this.insert(this.getTabBar().items.length, item)
    }

    /**
     * Handles the logic after the `activeIndex` config has changed. It ensures that the
     * layout of the `BodyContainer` is updated to show the correct card and fires the
     * `activeIndexChange` event.
     * @param {Number|null} value The new active index.
     * @param {Number|null} oldValue The previous active index.
     * @protected
     */
     async afterSetActiveIndex(value, oldValue) {
        let me            = this,
            cardContainer = Neo.getComponent(me.bodyContainerId);

        if (Neo.isNumber(value) && value > -1 && !cardContainer) {
            me.on('constructed', () => {
                me.afterSetActiveIndex(value, oldValue)
            }, me, {once: true})
        } else {
            if (Neo.isNumber(value) && value > -1) {
                // we need to ensure the afterSet method triggers when lazy loading the module
                cardContainer.layout._activeIndex = value;
                await cardContainer.layout.afterSetActiveIndex(value, oldValue);

                if (oldValue !== undefined) {
                    me.updateTabButtons();

                    me.fire('activeIndexChange', {
                        item: me.getActiveCard(),
                        oldValue,
                        value
                    })
                }
            }
        }
    }

    /**
     * Applies or removes the plain CSS class when the `plain` config changes.
     * @param {Boolean} value The new value for `plain`.
     * @param {Boolean} oldValue The old value for `plain`.
     * @protected
     */
    afterSetPlain(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray[value ? 'unshift' : 'remove'](cls, me.tabContainerCls + '-plain');
        me.cls = cls
    }

    /**
     * Passes the `dragResortable` config down to the `HeaderToolbar` instance.
     * @param {Boolean} value The new value for `dragResortable`.
     * @param {Boolean} oldValue The old value for `dragResortable`.
     * @protected
     */
    afterSetDragResortable(value, oldValue) {
        if (oldValue !== undefined) {
            this.getTabBar().dragResortable = value
        }
    }

    /**
     * Adjusts the container's layout and CSS classes when the tab bar position changes.
     * This method ensures that the `HeaderToolbar` is docked correctly and that the overall
     * flexbox layout direction is updated to accommodate the new position (e.g., row for left/right,
     * column for top/bottom).
     * @param {String} value The new tab bar position ('top', 'right', 'bottom', 'left').
     * @param {String} oldValue The old tab bar position.
     * @protected
     */
    afterSetTabBarPosition(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray.remove(cls, 'neo-' + oldValue);
        NeoArray.add(cls, 'neo-' + value);
        me.setSilent({cls});

        if (me.vnodeInitialized) {
            me.layout.setSilent(me.getLayoutConfig());
            me.getTabBar().setSilent({dock: value});
            me.getTabStrip().setSilent({cls: ['neo-tab-strip',  'neo-dock-' + value]});

            me.updateDepth = 2;

            me.fire('tabBarPositionChange', {
                component: me,
                oldValue,
                value
            })
        }

        me.update()
    }

    /**
     * Passes the `useActiveTabIndicator` config down to the `HeaderToolbar` and `Strip` instances.
     * @param {Boolean} value The new value for `useActiveTabIndicator`.
     * @param {Boolean} oldValue The old value for `useActiveTabIndicator`.
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        if (oldValue !== undefined) {
            this.getTabBar()  .useActiveTabIndicator = value;
            this.getTabStrip().useActiveTabIndicator = value
        }
    }

    /**
     * Validates the new value for the `tabBarPosition` config.
     * @param {String} value The new value.
     * @param {String} oldValue The old value.
     * @protected
     * @returns {String} The validated value.
     */
    beforeSetTabBarPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'tabBarPosition')
    }

    /**
     * Overrides the base `createItems` lifecycle method to construct the specific component
     * hierarchy required for a tab container. It transforms the user-provided `items` array
     * into the three core child components: `HeaderToolbar`, `Strip`, and `BodyContainer`.
     * @protected
     */
    createItems() {
        let me            = this,
            {activeIndex, removeInactiveCards, useActiveTabIndicator} = me,
            items         = me.items || [],
            tabButtons    = [],
            tabComponents = [];

        Object.assign(me, {
            bodyContainerId: me.bodyContainerId || Neo.getId('container'),
            tabBarId       : me.tabBarId        || Neo.getId('tab-header-toolbar'),
            tabStripId     : me.tabStripId      || Neo.getId('tab-strip')
        });

        items.forEach((item, index) => {
            tabButtons.push(me.getTabButtonConfig(item.header, index));

            if (!(item instanceof Neo.component.Base)) {
                item = {flex: 1, ...me.itemDefaults, isTab: true, ...item}
            }

            tabComponents.push(item)
        });

        me.items = [{
            module        : HeaderToolbar,
            dock          : me.tabBarPosition,
            dragResortable: me.dragResortable,
            flex          : 'none',
            id            : me.tabBarId,
            items         : tabButtons,
            useActiveTabIndicator,
            ...me.headerToolbar
        }, {
            module        : Strip,
            cls           : ['neo-dock-' + me.tabBarPosition],
            flex          : 'none',
            id            : me.tabStripId,
            tabContainerId: me.id,
            useActiveTabIndicator,
            ...me.tabStrip
        }, {
            module      : BodyContainer,
            id          : me.bodyContainerId,
            itemDefaults: me.itemDefaults,
            items       : tabComponents,
            layout      : {ntype: 'card', activeIndex, removeInactiveCards},
            useActiveTabIndicator,
            ...me.bodyContainer
        }];

        me.itemDefaults = null;

        super.createItems()
    }

    /**
     * Retrieves the component instance for the currently active tab.
     * @returns {Neo.component.Base|null} The active card component or null if none is active.
     */
    getActiveCard() {
        return this.getCardContainer()?.items[this.activeIndex] || null
    }

    /**
     * Retrieves the component instance for a tab at a specific index.
     * @param {Number} index The index of the card to retrieve.
     * @returns {Neo.component.Base|null} The card component or null if not found.
     */
    getCard(index) {
        return this.getCardContainer()?.items[index] || null
    }

    /**
     * A convenience method to get the `BodyContainer` instance that holds the tab content cards.
     * @returns {Neo.container.Base} The body container instance.
     */
    getCardContainer() {
        return Neo.getComponent(this.bodyContainerId)
    }

    /**
     * Returns the total number of tabs in the container.
     * @returns {Number} The number of tabs.
     */
    getCount() {
        return this.getTabBar().items.length
    }

    /**
     * Generates the appropriate flexbox layout configuration based on the current `tabBarPosition`.
     * For example, a 'top' or 'bottom' position requires a vertical layout, while 'left' or 'right'
     * requires a horizontal one.
     * @returns {Object} The flexbox layout configuration object.
     * @protected
     */
    getLayoutConfig() {
        let layoutMap = {
            bottom: {
                align    : 'stretch',
                direction: 'column-reverse',
                pack     : 'start'
            },
            left: {
                align    : 'stretch',
                direction: 'row',
                pack     : 'start'
            },
            right: {
                align    : 'stretch',
                direction: 'row-reverse',
                pack     : 'start'
            },
            top: {
                align    : 'stretch',
                direction: 'column',
                pack     : 'start'
            }
        };

        return layoutMap[this.tabBarPosition] || null
    }

    /**
     * Retrieves the `HeaderButton` instance for a tab at a specific index.
     * @param {Number} index The index of the tab button to retrieve.
     * @returns {Neo.tab.header.Button|null} The tab button component or null if not found.
     */
    getTabAtIndex(index) {
        return this.getTabBar().items[index] || null
    }

    /**
     * A convenience method to get the `HeaderToolbar` instance that holds the tab buttons.
     * @returns {Neo.toolbar.Base} The header toolbar instance.
     */
    getTabBar() {
        return Neo.getComponent(this.tabBarId)
    }

    /**
     * Creates the configuration object for a single tab button. It merges a default configuration
     * (including the module, index, and a click listener to change `activeIndex`) with the
     * user-provided configuration from the item's `header` property.
     * @param {Object} config The user-provided configuration from `item.header`.
     * @param {Number} index The index of this tab button.
     * @returns {Object} The merged configuration object for the tab button.
     * @protected
     */
    getTabButtonConfig(config, index) {
        let me = this,

        defaultConfig = {
            module : HeaderButton,
            flex   : 'none',
            index  : index,
            pressed: me.activeIndex === index,

            domListeners: [{
                click(data) {
                    me.activeIndex = data.component.index
                },
                scope: me
            }]
        };

        return {...defaultConfig, ...config}
    }

    /**
     * A convenience method to get the `Strip` instance, which is responsible for rendering
     * the active tab indicator.
     * @returns {Neo.tab.Strip} The strip instance.
     */
    getTabStrip() {
        return Neo.getComponent(this.tabStripId)
    }

    /**
     * Inserts one or more tab items at a specific index.
     * @param {Number} index The index at which to insert the new item(s).
     * @param {Object|Object[]} item The configuration object for a new tab or an array of such objects.
     * @param {Boolean} [silent=false] Set to true to prevent `updateTabButtons` from being called.
     * @returns {Neo.component.Base|Neo.component.Base[]} The newly created component(s).
     */
    insert(index, item, silent=false) {
        let me            = this,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            hasItem       = false,
            i, len, returnArray, superItem, tab;

        if (Array.isArray(item)) {
            i           = 0;
            len         = item.length;
            returnArray = [];

            for (; i < len; i++) {
                // insert the array backwards
                returnArray.unshift(me.insert(index, item[len - 1 - i], true))
            }

            superItem = returnArray;
        } else if (typeof item === 'object') {
            i   = 0;
            len = cardContainer.items.length;

            for (; i < len; i++) {
                if (cardContainer.items[i].id === item.id) {
                    hasItem   = true;
                    superItem = cardContainer.items[i];

                    if (me.activateInsertedTabs) {
                        me.activeIndex = i
                    }

                    break
                }
            }

            if (!hasItem) {
                tab = tabBar.insert(index, me.getTabButtonConfig(item.header, index));

                // todo: non index based matching of tab buttons and cards
                i = 0;
                len = tabBar.items.length;

                for (; i < len; i++) {
                    tabBar.items[i].index = i
                }

                item.flex = 1;
                superItem = cardContainer.insert(index, item, silent);

                if (me.activateInsertedTabs) {
                    if (!me.vnode) {
                        me.activeIndex = index
                    } else {
                        tab.on('mounted', me.onTabButtonMounted, me)
                    }
                }
            }
        }

        !silent && me.updateTabButtons();

        return superItem
    }

    /**
     * Moves an existing tab (both its button and its card) from one index to another.
     * This is primarily used for drag-and-drop reordering.
     * @param {Number} fromIndex The original index of the tab.
     * @param {Number} toIndex The new index for the tab.
     * @returns {Neo.component.Base} The card component that was moved.
     */
    moveTo(fromIndex, toIndex) {
        let me            = this,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            activeTab     = tabBar.items[me.activeIndex],
            index, returnValue;

        tabBar.moveTo(fromIndex, toIndex);
        index = activeTab.index;

        if (index !== me.activeIndex) {
            // silent updates
            me._activeIndex = index;
            cardContainer.layout._activeIndex = index
        }

        returnValue = cardContainer.moveTo(fromIndex, toIndex);

        me.fire('moveTo', {
            fromIndex,
            toIndex
        });

        return returnValue
    }

    /**
     * Overrides the base `onConstructed` lifecycle method to apply the initial flexbox layout
     * configuration after the main construction process is complete.
     * @protected
     */
    onConstructed() {
        this.layout = {ntype: 'flexbox', ...this.getLayoutConfig()};
        super.onConstructed()
    }

    /**
     * A handler that is triggered when a dynamically added tab button is mounted to the DOM.
     * If `activateInsertedTabs` is true, this method ensures that the `activeIndex` is set
     * correctly after the new tab's corresponding card is also mounted.
     * @param {String} buttonId The ID of the mounted button.
     * @protected
     */
    onTabButtonMounted(buttonId) {
        let me            = this,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            i             = 0,
            len           = tabBar.items.length,
            index         = -1,
            card;

        for (; i < len; i++) {
            if (tabBar.items[i].id === buttonId) {
                index = i;
                break
            }
        }

        if (index > -1) {
            card = cardContainer.items[index];

            if (me.vnode && !card.mounted) {
                card.on('mounted', () => {
                    me.activeIndex = index
                }, me, {once: true})
            } else {
                me.activeIndex = index
            }
        }
    }

    /**
     * Removes a tab from the container using a reference to the card component.
     * @param {Neo.component.Base} component The card component instance to remove.
     * @param {Boolean} [destroyItem=true] Set to false to keep the component instance in memory.
     * @param {Boolean} [silent=false] Set to true to prevent `updateTabButtons` from being called.
     */
    remove(component, destroyItem=true, silent=false) {
        let items = [...this.getCardContainer().items],
            i     = 0,
            len   = items.length;

        for (; i < len; i++) {
            if (items[i].id === component.id) {
                this.removeAt(i, destroyItem, silent)
            }
        }
    }

    /**
     * Removes a tab from the container at a specific index.
     * @param {Number} index The index of the tab to remove.
     * @param {Boolean} [destroyItem=true] Set to false to keep the component instance in memory.
     * @param {Boolean} [silent=false] Set to true to prevent `updateTabButtons` from being called.
     */
    removeAt(index, destroyItem=true, silent=false) {
        let me            = this,
            {activeIndex} = me,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            i, len;

        cardContainer.removeAt(index, destroyItem, silent);
        tabBar       .removeAt(index, true,        false);

        if (index < activeIndex) {
            // silent updates
            me._activeIndex = activeIndex - 1;
            cardContainer.layout._activeIndex = activeIndex - 1
        } else if (index === activeIndex) {
            me.activeIndex = activeIndex - 1
        }

        // todo: non index based matching of tab buttons and cards
        i   = 0;
        len = tabBar.items.length;

        for (; i < len; i++) {
            tabBar.items[i].index = i
        }
    }

    /**
     * Synchronizes the `pressed` state of all tab buttons with the container's `activeIndex`.
     * This ensures that only the button corresponding to the active tab appears pressed.
     * @protected
     */
    updateTabButtons() {
        let me            = this,
            {activeIndex} = me,
            tabButtons    = me.getTabBar()?.items || [];

        tabButtons.forEach((item, index) => {
            item.pressed = index === activeIndex
        })
    }
}

export default Neo.setupClass(Container);
