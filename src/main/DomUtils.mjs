import Base from '../core/Base.mjs';

const focusableTags = {
    BODY    : 1,
    BUTTON  : 1,
    EMBED   : 1,
    IFRAME  : 1,
    INPUT   : 1,
    OBJECT  : 1,
    SELECT  : 1,
    TEXTAREA: 1
};

/**
 * @class Neo.main.DomUtils
 * @extends Neo.core.Base
 * @singleton
 */
class DomUtils extends Base {
    static config = {
        /**
         * @member {String} className='Neo.main.DomUtils'
         * @protected
         */
        className: 'Neo.main.DomUtils'
    }

    /**
     * Analogous to the `HTMLElement` `closest` method. Searches starting at the passed element for
     * an element for which the passed `filterFn` returns `true`
     * @param {HTMLElement} el The element to start from.
     * @param {Function} filterFn A function which returns `true` when the desired element is reached.
     * @param {HTMLElement} [limit] The element to stop at. This is *not* considered for matching.
     * @returns {HTMLElement}
     */
    static closest(el, filterFn, limit = document.body) {
        while (el?.nodeType === Node.ELEMENT_NODE && el !== limit) {
            if (filterFn(el)) {
                return el
            }

            el = el.parentNode
        }
    }

    static isFocusable(e) {
        // May be used as a scopeless callback, so use "DomUtils", not "this"
        return DomUtils.isTabbable(e) || Number(e.getAttribute('tabIndex')) < 0
    }

    static isTabbable(e) {
        const
            { nodeName } = e,
            style        = getComputedStyle(e),
            tabIndex     = e.getAttribute('tabIndex');

        // Hidden elements are not tabbable.
        // Negative tabIndex also means not tabbable (Though still focusable)
        if (!e.isConnected || !e.offsetParent || style.getPropertyValue('visibility') === 'hidden' || Number(tabIndex) < 0) {
            return false
        }

        return focusableTags[nodeName] ||
            ((nodeName === 'A' || nodeName === 'LINK') && !!e.href) ||
            (tabIndex != null && Number(tabIndex) >= 0) ||
            e.contentEditable === 'true'
    }

    /**
     * Analogous to the `HTMLElement` `querySelector` method. Searches the passed element
     * and all descendants for the first element for which the passed `filterFn` returns `true`.
     * @param {HTMLElement} el The element to start from.
     * @param {Function} filterFn A function which returns `true` when the desired element is reached.
     * @returns {HTMLElement} The first matching element
     */
    static query(el, filterFn) {
        return [el, ...el.querySelectorAll('*')].find(filterFn);
    }

    /**
     * Analogous to the `HTMLElement` `querySelectorAll` method. Searches the passed element
     * and all descendants for all elements for which the passed `filterFn` returns `true`.
     * @param {HTMLElement} el The element to start from.
     * @param {Function} filterFn A function which returns `true` when a desired element is reached.
     * @returns {HTMLElement[]} An array of matching elements
     */
    static queryAll(el, filterFn) {
        return [el, ...el.querySelectorAll('*')].filter(filterFn)
    }
}

export default Neo.setupClass(DomUtils);
