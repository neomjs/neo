import Base            from '../core/Base.mjs';
import DomEventManager from '../manager/DomEvent.mjs';
import {isDescriptor}  from '../core/ConfigSymbols.mjs';

/**
 * A mixin providing DOM event handling capabilities to components.
 * This mixin is consumed by both Neo.component.Base and Neo.functional.component.Base
 * to enable consistent management of DOM event listeners across different component types.
 * @class Neo.mixin.DomEvents
 * @extends Neo.core.Base
 */
class DomEvents extends Base {
    static config = {
        /**
         * @member {String} className='Neo.mixin.DomEvents'
         * @protected
         */
        className: 'Neo.mixin.DomEvents',
        /**
         * DOM listener configs. A `tap` listener observes each qualifying release. Its optional
         * `count` and `contactCount` options filter the repeat index and simultaneous contact count.
         * Use `click` for button and link activation, including keyboard activation.
         *
         * A `press:start` listener can override Main's `Gesture.pressHoldMs` and
         * `Gesture.pressMoveTolerance` with `holdMs` in milliseconds and `moveTolerance` in CSS pixels.
         * The highest-priority `press:start` on the node supplies those overrides.
         * The gesture terminates in `press:end` (whose `duration` includes the full hold) or `press:cancel`.
         * @member {Object[]|null} domListeners_=null
         * @example
         * domListeners: [{
         *     tap: {fn: 'onChord', count: 1, contactCount: 2},
         *     'press:start': {fn: 'onHoldStart', holdMs: 300},
         *     'press:end': 'onHoldEnd',
         *     'press:cancel': 'onHoldCancel'
         * }]
         * @example
         * afterSetStayOnHover(value, oldValue) {
         *     if (value) {
         *         let me = this;
         *
         *         me.addDomListeners(
         *             {mouseenter: me.onMouseEnter, scope: me},
         *             {mouseleave: me.onMouseLeave, scope: me}
         *         )
         *    }
         *}
         * @reactive
         */
        domListeners_: {
            [isDescriptor]: true,
            cloneOnGet    : 'shallow',
            value         : null
        }
    }

    /**
     * Convenience shortcut to add additional dom listeners
     * @param {Object|Object[]} value
     */
    addDomListeners(value) {
        if (!Array.isArray(value)) {
            value = [value]
        }

        let domListeners = this.domListeners;

        domListeners.push(...value);

        this.domListeners = domListeners
    }

    /**
     * Registers the domListeners inside the Neo.manager.DomEvent
     * @param {Object[]} value
     * @param {Object[]} oldValue
     * @protected
     */
    afterSetDomListeners(value, oldValue) {
        let me = this;

        if (value?.[0] || oldValue?.[0]) {
            DomEventManager.updateDomListeners(me, value, oldValue)
        }
    }

    /**
     * Triggered before the domListeners config gets changed.
     * @param {Object|Object[]} value
     * @param {Object[]} oldValue
     * @returns {Object[]}
     * @protected
     */
    beforeSetDomListeners(value, oldValue) {
        if (Neo.isObject(value)) {
            value = [value]
        }

        return value || []
    }

    /**
     * Initializes DOM event listeners.
     */
    initDomEvents() {
        let me = this;
        if (me.domListeners?.length > 0) {
            // todo: the main thread reply of mount arrives after pushing the task into the queue which does not ensure the dom is mounted
            me.timeout(150).then(() => {
                DomEventManager.mountDomListeners(me)
            })
        }
    }

    /**
     * Resets the mounted flag for local domEvent listeners
     */
    resetMountedDomEvents() {
        DomEventManager.resetMountedDomListeners(this)
    }

    /**
     * Destroys DOM event listeners.
     */
    removeDomEvents() {
        this.domListeners = []
    }

    /**
     * @param {Array|Object} value
     */
    removeDomListeners(value) {
        if (!Array.isArray(value)) {
            value = [value];
        }

        let me             = this,
            {domListeners} = me,
            i, len;

        value.forEach(item => {
            i = 0;
            len = domListeners.length;

            for (; i < len; i++) {
                if (Neo.isEqual(item, domListeners[i])) {
                    domListeners.splice(i, 1);
                    break
                }
            }
        });

        me.domListeners = domListeners
    }
}

export default Neo.setupClass(DomEvents);
