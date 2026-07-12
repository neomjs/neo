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
 * The CSS duration/easing remain token-owned. Once mounted, the App Worker asks the main-thread DOM
 * authority for this header's rendered animation name + duration and opens the signal only for the
 * exact non-zero tab-entry animation. This avoids racing the framework's delayed local-listener
 * mount against `animationstart`, while a token-collapsed 0ms animation creates no false signal.
 * End, cancellation, replacement, and destroy settle idempotently, with `DockMotionSignal`'s
 * fail-safe remaining the final lost-event backstop.
 *
 * @class Neo.dashboard.DockTabEnterButton
 * @extends Neo.tab.header.Button
 * @see Neo.dashboard.DockLayoutAdapter
 * @see Neo.dashboard.DockMotionSignal
 */
class DockTabEnterButton extends TabHeaderButton {
    /**
     * Whether the rendered style describes this producer's live, non-zero animation. CSS lists
     * repeat shorter duration lists across animation names; mirror that grammar without owning any
     * duration value here.
     * @param {Object|null} styles Main-thread computed-style projection.
     * @returns {Boolean}
     * @static
     */
    static hasRenderedTabEnterMotion(styles) {
        let durations = String(styles?.['animation-duration'] || '').split(',').map(value => value.trim()),
            names     = String(styles?.['animation-name']     || '').split(',').map(value => value.trim()),
            index     = names.indexOf('neo-dock-tab-enter'),
            match;

        if (index < 0 || durations.length === 0) {
            return false
        }

        match = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(ms|s)$/.exec(durations[index % durations.length]);

        return !!match && Number(match[1]) > 0
    }

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
     * Wires local root animation settlement. The counted window opens from rendered-style truth in
     * {@link #afterSetMounted}; construction alone is not evidence of motion.
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me.addDomListeners([
            {animationcancel: me.onTabEnterAnimationSettle, scope: me},
            {animationend   : me.onTabEnterAnimationSettle, scope: me}
        ])
    }

    /**
     * Starts rendered-style discovery only after the physical header exists. Unmount is a
     * cancellation boundary and must settle before a late style-read response can arrive.
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        super.afterSetMounted(value, oldValue);

        if (oldValue !== undefined) {
            value ? this.syncRenderedTabEnterMotion() : this.finishTabEnterMotion()
        }
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
     * Reads the physical header's computed animation contract from its owning main thread. A late
     * response after unmount/destroy is inert; an unavailable or malformed style projection fails
     * safe to an instant landing.
     * @returns {Promise<void>}
     * @protected
     */
    async syncRenderedTabEnterMotion() {
        let me = this,
            styles;

        try {
            styles = await Neo.main.DomAccess.getComputedStyle({
                id   : me.id,
                style: ['animation-name', 'animation-duration']
            })
        } catch {
            return
        }

        if (me.mounted && !me.isDestroyed && !me.isDestroying
            && DockTabEnterButton.hasRenderedTabEnterMotion(styles)) {
            me.beginTabEnterMotion()
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
     * Both `animationend` and `animationcancel` route here. An end without a matching rendered
     * motion entry is an intentional safe no-op (the zero-duration / missing-animation path).
     * @param {Object} data
     */
    onTabEnterAnimationSettle(data) {
        if (data?.target?.id === (this.vdom?.id || this.id)) {
            this.finishTabEnterMotion()
        }
    }
}

export default Neo.setupClass(DockTabEnterButton);
