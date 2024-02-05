import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomUtils  from '../DomUtils.mjs';
import DomEvents from '../DomEvents.mjs';

// We do not need to inject a synthesized "click" event when we detect an ENTER
// keypress on these element types.
const enterActivatedTags= {
    A      : 1,
    BUTTON : 1
};

/**
 * Addon for Navigator
 * @class Neo.main.addon.Navigator
 * @extends Neo.core.Base
 * @singleton
 */
class Navigator extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.addon.Navigator'
         * @protected
         */
        className: 'Neo.main.addon.Navigator',
        /**
         * Remote method access for other workers
         * @member {Object} remote={app: [//...]}
         * @protected
         */
        remote: {
            app: [
                'navigateTo',
                'subscribe',
                'unsubscribe'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * Sets up keyboard based navigation within the passed element id.
     *
     * When navigation occurs from one navigable element to another, the `navigate` event
     * will be fired.
     *
     * Note that if focus is expected to enter the subject, the navigable elements
     * designated by the `selector` must be focusable in some way. So if not using natively
     * focusable elements, they must have `tabIndex="-1"`.
     *
     * Upon navigation, the `aria-activedescendant` property is automatically updated
     * on the `eventSource` element (which defaults to the subject element, but may be external)
     *
     * Pressing `Enter` when an item is active clicks that item.
     *
     * if `autoClick` is set to `true` in the data, simply navigating to an element will click it.
     * @param {*} data
     * @param {String} data.id The element id to navigate in.
     * @param {String} [data.eventSource] Optional - the element id to read keystrokes from.
     * defaults to the main element id. Select field uses this. Focus remains in the field's
     * `<input>` element while navigating its dropdown.
     * @param {String} data.selector A CSS selector which identifies the navigable elements.
     * @param {String} data.activeCls A CSS class to add to the currently active navigable element.
     * @param {Boolean} data.wrap Pass as `true` to have navigation wrap from first to last and vice versa.
     * @param {Boolean} [data.autoClick=false] Pass as `true` to have navigation click the target navigated to.
     * TabPanels will use this on their tab toolbar.
     */
    subscribe(data) {
        const
            me          = this,
            subject     = data.subject = DomAccess.getElement(data.id),
            eventSource = data.eventSource = data.eventSource ? DomAccess.getElement(data.eventSource) : subject;

        subject.$navigator = data;

        if (!data.activeCls) {
            data.activeCls = 'neo-navigator-active-item'
        }

        // Ensure that only *one* of the child focusables is actually tabbable.
        // We use arrow keys for internal navigation. TAB must move out.
        me.fixItemFocusability(data);

        // Finds a focusable item starting from a descendant el within one of our selector items
        data.findFocusable = el => DomUtils.closest(el, el =>
            // We're looking for an element that is focusable
            DomUtils.isFocusable(el) &&
            // And within our subject element
            (subject.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_CONTAINED_BY) &&
            // And within an element that matches our selector
            el.closest(data.selector)
        );

        // TreeWalker so that we can easily move between navigable elements within the target.
        data.treeWalker = document.createTreeWalker(subject, NodeFilter.SHOW_ELEMENT, node => me.navigateNodeFilter(node, data));

        // We have to know when the DOM mutates in case the active item is removed.
        (data.targetMutationMonitor = new MutationObserver(e => me.navigateTargetChildListChange(e, data))).observe(subject, {
            childList : true,
            subtree   : true
        });

        eventSource.addEventListener('keydown', data.l1 = e => me.navigateKeyDownHandler(e, data));
        subject.addEventListener('mousedown',   data.l2 = e => me.navigateMouseDownHandler(e, data));
        subject.addEventListener('click',       data.l3 = e => me.navigateClickHandler(e, data));
        subject.addEventListener('focusin',     data.l4 = e => me.navigateFocusInHandler(e, data));
        subject.addEventListener('focusout',    data.l5 = e => me.navigateFocusOutHandler(e, data));
    }

    // The navigables we are dealing with, if they are focusable must *not* be tabbable.
    // Only *one* must be tabbable, so that tabbing into the subject element goes to the
    // one active element.
    //
    // Tabbing *from* that must exit the subject element.
    //
    // So we must ensure that all the focusable elements except the first are not tabbable.
    fixItemFocusability(data) {
        // If the key events are being read from an external element, then that will always contain
        // focus, so we have nothing to do here. The navigable items wil be inert and not
        // focusable. Navigation will be "virtual". Select field navigates its dropdowns like this.
        if (!data.subject.contains(data.eventSource)) {
            return;
        }

        const
            // Extract all our navigable items, and find the focusable within
            focusables = Array.from(data.subject.querySelectorAll(data.selector)).reduce((value,item ) => {
                const f = DomUtils.query(item, DomUtils.isFocusable);
                if (f){
                    value.push(f);
                }
                return value;
            }, []),
            defaultActiveItem = focusables[0] || data.subject.querySelector(data.selector);

        // Ensure the items are not tabbable.
        // TAB navigates out of the subject.
        focusables.forEach(e => e !== defaultActiveItem && (e.tabIndex = -1));

        // Make at least one thing tabbable so focus can move into the subject element
        if (defaultActiveItem) {
            defaultActiveItem.tabIndex = 0;
        }
    }

    unsubscribe(data) {
        const target = DomAccess.getElement(data.id);

        data = target?.$navigator;
        if (data) {
            delete target.$navigator;
            data.targetMutationMonitor.disconnect(target);
            data.eventSource.removeEventListener('keydown', data.l1);
            target.removeEventListener('mousedown',    data.l2);
            target.removeEventListener('click',        data.l3);
            target.removeEventListener('focusin',      data.l4);
            target.removeEventListener('focusout',     data.l5);
        }
    }

    // This is called if mutations take place within the subject element.
    // We have to keep things in order if the list items change.
    navigateTargetChildListChange(mutations, data) {
        this.fixItemFocusability(data);

        // Active item gone.
        // Try to activate the item at the same index;
        if (data.activeItem && !data.subject.contains(data.activeItem)) {
            const allItems = data.subject.querySelectorAll(data.selector);

            allItems.length && this.navigateTo(allItems[Math.max(Math.min(data.activeIndex, allItems.length - 1), 0)], data);
        }
    }

    navigateFocusInHandler(e, data) {
        const
            target            = e.target.closest(data.selector),
            { relatedTarget } = e,
            { subject }       = data;

        // If our targets are focusable and recieve focus, that is a navigation.
        if (target) {
            this.setActiveItem(target, data);

            // This was internal navigation.
            // The items must be focusable, but *not* tabbable.
            // So remove tabbability on the last active item
            if (subject.contains(relatedTarget)) {
                relatedTarget.tabIndex = -1;
            }
        }
    }

    navigateFocusOutHandler(e, data) {
        const { target } = e;

        // Clear active class from the item we are leaving from.
        target.closest(data.selector)?.classList.remove(data.activeCls);

        // On focusout, leave the last active item as tabbable so user can TAB back in here
        if (!DomUtils.isTabbable(target)) {
            target.tabIndex = 0;
        }
    }

    navigateClickHandler(e, data) {
        const target = e.target.closest(data.selector);

        // If there was a focusable under the mouse, mousedown will have focused it and and we
        // will have respond to that in navigateFocusInHandler.
        // If not, we navigate programmatically.
        if (target && !data.findFocusable(target)) {
            this.navigateTo(target, data);
        }
    }

    navigateMouseDownHandler(e, data) {
        const target = e.target.closest(data.selector);

        // If there is a focusable under the mouse, it will take focus, and we respond to that in navigateFocusInHandler.
        // If not, we have to programmatically activate on click, but we must not draw focus away from
        // where it is, so preventDefault
        if (target && !data.findFocusable(target)) {
            e.preventDefault();
        }
    }

    navigateKeyDownHandler(keyEvent, data) {
        const
            me        = this,
            {
                subject,
                wrap
            }         = data,
            firstItem = subject.querySelector(data.selector);

        if (!data.nextKey && firstItem) {
            const
                containerStyle = getComputedStyle(subject),
                itemStyle      = getComputedStyle(firstItem);

            // Detect what the next and prev keys should be.
            // Child elements layed out horizontally.
            if (containerStyle.display === 'flex' && containerStyle.flexDirection === 'row'
                || itemStyle.display === 'inline' || itemStyle.display === 'inline-block') {
                data.previousKey = 'ArrowLeft';
                data.nextKey     = 'ArrowRight';
            }
            // Child elements layed out vertically.
            else {
                data.previousKey = 'ArrowUp';
                data.nextKey     = 'ArrowDown';
            }
        }

        let { key, target } = keyEvent,
            newActiveElement;

        switch(key) {
            // Move to the previous navigable item
            case data.previousKey:
                newActiveElement = me.navigateGetAdjacent(-1, data);
                if (!newActiveElement && wrap) {
                    newActiveElement = subject.querySelector(`${data.selector}:last-of-type`);
                }
                break;
            // Move to the next navigable item
            case data.nextKey:
                newActiveElement = me.navigateGetAdjacent(1, data);
                if (!newActiveElement && wrap) {
                    newActiveElement = subject.querySelector(data.selector);
                }
                break;
            // Move to the first navigable item
            case 'Home':
                newActiveElement = subject.querySelector(data.selector);
                break;
            // Move to the last navigable item
            case 'End':
                newActiveElement = subject.querySelector(`${data.selector}:last-of-type`);
                break;
            // Click the currently active item if necessary
            case 'Enter':
                if (data.activeItem && !enterActivatedTags[target.tagName]) {
                    this.clickItem(data.activeItem);
                }
        }

        if (newActiveElement) {
            keyEvent.preventDefault();
            me.navigateTo(newActiveElement, data);
        }
    }

    clickItem(el) {
        // The element knows how to click itself.
        if (typeof el.click === 'function') {
            el.click();
        }
        // It operates through a listenert, so needs an event firing into it.
        else {
            const
                rect    = el.getBoundingClientRect(),
                clientX = rect.x + (rect.width / 2),
                clientY = rect.y + (rect.height / 2);

            el.dispatchEvent(new MouseEvent('click', {
                bubbles  : true,
                altKey   : Neo.altKeyDown,
                ctrlKey  : Neo.controlKeyDown,
                metaKey  : Neo.metaKeyDown,
                shiftKey : Neo.shiftKeyDown,
                clientX,
                clientY
            }));
        }
    }

    /**
     * Navigates to the passed
     * @param {String|Number} newActiveElement The id of the new active element in the subject
     * element, or the index of the item.
     * @param {Object} data The data block as passed to {@link #subscribe}
     */
    navigateTo(newActiveElement, data) {
        if (!data.subject) {
            // If subject has been unmounted, we cannot navigate
            if (!(data = DomAccess.getElement(data.id)?.$navigator)) {
                return;
            }
        }

        // Can navigate by index. This is useful if the active item is deleted.
        // We can navigate to the same index and preserve UI stability.
        if (typeof newActiveElement === 'number') {
            newActiveElement = data.subject.querySelectorAll(data.selector)?.[newActiveElement];
        }
        else if (typeof newActiveElement === 'string') {
            newActiveElement = DomAccess.getElement(newActiveElement);
        }

        // Could not do what was asked because we could not find the requested item
        if (!newActiveElement) {
            return;
        }

        // Find a focusable element which may be the item, or inside the item to draw focus to.
        // For example a Chip list in which .neo-list-items contain focusable Chips.
        const focusTarget = DomUtils.query(newActiveElement, DomUtils.isFocusable);

        // If the item contains a focusable, we focus it and then react in navigateFocusInHandler
        if (focusTarget) {
            focusTarget.focus();
        }
        // If not, we programatically navigate there
        else {
            this.setActiveItem(newActiveElement, data);
        }
    }

    setActiveItem(newActiveElement, data) {
        const allItems = Array.from(data.subject.querySelectorAll(data.selector));

        // Can navigate by index. This is useful if the active item is deleted.
        // We can navigate to the same index and preserve UI stability.
        if (typeof newActiveElement === 'number') {
            newActiveElement = allItems[Math.max(Math.min(newActiveElement, allItems.length - 1), 0)];
        }

        data.previousActiveIndex = data.activeIndex;
        (data.previousActiveItem = data.activeItem)?.classList.remove(data.activeCls);
        (data.activeItem = newActiveElement)?.classList.add(data.activeCls);
        data.activeIndex = newActiveElement ? allItems.indexOf(newActiveElement) : -1;

        newActiveElement.scrollIntoView({
            block    : 'nearest',
            inline   : 'nearest',
            nehavior : 'smooth'
        });

        // Link the event source or the encapsulating element to the active item for A11Y
        (data.eventSource || data.subject).setAttribute('aria-activedescendant', data.activeItem.id);

        DomEvents.sendMessageToApp({
            type                : 'neonavigate',
            target              : data.id,
            path                : [{
                id : data.id
            }],
            activeItem          : data.activeItem.id,
            previousActiveItem  : data.previousActiveItem?.id,
            activeIndex         : data.activeIndex,
            previousActiveIndex : data.previousActiveIndex,
            altKey              : Neo.altKeyDown,
            ctrlKey             : Neo.controlKeyDown,
            metaKey             : Neo.metaKeyDown,
            shiftKey            : Neo.shiftKeyDown
        });

        // Navigation causes click if autoClick set.
        // TabPanels work like this.
        if (data.autoClick) {
            this.clickItem(newActiveElement);
        }
    }

    navigateGetAdjacent(direction = 1, data) {
        const { treeWalker } = data;

        // Walk forwards or backwards to the next or previous node which matches our selector
        treeWalker.currentNode = this.navigatorGetActiveItem(data) || data.subject;
        treeWalker[direction < 0 ? 'previousNode' : 'nextNode']();

        // Found a target in the requested direction
        if (treeWalker.currentNode) {
            if (treeWalker.currentNode !== data.activeItem) {
                return treeWalker.currentNode;
            }
        }
        // Could not find target in requested direction, then wrap if configured to do so
        else if (data.wrap !== false) {
            const allItems = data.subject.querySelector(data.selector);

            return allItems[direction === 1 ? 0 : allItems.length - 1];
        }
    }

    navigatorGetActiveItem(data) {
        let activeItem = data.activeItem && DomAccess.getElement(data.activeItem.id);

        if (!activeItem && ('activeIndex' in data)) {
            const allItems = data.subject.querySelectorAll(data.selector);

            activeItem = allItems[Math.max(Math.min(data.activeIndex, allItems.length - 1), 0)];
        }
        return activeItem;
    }

    navigateNodeFilter(node, data) {
        return node.offsetParent && node.matches?.(data.selector) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    }
}

let instance = Neo.applyClassConfig(Navigator);

export default instance;
