import BaseContainer from '../container/Base.mjs';
import HeaderButton  from './header/Button.mjs';
import HeaderToolbar from './header/Toolbar.mjs';
import NeoArray      from '../util/Array.mjs';
import Strip         from './Strip.mjs';

/**
 * @class Neo.tab.Container
 * @extends Neo.container.Base
 */
class Container extends BaseContainer {
    static getStaticConfig() {return {
        /**
         * Valid values for tabBarPosition
         * @member {String[]} tabBarPositions=['top', 'right', 'bottom', 'left']
         * @protected
         * @static
         */
        tabBarPositions: ['top', 'right', 'bottom', 'left']
    }}

    static getConfig() {return {
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
         * @member {Number} activeIndex_=0
         */
        activeIndex_: 0,
        /**
         * True will activate a tab which gets dynamically inserted / added after the TabContainer is mounted
         * @member {Boolean} activateInsertedTabs=false
         */
        activateInsertedTabs: false,
        /**
         * @member {String} baseCls='neo-tab-container'
         */
        baseCls: 'neo-tab-container',
        /**
         * @member {String|null} [cardContainerId]=null
         */
        cardContainerId: null,
        /**
         * adds baseCls + '-plain' is case plain is set to true
         * @member {String[]} cls=['neo-tab-container'],
         * @protected
         */
        cls: ['neo-tab-container'],
        /**
         * Default configs for the tab.Strip
         * @member {Object|null} [contentContainerDefaults]=null
         */
        contentContainerDefaults: null,
        /**
         * Default configs for the tab.HeaderToolbar
         * @member {Object|null} [headerToolbarDefaults]=null
         */
        headerToolbarDefaults: null,
        /**
         * True to not apply a background effect to the tab header container
         * @member {Boolean} plain_=true
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
         */
        sortable_: false,
        /**
         * @member {String|null} tabBarId=null
         */
        tabBarId: null,
        /**
         * Default configs for the tab.Strip
         * @member {Object|null} [tabStripDefaults]=null
         */
        tabStripDefaults: null,
        /**
         * @member {String|null} [tabStripId]=null
         */
        tabStripId: null,
        /**
         * The position of the tab header toolbar.
         * Valid values are top, right, bottom, left.
         * @member {String} tabBarPosition_='top'
         */
        tabBarPosition_: 'top',
        /**
         * @member {Boolean} useActiveTabIndicator_=true
         */
        useActiveTabIndicator_: true
    }}

    /**
     *
     */
    onConstructed() {
        this._layout = this.getLayoutConfig(); // silent update
        super.onConstructed();
    }

