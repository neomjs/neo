import Model    from './Model.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @summary Selection and keyboard navigation model for {@link Neo.container.Accordion}.
 * @class Neo.selection.AccordionModel
 * @extends Neo.selection.Model
 */
class AccordionModel extends Model {
    static config = {
        /**
         * @member {String} className='Neo.selection.AccordionModel'
         * @protected
         */
        className: 'Neo.selection.AccordionModel',
        /**
         * @member {String} ntype='selection-accordionmodel'
         * @protected
         */
        ntype: 'selection-accordionmodel'
    }

    /**
     * @summary Writes selection annotations onto the vdom node and syncs the AccordionItem's `_cls`.
     * @param {Object|null} node
     * @param {String} [selectedCls]
     * @protected
     */
    annotateItem(node, selectedCls) {
        super.annotateItem(node, selectedCls);

        let item = node?.id && Neo.getComponent(node.id);

        if (item) {
            NeoArray.add(item._cls, selectedCls || this.selectedCls);
            !this.view.silentSelect && item.update()
        }
    }

    /**
     * @summary Removes selection annotations from the vdom node and syncs the AccordionItem's `_cls`.
     * @param {Object|null} node
     * @param {String} [selectedCls]
     * @protected
     */
    deannotateItem(node, selectedCls) {
        super.deannotateItem(node, selectedCls);

        let item = node?.id && Neo.getComponent(node.id);

        if (item) {
            NeoArray.remove(item._cls, selectedCls || this.selectedCls);
            !this.view.silentSelect && item.update()
        }
    }

    /**
     * @summary Resolves a tracked AccordionItem id into its component instance for selection events.
     * @param {Object|Number|String} item
     * @returns {Neo.container.AccordionItem|Object|Number|String}
     */
    getSelectionRecord(item) {
        return (Neo.isString(item) && Neo.getComponent(item)) || super.getSelectionRecord(item)
    }

    /**
     * @summary Selects the clicked AccordionItem when selection is enabled on the owner Accordion.
     * @param {Object} data
     */
    onItemClick(data) {
        let me     = this,
            {view} = me,
            target;

        if (!view.disableSelection) {
            for (let node of data.path || []) {
                if (node.cls?.includes('neo-accordion-item')) {
                    target = Neo.getComponent(node.id);
                    break
                }
            }

            if (!target && data.currentTarget) {
                target = Neo.getComponent(data.currentTarget)
            }

            if (target && view.getAccordionItems().includes(target)) {
                me.select(target.id)
            }
        }
    }

    /**
     * @summary Navigates to the next AccordionItem on Down arrow key.
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.onNavKey(data, 1)
    }

    /**
     * @summary Toggles the expanded state of the selected AccordionItem on Enter or Space key.
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let me   = this,
            item = Neo.getComponent(me.getSelection()[0]);

        if (item) {
            me.toggleExpanded(item, !item.expanded)
        } else {
            me.selectRoot()
        }
    }

    /**
     * @summary Clears the current selection on Escape key.
     * @param {Object} data
     */
    onKeyDownEscape(data) {
        this.deselectAll()
    }

    /**
     * @summary Collapses the selected AccordionItem if expanded, or navigates to the previous item.
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        let me   = this,
            item = Neo.getComponent(me.getSelection()[0]);

        if (!item) {
            me.selectRoot();
            return
        }

        if (item.expanded) {
            me.toggleExpanded(item, false)
        } else {
            me.onNavKey(data, -1)
        }
    }

    /**
     * @summary Expands the selected AccordionItem if collapsed, or navigates to the next item.
     * @param {Object} data
     */
    onKeyDownRight(data) {
        let me   = this,
            item = Neo.getComponent(me.getSelection()[0]);

        if (!item) {
            me.selectRoot();
            return
        }

        if (!item.expanded) {
            me.toggleExpanded(item, true)
        } else {
            me.onNavKey(data, 1)
        }
    }

    /**
     * @summary Navigates to the previous AccordionItem on Up arrow key.
     * @param {Object} data
     */
    onKeyDownUp(data) {
        this.onNavKey(data, -1)
    }

    /**
     * @summary Steps selection forward or backward across the Accordion's items.
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        let me         = this,
            {view}     = me,
            items      = view.getAccordionItems(),
            selectedId = me.getSelection()[0],
            index, nextItem;

        if (view.disableSelection || items.length === 0) {
            return
        }

        if (!selectedId) {
            me.selectRoot();
            return
        }

        index = items.findIndex(item => item.id === selectedId);

        if (index === -1) {
            me.selectRoot();
            return
        }

        nextItem = items[index + step];

        if (nextItem) {
            me.selectAndScrollIntoView(nextItem.id)
        } else {
            me.deselectAll();
            view.fire(step === 1 ? 'selectPostLastItem' : 'selectPreFirstItem')
        }
    }

    /**
     * @summary Registers DOM click delegation and keyboard navigation handlers on the Accordion view.
     * @param {Neo.component.Base} component
     */
    register(component) {
        super.register(component);

        let me         = this,
            {id, view} = me;

        view.addDomListeners([{
            click   : me.onItemClick,
            delegate: '.neo-accordion-item',
            scope   : me
        }]);

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  , key: 'Down'  , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Enter' , scope: id},
            {fn: 'onKeyDownEscape', key: 'Escape', scope: id},
            {fn: 'onKeyDownLeft'  , key: 'Left'  , scope: id},
            {fn: 'onKeyDownRight' , key: 'Right' , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Space' , scope: id},
            {fn: 'onKeyDownUp'    , key: 'Up'    , scope: id}
        )
    }

    /**
     * @summary Selects an AccordionItem by id and scrolls it into view.
     * @param {String} itemId
     */
    selectAndScrollIntoView(itemId) {
        if (itemId && !this.view.disableSelection) {
            this.select(itemId);

            Neo.main.DomAccess?.scrollIntoView({
                id      : itemId,
                block   : 'center',
                windowId: this.view.windowId
            })
        }
    }

    /**
     * @summary Selects the AccordionItem at the given zero-based index.
     * @param {Number} index
     */
    selectAt(index) {
        let item = this.view?.getAccordionItems()[index];

        item && this.selectAndScrollIntoView(item.id)
    }

    /**
     * @summary Selects the first AccordionItem in the Accordion.
     */
    selectRoot() {
        this.selectAt(0)
    }

    /**
     * @summary Toggles an AccordionItem's expanded state through the parent Accordion's expansion policy.
     * @param {Neo.container.AccordionItem} item
     * @param {Boolean} expanded
     */
    toggleExpanded(item, expanded) {
        if (item && item.expanded !== expanded) {
            this.view.childExpandChange({
                expanded,
                target: item
            })
        }
    }

    /**
     * @summary Unregisters keyboard navigation and DOM listeners from the Accordion view.
     */
    unregister() {
        let me         = this,
            {id, view} = me;

        view?.keys?.removeKeys([
            {fn: 'onKeyDownDown'  , key: 'Down'  , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Enter' , scope: id},
            {fn: 'onKeyDownEscape', key: 'Escape', scope: id},
            {fn: 'onKeyDownLeft'  , key: 'Left'  , scope: id},
            {fn: 'onKeyDownRight' , key: 'Right' , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Space' , scope: id},
            {fn: 'onKeyDownUp'    , key: 'Up'    , scope: id}
        ]);

        super.unregister()
    }
}

export default Neo.setupClass(AccordionModel);
