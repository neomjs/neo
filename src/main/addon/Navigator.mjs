import Base      from '../../core/Base.mjs';
import DomAccess from '../DomAccess.mjs';
import DomUtils  from '../DomUtils.mjs';
import DomEvents from '../DomEvents.mjs';

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
                'subscribe',
                'unsubscribe',
                'navigateTo'
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
     * @param {*} data
     * @param {String} data.id The element id to navigate in.
     * @param {String} [data.eventSource] Optional - the element id to read keystrokes from.
     * defaults to the main element id.
     * @param {String} data.selector A CSS selector which identifies the navigable elements.
     * @param {String} data.activeCls A CSS class to add to the currently active navigable element.
     * @param {Boolean} wrap Pass as `true` to have navigation wrap from first to last and vice versa.
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

        // Finds a focusable item starting from a descendant el within one of our selector items
        data.findFocusable = el => DomUtils.closest(el, el =>
            // We're looking for an element that is focusable
            DomUtils.isFocusable(el) &&
            // And within our subject element
            (subject.compcompareDocumentPosition(el) & Node.DOCUMENT_POSITION_CONTAINED_BY) &&
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
        subject.addEventListener('mousedown',    data.l2 = e => me.navigateMouseDownHandler(e, data));
        subject.addEventListener('click',        data.l3 = e => me.navigateClickHandler(e, data));
        subject.addEventListener('focusin',      data.l4 = e => me.navigateFocusInHandler(e, data));
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
        }
    }

    navigateTargetChildListChange(mutations, data) {
        // Active item gone.
        // Try to activate the item at the same index;
        if (data.activeItem && !data.subject.contains(data.activeItem)) {
            const allItems = data.subject.querySelectorAll(data.selector);

            allItems.length && this.navigateTo(allItems[Math.max(Math.min(data.activeIndex, allItems.length - 1), 0)], data);
        }
    }

    navigateFocusInHandler(e, data) {
        const target = e.target.closest(data.selector);

        // If our targets are focusable and recieve focus, that is a navigation.
        if (target) {
            this.setActiveItem(target, data);
        }
    }

    navigateClickHandler(e, data) {
        const target = e.target.closest(data.selector);

        // If there was a focusable under the mouse, mousedown will have focused it and and we
        // will have respond to that in navigateFocusInHandler.
        // If not, we navigate programatically.
        if (target && !data.findFocusable(target)) {
            this.navigateTo(target, data);
        }
    }

    navigateMouseDownHandler(e, data) {
        const target = e.target.closest(data.selector);

        // If there is a focusable undet the mouse, it will take focus, and we respond to that in navigateFocusInHandler.
        // If not, we have to programatically activate on click, but we must not draw focus away from
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
                data.nextKey = 'ArrowRight';
            }
            // Child elements layed out vertically.
            else {
                data.previousKey = 'ArrowUp';
                data.nextKey = 'ArrowDown';
            }
        }

        let { key } = keyEvent,
            newActiveElement;

        switch(key) {
            case data.previousKey:
                newActiveElement = me.navigateGetAdjacent(-1, data);
                if (!newActiveElement && wrap) {
                    newActiveElement = subject.querySelector(`${data.selector}:last-of-type`);
                }
                break;
            case data.nextKey:
                newActiveElement = me.navigateGetAdjacent(1, data);
                if (!newActiveElement && wrap) {
                    newActiveElement = subject.querySelector(data.selector);
                }
                break;
            case 'Home':
                newActiveElement = subject.querySelector(data.selector);
                break;
            case 'End':
                newActiveElement = subject.querySelector(`${data.selector}:last-of-type`);
                break;
            case 'Enter':
                if (data.activeItem) {
                    const
                        rect    = data.activeItem.getBoundingClientRect(),
                        clientX = rect.x + (rect.width / 2),
                        clientY = rect.y + (rect.height / 2);

                    data.activeItem.dispatchEvent(new MouseEvent('click', {
                        bubbles  : true,
                        altKey   : Neo.altKeyDown,
                        ctrlKey  : Neo.controlKeyDown,
                        metaKey  : Neo.metaKeyDown,
                        shiftKey : Neo.shiftKeyDown,
                        clientX,
                        clientY
                    }))
                }
        }

        if (newActiveElement) {
            keyEvent.preventDefault();
            me.navigateTo(newActiveElement, data);
        }
    }

    /**
     * Navigates to the passed 
     * @param {String|Number} newActiveElement The id of the new active element in the subject
     * element, or the index of the item.
     * @param {Object} data The data block as passed to {@link #subscribe}
     * @returns 
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
            newActiveElement = data.subject.querySelectorAll(data.selector)[newActiveElement];
        }
        else if (typeof newActiveElement === 'string') {
            newActiveElement = DomAccess.getElement(newActiveElement);
        }

        // Find a focusable element which may be the item, or inside the item to draw focus to.
        // For example a Chip list in which .neo-list-items contain focusable Chips.
        const focusTarget = [newActiveElement, ...newActiveElement.querySelectorAll('*')].find(DomUtils.isFocusable);

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
