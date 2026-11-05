import Model    from './Model.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @summary Selection and keyboard navigation model for {@link Neo.container.Accordion}.
 * @class Neo.selection.AccordionModel
 * @extends Neo.selection.Model
 */
class AccordionModel extends Model {
    /**
     * Interactive HTML tag names whose own key events must not trigger Accordion navigation or expansion.
     * @member {String[]} interactiveTags=['a','button','input','select','textarea']
     * @protected
     * @static
     */
    static interactiveTags = ['a', 'button', 'input', 'select', 'textarea']

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
     * Tracks the last focused or selected AccordionItem id so roving tabIndex retains its stop
     * when selection is cleared via Escape.
     * @member {String|null} focusedItemId=null
     * @protected
     */
    focusedItemId = null

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
            this.focusedItemId = item.id;
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
     * @summary Deselects an AccordionItem and updates roving header tabIndex.
     * @param {Object|String} item
     * @param {Boolean} [silent]
     * @param {Object[]|String[]} [itemCollection=this.items]
     * @param {String} [selectedCls]
     */
    deselect(item, silent, itemCollection=this.items, selectedCls) {
        super.deselect(item, silent, itemCollection, selectedCls);
        !silent && this.syncTabIndices(!this.view?.vnodeInitialized)
    }

    /**
     * @summary Deselects all AccordionItems and updates roving header tabIndex.
     * @param {Boolean} [silent]
     * @param {Object[]|String[]} [itemCollection=this.items]
     */
    deselectAll(silent, itemCollection=this.items) {
        super.deselectAll(silent, itemCollection);
        !silent && this.syncTabIndices(!this.view?.vnodeInitialized)
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
     * @summary Returns true when a key event belongs to Accordion header/item navigation rather than
     * a descendant interactive control or content area.
     * @param {Object} [data]
     * @returns {Boolean}
     * @protected
     */
    isNavigationEvent(data) {
        if (!data || (!data.path && !data.target)) {
            return true
        }

        let interactiveTags = AccordionModel.interactiveTags,
            targetTag       = data.target?.tagName?.toLowerCase();

        if ((targetTag && interactiveTags.includes(targetTag)) || data.target?.isContentEditable) {
            return false
        }

        for (let node of data.path || []) {
            let tag = node.tagName?.toLowerCase();

            if (node.cls?.includes('neo-accordion-content') || (tag && interactiveTags.includes(tag)) || node.isContentEditable) {
                return false
            }

            if (node.cls?.includes('neo-accordion-header') || node.cls?.includes('neo-accordion-item')) {
                return true
            }
        }

        return true
    }

    /**
     * @summary Selects the AccordionItem whose header receives focus when selection is enabled.
     * @param {Object} data
     */
    onHeaderFocus(data) {
        let me     = this,
            {view} = me,
            item   = me.resolveHeaderItem(data);

        if (item && view && !view.disableSelection) {
            me.focusedItemId = item.id;

            if (!me.isSelected(item.id)) {
                me.select(item.id)
            } else {
                me.syncTabIndices(!view.vnodeInitialized)
            }
        }
    }

    /**
     * @summary Selects the clicked AccordionItem when selection is enabled on the owner Accordion.
     * @param {Object} data
     */
    onItemClick(data) {
        let me     = this,
            {view} = me,
            target;

        if (view && !view.disableSelection) {
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
                me.focusedItemId = target.id;
                me.select(target.id)
            }
        }
    }

    /**
     * @summary Navigates to the next AccordionItem on Down arrow key.
     * @param {Object} data
     */
    onKeyDownDown(data) {
        this.isNavigationEvent(data) && this.onNavKey(data, 1)
    }

