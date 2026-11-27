import Button from './Base.mjs';

/**
 * @summary One primary action that floats above the content at the bottom of the window, and collapses to its icon
 * or hides while the content it watches scrolls down.
 *
 * A floating action button is a {@link Neo.button.Base} with a placement and two scroll behaviors, so `text`,
 * `iconCls`, `badgeText`, `handler`, `route` and the ripple work as on any button. It sits `position: fixed` at the
 * bottom edge of its window, inside the safe area, at the `start`, `center` or `end` of the edge.
 *
 * `extended` shows the text beside the icon. Without it, or while collapsed, only the icon shows. The text stays in
 * the DOM, visually clipped, so it remains the accessible name.
 *
 * `scrollBehavior` reads the scroll events of `scrollTarget`. A downward scroll of at least `scrollThreshold` pixels
 * collapses (`'collapse'`) or hides (`'hide'`) the button. An upward scroll, or reaching the top, brings it back. A
 * hidden button is `visibility: hidden`, so it can neither take focus nor receive a tap.
 *
 * @example
 * {
 *     module        : FloatingAction,
 *     iconCls       : 'fa fa-pen',
 *     scrollBehavior: 'collapse',
 *     scrollTarget  : 'contacts-list', // a component or its id
 *     text          : 'Edit'
 * }
 * @class Neo.button.FloatingAction
 * @extends Neo.button.Base
 */
class FloatingAction extends Button {
    /**
     * Valid values for position
     * @member {String[]} positions=['start','center','end']
     * @protected
     * @static
     */
    static positions = ['start', 'center', 'end']
    /**
     * Valid values for scrollBehavior
     * @member {Array} scrollBehaviors=[null,'collapse','hide']
     * @protected
     * @static
     */
    static scrollBehaviors = [null, 'collapse', 'hide']

    static config = {
        /**
         * @member {String} className='Neo.button.FloatingAction'
         * @protected
         */
        className: 'Neo.button.FloatingAction',
        /**
         * @member {String} ntype='floating-action-button'
         * @protected
         */
        ntype: 'floating-action-button',
        /**
         * @member {String[]} baseCls=['neo-floating-action-button','neo-button']
         * @protected
         */
        baseCls: ['neo-floating-action-button', 'neo-button'],
        /**
         * True shows the text beside the icon. False leaves only the icon, and the text stays the accessible name.
         * @member {Boolean} extended_=true
         * @reactive
         */
        extended_: true,
        /**
         * Where along the bottom edge of the window the button sits.
         * @member {'start'|'center'|'end'} position_='end'
         * @reactive
         */
        position_: 'end',
        /**
         * What a downward scroll of `scrollTarget` does: collapse the button to its icon, hide it, or nothing.
         * @member {'collapse'|'hide'|null} scrollBehavior_=null
         * @reactive
         */
        scrollBehavior_: null,
        /**
         * True while a downward scroll of `scrollTarget` keeps the button collapsed or hidden.
         * @member {Boolean} scrolledAway_=false
         * @protected
         * @reactive
         */
        scrolledAway_: false,
        /**
         * The component whose scroll events drive `scrollBehavior`, or its id.
         * @member {Neo.component.Base|String|null} scrollTarget_=null
         * @reactive
         */
        scrollTarget_: null,
        /**
         * The distance in pixels a scroll must travel in one direction before the button reacts, so jitter
         * changes nothing.
         * @member {Number} scrollThreshold=8
         */
        scrollThreshold: 8
    }

    /**
     * The listener this button adds to `scrollTarget`, and removes with an equal object. Its `scope` tells two
     * buttons on one target apart: listeners compare as equal by method name and source, instances by id.
     * @member {Object} scrollListener
     * @protected
     */
    scrollListener = {scroll: this.onTargetScroll, scope: this}
    /**
     * The scroll position each element inside `scrollTarget` was last measured at, by element id. An element not
     * seen yet counts from 0, its unscrolled position, so one coalesced scroll event still has a direction.
     * @member {Map<String, Number>} scrollTops
     * @protected
     */
    scrollTops = new Map()

    /**
     * Triggered after the extended config got changed
     * @param {Boolean} value    The new value of the extended config.
     * @param {Boolean} oldValue The old value of the extended config.
     * @protected
     */
    afterSetExtended(value, oldValue) {
        this.updateScrollState()
    }

