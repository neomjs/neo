import Container from './Base.mjs';

/**
 * @summary A "Phantom" container that renders its items directly into the parent's DOM without a wrapper element.
 *
 * `Neo.container.Fragment` allows you to group multiple components together for logical purposes (e.g., mass visibility toggling,
 * shared state, batch operations) without introducing an extra DOM node (like a `<div>`) that would disrupt the visual layout.
 *
 * **Key Architectural Concepts:**
 * 1.  **Wrapperless Rendering:** In the VDOM and DOM, a Fragment appears as a range of sibling nodes anchored by
 *     start and end comments (e.g., `<!-- fragment-id-start -->` ... `<!-- fragment-id-end -->`).
 * 2.  **Layout Participation:** Since there is no wrapper `<div>`, the Fragment's children sit directly in the parent container's
 *     layout context. This is critical for **CSS Grid** and **Flexbox** layouts where an intermediate wrapper would break
 *     the column/row flow.
 * 3.  **Atomic Moves:** The entire fragment (and all its children) can be moved to a new parent or window as a single unit,
 *     preserving the state of all children (focus, input values, etc.).
 *
 * **Semantic Signposts**:
 * - "Ghost Container"
 * - "Phantom Node"
 * - "Wrapperless Grouping"
 * - "Logical Grouping"
 * - "Transparent Container"
 *
 * @class Neo.container.Fragment
 * @extends Neo.container.Base
 * @see Neo.examples.container.fragment.MainContainer
 * @see Neo.vdom.Helper
 */
class Fragment extends Container {
    static config = {
        /**
         * @member {String} className='Neo.container.Fragment'
         * @protected
         */
        className: 'Neo.container.Fragment',
        /**
         * @member {String} ntype='fragment'
         * @protected
         */
        ntype: 'fragment',
        /**
         * @member {String[]|null} baseCls=null
         */
        baseCls: null,
        /**
         * @member {String[]|null} cls=null
         */
        cls: null,
        /**
         * Fragments cannot have layouts because they do not have a physical DOM element to apply CSS layout rules to.
         * The children of the fragment participate directly in the *parent container's* layout.
         * @member {Object|String|null} layout=null
         */
        layout: null,
        /**
         * The special VNode tag that signals the VDOM engine to render this as a comment-anchored range.
         * @member {String} tag='fragment'
         */
        tag: 'fragment'
    }

    /**
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetCls(value, oldValue) {
        return null
    }

    /**
     * @param {Object|String|Neo.layout.Base} value
     * @param {Object|String|Neo.layout.Base} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetLayout(value, oldValue) {
        return null
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetStyle(value, oldValue) {
        return null
    }

    /**
     * @param {String[]|null} value
     * @param {String[]|null} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetWrapperCls(value, oldValue) {
        return null
    }

    /**
     * @param {Object} value
     * @param {Object} oldValue
     * @protected
     * @returns {null}
     */
    beforeSetWrapperStyle(value, oldValue) {
        return null
    }

    /**
     * Overriding createLayout to ensure it always returns null
     * @param {Object|String|Neo.layout.Base} value
     * @protected
     * @returns {null}
     */
    createLayout(value) {
        return null
    }
}

export default Neo.setupClass(Fragment);