    /**
     * @summary Toggles the expanded state of the selected or focused AccordionItem on Enter or Space key.
     * @param {Object} data
     */
    onKeyDownEnter(data) {
        let me = this;

        if (!me.isNavigationEvent(data) || me.view?.disableSelection) {
            return
        }

        let item = Neo.getComponent(me.getSelection()[0]) || me.resolveHeaderItem(data);

        if (item) {
            !me.isSelected(item.id) && me.select(item.id);
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
        this.isNavigationEvent(data) && this.deselectAll()
    }

    /**
     * @summary Collapses the selected AccordionItem if expanded, or navigates to the previous item.
     * @param {Object} data
     */
    onKeyDownLeft(data) {
        let me = this;

        if (!me.isNavigationEvent(data) || me.view?.disableSelection) {
            return
        }

        let item = Neo.getComponent(me.getSelection()[0]);

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
        let me = this;

        if (!me.isNavigationEvent(data) || me.view?.disableSelection) {
            return
        }

        let item = Neo.getComponent(me.getSelection()[0]);

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
        this.isNavigationEvent(data) && this.onNavKey(data, -1)
    }

    /**
     * @summary Steps selection forward or backward across the Accordion's items.
     * @param {Object} data
     * @param {Number} step
     */
    onNavKey(data, step) {
        let me         = this,
            {view}     = me,
            items      = view?.getAccordionItems() || [],
            selectedId = me.getSelection()[0],
            index, nextItem;

        if (!view || view.disableSelection || items.length === 0) {
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
     * @summary Registers DOM click/focus delegation, keyboard navigation handlers, and roving tabIndex on the Accordion view.
     * @param {Neo.component.Base} component
     */
    register(component) {
        let me = this;

        if (me.view === component) {
            return
        }

        super.register(component);

        let {id, view} = me;

        view.addDomListeners([{
            click   : me.onItemClick,
            delegate: '.neo-accordion-item',
            scope   : me
        }, {
            focusin : me.onHeaderFocus,
            delegate: '.neo-accordion-header',
            scope   : me
        }]);

        view.on({
            focusEnter: me.onHeaderFocus,
            focusMove : me.onHeaderFocus,
            scope     : me
        });

        view.keys?._keys.push(
            {fn: 'onKeyDownDown'  , key: 'Down'  , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Enter' , scope: id},
            {fn: 'onKeyDownEscape', key: 'Escape', scope: id},
            {fn: 'onKeyDownLeft'  , key: 'Left'  , scope: id},
            {fn: 'onKeyDownRight' , key: 'Right' , scope: id},
            {fn: 'onKeyDownEnter' , key: 'Space' , scope: id},
            {fn: 'onKeyDownUp'    , key: 'Up'    , scope: id}
        );

        me.syncTabIndices(!view.vnodeInitialized)
    }

    /**
     * @summary Resolves the owning AccordionItem from a header or item DOM event payload.
     * @param {Object} [data]
     * @returns {Neo.container.AccordionItem|null}
     * @protected
     */
    resolveHeaderItem(data) {
        let {view} = this;

        if (!view || !data) {
            return null
        }

        let validItems = view.getAccordionItems();

        for (let node of data.path || []) {
            if (node.cls?.includes('neo-accordion-content')) {
                return null
            }

            if (node.cls?.includes('neo-accordion-header')) {
                let header = Neo.getComponent(node.id),
                    item   = header?.up('accordionitem');

                if (item && validItems.includes(item)) {
                    return item
                }
            }

            if (node.cls?.includes('neo-accordion-item')) {
                let item = Neo.getComponent(node.id);

                if (item && validItems.includes(item)) {
                    return item
                }
            }
        }

        return null
    }

    /**
     * @summary Selects one or more AccordionItems and updates roving header tabIndex.
     * @param {Object|Object[]|String[]} items
     * @param {Object[]|String[]} [itemCollection=this.items]
     * @param {String} [selectedCls]
     */
    select(items, itemCollection=this.items, selectedCls) {
        super.select(items, itemCollection, selectedCls);
        this.syncTabIndices(!this.view?.vnodeInitialized)
    }

    /**
     * @summary Selects an AccordionItem by id, focuses its header, and scrolls it into view.
     * @param {String} itemId
     */
    selectAndScrollIntoView(itemId) {
        let me     = this,
            {view} = me;

        if (itemId && view && !view.disableSelection) {
            let item     = Neo.getComponent(itemId),
                headerId = item?.getHeader()?.id || itemId;

            me.select(itemId);

            Neo.main.DomAccess?.focus({
                id           : headerId,
                modality     : 'keyboard',
                preventScroll: true,
                windowId     : view.windowId
            });

            Neo.main.DomAccess?.scrollIntoView({
                id      : itemId,
                block   : 'center',
                windowId: view.windowId
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
     * @summary Maintains a roving tabIndex (0 on the selected or active AccordionItem header, -1 on all others)
     * when selection is active, or resets all headers to -1 when disabled or unregistered.
     * @param {Boolean} [silent=false]
     * @param {Boolean} [forceDisable=false]
     */
    syncTabIndices(silent=false, forceDisable=false) {
        let me     = this,
            {view} = me;

        if (!view || view.isDestroying) {
            return
        }

        let items      = view.getAccordionItems(),
            enabled    = !forceDisable && !me.isUnregistering && !view.disableSelection,
            activeId   = me.getSelection()[0] || me.focusedItemId,
            activeItem = enabled ? (items.find(item => item.id === activeId) || items[0]) : null;

        items.forEach(item => {
            let header       = item.getHeader(),
                nextTabIndex = item === activeItem ? 0 : -1;

            if (header?.vdom && header.vdom.tabIndex !== nextTabIndex) {
                header.vdom.tabIndex = nextTabIndex;
                !silent && !view.silentSelect && header.update()
            }
        })
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
     * @summary Unregisters keyboard navigation, DOM listeners, and header roving tabIndex from the Accordion view.
     */
    unregister() {
        let me         = this,
            {id, view} = me;

        me.isUnregistering = true;

        if (view && !view.isDestroying) {
            me.syncTabIndices(!view.vnodeInitialized, true);

            view.un({
                focusEnter: me.onHeaderFocus,
                focusMove : me.onHeaderFocus,
                scope     : me
            });

            view.keys?.removeKeys([
                {fn: 'onKeyDownDown'  , key: 'Down'  , scope: id},
                {fn: 'onKeyDownEnter' , key: 'Enter' , scope: id},
                {fn: 'onKeyDownEscape', key: 'Escape', scope: id},
                {fn: 'onKeyDownLeft'  , key: 'Left'  , scope: id},
                {fn: 'onKeyDownRight' , key: 'Right' , scope: id},
                {fn: 'onKeyDownEnter' , key: 'Space' , scope: id},
                {fn: 'onKeyDownUp'    , key: 'Up'    , scope: id}
            ])
        }

        super.unregister();
        me.isUnregistering = false
    }
}

export default Neo.setupClass(AccordionModel);
