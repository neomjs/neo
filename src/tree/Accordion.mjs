import TreeList           from '../tree/List.mjs';
import TreeAccordionModel from "../selection/TreeAccordionModel.mjs";
import ClassSystemUtil    from "../util/ClassSystem.mjs";

/**
 * @class Neo.tree.Accordion
 * @extends Neo.tree.List
 */
class AccordionTree extends TreeList {
    static config = {
        /**
         * @member {String} className='Neo.tree.Accordion'
         * @protected
         */
        className: 'Neo.tree.Accordion',
        /**
         * @member {String} ntype='treeaccordion'
         * @protected
         */
        ntype: 'treeaccordion',
        /**
         * @member {String[]} baseCls=['neo-tree-accordion']
         */
        baseCls: ['neo-tree-list'],
        /**
         * @member {Boolean} showCollapseExpandAllIcons=true
         */
        showCollapseExpandAllIcons: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
            {
                cn: [
                    {tag: 'ul', cls: ['neo-list-container', 'neo-list', 'neo-accordion-style'], tabIndex: -1, cn: []}
                ]
            }
    }

    onConstructed() {
        super.onConstructed();
        let me = this;

        me.addDomListeners({
            focusin: me.onFocus,
            scope  : me
        })
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

        return ClassSystemUtil.beforeSetInstance(value, TreeAccordionModel);
    }

    /**
     * @param {String} [parentId] The parent node
     * @param {Object} [vdomRoot] The vdom template root for the current sub tree
     * @param {Number} level The hierarchy level of the tree
     * @returns {Object} vdomRoot
     * @protected
     */
    createItems(parentId, vdomRoot, level) {
        let me        = this,
            items     = me.store.find('parentId', parentId),
            itemCls   = me.itemCls,
            folderCls = me.folderCls,
            cls, tmpRoot;

        if (items.length > 0) {
            if (!vdomRoot.cn) {
                vdomRoot.cn = [];
            }

            if (parentId !== null) {
                vdomRoot.cn.push({
                    tag  : 'ul',
                    cls  : ['neo-list'],
                    cn   : [],
                    style: {
                        paddingLeft: '15px'
                    }
                });

                tmpRoot = vdomRoot.cn[vdomRoot.cn.length - 1];
            } else {
                tmpRoot = vdomRoot;
            }

            items.forEach(item => {
                cls = [itemCls];

                if (item.isLeaf) {
                    cls.push(itemCls + (item.singleton ? '-leaf-singleton' : '-leaf'));
                } else {
                    cls.push(folderCls);

                    if (!item.collapsed) {
                        cls.push('neo-folder-open');
                    }
                }

                tmpRoot.cn.push({
                    tag  : 'li',
                    cls,
                    id   : me.getItemId(item.id),
                    cn   : [{
                        tag      : 'span',
                        cls      : ['neo-accordion-item-icon', item.iconCls],
                        removeDom: !item.isLeaf
                    }, {
                        tag      : 'span',
                        cls      : [itemCls + '-content'],
                        innerHTML: item.name,
                        style    : {
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
     * @param {Object} item
     * @param {Object} data
     */
    onItemClick(item, data) {
        super.onItemClick(item, data);

        const me             = this,
              selectionModel = me.selectionModel,
              itemId         = item.id,
              // ! todo make it String
              id             = Number(itemId.split('__')[1]),
              record         = me.store.get(id);

        selectionModel.select(item.id);

        if (!record.isLeaf) {
            /**
             * The folderItemClick event fires when a click occurs on a list item which does have child items.
             * Passes the item record to the event handler.
             * @event folderItemClick
             * @returns {Object} record
             */
            me.fire('folderItemClick', {record});

            record.collapsed = !record.collapsed
        }
    }

    /**
     * To place the root item at the correct location
     * @returns {Object}
     */
    getListItemsRoot() {
        return this.vdom.cn[0];
    }

    /**
     * Accordion gaining focus without selection => setSelection
     * @param {Object} data
     */
    onFocus(data) {
        const me        = this,
              selModel  = me.selectionModel,
              selection = selModel.getSelection()[0];

        if (!selection) selModel.selectRoot();
    }

    // Todo Might be needed
    onStoreLoad() {
    }

    onStoreRecordChange() {
    }
}

Neo.applyClassConfig(AccordionTree);

export default AccordionTree