    /**
     * Adds one or multiple tabs at the end of the header
     * @param {Object|Array} item
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    add(item) {
        return this.insert(this.getTabBar().items.length, item);
    }

    /**
     * Triggered after the activeIndex config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetActiveIndex(value, oldValue) {
        if (oldValue !== undefined) {
            let me            = this,
                cardContainer = Neo.getComponent(me.cardContainerId);

            if (cardContainer && value > -1) {
                me.updateTabButtons();

                cardContainer.layout.activeIndex = value;

                me.fire('activeIndexChange', {
                    oldValue: oldValue,
                    value   : value
                });
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
        let me      = this,
            baseCls = me.baseCls,
            cls     = me.cls || [];

        NeoArray[value ? 'unshift' : 'remove'](cls, baseCls + '-plain');
        me.cls = cls;
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        if (oldValue !== undefined) {
            this.getTabBar().sortable = value;
        }
    }

    /**
     * Triggered after the tabBarPosition config got changed
     * @param {String} value 'top', 'right', 'bottom', 'left'
     * @param {String} oldValue 'top', 'right', 'bottom', 'left'
     * @protected
     */
    afterSetTabBarPosition(value, oldValue) {
        let me  = this,
            cls = me.cls;

        NeoArray.remove(cls, 'neo-' + oldValue);
        NeoArray.add(cls, 'neo-' + value);
        me.cls = cls;

        if (me.rendered) {
            me.layout = me.getLayoutConfig();
            me.getTabBar().dock = value;
            me.getTabStrip().cls = ['neo-tab-strip',  'neo-dock-' + value];

            me.fire('tabBarPositionChange', {
                component: me,
                oldValue : oldValue,
                value    : value
            });
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
            this.getTabBar()  .useActiveTabIndicator = value;
            this.getTabStrip().useActiveTabIndicator = value;
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
        return this.beforeSetEnumValue(value, oldValue, 'tabBarPosition');
    }

    /**
     *
     * @protected
     */
    createItems() {
        let me            = this,
            items         = me.items || [],
            tabButtons    = [],
            tabComponents = [];

        Object.assign(me, {
            cardContainerId: me.cardContainerId || Neo.getId('container'),
            tabBarId       : me.tabBarId        || Neo.getId('tab-header-toolbar'),
            tabStripId     : me.tabStripId      || Neo.getId('tab-strip')
        });

        items.forEach((item, index) => {
            tabButtons.push(me.getTabButtonConfig(item.tabButtonConfig, index));

            if (!(item instanceof Neo.component.Base)) {
                item = {...me.itemDefaults, flex: 1, isTab:true, ...item};
            }

            tabComponents.push(item);
        });

        me.items = [{
            module               : HeaderToolbar,
            dock                 : me.tabBarPosition,
            flex                 : 'none',
            id                   : me.tabBarId,
            items                : tabButtons,
            sortable             : me.sortable,
            useActiveTabIndicator: me.useActiveTabIndicator,
            ...me.headerToolbarDefaults || {}
        }, {
            module               : Strip,
            cls                  : ['neo-tab-strip', 'neo-dock-' + me.tabBarPosition],
            flex                 : 'none',
            id                   : me.tabStripId,
            tabContainerId       : me.id,
            useActiveTabIndicator: me.useActiveTabIndicator,
            ...me.tabStripDefaults || {}
        }, {
            ntype                : 'container',
            cls                  : ['neo-container', 'neo-tab-content-container'],
            id                   : me.cardContainerId,
            itemDefaults         : me.itemDefaults,
            items                : tabComponents,
            layout               : {ntype: 'card', activeIndex: me.activeIndex, removeInactiveCards: me.removeInactiveCards},
            useActiveTabIndicator: me.useActiveTabIndicator,
            ...me.contentContainerDefaults || {}
        }];

        me.itemDefaults = null;

        super.createItems();
    }

    /**
     * Returns the card matching this.activeIndex
     * @returns {Neo.component.Base|null}
     */
    getActiveCard() {
        return this.getCardContainer().items[this.activeIndex] || null;
    }

    /**
     * Returns a card by a given index
     * @param {Number} index
     * @returns {Neo.component.Base|null}
     */
    getCard(index) {
        return this.getCardContainer().items[index] || null;
    }

    /**
     * @returns {Neo.container.Base}
     */
    getCardContainer() {
        return Neo.getComponent(this.cardContainerId);
    }

    /**
     * Returns the amount of items inside the tab header toolbar
     * @returns {Number}
     */
    getCount() {
        return this.getTabBar().items.length;
    }

    /**
     *
     * @returns {Object} layoutConfig
     * @protected
     */
    getLayoutConfig() {
        let me           = this,
            layoutConfig = null;

        switch(me.tabBarPosition) {
            case 'bottom':
                layoutConfig = {
                    ntype    : 'vbox',
                    align    : 'stretch',
                    direction: 'column-reverse',
                    pack     : 'start'
                };
                break;
            case 'left':
                layoutConfig = {
                    ntype    : 'hbox',
                    align    : 'stretch',
                    direction: 'row',
                    pack     : 'start'
                };
                break;
            case 'right':
                layoutConfig = {
                    ntype    : 'hbox',
                    align    : 'stretch',
                    direction: 'row-reverse',
                    pack     : 'start'
                };
                break;
            case 'top':
                layoutConfig = {
                    ntype: 'vbox',
                    align: 'stretch'
                };
                break;
        }

        return layoutConfig;
    }

    /**
     *
     * @param {Number} index
     * @returns {Neo.tab.header.Button|null}
     */
    getTabAtIndex(index) {
        return this.getTabBar().items[index] || null;
    }

    /**
     * @returns {Neo.container.Toolbar}
     */
    getTabBar() {
        return Neo.getComponent(this.tabBarId);
    }

    /**
     *
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
                    click: function(data) {
                        me.activeIndex = data.component.index;
                    },
                    scope: me
                }]
            };

        return {...defaultConfig, ...config};
    }

    /**
     * @returns {Neo.tab.Strip}
     */
    getTabStrip() {
        return Neo.getComponent(this.tabStripId);
    }

    /**
     * Inserts an item or array of items at a specific index
     * @param {Number} index
     * @param {Object|Object[]} item
     * @returns {Neo.component.Base|Neo.component.Base[]}
     */
    insert(index, item) {
        let me            = this,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            hasItem       = false,
            i, len, superItem, tab, tabButtonConfig;

        if (Array.isArray(item)) {
            i   = 0;
            len = item.length;

            for (; i < len; i++) {
                // todo: render is async, ensure the order of items is correct

                // insert the array backwards
                item[i] = me.insert(item[len - 1], index);
            }
        } else if (typeof item === 'object') {
            i   = 0;
            len = cardContainer.items.length;

            for (; i < len; i++) {
                if (cardContainer.items[i].id === item.id) {
                    hasItem   = true;
                    superItem = cardContainer.items[i];
                    me.activeIndex = i;
                    break;
                }
            }
        }

        if (!hasItem) {
            tabButtonConfig = item.tabButtonConfig;

            tab = tabBar.insert(index, me.getTabButtonConfig(tabButtonConfig, index));

            // todo: non index based matching of tab buttons and cards
            i   = 0;
            len = tabBar.items.length;

            for (; i < len; i++) {
                tabBar.items[i].index = i;

            }

            item.flex = 1;
            superItem = cardContainer.insert(index, item);

            if (me.activateInsertedTabs) {
                if (!me.vnode) {
                    me.activeIndex = index;
                } else {
                    tab.on('mounted', me.onTabButtonMounted, me);
                }
            }
        }

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
            cardContainer.layout._activeIndex = index;
        }

        returnValue = cardContainer.moveTo(fromIndex, toIndex);

        me.fire('moveTo', {
            fromIndex: fromIndex,
            toIndex  : toIndex
        });

        return returnValue;
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
            card, listenerId;

        for (; i < len; i++) {
            if (tabBar.items[i].id === buttonId) {
                index = i;
                break;
            }
        }

        if (index > -1) {
            card = cardContainer.items[index];

            if (me.vnode && !card.mounted) {
                listenerId = card.on('mounted', () => {
                    card.un('mounted', listenerId);
                    me.activeIndex = index;
                });
            } else {
                me.activeIndex = index;
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
                this.removeAt(i, destroyItem, silent);
            }
        }
    }

