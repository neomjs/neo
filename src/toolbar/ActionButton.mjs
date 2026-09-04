import Button   from '../button/Base.mjs';
import NeoArray from '../util/Array.mjs';

/**
 * @summary A toolbar action that derives its own presentation from one reactive flag.
 *
 * A toggling action shows one icon, name and tooltip while off and another while on. Without an
 * owner for that mapping, each host computes the pair itself — once in the projection that builds
 * the boot config and again in the sync that runs afterwards — and the two are kept equal by hand.
 * Here the config DECLARES both sides and `pressed` picks, so the same code answers at boot and at
 * runtime and the copies cannot disagree.
 *
 * `pressed` is `button.Base`'s own flag: this extends what its `afterSet` already does for `cls`
 * to the rest of the presentation. A non-toggling action leaves the pressed-side configs null and
 * behaves exactly like the plain button it replaces.
 *
 * @class Neo.toolbar.ActionButton
 * @extends Neo.button.Base
 */
class ActionButton extends Button {
    static config = {
        /**
         * @member {String} className='Neo.toolbar.ActionButton'
         * @protected
         */
        className: 'Neo.toolbar.ActionButton',
        /**
         * @member {String} ntype='toolbar-action-button'
         * @protected
         */
        ntype: 'toolbar-action-button',
        /**
         * The accessible name while `pressed` is false. Null keeps whatever the toolbar derived.
         * @member {String|null} actionLabel_=null
         * @reactive
         */
        actionLabel_: null,
        /**
         * The accessible name while `pressed` is true.
         * @member {String|null} pressedActionLabel_=null
         * @reactive
         */
        pressedActionLabel_: null,
        /**
         * The icon while `pressed` is true. `iconCls` remains the unpressed side.
         * @member {String|null} pressedIconCls_=null
         * @reactive
         */
        pressedIconCls_: null,
        /**
         * The tooltip while `pressed` is true. `tooltip` remains the unpressed side.
         * @member {Object|String|null} pressedTooltip_=null
         * @reactive
         */
        pressedTooltip_: null
    }

    /**
     * The unpressed side of each axis, captured before `pressed` first swaps it so the reversal
     * restores what the config declared rather than what the last swap happened to leave.
     *
     * Captured ONCE, which makes the resting side config-time truth: writing `iconCls`, `tooltip`
     * or `actionLabel` on a live instance while it is pressed is unsupported, because the next
     * un-press restores this snapshot over it. Under object permanence a host keeps one action
     * instance across projections and re-syncs it, so a sync belongs on `pressed` and the
     * consumer-owned flags — never on a resting axis.
     * @member {Object|null} restingPresentation=null
     * @protected
     */
    restingPresentation = null

    /**
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetPressed(value, oldValue) {
        let me = this;

        if (!me.isConstructed) {
            super.afterSetPressed(value, oldValue);
            return
        }

        me.restingPresentation ??= {iconCls: me.iconCls, tooltip: me.tooltip, label: me.actionLabel};

        // `pressedIconCls` is what makes this a TOGGLE. Once it is, the pressed side is
        // authoritative for the OPTIONAL axes including its ABSENCE — a state that declares no
        // tooltip has none, rather than keeping the one the button just left.
        //
        // The accessible name is not one of them, and the asymmetry is deliberate: a control
        // without a name cannot be announced at all, so absence there cannot mean "remove". A
        // pressed state declaring no `pressedActionLabel` FALLS BACK to the resting name — it does
        // not merely leave the attribute alone, which would name the control only when some
        // earlier writer happened to. The fallback is the least wrong answer, not a good one,
        // which is why a toggle that swaps its glyph should declare both names. A null on both
        // sides writes nothing and keeps whatever the toolbar derived.
        //
        // An action with no pressed side at all is not a toggle and keeps everything it was
        // configured with.
        let resting = me.restingPresentation,
            toggle  = me.pressedIconCls != null,
            on      = toggle && value === true,
            cls     = [...me.cls || []],
            label   = (on ? me.pressedActionLabel : null) ?? resting.label,
            values  = {
                cls,
                iconCls: on ? me.pressedIconCls : resting.iconCls,
                tooltip: toggle ? (on ? me.pressedTooltip ?? null : resting.tooltip) : me.tooltip
            };

        NeoArray.toggle(cls, 'pressed', on);

        // ONE publish for the whole transition. `super.afterSetPressed` writes `cls` reactively and
        // would publish on its own, so the toggle folds into this batch instead of being inherited.
        // `setSilent` rather than `set` because the accessible name is a vdom attribute, not a
        // config, and has to ride the same update; `set()` publishes at the end of itself. Configs
        // still self-diff inside `setSilent`, so only the vdom write needs a guard.
        me.setSilent(values);
        label != null && me.vdom['aria-label'] !== label && (me.vdom['aria-label'] = label);

        // A gated action's PRESENCE follows `pressed` (`toolbar.Base#isFocusGatedAction`), and a
        // child cannot re-insert its own removed node — so the owner stamps the gate and publishes
        // the whole transition as one diff. An ungated action publishes its own.
        let owner = me.showOnFocus === true ? me.parent : null;

        owner?.applyContextualActionState ? owner.applyContextualActionState() : me.update()
    }
}

export default Neo.setupClass(ActionButton);
