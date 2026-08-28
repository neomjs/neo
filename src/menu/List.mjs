import BaseList  from '../list/Base.mjs';
import ListModel from '../selection/menu/ListModel.mjs';
import Store     from './Store.mjs';

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
        selectionModel: ListModel,
        /**
         * Value for the list.Base store_ config
         * @member {Neo.menu.Store} store=Store
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
     * Checks if a record has items
     * @param {Object} record
     * @returns {Boolean}
     */
    hasChildren(record) {
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
     * @param {String} nodeId
     */
    onKeyDownEnter(nodeId) {
        if (nodeId) {
            let me       = this,
                recordId = me.getItemRecordId(nodeId),
                record   = me.store.get(recordId),
                submenu;

            me.callback(record.handler, me, [record]);

            record.route && Neo.Main.setRoute({
                appName: me.appName,
                value  : record.route
            });

            me.hideOnLeafItemClick && !record.items && me.unmount();

            if (record.items) {
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
                items          : record.items,
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
