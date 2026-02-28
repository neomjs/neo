import Base            from '../list/Base.mjs';
import ClassSystemUtil from '../util/ClassSystem.mjs';
import Collection      from '../collection/Base.mjs';
import NeoArray        from '../util/Array.mjs';
import TreeModel       from '../selection/TreeModel.mjs';
import VDomUtil        from "../util/VDom.mjs";

/**
 * @summary A hierarchical list component supporting nested folders, expansion, and sticky headers.
 *
 * This component renders hierarchical data structures (trees) using a flat store managed by a `Neo.selection.TreeModel`.
 * It provides built-in support for:
 * - **Recursive rendering:** Efficiently renders deeply nested folder structures.
 * - **Collapsible folders:** Interactive expand/collapse functionality for branch nodes.
 * - **Sticky Headers:** Folder headers use CSS `position: sticky` to remain visible while scrolling through their content.
 * - **Stuck State Detection:** When `saveScrollPosition` is enabled, the component tracks the sticky state via JS and applies
 *   a `.neo-stuck` class to headers that are currently pinned. This is useful for visual customization, such as applying
 *   backgrounds to transparent items.
 * - **Drag and Drop:** Supports reordering via `dragResortable` or moving items between lists via `draggable`.
 * - **Filtering:** Deep-filtering that preserves folder structures for matched leaf nodes.
 *
 * Keywords: `Hierarchical Data`, `Tree View`, `Recursive List`, `Sticky Headers`, `Folder View`
 *
 * @class Neo.tree.List
 * @extends Neo.list.Base
 * @see Neo.selection.TreeModel
 */
