import BaseContainer from '../container/Base.mjs';
import BodyContainer from './BodyContainer.mjs';
import HeaderButton  from './header/Button.mjs';
import HeaderToolbar from './header/Toolbar.mjs';
import NeoArray      from '../util/Array.mjs';
import Strip         from './Strip.mjs';

/**
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
         * You can use null to not render any items initially
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
        /*
         * Remove the DOM of inactive cards (TabContainer Body).
         * This will keep the instances & vdom trees
         * @member {Boolean} removeInactiveCards=true
         */
        removeInactiveCards: true,
        /**
         * true enables sorting tabs via drag&drop.
         * The config gets passed to the header toolbar
         * @member {Boolean} sortable_=false
         * @reactive
         */
        sortable_: false,
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
     * Adds one or multiple tabs at the end of the header
     * @param {Object|Array} item
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    add(item) {
        return this.insert(this.getTabBar().items.length, item)
    }

    /**
     * Triggered after the activeIndex config got changed
     * @param {Number|null} value
     * @param {Number|null} oldValue
     * @protected
     */
     async afterSetActiveIndex(value, oldValue) {
        let me            = this,
            cardContainer = Neo.getComponent(me.bodyContainerId);

        if (Neo.isNumber(value) && value > -1 && !cardContainer) {
            me.on('constructed', () => {
                me.afterSetActiveIndex(value, oldValue)
            })
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
     * Triggered after the plain config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPlain(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray[value ? 'unshift' : 'remove'](cls, me.tabContainerCls + '-plain');
        me.cls = cls
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        if (oldValue !== undefined) {
            this.getTabBar().sortable = value
        }
    }

    /**
     * Triggered after the tabBarPosition config got changed
     * @param {String} value 'top', 'right', 'bottom', 'left'
     * @param {String} oldValue 'top', 'right', 'bottom', 'left'
     * @protected
     */
    afterSetTabBarPosition(value, oldValue) {
        let me    = this,
            {cls} = me;

        NeoArray.remove(cls, 'neo-' + oldValue);
        NeoArray.add(cls, 'neo-' + value);
        me.setSilent({cls});

        if (me.rendered) {
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
     * Triggered after the useActiveTabIndicator config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetUseActiveTabIndicator(value, oldValue) {
        if (oldValue !== undefined) {
            this.getTabBar()  .useActiveTabIndicator = value;
            this.getTabStrip().useActiveTabIndicator = value
        }
    }

    /**
     * Triggered before the tabBarPosition config gets changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     * @returns {String} value
     */
    beforeSetTabBarPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'tabBarPosition')
    }

    /**
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
            module  : HeaderToolbar,
            dock    : me.tabBarPosition,
            flex    : 'none',
            id      : me.tabBarId,
            items   : tabButtons,
            sortable: me.sortable,
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
        }]

        me.itemDefaults = null;

        super.createItems()
    }

    /**
     * Returns the card matching this.activeIndex
     * @returns {Neo.component.Base|null}
     */
    getActiveCard() {
        return this.getCardContainer().items[this.activeIndex] || null
    }

    /**
     * Returns a card by a given index
     * @param {Number} index
     * @returns {Neo.component.Base|null}
     */
    getCard(index) {
        return this.getCardContainer().items[index] || null
    }

    /**
     * @returns {Neo.container.Base}
     */
    getCardContainer() {
        return Neo.getComponent(this.bodyContainerId)
    }

    /**
     * Returns the amount of items inside the tab header toolbar
     * @returns {Number}
     */
    getCount() {
        return this.getTabBar().items.length
    }

    /**
     * @returns {Object} layoutConfig
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
     * @param {Number} index
     * @returns {Neo.tab.header.Button|null}
     */
    getTabAtIndex(index) {
        return this.getTabBar().items[index] || null
    }

    /**
     * @returns {Neo.toolbar.Base}
     */
    getTabBar() {
        return Neo.getComponent(this.tabBarId)
    }

    /**
     * @param {Object} config
     * @param {Number} index
     * @returns {Object} The merged config
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
     * @returns {Neo.tab.Strip}
     */
    getTabStrip() {
        return Neo.getComponent(this.tabStripId)
    }

    /**
     * Inserts an item or array of items at a specific index
     * @param {Number} index
     * @param {Object|Object[]} item
     * @param {Boolean} silent=false
     * @returns {Neo.component.Base|Neo.component.Base[]}
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
     * Moves an existing item to a new index
     * @param {Number} fromIndex
     * @param {Number} toIndex
     * @returns {Neo.component.Base} the card item
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
     *
     */
    onConstructed() {
        this.layout = {ntype: 'flexbox', ...this.getLayoutConfig()};
        super.onConstructed()
    }

    /**
     * Gets triggered once a dynamically added header.Button gets mounted
     * in case activateInsertedTabs is set to true
     * @param {String} buttonId
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
     * Removes a container item by reference
     * @param {Neo.component.Base} component
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
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
     * @param {Number} index
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
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
     * @protected
     */
    updateTabButtons() {
        let me            = this,
            {activeIndex} = me,
            tabButtons    = me.getTabBar().items || [];

        tabButtons.forEach((item, index) => {
            item.pressed = index === activeIndex
        })
    }
}

export default Neo.setupClass(Container);