    /**
     * Triggered after the position config got changed
     * @param {String} value    The new value of the position config.
     * @param {String} oldValue The old value of the position config.
     * @protected
     */
    afterSetPosition(value, oldValue) {
        this.removeAddCls(oldValue ? `neo-position-${oldValue}` : [], `neo-position-${value}`)
    }

    /**
     * Triggered after the scrollBehavior config got changed
     * @param {String|null} value    The new value of the scrollBehavior config.
     * @param {String|null} oldValue The old value of the scrollBehavior config.
     * @protected
     */
    afterSetScrollBehavior(value, oldValue) {
        if (!value) {
            this.scrolledAway = false
        }

        this.updateScrollState()
    }

    /**
     * Triggered after the scrolledAway config got changed
     * @param {Boolean} value    The new value of the scrolledAway config.
     * @param {Boolean} oldValue The old value of the scrolledAway config.
     * @protected
     */
    afterSetScrolledAway(value, oldValue) {
        this.updateScrollState()
    }

    /**
     * @summary Moves the scroll listener from the previous target to the new one and starts a fresh measurement.
     * @param {Neo.component.Base|null} value    The new value of the scrollTarget config.
     * @param {Neo.component.Base|null} oldValue The old value of the scrollTarget config.
     * @protected
     */
    afterSetScrollTarget(value, oldValue) {
        let me = this;

        oldValue?.removeDomListeners(me.scrollListener);
        value   ?.addDomListeners(me.scrollListener);

        me.scrollTops.clear();
        me.scrolledAway = false
    }

    /**
     * Triggered before the position config gets changed
     * @param {String} value    The new value of the position config.
     * @param {String} oldValue The old value of the position config.
     * @returns {String}
     * @protected
     */
    beforeSetPosition(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'position')
    }

    /**
     * Triggered before the scrollBehavior config gets changed
     * @param {String|null} value    The new value of the scrollBehavior config.
     * @param {String|null} oldValue The old value of the scrollBehavior config.
     * @returns {String|null}
     * @protected
     */
    beforeSetScrollBehavior(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'scrollBehavior')
    }

    /**
     * Triggered before the scrollTarget config gets changed. Resolves an id to its component.
     * @param {Neo.component.Base|String|null} value    The new value of the scrollTarget config.
     * @param {Neo.component.Base|null}        oldValue The old value of the scrollTarget config.
     * @returns {Neo.component.Base|null}
     * @protected
     */
    beforeSetScrollTarget(value, oldValue) {
        if (Neo.isString(value)) {
            value = Neo.getComponent(value) || null
        }

        return value
    }

    /**
     * Removes the scroll listener from `scrollTarget` before the button goes away.
     * @param {...*} args
     */
    destroy(...args) {
        this.scrollTarget?.removeDomListeners(this.scrollListener);
        super.destroy(...args)
    }

    /**
     * @summary Turns the scroll position of an element inside `scrollTarget` into a direction: down by at least
     * `scrollThreshold` pixels scrolls the button away, up by as much brings it back, and the top always does.
     * Each element keeps its own last position, so a nested scroller never compares against the outer one.
     * @param {Object} data The scroll event data
     * @param {Number} data.scrollTop
     * @param {Object} [data.target]
     * @protected
     */
    onTargetScroll(data) {
        let me           = this,
            {scrollTop}  = data,
            {scrollTops} = me,
            targetId     = data.target?.id,
            delta        = scrollTop - (scrollTops.get(targetId) || 0);

        if (scrollTop <= 0) {
            scrollTops.set(targetId, 0);
            me.scrolledAway = false
        } else if (Math.abs(delta) >= me.scrollThreshold) {
            scrollTops.set(targetId, scrollTop);
            me.scrolledAway = delta > 0
        }
    }

    /**
     * @summary Sets `neo-collapsed` (text clipped, icon only) and `neo-scroll-hidden` (the button moves out of the
     * window) from `extended`, `scrollBehavior` and `scrolledAway`.
     * @protected
     */
    updateScrollState() {
        let me                                       = this,
            {extended, scrollBehavior, scrolledAway} = me,
            away                                     = scrolledAway && !!scrollBehavior;

        me.toggleCls('neo-collapsed',     !extended || (away && scrollBehavior === 'collapse'));
        me.toggleCls('neo-scroll-hidden', away && scrollBehavior === 'hide')
    }
}

export default Neo.setupClass(FloatingAction);