class Tree extends Base {
    static config = {
        /**
         * @member {String} className='Neo.tree.List'
         * @protected
         */
        className: 'Neo.tree.List',
        /**
         * @member {String} ntype='treelist'
         * @protected
         */
        ntype: 'treelist',
        /**
         * @member {String[]} baseCls=['neo-tree-list']
         */
        baseCls: ['neo-tree-list'],
        /**
         * @member {Boolean} disableSelection=false
         * @reactive
         */
        disableSelection: false,
        /**
         * @member {Boolean} dragResortable_=false
         * @reactive
         */
        dragResortable_: false,
        /**
         * @member {Neo.draggable.tree.DragZone|null} dragZone=null
         */
        dragZone: null,
        /**
         * @member {String} folderCls='neo-list-folder'
         */
        folderCls: 'neo-list-folder',
        /**
         * @member {Boolean} showCollapseExpandAllIcons=true
         */
        showCollapseExpandAllIcons: true,
        /**
         * @member {Neo.draggable.tree.SortZone|null} sortZone=null
         */
        sortZone: null,
        /**
         * @member {Object} dragZoneConfig=null
         */
        sortZoneConfig: null,
        /**
         * @member {String[]} wrapperCls=[]
         * @reactive
         */
        wrapperCls: [],
        /**
         * Set this config to true to monitor the scroll position of the list.
         * This enables the `onScrollCapture` logic which calculates if sticky folder headers
         * are currently in a "stuck" state (pinned to the top), applying the `.neo-stuck` CSS class.
         * Useful for applying visual changes (e.g. background opacity) only when headers are sticking.
         * @member {Boolean} saveScrollPosition=false
         */
        saveScrollPosition: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'ul', cls: ['neo-list-container', 'neo-list'], tabIndex: -1, cn: []}
        ]}
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me = this;

        if (value) {
            if (me.dragResortable) {
                console.error('tree.List can be either draggable or dragResortable, not both.', me.id)
            } else if (!me.dragZone) {
                import('../draggable/tree/DragZone.mjs').then(module => {
                    me.dragZone = Neo.create({
                        module  : module.default,
                        appName : me.appName,
                        owner   : me,
                        windowId: me.windowId,
                        ...me.dragZoneConfig
                    })
                })
            }
        }
    }

    /**
     * Triggered after the dragResortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDragResortable(value, oldValue) {
        let me = this;

        if (value) {
            if (me.draggable) {
                console.error('tree.List can be either draggable or dragResortable, not both.', me.id)
            } else if (!me.sortZone) {
                import('../draggable/tree/SortZone.mjs').then(module => {
                    me.sortZone = Neo.create({
                        module             : module.default,
                        appName            : me.appName,
                        boundaryContainerId: me.id,
                        owner              : me,
                        windowId           : me.windowId,
                        ...me.sortZoneConfig
                    })
                })
            }
        }
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @returns {Neo.selection.Model}
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, TreeModel)
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Object|Neo.data.Store} value
     * @param {Object|Neo.data.Store} oldValue
     * @returns {Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        if (!value) {
            value = Neo.create(Collection, {
                keyProperty: 'id'
            })
        }

        return super.beforeSetStore(value, oldValue)
    }


    /**
     * Collapses all folders
     * @param {Boolean} [silent]=false Set silent to true to prevent a vnode update
     */
    collapseAll(silent=false) {
        let me       = this,
            hasMatch = false,
            nextSibling, node, parentNode, index;

        me.store.forEach(item => {
            if (!item.isLeaf) {
                node = me.getVdomChild(me.getItemId(item.id), me.vdom);

                if (node.cls.includes('neo-folder-open')) {
                    NeoArray.remove(node.cls, 'neo-folder-open');

                    ({parentNode, index} = VDomUtil.find(me.vdom, node.id));
                    nextSibling          = parentNode.cn[index + 1];

                    node.style.position = null;
                    node.style.top      = null;

                    if (nextSibling?.tag === 'ul') {
                        nextSibling.removeDom = true
                    }

                    hasMatch = true
                }
            }
        });

        if (hasMatch && !silent) {
            me.update()
        }
    }

    /**
     * Creates the VDOM object for a single tree item (leaf or folder).
     *
     * This method is the core VDOM factory for the tree. It constructs the `li` element
     * representing a record. Key responsibilities:
     * 1.  **Class Assignment:** Applies `itemCls`, `folderCls`, and `iconCls` based on record state.
     * 2.  **Hierarchy visualization:** Calculates `zIndex` and `padding` based on depth (`level`).
     * 3.  **Sticky Positioning:** Sets `position: sticky` and calculates `top` offsets for folder nodes
     *     to ensure they stack correctly while scrolling.
     * 4.  **Content:** Creates the label and icon structure.
     *
     * @param {Object} record The data record from the store
     * @returns {Object} The VDOM object for the list item
     */
    createItem(record) {
        let me                   = this,
            {folderCls, itemCls} = me,
            cls                  = [itemCls],
            contentCls           = [itemCls + '-content'],
            keyProperty          = me.getKeyProperty(),
            itemVdom;

        if (record.iconCls) {
            if (Array.isArray(record.iconCls)) {
                contentCls.push(...record.iconCls)
            } else {
                contentCls.push(record.iconCls)
            }
        }

        if (record.isLeaf) {
            cls.push(itemCls + (record.singleton ? '-leaf-singleton' : '-leaf'))
        } else {
            cls.push(folderCls);

            if (!record.collapsed) {
                cls.push('neo-folder-open')
            }
        }

        itemVdom = {
            tag: 'li',
            cls,
            id   : me.getItemId(record[keyProperty]),
            level: record.level,
            cn   : [{
                tag  : 'span',
                cls  : contentCls,
                html : record[me.displayField],
                style: {pointerEvents: 'none'}
            }],
            style: {
                '--neo-tree-level': record.level,
                display           : record.hidden ? 'none' : 'flex',
                padding           : '10px',
                position          : (record.isLeaf || record.collapsed) ? null : 'sticky',
                top               : (record.isLeaf || record.collapsed) ? null : (record.level * 38) + 'px',
                zIndex            : record.isLeaf ? 1 : (10000 + record.level)
            }
        };

        if (me.itemsFocusable) {
            itemVdom.tabIndex = -1
        }

        return itemVdom
    }

    /**
     * Recursively generates the VDOM tree structure starting from a given parent.
     *
     * This method implements the recursive logic required to turn a flat store into a
     * hierarchical DOM structure.
     * - It finds all direct children of the `parentId`.
     * - It creates a `ul` container for them.
     * - For each child, it calls `createItem` to generate the node.
     * - It recursively calls itself (`createItemLevel`) for each child to build the next level.
     *
     * This approach ensures that the visual hierarchy matches the data relationship,
     * supporting arbitrary depth.
     *
     * @param {String} [parentId] The parent node id (null for root level)
     * @param {Object} [vdomRoot] The vdom template root for the current sub tree
     * @param {Number} level The current hierarchy level (depth)
     * @param {Boolean} hidden=false Whether this branch is currently hidden (collapsed parent)
     * @returns {Object} vdomRoot
     * @protected
     */
    createItemLevel(parentId, vdomRoot, level, hidden=false) {
        let me    = this,
            items = me.store.find('parentId', parentId),
            tmpRoot;

        if (items.length > 0) {
            if (!vdomRoot.cn) {
                vdomRoot.cn = []
            }

            if (parentId !== null) {
                vdomRoot.cn.push({
                    tag      : 'ul',
                    cls      : ['neo-list'],
                    cn       : [],
                    removeDom: hidden,
                    style    : {
                        paddingLeft: '15px'
                    }
                });

                tmpRoot = vdomRoot.cn[vdomRoot.cn.length - 1]
            } else {
                tmpRoot = vdomRoot
            }

            items.forEach(record => {
                record.level = level;

                tmpRoot.cn.push(me.createItem(record));

                me.createItemLevel(record.id, tmpRoot, level + 1, record.hidden || hidden || record.collapsed)
            })
        }

        return vdomRoot
    }

    /**
     * The main entry point for rendering the tree's content.
     *
     * This method clears the current list content and initiates the recursive rendering process
     * by calling `createItemLevel` starting from the root (null parent).
     * It is typically called when the store is loaded or when a full refresh is needed.
     *
     * @protected
     */
    createItems() {
        let me        = this,
            itemsRoot = me.getListItemsRoot();

        itemsRoot.cn = [];

        me.createItemLevel(null, itemsRoot, 0);
        me.update()
    }

    /**
     * Expands all folders
     * @param {Boolean} silent=false Set silent to true to prevent a vnode update
     */
    expandAll(silent=false) {
        let me       = this,
            hasMatch = false,
            nextSibling, node, parentNode, index;

        me.store.forEach(item => {
            if (!item.isLeaf) {
                node = me.getVdomChild(me.getItemId(item.id), me.vdom);

                if (!node.cls.includes('neo-folder-open')) {
                    NeoArray.add(node.cls, 'neo-folder-open');

                    ({parentNode, index} = VDomUtil.find(me.vdom, node.id));
                    nextSibling          = parentNode.cn[index + 1];

                    node.style.position = 'sticky';
                    node.style.top      = (node.level * 38) + 'px';

                    if (nextSibling?.tag === 'ul') {
                        nextSibling.removeDom = false
                    }

                    hasMatch = true
                }
            }
        });

        if (hasMatch && !silent) {
            me.update()
        }
    }

    /**
     * Expands all parent nodes of a given item and scrolls it into view once mounted.
     * @param {String|Number} itemId
     * @returns {Promise<void>}
     */
    async expandAndScrollToItem(itemId) {
        let me = this;

        me.expandParents(itemId);

        const
            id   = me.getItemId(itemId),
            rect = await me.waitForDomRect({id, attempts: 20, delay: 50});

        if (rect) {
            me.scrollToItem(itemId)
        }
    }

    /**
     * Expands all parent folders of a given item
     * @param {String|Number} itemId
     */
    expandParents(itemId) {
        let me       = this,
            item     = me.store.get(itemId),
            hasMatch = false,
            nextSibling, node, parentId, parentNode, index;

        if (item) {
            parentId = item.parentId;

            while (parentId) {
                node = me.getVdomChild(me.getItemId(parentId));

                if (node && !node.cls.includes('neo-folder-open')) {
                    NeoArray.add(node.cls, 'neo-folder-open');

                    ({parentNode, index} = VDomUtil.find(me.vdom, node.id));
                    nextSibling          = parentNode.cn[index + 1];

                    node.style.position = 'sticky';
                    node.style.top      = (node.level * 38) + 'px';

                    if (nextSibling?.tag === 'ul') {
                        nextSibling.removeDom = false
                    }

                    hasMatch = true
                }

                item     = me.store.get(parentId);
                parentId = item ? item.parentId : null
            }
        }

        if (hasMatch) {
            me.update()
        }
    }

    /**
     * Hides Tree nodes which do not match the filter
     * @param {String} property The store field to filter by
     * @param {String} value The filter value
     * @param {Number|null} parentId The root id for the current filter call
     * @param {Boolean} [parentMatch]=false In case a parent folder matches the filter, show its child items
     * @returns {Boolean} false if at least one child item is filtered
     */
    filter(property, value, parentId, parentMatch = false) {
        let me         = this,
            isFiltered = true,
            valueRegEx = new RegExp(value, 'gi'),
            childReturnValue, directMatch, node;

        if (!value) {
            value = ''
        }

        me.store.forEach(item => {
            if (item.parentId === parentId) {
                directMatch = false;
                node        = me.getVdomChild(me.getItemId(item.id), me.vdom);

                node.cn[0].html = item[property].replace(valueRegEx, match => {
                    directMatch = true;
                    return `<span class="neo-highlight-search">${match}</span>`
                });

                if (item.isLeaf) {
                    childReturnValue = true
                } else {
                    childReturnValue = me.filter(property, value, item.id, directMatch || parentMatch)
                }

                if (directMatch || parentMatch || childReturnValue === false || value === '') {
                    isFiltered = false
                }

                node.style.display = isFiltered ? 'none' : 'list-item'
            }
        });

        if (parentId === null) {
            me.expandAll(true);
            me.update()
        }

        return isFiltered
    }

    /**
     * Scrolls a list item into the visible area
     * @param {String|Number} itemId
     */
    scrollToItem(itemId) {
        let me = this;

        Neo.main.DomAccess.scrollIntoView({
            id      : me.getItemId(itemId),
            inline  : 'start',
            windowId: me.windowId
        })
    }

    /**
     * @returns {Object}
     */
    getListItemsRoot() {
        let me = this,
            cn = me.vdom.cn;

        if (cn.length >= 3 && cn[0].cls?.includes('neo-treelist-collapse-all-icon')) {
            return cn[2]
        }

        return cn[0]
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        if (data.target.cls.includes('neo-treelist-menu-item')) {
            this.onMenuItemClick(data.target.cls)
        } else {
            super.onClick(data)
        }
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.showCollapseExpandAllIcons) {
            me.vdom.cn.unshift({
                cls: ['neo-treelist-menu-item', 'neo-treelist-collapse-all-icon'],
                cn : [{
                    tag: 'span',
                    cls: ['neo-treelist-menu-item-content']
                }]
            }, {
                cls: ['neo-treelist-menu-item', 'neo-treelist-expand-all-icon'],
                cn : [{
                    tag: 'span',
                    cls: ['neo-treelist-menu-item-content']
                }]
            });

            me.update()
        }
    }

    /**
     * @param {Object} node
     * @param {Object} data
     */
    onItemClick(node, data) {
        let me          = this,
            {items}     = me.store,
            i           = 0,
            len         = items.length,
            keyProperty = me.getKeyProperty(),
            path        = data.path.map(e => e.id),
            item, record, tmpItem, vnodeId;

        for (; i < len; i++) {
            tmpItem = items[i];
            vnodeId = me.getItemId(tmpItem[keyProperty]);

            if (path.includes(vnodeId)) {
                record = tmpItem;
                item = me.getVdomChild(vnodeId);
                break
            }
        }

        if (item) {
            if (item.cls?.includes(me.folderCls)) {
                NeoArray.toggle(item.cls, 'neo-folder-open');

                let isOpen              = item.cls.includes('neo-folder-open'),
                    {parentNode, index} = VDomUtil.find(me.vdom, item.id),
                    nextSibling         = parentNode.cn[index + 1];

                item.style.position = isOpen ? 'sticky' : null;
                item.style.top      = isOpen ? (item.level * 38) + 'px' : null;

                if (nextSibling?.tag === 'ul') {
                    nextSibling.removeDom = !isOpen
                }

                me.update()
            } else {
                me.onLeafItemClick(record);

                /**
                 * The leafItemClick event fires when a click occurs on a list item which does not have child items.
                 * Passes the item record to the event handler.
                 * @event leafItemClick
                 * @returns {Object} record
                 */
                me.fire('leafItemClick', record)
            }

            super.onItemClick(node, data)
        }
    }

    /**
     * Placeholder method
     * @param {Object} record
     */
    onLeafItemClick(record) {

    }

    /**
     * Gets triggered by clicks on the collapse or expand all icons
     * @param {Array} cls
     * @protected
     */
    onMenuItemClick(cls) {
        if (cls.includes('neo-treelist-collapse-all-icon')) {
            this.collapseAll()
        } else {
            this.expandAll()
        }
    }

    /**
     * Captures the scroll stream from the Main Thread to detect sticky states.
     *
     * When `saveScrollPosition` is true, this method calculates which folder headers are currently
     * pinned ("stuck") to the top of the viewport by comparing their computed `top` style with
     * the current `scrollTop`. It toggles the `neo-stuck` class on these items, allowing for
     * conditional styling (e.g. background opacity) only when headers are sticking.
     *
     * @param {Object} data
     * @param {Number} data.scrollTop The current scroll position
     */
    onScrollCapture(data) {
        super.onScrollCapture(data);

        let me = this;

        if (me.saveScrollPosition) {
            let scrollTop       = data.scrollTop,
                needsUpdate     = false,
                y               = 0,
                stuckCandidates = {};

            const traverse = (node) => {
                if (!node.cn) return;

                let lastFolderOpen = true;

                node.cn.forEach(child => {
                    if (child.tag === 'li') {
                        if (child.cls.includes(me.folderCls)) {
                            let topStyle = child.style.top;

                            if (topStyle) {
                                let isStuck = scrollTop > 0 && (y - scrollTop) <= parseInt(topStyle);

                                if (isStuck) {
                                    let level = child.level || 0;
                                    stuckCandidates[level] ??= [];
                                    stuckCandidates[level].push(child)
                                } else {
                                    if (child.cls.includes('neo-stuck')) {
                                        NeoArray.remove(child.cls, 'neo-stuck');
                                        needsUpdate = true
                                    }
                                }
                            }

                            lastFolderOpen = child.cls.includes('neo-folder-open')
                        } else {
                            lastFolderOpen = true
                        }

                        if (child.style?.display !== 'none' && !child.removeDom) {
                            y += 51
                        }
                    } else if (child.tag === 'ul') {
                        if (lastFolderOpen && !child.removeDom) {
                            traverse(child)
                        }
                    }
                })
            };

            if (me.vdom.cn && me.vdom.cn[0]) {
                traverse(me.vdom.cn[0])
            }

            Object.values(stuckCandidates).forEach(items => {
                let last = items[items.length - 1];

                items.forEach(item => {
                    let shouldBeStuck = (item === last),
                        hasClass      = item.cls.includes('neo-stuck');

                    if (shouldBeStuck !== hasClass) {
                        NeoArray.toggle(item.cls, 'neo-stuck', shouldBeStuck);
                        needsUpdate = true
                    }
                })
            });

            if (needsUpdate) {
                me.update()
            }
        }
    }

    /**
     * @param {Object} data
     * @param {Object[]} data.fields Each field object contains the keys: name, oldValue, value
     * @param {Number} data.index
     * @param {Neo.data.Model} data.model
     * @param {Object} data.record
     */
    onStoreRecordChange(data) {
        let me                  = this,
            {record}            = data,
            {index, parentNode} = VDomUtil.find(me.vdom, me.getItemId(record.id));

        parentNode.cn[index] = me.createItem(record);

        me.update()
    }
}

export default Neo.setupClass(Tree);
