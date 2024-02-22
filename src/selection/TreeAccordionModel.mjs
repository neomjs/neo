import TreeModel from './TreeModel.mjs';
import NeoArray  from "../util/Array.mjs";

/**
 * @class Neo.selection.TreeAccordionModel
 * @extends Neo.selection.TreeModel
 */
class TreeAccordionModel extends TreeModel {
    static config = {
        /**
         * @member {String} className='Neo.selection.TreeAccordionModel'
         * @protected
         */
        className: 'Neo.selection.TreeAccordionModel',
        /**
         * @member {String} ntype='selection-treeaccordionmodel'
         * @protected
         */
        ntype: 'selection-treeaccordionmodel'
    }

    /**
     * Tries to find a child and returns it
     * @param {Object} record
     * @returns {Object|null}
     */
    checkForChild(record) {
        const view     = this.view,
              recordId = record[view.getKeyProperty()];
        let childRecord = null;

        for (const item of view.store.items) {
            if (item.parentId === recordId) {
                childRecord = item;
                break;
            }
        }

        return childRecord;
    }

    /**
     * Return the parent record if any
     * @param {Object} record
     * @returns {Object|null}
     */
    checkForParent(record) {
        if (record.parentId) {
            const view = this.view;

            return view.store.get(record.parentId);
        } else {
            return null;
        }
    }

    /**
     * Depending on {-1|1} step return
     * -1: previous record OR parent record
     *  1: next record or null
     *
     * @param {Object} record
     * @param {Number} step
     * @returns {Object|null}
     */
    checkForSibling(record, step) {
        const view           = this.view,
              store          = view.store,
              parentRecordId = record.parentId,
              recordId       = record[view.getKeyProperty()];
        let hasFoundNext   = false,
            nextItemRecord = null,
            previousItemRecord;

        for (let item of store.items) {
            if (hasFoundNext && item.parentId === parentRecordId) {
                nextItemRecord = item;
                break;
            }

            if (!hasFoundNext && item.parentId === parentRecordId) {
                if (!hasFoundNext && item[view.getKeyProperty()] === recordId) {
                    if (step === -1) break;
                    hasFoundNext = true;
                } else {
                    previousItemRecord = item;
                }
            }
        }

        return step === 1 ? nextItemRecord : (previousItemRecord || store.get(parentRecordId));
    }

    /**
     * Find the next sibling of a parent item
     * @param {Object} record
     * @returns {Object|null}
     */
    checkNextParentSibling(record) {
        const parent = this.view.store.get(record.parentId);
        let parentSibling = this.checkForSibling(parent, 1);

        if (!parentSibling && parent.parentId) this.checkNextParentSibling(parent);

        return parentSibling;
    }

    /**
     * Called by keys (List.mjs:register)
     * Toggle collapse or if isLeaf select next item
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let me     = this,
            view   = me.view,
            itemId = me.getSelection()[0],
            record = view.store.get(view.getItemRecordId(itemId));

        if (record.isLeaf || record.collapsed) {
            me.onKeyDownRight(data);
        } else {
            me.onKeyDownLeft(data);
        }
    }

    /**
     * Called by keys (List.mjs:register)
     * Deselect all and fire event selectPostLastItem
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        let me = this;

        me.deselectAll();
    }

    /**
     * Collapse folder or select previous
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        const me     = this,
              view   = me.view,
              itemId = me.getSelection()[0];

        if (!itemId) {
            me.selectRoot();
            return;
        }

        const record = view.store.get(view.getItemRecordId(itemId));

        if (record.isLeaf || record.collapsed || !view.rootParentsAreCollapsible) {
            me.onNavKey(data, -1);
        } else {
            me.toggleCollapsed(record, itemId, true);
        }
    }

    /**
     * Open folder or select next
     * @param {Object} data
     */
    onKeyDownRight(data) {
        const me     = this,
              view   = me.view,
              itemId = me.getSelection()[0];

        if (!itemId) {
            me.selectRoot();
            return;
        }

        const record = view.store.get(view.getItemRecordId(itemId));

        if (record.isLeaf || !record.collapsed) {
            me.onNavKey(data, 1);
        } else {
            me.toggleCollapsed(record, itemId, false);
        }
    }

    /**
     * Handles 'up' and 'down' keys
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        const me   = this,
              view = me.view,
              item = me.getSelection()[0];
        let newRecord;

        if (item) {
            const recordId = view.getItemRecordId(item);
            let record = view.store.get(recordId);

            if (step === 1) {
                if (!record.isLeaf && !record.collapsed) {
                    // find first child
                    newRecord = this.checkForChild(record);
                } else {
                    // find next sibling
                    newRecord = this.checkForSibling(record, step);
                    // no ==> loop through parent next siblings until no parent
                    if (!newRecord) {
                        newRecord = this.checkNextParentSibling(record);
                    }
                }
                // current item was the last item
                if (!newRecord) {
                    me.deselectAll();
                    view.fire('selectPostLastItem');
                }
            } else if (step === -1) {
                // check previous sibling
                newRecord = this.checkForSibling(record, step);
                // no ==> get parent
                if (!newRecord) {
                    newRecord = this.checkForParent(record);
                }
                // current item was the first item
                if (!newRecord) {
                    me.deselectAll();
                    view.fire('selectPreFirstItem');
                }
            }
        } else {
            me.selectRoot();
        }

        if (newRecord) {
            const itemId = view.getItemId(newRecord[me.view.getKeyProperty()]);

            me.selectAndScrollIntoView(itemId);
        }
    }

    /**
     * Select an item and scroll the tree to show the item in the center
     * @param {String} itemId
     */
    selectAndScrollIntoView(itemId) {
        const me = this;

        me.select(itemId);

        Neo.main.DomAccess.scrollIntoView({
            id   : itemId,
            block: 'center'
        });
    }

    /**
     * Select the root item of the tree
     */
    selectRoot() {
        const me    = this,
              view  = me.view,
              store = view.store;
        let rootItemId;

        for (let record of store.items) {
            if (!record.parentId) {
                rootItemId = view.getItemId(record[me.view.getKeyProperty()]);
                break;
            }
        }

        me.selectAndScrollIntoView(rootItemId);
    }

    /**
     * Return the parent record if any
     * @param {Object} record
     * @param {String} itemId
     * @param {Boolean} collapse
     */
    toggleCollapsed(record, itemId, collapse) {
        const me    = this,
              item  = me.view.getVdomChild(itemId),
              clsFn = collapse ? 'remove' : 'add';

        NeoArray[clsFn](item.cls, 'neo-folder-open');
        me.view.update();

        record.collapsed = collapse;
    }
}

Neo.setupClass(TreeAccordionModel);

export default TreeAccordionModel;
