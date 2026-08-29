import BaseList  from '../list/Base.mjs';
import ListModel from '../selection/menu/ListModel.mjs';
import Store     from './Store.mjs';
import TreeStore from '../data/TreeStore.mjs';

/**
 * A floating root menu forms one interaction island with its exact align target and every mounted
 * descendant submenu. While mounted, it listens on its own app main view so outside pointer input
 * can dismiss it even when a non-focusable target produces no focus transition. Focus movement uses
 * the same structural island; timing is never the ownership signal.
 *
 * @class Neo.menu.List
 * @extends Neo.list.Base
 */
class List extends BaseList {
    static config = {
        /**
         * @member {String} className='Neo.menu.List'
         * @protected
         */
        className: 'Neo.menu.List',
        /**
         * @member {String} ntype='menu-list'
         * @protected
         */
        ntype: 'menu-list',
        /**
         * Read only. We are storing the currently visible subMenu instance.
         * @member {Neo.menu.List|Neo.menu.Panel|null} activeSubMenu=null
         */
        activeSubMenu: null,
        /**
         * @member {String[]} baseCls=['neo-menu-list','neo-list']
         */
        baseCls: ['neo-menu-list', 'neo-list'],
        /**
         * Hides a floating list on leaf item click, in case it has a parentComponent
         * @member {Boolean} hideOnLeafItemClick=true
         */
        hideOnLeafItemClick: true,
        /**
         * Optionally pass menu.Store data directly
         * @member {Object[]|null} items_=null
         * @reactive
         */
        items_: null,
        /**
         * Internal flag.
         * Sub-menus will bubble focus changes to the top level.
         * @member {Boolean} menuFocus_=false
         * @protected
         * @reactive
         */
        menuFocus_: false,
        /**
         * Internal flag.
         * True for a top level menu, false for sub-menus.
         * @member {Boolean} isRoot=true
         * @protected
         */
        isRoot: true,
        /**
         * Storing the list item index of the parent menu in case it exists.
         * @member {Number} parentIndex=0
         * @protected
         */
        parentIndex: 0,
        /**
         * Storing a reference to the parent menu in case it exists.
         * @member {Neo.menu.List|Neo.menu.Panel|null} parentMenu=null
         * @protected
         */
        parentMenu: null,
        /**
         * Value for the list.Base selectionModel_ config
         * @member {Neo.selection.menu.ListModel} selectionModel=ListModel
         * @reactive
         */
        /**
         * The key of the record whose children this level renders.
         *
         * Only relevant when the menu is driven by a `Neo.data.TreeStore`. The root menu keeps the
         * default and renders the tree roots; every submenu is created with the key of the item that
         * opened it. Distinct from the inherited `parentId`, which is the VDOM parent node.
         * @member {String|Number} parentRecordId='root'
         */
        parentRecordId: 'root',
        /**
         * @member {Neo.selection.menu.ListModel} selectionModel=ListModel
         */
        selectionModel: ListModel,
        /**
         * Value for the list.Base store_ config.
         *
         * Accepts either a flat `Neo.menu.Store` (nested `items` arrays on each record) or a
         * `Neo.data.TreeStore` (hierarchy expressed via `parentId`). See `beforeSetStore()` for why a
         * tree store is not rendered directly.
         * @member {Neo.menu.Store|Neo.data.TreeStore} store=Store
         * @reactive
         */
        store: Store,
        /**
         * The distance in px between a menu and a child menu
         * See: https://github.com/neomjs/neo/issues/2569
         * @member {Number} subMenuGap=0
         */
        subMenuGap: 0,
        /**
         * Storing childMenus by record keyProperty
         * @member {Object} subMenuMap=null
         * @protected
         */
        subMenuMap: null,
        /**
         * We are applying a z-index style which is 1 number higher to each sub-menu
         * @member {Number} zIndex_=100
         * @reactive
         */
        zIndex_: 100,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tag: 'ul', cn: []}
    }

    /**
     * The exact listener config attached to the owning app's main view while this floating root is mounted.
     * @member {Object|null} outsidePointerListener=null
     * @protected
     */
    outsidePointerListener = null
    /**
     * The main view currently carrying `outsidePointerListener`.
     * @member {Neo.component.Base|null} outsidePointerListenerOwner=null
     * @protected
     */
    outsidePointerListenerOwner = null
    /**
     * The hierarchy source, when this menu is driven by a `Neo.data.TreeStore`.
     *
     * The tree store is the single source of truth and is shared by every level of the cascade; it is
     * never owned by a level and never destroyed by one. Each level renders the flat `store` derived
     * from it. Null for the classic nested-`items` API.
     * @member {Neo.data.TreeStore|null} sourceStore=null
     * @protected
     */
    sourceStore = null

    /**
     * Triggered after the items config got changed
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetItems(value, oldValue) {
        let {store} = this;

        oldValue && store.clear(); // we can not use remove() here, since items are no records => often no id
        value    && store.add(value)
    }

    /**
     * Triggered after the menuFocus config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMenuFocus(value, oldValue) {
        if (oldValue !== undefined) {
            let me = this;

            if (me.isRoot) {
                if (!value) {
                    me[me.floating ? 'unmount' : 'hideSubMenu']()
                }
            } else {
                // bubble the focus change upwards
                me.parentMenu.menuFocus = value
            }
        }
    }

    /**
     * Keeps the app-root outside-pointer listener symmetric with the floating root's mounted lifecycle.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (oldValue !== undefined && this.isRoot && this.floating) {
            this.syncOutsidePointerListener(value)
        }
    }

    /**
     * Triggered after the theme config got changed
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetTheme(value, oldValue) {
        super.afterSetTheme(value, oldValue);

        Object.values(this.subMenuMap || {}).forEach(menu => {
            menu.theme = value
        })
    }

    /**
     * Triggered after the zIndex config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetZIndex(value, oldValue) {
        this.style = {...this.style, zIndex: value}
    }

    /**
     * Triggered before the store config gets changed.
     *
     * A `Neo.data.TreeStore` is deliberately NOT handed to `list.Base` for rendering. The inherited
     * index math walks the full store: `getSelectedIndex()` and `getHeaderlessIndex()` both index into
     * `store.items`. A level rendering only a subset of a shared tree store would therefore resolve
     * selection and key navigation against every record in the tree while its DOM held one level —
     * it would render correctly and mis-target silently.
     *
     * Instead the tree store is kept as `sourceStore` and this level receives its own flat store
     * holding exactly the records it renders. `syncLevelRecords()` fills it once the configs are applied.
     * @param {Object|Neo.data.Store|Neo.data.TreeStore} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (value instanceof TreeStore) {
            this.sourceStore = value;

            // The level store reuses the tree store's model CLASS, so its records keep every field the
            // hierarchy declares (isLeaf, parentId, depth) next to the menu fields. Re-adding records
            // under menu.Model instead would silently drop them, and hasChildren() reads isLeaf.
            // A fresh instance, not the shared one: a level owns and destroys its own store, never the source.
            value = {model: value.model.constructor, module: Store}
        }

        return super.beforeSetStore(value, oldValue)
    }

    /**
     * Override this method for custom renderers
     * @param {Object} record
     * @param {Number} index
     * @returns {Object|Object[]|String} Either a config object to assign to the item, a vdom cn array or a html string
     */
    createItemContent(record, index) {
        let me        = this,
            {iconCls} = record,
            id        = me.store.getKey(record),
            vdomCn    = [{tag: 'span', cls: ['neo-content'], text: record[me.displayField]}];

        if (iconCls && iconCls !== '') {
            vdomCn.unshift({tag: 'i', cls: ['neo-menu-icon', 'neo-icon', iconCls], id: me.getIconId(id)})
        }

        if (me.hasChildren(record)) {
            vdomCn.push({tag: 'i', cls: ['neo-arrow-icon', 'neo-icon', 'fas fa-chevron-right'], id: me.getArrowIconId(id)})
        }

        return vdomCn
    }

    /**
     *
     */
    destroy(...args) {
        let me              = this,
            {activeSubMenu} = me,
            subMenuMap      = me.subMenuMap || {};

        me.syncOutsidePointerListener(false);
        activeSubMenu?.unmount();

        // The tree store outlives every level, so a level that stops rendering must stop listening.
        // Its own object literal — on() and un() both consume keys from what they are handed.
        me.sourceStore?.un({
            mutate      : me.onSourceStoreMutate,
            recordChange: me.onSourceStoreRecordChange,
            sort        : me.onSourceStoreSort,
            scope       : me
        });

        Object.entries(subMenuMap).forEach(([key, value]) => {
            value.destroy();
            subMenuMap[key] = null
        });

        super.destroy(...args)
    }

    /**
     * @summary Tests whether a serialized DOM path belongs to this menu tree or its exact trigger.
     * @param {Object[]} [path]
     * @returns {Boolean}
     * @protected
     */
    isInteractionPath(path=[]) {
        const ids  = new Set(path.map(item => item.id).filter(Boolean));
        let   root = this;

        while (root.parentMenu) {
            root = root.parentMenu
        }

        const menus = [root];
        let   menu;

        while ((menu = menus.pop())) {
            if (ids.has(menu.id)) {
                return true
            }

            Object.values(menu.subMenuMap || {}).forEach(submenu => {
                submenu?.mounted && menus.push(submenu)
            })
        }

        return Neo.isString(root.align?.target) && ids.has(root.align.target)
    }

    /**
     * Dismisses a floating root from pointer input outside the complete menu interaction island.
     * @param {Object} data
     * @param {Object[]} [data.path]
     * @protected
     */
    onAppMouseDown(data) {
        if (this.isRoot && this.floating && !this.isInteractionPath(data.path)) {
            this.unmount()
        }
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getArrowIconId(recordId) {
        return `${this.id}__arrow_icon__${recordId}`
    }

    /**
     * @param {Number|String} recordId
     * @returns {String}
     */
    getIconId(recordId) {
        return `${this.id}__icon__${recordId}`
    }

    /**
     * recordIds can be Numbers, so we do need a prefix
     * @param {Number|String} recordId
     * @returns {String}
     */
    getMenuMapId(recordId) {
        return `menu__${recordId}`
    }

    /**
     * Returns the data-related configs for a child level, for whichever store shape drives this menu.
     *
     * Tree-driven levels share the one `sourceStore` and identify their slice by `parentRecordId`;
     * classic levels keep handing down the nested `items` array. Kept as its own method so both shapes
     * stay side by side and visible, instead of hiding a branch inside `showSubMenu()`'s config literal.
     * @param {Object} record The item that opened the submenu
     * @returns {Object}
     * @protected
     */
    getSubMenuData(record) {
        let me = this;

        if (me.sourceStore) {
            return {
                parentRecordId: me.store.getKey(record),
                store         : me.sourceStore
            }
        }

        return {items: record.items}
    }

    /**
     * Checks if a record has items
     * @param {Object} record
     * @returns {Boolean}
     */
    hasChildren(record) {
        // TreeModel declares isLeaf: true by default, so a branch node opts in explicitly. Testing the
        // declared flag rather than childCount keeps async subtree loading intact: a branch whose
        // children have not arrived yet must still render its arrow and open.
        if (this.sourceStore) {
            return record.isLeaf === false
        }

        return Array.isArray(record.items) && record.items.length > 0
    }

    /**
     *
     */
    hideSubMenu() {
        let {activeSubMenu} = this;

        if (activeSubMenu) {
            activeSubMenu.unmount();
            this.activeSubMenu = null
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.path
     */
    onFocusEnter(data) {
        super.onFocusEnter(data);
        this.menuFocus = true
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.oldPath
     */
    onFocusLeave(data) {
        super.onFocusLeave(data);

        const leftPathIsOwnTree = data.oldPath?.some(item => item.id === this.id);

        if (!data.relatedTarget || leftPathIsOwnTree || !this.isInteractionPath(data.oldPath)) {
            this.menuFocus = false
        }
    }

    /**
     * Adds or removes one retained `mousedown` config on the owning app main view.
     * @param {Boolean} attach
     * @protected
     */
    syncOutsidePointerListener(attach) {
        let me    = this,
            owner = me.outsidePointerListenerOwner;

        if (attach && !owner) {
            owner = me.app?.mainView;

            if (owner) {
                me.outsidePointerListener ||= {mousedown: me.onAppMouseDown, scope: me};
                owner.addDomListeners(me.outsidePointerListener);
                me.outsidePointerListenerOwner = owner
            }
        } else if (!attach && owner) {
            owner.removeDomListeners(me.outsidePointerListener);
            me.outsidePointerListenerOwner = null
        }
    }

    /**
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        super.onItemClick(node, data);

        this.onKeyDownEnter(node.id)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.sourceStore) {
            me.syncLevelRecords();

            // Its own object: Observable#on() and #un() CONSUME keys from what they are handed
            // (`scope` among them), so the two calls can never share one literal.
            me.sourceStore.on({
                mutate      : me.onSourceStoreMutate,
                recordChange: me.onSourceStoreRecordChange,
                sort        : me.onSourceStoreSort,
                scope       : me
            })
        }
    }

    /**
     * @param {String} nodeId
     */
    onKeyDownEnter(nodeId) {
        if (nodeId) {
            let me          = this,
                recordId    = me.getItemRecordId(nodeId),
                record      = me.store.get(recordId),
                hasChildren = me.hasChildren(record),
                submenu;

            me.callback(record.handler, me, [record]);

            record.route && Neo.Main.setRoute({
                appName: me.appName,
                value  : record.route
            });

            // hasChildren() is the single branch predicate: it is store-shape aware, and it does not
            // treat an empty `items: []` array as a parent the way a raw truthiness test would.
            if (me.hideOnLeafItemClick && !hasChildren) {
                /*
                    Through the SETTER, and that is the whole point. `afterSetMenuFocus` is the only
                    path that closes ANCESTORS: a non-root menu bubbles to `parentMenu`, recursing
                    until the floating root unmounts itself and cascades back down via `hideSubMenu()`.

                    `unmount()` writes `_menuFocus` silently on purpose — reaching it *from*
                    `afterSetMenuFocus` must not re-enter that hook. But a leaf click reaches
                    `unmount()` directly, so calling it first swallowed the only signal the ancestors
                    ever get, and left the submenu closed under a still-open parent. It also disarmed
                    the fallback: a later `menuFocus = false` from `onFocusLeave` found the value
                    already false, so the setter fired nothing.
                */
                me.menuFocus = false;

                // The root's cascade may already have taken this menu down.
                me.mounted && me.unmount()
            }

            if (hasChildren) {
                submenu = me.subMenuMap?.[me.getMenuMapId(recordId)];

                if (submenu) {
                    me.toggleSubMenu(nodeId, record)
                }
            }
        }
    }

    /**
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        this.floating && this.unmount()
    }

    /**
     * @param {String[]} items
     */
    onSelect(items) {
        let me       = this,
            nodeId   = items[0],
            recordId = me.getItemRecordId(nodeId),
            record   = me.store.get(recordId);

        if (me.activeSubMenu !== me.subMenuMap?.[me.getMenuMapId(recordId)]) {
            me.hideSubMenu();
            me.hasChildren(record) && me.showSubMenu(nodeId, record)
        }
    }

    /**
     * @param {String} nodeId
     * @param {Object} record
     */
    showSubMenu(nodeId, record) {
        const
            me           = this,
            {store}      = me,
            recordId     = store.getKey(record),
            subMenuMap   = me.subMenuMap || (me.subMenuMap = {}),
            subMenuMapId = me.getMenuMapId(recordId),
            subMenu      = subMenuMap[subMenuMapId] || (subMenuMap[subMenuMapId] = Neo.create({
                module: List,
                align : {
                    target      : nodeId,
                    edgeAlign   : 'l0-r0',
                    axisLock    : true,
                    targetMargin: me.subMenuGap
                },
                appName        : me.appName,
                displayField   : me.displayField,
                floating       : true,
                ...me.getSubMenuData(record),
                isRoot         : false,
                parentComponent: me.parentComponent,
                parentId       : me.app.mainView.id,
                parentIndex    : store.indexOf(record),
                parentMenu     : me,
                theme          : me.theme,
                zIndex         : me.zIndex + 1
            }));

        if (me.activeSubMenu !== subMenu) {
            me.activeSubMenu = subMenu;
            subMenu.initVnode(true)
        }
    }

    /**
     * A mutation anywhere in the shared tree is broadcast to every level. Only the records parented by
     * this level's `parentRecordId` belong here.
     * @param {Object} record
     * @returns {Boolean}
     * @protected
     */
    belongsToLevel(record) {
        return (record.parentId || 'root') === this.parentRecordId
    }

    /**
     * Splices this level for a tree mutation, rather than re-deriving it.
     *
     * Records contributed to a group after mount therefore appear without rebuilding the cascade, and
     * order follows the Structural Layer — so a sort applied to the tree store reaches every level.
     * @param {Object} data
     * @param {Object[]} data.addedItems
     * @param {Object[]} data.removedItems
     * @protected
     */
    onSourceStoreMutate(data) {
        let me            = this,
            {sourceStore} = me,
            removed       = (data.removedItems || []).filter(record => me.belongsToLevel(record)),
            added         = (data.addedItems   || [])
                .filter(record => me.belongsToLevel(record))
                // Resolve every addition through the source before inserting it. The mutate payload can
                // carry raw data, and letting the level store hydrate that would mint a SECOND record
                // instance for the same key. Levels resolve a later recordChange by identity, so a clone
                // is not merely wasteful — the row silently stops updating for the rest of its life.
                .map(record => sourceStore.get(sourceStore.getKey(record)) || record);

        // Splicing the level store is enough to repaint it: the collection turns a mutation into a
        // `load` (via onCollectionMutate), which list.Base already re-renders on. Calling createItems()
        // here as well rendered the level twice per contribution.
        removed.length && me.store.remove(removed);
        added.length   && me.store.add(added)
    }

    /**
     * Re-derives this level after the tree store sorts.
     *
     * A sort reorders the Structural Layer wholesale, so sibling order is controlled at the tree and
     * every level follows it. Re-deriving is correct here precisely because nothing is spliceable —
     * unlike a mutation, a sort has no added or removed set.
     * @protected
     */
    onSourceStoreSort() {
        // syncLevelRecords() clears and refills the level store, and that mutation repaints it through
        // the same load path a contribution uses. No explicit re-render here either.
        this.syncLevelRecords()
    }

    /**
     * Repaints the single row a changed record occupies, if this level renders it.
     *
     * A level shares record INSTANCES with the tree store, so the data is already current — only the
     * rendering needs to catch up. `data.index` from the source is the tree's projection index and is
     * meaningless here, so the row is resolved against this level's own store.
     * @param {Object} data
     * @param {Object} data.record
     * @protected
     */
    onSourceStoreRecordChange(data) {
        let me    = this,
            index = me.store.indexOf(data.record);

        index > -1 && me.onStoreRecordChange({...data, index})
    }

    /**
     * Fills this level's flat store with exactly the records it renders.
     *
     * A no-op for the classic nested-`items` API, where `afterSetItems()` already owns the contents.
     * Driven from `onConstructed()` rather than a config setter because the derivation needs both
     * `sourceStore` and `parentRecordId`, and config application order is not a contract worth
     * depending on.
     * @protected
     */
    syncLevelRecords() {
        let me = this;

        if (me.sourceStore) {
            me.store.clear();
            me.store.add(me.sourceStore.getChildren(me.parentRecordId))
        }
    }

    /**
     * @param {String} nodeId
     * @param {Object} record
     */
    toggleSubMenu(nodeId, record) {
        let me       = this,
            recordId = me.store.getKey(record),
            submenu  = me.subMenuMap?.[me.getMenuMapId(recordId)];

        if (!submenu?.mounted) {
            me.showSubMenu(nodeId, record)
        } else {
            me.hideSubMenu()
        }
    }

    /**
     *
     */
    unmount() {
        this._menuFocus = false;
        this.selectionModel?.deselectAll(true); // silent update
        this.hideSubMenu();

        super.unmount()
    }
}

export default Neo.setupClass(List);
