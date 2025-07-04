import ClassSystemUtil    from '../util/ClassSystem.mjs';
import NeoArray           from '../util/Array.mjs';
import TreeList           from '../tree/List.mjs';
import TreeAccordionModel from '../selection/TreeAccordionModel.mjs';
import VDomUtil           from '../util/VDom.mjs';

/**
 * @class Neo.tree.Accordion
 * @extends Neo.tree.List
 *
 * Accordion Store expects the following fields
 *
 *      [
 *          iconCls,        // can be defined in fields:icon
 *          content,        // can be defined in fields:text
 *          name,           // can be defined in fields:header
 *
 *          collapsed,      // collapsed state for non-leaf-items
 *          isLeaf,         // defines it item is leaf-item
 *          id,             // defines item id
 *          parentId        // leaf or sub-items need a parentId
 *      ]
 *
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
         * Define the field names for the store to show header, text and icon
         * @member {Object} fields={header:'name',icon:'iconCls',text:'content'}
         */
        fields: {
            header: 'name',
            icon  : 'iconCls',
            text  : 'content'
        },
        /**
         * Set to false to hide the initial root item
         * @member {Boolean} firstParentIsVisible=true
         */
        firstParentIsVisible_: true,
        /**
         * Set to false will auto expand root parent items and disallow collapsing
         * @member {Boolean} rootParentIsCollapsible=false
         */
        rootParentsAreCollapsible_: false,
        /**
         * Currently selected item, which is bindable
         * @member {Record[]|null} selection=null
         *
         * @example
         *     module: AccordionTree,
         *     bind  : {selection: {twoWay: true, value: data => data.selection}}
         *
         *     ntype: 'component',
         *     bind : {html: data => data.selection[0].name}
         */
        selection_: null,
        /**
         * Set to false will hide the icons for all leaf items
         * @member {Boolean} showIcon=true
         */
        showIcon_: true,
        /**
         * @member {Boolean} showCollapseExpandAllIcons=true
         */
        showCollapseExpandAllIcons: false,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cn: [
            {tag: 'ul', cls: ['neo-list-container', 'neo-list', 'neo-accordion-style'], cn: []}
        ]}
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.addDomListeners({
            focusin: me.onFocus,
            scope  : me
        })
    }

    /**
     * Called when changing firstParentIsVisible
     * First store item gets marked and additional css class
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetFirstParentIsVisible(value, oldValue) {
        let firstRecord = this.store.first();

        this.toggleCls('first-parent-not-visible', !value);

        if (firstRecord) {
            firstRecord.visible = value
        }
    }

    /**
     * Called when changing rootParentsAreCollapsible
     * Ensures that root items are expanded if not collapsible
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetRootParentsAreCollapsible(value, oldValue) {
        let me = this;

        me[!value ? 'addCls' : 'removeCls']('root-not-collapsible');

        if (me.rendered && value === false) {
            let {store} = me;

            store.items.forEach(record => {
                if (record.parentId === null && !record.isLeaf) {
                    me.expandItem(record)
                }
            })
        }
    }

    /**
     * Called when changing showIcon
     * Changes the display of the icons
     *
     * @param {Boolean} value
     * @param {Boolean} oldValue
     */
    afterSetShowIcon(value, oldValue) {
        const me      = this,
              {store} = me,
              hide    = !value;

        store.items.forEach((record) => {
            const itemId   = me.getItemId(record[me.getKeyProperty()]),
                  vdom     = me.getVdomChild(itemId),
                  itemVdom = VDomUtil.getByFlag(vdom, 'iconCls');

            if (record.isLeaf) {
                itemVdom.removeDom = hide
            }
        })

        me.update()
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

        return ClassSystemUtil.beforeSetInstance(value, TreeAccordionModel)
    }

    /**
     * Remove all items from the accordion
     * If you do not need to update the view after clearing, set `withUpdate = false`
     *
     * @param {Boolean} [withUpdate=true]
     */
    clear(withUpdate=true) {
        delete this.getVdomRoot().cn[0].cn

        withUpdate && this.update()
    }

    /**
     * Remove all items from the selection
     */
    clearSelection() {
        this.selectionModel.deselectAll();
    }

    /**
     * @param {String} [parentId] The parent node
     * @param {Object} [vdomRoot] The vdom template root for the current sub tree
     * @param {Number} level The hierarchy level of the tree
     * @returns {Object} vdomRoot
     * @protected
     */
    createItems(parentId, vdomRoot, level) {
        let me                   = this,
            {folderCls, itemCls} = me,
            items                = me.store.find('parentId', parentId),
            cls, id, itemIconCls, tmpRoot;

        if (items.length > 0) {
            if (!vdomRoot.cn) {
                vdomRoot.cn = []
            }

            if (parentId !== null) {
                vdomRoot.cn.push({
                    tag: 'ul',
                    cls: ['neo-list'],
                    cn : [],
                    id : `${me.id}__${parentId}__ul`
                });

                tmpRoot = vdomRoot.cn[vdomRoot.cn.length - 1]
            } else {
                tmpRoot = vdomRoot
            }

            items.forEach(item => {
                cls         = [itemCls];
                itemIconCls = ['neo-accordion-item-icon'];

                if (item.iconCls) {
                    NeoArray.add(itemIconCls, item.iconCls.split(' '))
                }

                if (item.isLeaf) {
                    cls.push(itemCls + (item.singleton ? '-leaf-singleton' : '-leaf'))
                } else {
                    cls.push(folderCls);

                    if (!item.parentId && !me.rootParentsAreCollapsible) {
                        cls.push('neo-not-collapsible');

                        if (item.collapsed) {
                            item.collapsed = false
                        }
                    }

                    if (!item.collapsed) {
                        cls.push('neo-folder-open')
                    }
                }

                id = me.getItemId(item.id);

                tmpRoot.cn.push({
                    tag     : 'li',
                    tabIndex: -1,
                    cls,
                    id,
                    cn      : [{
                        flag     : 'iconCls',
                        tag      : 'span',
                        cls      : itemIconCls,
                        id       : id + '__icon',
                        removeDom: (!item.isLeaf || !me.showIcon)
                    }, {
                        cls  : [itemCls + '-content'],
                        id   : id + '__item-content',
                        style: {pointerEvents: 'none'},
                        cn: [{
                            flag: 'name',
                            tag : 'span',
                            cls : [itemCls + '-content-header'],
                            id  : id + '__item-content-header',
                            text: item[me.fields.header]
                        }, {
                            flag: 'content',
                            tag : 'span',
                            cls : [itemCls + '-content-text'],
                            id  : id + '__item-content-text',
                            text: item[me.fields.text]
                        }]
                    }],
                    style: {
                        position: item.isLeaf ? null : 'sticky',
                        top     : item.isLeaf ? null : (level * 38) + 'px',
                        zIndex  : item.isLeaf ? null : (20 / (level + 1)),
                    }
                });

                tmpRoot = me.createItems(item.id, tmpRoot, level + 1)
            })
        }

        return vdomRoot
    }


    /**
     * Expands an item based on the record
     * @param {Object} record
     */
    expandItem(record) {
        let me     = this,
            itemId = me.getItemId(record[me.getKeyProperty()]),
            item   = me.getVdomChild(itemId);

        record.collapsed = false;

        NeoArray.add(item.cls, 'neo-folder-open');
        me.update()
    }

    /**
     * @param {Object} item
     * @param {Object} data
     */
    onItemClick(item, data) {
        super.onItemClick(item, data);

        let me               = this,
            {selectionModel} = me,
            itemId           = item.id,
            id               = Number(itemId.split('__')[1]),
            record           = me.store.get(id);

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
        return this.vdom.cn[0]
    }

    /**
     * Accordion gaining focus without selection => setSelection
     * @param {Object} data
     */
    onFocus(data) {
        let me               = this,
            {selectionModel} = me,
            selection        = selectionModel.getSelection()[0];

        !selection && selectionModel.selectRoot()
    }

    /**
     * Called from SelectionModel select()
     * @param {String[]} value
     */
    onSelect(value) {
        let me      = this,
            records = [];

        value.forEach((selectItemId) => {
            let id     = me.getItemRecordId(selectItemId),
                record = me.store.get(id);

            records.push(record)
        });

        me.selection = records
    }

    /**
     * After the store loaded, create the items for the list
     * @param {Record[]} records
     */
    onStoreLoad(records) {
        let me = this;

        me.clear(false);

        if (!me.mounted && me.rendering) {
            me.on('mounted', () => {
                me.createItems(null, me.getListItemsRoot(), 0);
                me.update()
            }, me, {once: true})
        } else {
            me.createItems(null, me.getListItemsRoot(), 0);
            me.update()
        }
    }

    /**
     * Update a record
     * @param {Object}         data
     * @param {Object[]}       data.fields
     * @param {Number}         data.index
     * @param {Neo.data.Model} data.model
     * @param {Record}         data.record
     */
    onStoreRecordChange(data) {
        let me               = this,
            {fields, record} = data,
            itemId           = me.getItemId(record[me.getKeyProperty()]),
            vdom             = me.getVdomChild(itemId),
            itemVdom;

        fields.forEach((field) => {
            itemVdom = VDomUtil.getByFlag(vdom, field.name);

            if (itemVdom) {
                if (field.name === 'iconCls') {
                    let clsItems = field.value.split(' '),
                        cls      = ['neo-accordion-item-icon'];

                    NeoArray.add(cls, clsItems);
                    itemVdom.cls = cls
                } else {
                    itemVdom.text = field.value
                }
            }
        });

        me.update()
    }

    /**
     * Set the selection either bei record id or record.
     * You can pass a record or a recordId as value
     *
     * @param {Record|Record[]|Number|Number[]|String|String[]} value
     */
    setSelection(value) {
        if (value === null) {
            this.clearSelection();
            return
        }

        // In case you pass in an array use only the first item
        if (Neo.isArray(value)) {
            value = value[0]
        }

        let me = this,
            recordKeyProperty, elId;

        if (Neo.isRecord(value)) {
            recordKeyProperty = value[me.getKeyProperty()];
        } else {
            // RecordId
            recordKeyProperty = value;
        }

        elId = me.getItemId(recordKeyProperty);

        me.selectionModel.selectAndScrollIntoView(elId)
    }
}

export default Neo.setupClass(AccordionTree)
