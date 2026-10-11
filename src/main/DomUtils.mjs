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

    /**
     * @summary Builds circular-reveal effects that own both snapshot layers' compositing.
     *
     * The old snapshot stays opaque behind the growing new snapshot. Both effects override the
     * browser's cross-fade and additive blending, so consumers need no view-transition CSS.
     * Filled effects must be cancelled when the owning view transition settles, not when their
     * duration elapses: a zero-duration reveal still shares the browser's transition lifetime.
     *
     * The values are percentages on purpose. A view transition pseudo-element resolves a percentage
     * against its own box, while a pixel length depends on the coordinate space the browser resolves
     * lengths in — one browser resolved them in device pixels while the box stayed in CSS pixels,
     * halving both the origin and the radius on a HiDPI display. A percentage radius for `circle()`
     * resolves against `sqrt(width² + height²) / sqrt(2)`, which is what lets the end radius be
     * *derived* from the origin rather than guessed: the reveal ends exactly at its farthest corner.
     * An over-large fixed radius covers the box too, but only by finishing off-screen — the
     * predecessor here used a hardcoded 3000 and spent roughly half its duration outside the
     * viewport, which is invisible motion the easing curve still budgets time for.
     *
     * **Assumption, stated because it is not universal:** the incoming coordinates are viewport
     * relative, and the percentages are resolved against the pseudo-element's own box, so this is
     * exact only while that box is viewport-aligned. It is on desktop — measured identical to
     * `innerWidth`/`innerHeight` for `::view-transition`, `-group`, `-image-pair` and `-new`. It is
     * NOT guaranteed on mobile, where the snapshot containing block spans area the retractable
     * browser UI can occupy and its origin can sit above the layout viewport. Percentages remove the
     * unit hazard; they do not by themselves reconcile two different boxes. A caller that needs
     * exactness there has to map the snapshot box rather than pass `innerWidth`/`innerHeight`.
     * @param {Object} [reveal]
     * @param {Number} [reveal.duration=500]
     * @param {String} [reveal.easing='ease-in']
     * @param {Number} [reveal.x] Viewport x coordinate to grow the new state from
     * @param {Number} [reveal.y] Viewport y coordinate to grow the new state from
     * @param {Number} [width=globalThis.innerWidth]
     * @param {Number} [height=globalThis.innerHeight]
     * @returns {Object|null} A new-layer `Element.animate()` payload with an `oldLayer` companion,
     * or null when there is no usable origin
     */
    static createRevealAnimation(reveal, width=globalThis.innerWidth, height=globalThis.innerHeight) {
        // `x` and `y` are compared to null, not tested for truthiness: 0 is a coordinate on the
        // viewport edge, not a missing one. A zero-sized viewport is a different miss — a hidden or
        // unrendered document reports 0 for every dimension, and dividing by it yields Infinity,
        // which is an accepted keyframe that renders nothing rather than a parse error.
        if (reveal?.x == null || reveal.y == null || !width || !height) {
            return null
        }

        // The circle has to reach whichever corner is farthest from the origin — no more, or the
        // tail of the animation plays outside the viewport where nothing can see it.
        const distance = Math.max(
                  Math.hypot(reveal.x,         reveal.y),
                  Math.hypot(width - reveal.x, reveal.y),
                  Math.hypot(reveal.x,         height - reveal.y),
                  Math.hypot(width - reveal.x, height - reveal.y)
              ),
              options  = {
                  // Nullish defaults preserve an explicit zero-duration reduced-motion reveal.
                  duration: reveal.duration ?? 500,
                  easing  : reveal.easing   ?? 'ease-in',
                  fill    : 'both'
              },
              radius   = distance / (Math.hypot(width, height) / Math.SQRT2) * 100,
              x        = reveal.x / width  * 100,
              y        = reveal.y / height * 100;

        return {
            keyframes: [
                {clipPath: `circle(0% at ${x}% ${y}%)`, opacity: 1, mixBlendMode: 'normal'},
                {clipPath: `circle(${radius}% at ${x}% ${y}%)`, opacity: 1, mixBlendMode: 'normal'}
            ],
            options: {
                ...options,
                pseudoElement: '::view-transition-new(root)'
            },
            oldLayer: {
                keyframes: [
                    {opacity: 1, mixBlendMode: 'normal'},
                    {opacity: 1, mixBlendMode: 'normal'}
                ],
                options: {...options, pseudoElement: '::view-transition-old(root)'}
            }
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
