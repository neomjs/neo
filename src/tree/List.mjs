import Base       from '../list/Base.mjs';
import Collection from '../collection/Base.mjs';
import NeoArray   from '../util/Array.mjs';

/**
 * @class Neo.tree.List
 * @extends Neo.list.Base
 */
class Tree extends Base {
    static getConfig() {return {
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
         * @member {String[]} cls=['neo-tree-list']
         */
        cls: ['neo-tree-list'],
        /**
         * todo: change the default to false once selection.TreeList is in place
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Neo.draggable.tree.DragZone|null} dragZone=null
         */
        dragZone: null,
        /**
         * @member {Boolean} showCollapseExpandAllIcons=true
         */
        showCollapseExpandAllIcons: true,
        /**
         * @member {Boolean} sortable_=false
         */
        sortable_: false,
        /**
         * @member {Neo.draggable.tree.SortZone|null} sortZone=null
         */
        sortZone: null,
        /**
         * @member {Object} dragZoneConfig=null
         */
        sortZoneConfig: null,
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            cn: [{
                tag: 'ul',
                cls: ['neo-list-container', 'neo-list'],
                cn : []
            }]
        }
    }}

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me   = this,
            vdom = me.vdom;

        if (me.showCollapseExpandAllIcons) {
            vdom.cn.unshift({
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

            me.vdom = vdom;
        }
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
            if (me.sortable) {
                console.error('tree.List can be either draggable or sortable, not both.', me.id);
            } else if (!me.dragZone) {
                import(
                    /* webpackChunkName: 'src/draggable/tree/DragZone-mjs.js' */
                    '../draggable/tree/DragZone.mjs'
                    ).then(module => {
                    me.dragZone = Neo.create(module.default, {
                        appName: me.appName,
                        owner  : me,
                        ...me.dragZoneConfig || {}
                    });
                });
            }
        }
    }

    /**
     * Triggered after the sortable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetSortable(value, oldValue) {
        let me = this;

        if (value) {
            if (me.draggable) {
                console.error('tree.List can be either draggable or sortable, not both.', me.id);
            } else if (!me.sortZone) {
                import(
                    /* webpackChunkName: 'src/draggable/tree/SortZone-mjs.js' */
                    '../draggable/tree/SortZone.mjs'
                    ).then(module => {
                    me.sortZone = Neo.create({
                        module             : module.default,
                        appName            : me.appName,
                        boundaryContainerId: me.id,
                        owner              : me,
                        ...me.sortZoneConfig || {}
                    });
                });
            }
        }
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
            });
        }

        return value;
    }


    /**
     * Collapses all folders
     * @param {Boolean} [silent]=false Set silent to true to prevent a vnode update
     */
    collapseAll(silent=false) {
        let me       = this,
            vdom     = me.vdom,
            hasMatch = false,
            node;

        me.store.items.forEach(item => {
            if (!item.isLeaf) {
                node = me.getVdomChild(me.getItemId(item.id), vdom);

                if (node.cls.includes('neo-folder-open')) {
                    NeoArray.remove(node.cls, 'neo-folder-open');
                    hasMatch = true;
                }
            }
        });

        if (hasMatch) {
            me[silent ? '_vdom' : 'vdom'] = vdom;
        }
    }

    /**
     *
     * @param {String} [parentId] The parent node
     * @param {Object} [vdomRoot] The vdom template root for the current sub tree
     * @param {Number} level The hierarchy level of the tree
     * @returns {Object} vdomRoot
     * @protected
     */
    createItems(parentId, vdomRoot, level) {
        let me    = this,
            items = me.store.find('parentId', parentId),
            cls, tmpRoot;

        if (items.length > 0) {
            if (!vdomRoot.cn) {
                vdomRoot.cn = [];
            }

            if (parentId !== null) {
                vdomRoot.cn.push({
                    tag: 'ul',
                    cls: ['neo-list'],
                    cn : [],
                    style: {
                        paddingLeft: '15px'
                    }
                });

                tmpRoot = vdomRoot.cn[vdomRoot.cn.length - 1];
            } else {
                tmpRoot = vdomRoot;
            }

            items.forEach(item => {
                cls = ['neo-list-item'];

                if (item.isLeaf) {
                    cls.push(item.singleton ? 'neo-list-item-leaf-singleton' : 'neo-list-item-leaf');
                } else {
                    cls.push('neo-list-folder');

                    if (!item.collapsed) {
                        cls.push('neo-folder-open');
                    }
                }

                tmpRoot.cn.push({
                    tag: 'li',
                    cls: cls,
                    id : me.getItemId(item.id),
                    cn : [{
                        tag      : 'span',
                        cls      : ['neo-list-item-content'],
                        innerHTML: item.name,
                        style: {
                            pointerEvents: 'none'
                        }
                    }],
                    style: {
                        padding : '10px',
                        position: item.isLeaf ? null : 'sticky',
                        top     : item.isLeaf ? null : (level * 38) + 'px',
                        zIndex  : item.isLeaf ? null : (20 / (level + 1)),
                    }
                });

                tmpRoot = me.createItems(item.id, tmpRoot, level + 1);
            });
        }

        return vdomRoot;
    }

    /**
     * Expands all folders
     * @param {Boolean} silent=false Set silent to true to prevent a vnode update
     */
    expandAll(silent=false) {
        let me       = this,
            vdom     = me.vdom,
            hasMatch = false,
            node;

        me.store.items.forEach(item => {
            if (!item.isLeaf) {
                node = me.getVdomChild(me.getItemId(item.id), vdom);

                if (!node.cls.includes('neo-folder-open')) {
                    NeoArray.add(node.cls, 'neo-folder-open');
                    hasMatch = true;
                }
            }
        });

        if (hasMatch) {
            me[silent ? '_vdom' : 'vdom'] = vdom;
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
    filter(property, value, parentId, parentMatch=false) {
        let me         = this,
            isFiltered = true,
            valueRegEx = new RegExp(value, 'gi'),
            vdom       = me.vdom,
            childReturnValue, directMatch, node;

        if (!value) {
            value = '';
        }

        me.store.items.forEach(item => {
            if (item.parentId === parentId) {
                directMatch = false;
                node        = me.getVdomChild(me.getItemId(item.id), vdom);

                node.cn[0].innerHTML = item[property].replace(valueRegEx, match => {
                    directMatch = true;
                    return `<span class="neo-highlight-search">${match}</span>`;
                });

                if (item.isLeaf) {
                    childReturnValue = true;
                } else {
                    childReturnValue = me.filter(property, value, item.id, directMatch || parentMatch);
                }

                if (directMatch || parentMatch || childReturnValue === false || value === '') {
                    isFiltered = false;
                }

                node.style.display = isFiltered ? 'none' : 'list-item';
            }
        });

        if (parentId === null) {
            me.expandAll(true);
            me.vdom = vdom;
        }

        return isFiltered;
    }

    /**
     *
     * @returns {Object}
     */
    getListItemsRoot() {
        return this.vdom.cn[this.showCollapseExpandAllIcons ? 2 : 0];
    }

    /**
     *
     * @param {Object} data
     */
    onClick(data) {
        if (data.target.cls.includes('neo-treelist-menu-item')) {
            this.onMenuItemClick(data.target.cls);
        } else {
            super.onClick(data);
        }
    }

    /**
     *
     * @param {Object} data
     */
    onItemClick(data) {
        let me    = this,
            vdom  = me.vdom,
            items = me.store.items,
            i     = 0,
            len   = items.length,
            path  = data.path.map(e => e.id),
            item, record, tmpItem, vnodeId;

        for (; i < len; i++) {
            tmpItem = items[i];
            vnodeId = me.getItemId(tmpItem.id);

            if (path.includes(vnodeId)) {
                record = tmpItem;
                item   = me.getVdomChild(vnodeId);
                break;
            }
        }

        if (item) {
            if (item.cls && item.cls.includes('neo-list-folder')) {
                NeoArray.toggle(item.cls, 'neo-folder-open');
                me.vdom = vdom;
            } else {
                me.onLeafItemClick(record);

                /**
                 * The leafItemClick event fires when a click occurs on a list item which does not have child items.
                 * Passes the item record to the event handler.
                 * @event leafItemClick
                 * @returns {Object} record
                 */
                me.fire('leafItemClick', record);
            }

            super.onItemClick(data);
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
            this.collapseAll();
        } else {
            this.expandAll();
        }
    }
}

Neo.applyClassConfig(Tree);

export {Tree as default};