    /**
     *
     * @param {Number} index
     * @param {Boolean} [destroyItem=true]
     * @param {Boolean} [silent=false]
     */
    removeAt(index, destroyItem=true, silent=false) {
        let me            = this,
            activeIndex   = me.activeIndex,
            cardContainer = me.getCardContainer(),
            tabBar        = me.getTabBar(),
            i, len;

        cardContainer.removeAt(index, destroyItem, silent);
        tabBar       .removeAt(index, true,        false);

        if (index < activeIndex) {
            // silent updates
            me._activeIndex = activeIndex - 1;
            cardContainer.layout._activeIndex = activeIndex - 1;
        } else if (index === activeIndex) {
            me.activeIndex = activeIndex - 1;
        }

        // todo: non index based matching of tab buttons and cards
        i   = 0;
        len = tabBar.items.length;

        for (; i < len; i++) {
            tabBar.items[i].index = i;
        }
    }

    /**
     *
     * @protected
     */
    updateTabButtons() {
        let me          = this,
            activeIndex = me.activeIndex,
            tabBar      = me.getTabBar(),
            tabButtons  = tabBar.items || [];

        tabButtons.forEach((item, index) => {
            item.pressed = index === activeIndex;
        });
    }
}

Neo.applyClassConfig(Container);

export {Container as default};