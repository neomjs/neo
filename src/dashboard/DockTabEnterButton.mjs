import DockMotionSignal from './DockMotionSignal.mjs';
import TabHeaderButton  from '../tab/header/Button.mjs';

/**
 * @summary The operation-correlated tab header used for exactly one committed dock `addTab`
 * projection. It brackets its CSS entry animation through {@link Neo.dashboard.DockMotionSignal}
 * and settles on the root animation end/cancel or teardown.
 *
 * This component is intentionally dashboard-owned: the generic {@link Neo.tab.header.Button}
 * stays unaware of dock documents and operations. {@link Neo.dashboard.DockLayoutAdapter} selects
 * this subclass only for the header whose `itemId` + `tabsNodeId` match the transient descriptor
 * carried by the consuming projection. The correlation never enters the dock document and the
 * class does not survive a later coarse projection.
 *
 * The CSS duration/easing remain token-owned. Motion enters only when the browser emits the root
 * `animationstart`, so a token-collapsed 0ms animation (which emits no animation events) creates no
 * false signal. End, cancellation, replacement, and destroy settle idempotently, with
 * `DockMotionSignal`'s fail-safe remaining the final lost-event backstop.
 *
 * @class Neo.dashboard.DockTabEnterButton
 * @extends Neo.tab.header.Button
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockMotionSignal
 */
class DockTabEnterButton extends TabHeaderButton {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.DockTabEnterButton'
         * @protected
         */
        className: 'Neo.dashboard.DockTabEnterButton',
        /**
         * @member {String} ntype='dashboard-dock-tab-enter-button'
         * @protected
         */
        ntype: 'dashboard-dock-tab-enter-button'
    }

    /**
     * Whether this instance currently owns one counted tab-entry motion.
     * @member {Boolean} tabEnterMotionActive=false
     * @protected
     */
    tabEnterMotionActive = false

    /**
     * Wires local root animation start/settlement. The browser opens the counted window only when
     * CSS actually starts; construction alone is not evidence of motion.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {animationcancel: me.onTabEnterAnimationSettle, scope: me},
            {animationend   : me.onTabEnterAnimationSettle, scope: me},
            {animationstart : me.onTabEnterAnimationStart,  scope: me}
        ])
    }

    /**
     * Opens this producer's one counted motion entry.
     * @protected
     */
    beginTabEnterMotion() {
        if (!this.tabEnterMotionActive) {
            this.tabEnterMotionActive = true;
            DockMotionSignal.enter(this)
        }
    }

    /**
     * Settles this producer's owned motion entry exactly once.
     * @protected
     */
    finishTabEnterMotion() {
        if (this.tabEnterMotionActive) {
            this.tabEnterMotionActive = false;
            DockMotionSignal.leave(this)
        }
    }

    /**
     * Opens the motion signal only for this button's real root CSS animation. A 0ms token emits no
     * start, so reduced motion stays honestly signal-free instead of waiting on a timer backstop.
     * @param {Object} data
     */
    onTabEnterAnimationStart(data) {
        if (data?.target?.id === (this.vdom?.id || this.id)) {
            this.beginTabEnterMotion()
        }
    }

    /**
     * Replacement or teardown may remove the animated node before the browser emits an end event.
     * Settle while the instance is still live, then continue the ordinary component lifecycle.
     */
    destroy() {
        this.finishTabEnterMotion();
        super.destroy()
    }

    /**
     * Settles only for this button's root event. Descendant animations bubble through the same
     * local listener but retain their own config-aware target id and cannot close this producer.
     * Both `animationend` and `animationcancel` route here. An end without a matching start is an
     * intentional safe no-op (the zero-duration / missing-animation path).
     * @param {Object} data
     */
    onTabEnterAnimationSettle(data) {
        if (data?.target?.id === (this.vdom?.id || this.id)) {
            this.finishTabEnterMotion()
        }
    }
}

export default Neo.setupClass(DockTabEnterButton);
