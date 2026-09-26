import Base from '../../../core/Base.mjs';

/**
 * @summary Owns one vessel's transient conversion decision and asynchronous admission.
 * The decision is claim-owned: a live pointer claim on the target proposes conversion as soon as
 * both live rects are measurable, and an admitted conversion holds until the pointer's departure
 * is observed or, absent that evidence, the claim is lost. No geometric threshold gates either
 * direction — the target's content is the accepting region, exactly as it is for a native
 * title-bar drag's anchor point. Unmeasurable geometry still fails closed: it never converts and
 * it reverts an admitted conversion. Reset and destruction invalidate pending admission without
 * firing either actuator; no conversion state enters the dock document.
 * @class Neo.dashboard.dock.window.VesselConversion
 * @extends Neo.core.Base
 */
class VesselConversion extends Base {
    static config = {
        /**
         * @member {String} className='Neo.dashboard.dock.window.VesselConversion'
         * @protected
         */
        className: 'Neo.dashboard.dock.window.VesselConversion',
        /**
         * Strict entry admission: only true or Promise<true> accepts the proposal.
         * @member {Function|null} onConvertIn=null
         */
        onConvertIn: null,
        /**
         * Strict reversion admission; refusal retains conversion for retry.
         * @member {Function|null} onConvertOut=null
         */
        onConvertOut: null
    }

    /**
     * @member {Boolean} conversionAccepted=false
     * @protected
     */
    conversionAccepted = false
    /**
     * @member {Number} generation=0
     * @protected
     */
    generation = 0
    /**
     * @member {Object|null} transition=null
     * @protected
     */
    transition = null

    /**
     * The admitted conversion state.
     * @member {Boolean} converted
     */
    get converted() {
        return this.conversionAccepted === true
    }

    /**
     * The pending proposal, or the admitted state.
     * @member {Boolean} targetConverted
     */
    get targetConverted() {
        return this.transition?.targetConverted ?? this.converted
    }

    /**
     * Whether actuator admission is pending.
     * @member {Boolean} transitioning
     */
    get transitioning() {
        return Boolean(this.transition)
    }

    /**
     * Pending strict admission.
     * @member {Promise<Boolean>|null} transitionPromise
     */
    get transitionPromise() {
        return this.transition?.promise ?? null
    }

    /**
     * @summary Validates the required seams before allocating a registered instance.
     * @param {Object} [config={}]
     */
    construct(config={}) {
        this.validateConfig({...this.constructor.config, ...config});
        super.construct(config)
    }

    /**
     * @summary Invalidates pending admission before Base unregisters this sensor.
     */
    destroy() {
        this.reset();
        super.destroy()
    }

    /**
     * @summary Admits finite rectangles with positive extents as measurable geometry.
     * @param {Object|null} rect
     * @returns {Boolean}
     */
    isMeasurableRect(rect) {
        return Boolean(rect) && Number.isFinite(rect.x) && Number.isFinite(rect.y) &&
            Number.isFinite(rect.width) && rect.width > 0 &&
            Number.isFinite(rect.height) && rect.height > 0
    }

    /**
     * @summary Clears conversion silently and invalidates pending completions.
     */
    reset() {
        this.generation++;
        this.conversionAccepted = false;
        this.transition = null
    }

    /**
     * @summary Selects a state without owning actuator admission or its lifecycle.
     * Entry requires a current pointer claim over measurable geometry. A false observed exit holds
     * through a lapsed claim; absent exit evidence keeps strict claim-loss behavior; unmeasurable
     * geometry reverts whatever the pointer says.
     * @param {Object} record Measured sample and admitted state.
     * @param {Boolean|null} pointerExitedTarget Tri-state observed departure.
     * @returns {Boolean}
     */
    resolveConversion(record, pointerExitedTarget) {
        const {converted, measurable, pointerInTarget} = record;
        if (!measurable) return false;
        if (!converted) return pointerInTarget;
        return !(pointerExitedTarget === true || (pointerExitedTarget == null && !pointerInTarget))
    }

    /**
     * @summary Measures a live frame and submits at most one strict proposal.
     * Pending admission preserves the previously admitted state; reset or destruction makes a late
     * completion inert.
     * @param {Object} [data={}]
     * @param {Boolean} data.pointerInTarget Current claim on the accepting region.
     * @param {Boolean|null} [data.pointerExitedTarget] Observed exit/still-inside evidence.
     * @param {Object} data.sourceRect Live {x, y, width, height}.
     * @param {Object} data.targetRect Live {x, y, width, height}.
     * @returns {Object} Sample with measurable, pointerInTarget, converted and optional transitioning.
     */
    sample({pointerExitedTarget, pointerInTarget, sourceRect, targetRect} = {}) {
        const me     = this,
              record = {
                  converted      : me.conversionAccepted,
                  measurable     : me.isMeasurableRect(sourceRect) && me.isMeasurableRect(targetRect),
                  pointerInTarget: pointerInTarget === true,
                  sourceRect,
                  targetRect
              };

        if (me.transition) return {...record, transitioning: true};

        const next = me.resolveConversion(record, pointerExitedTarget);
        if (typeof next !== 'boolean' || next === me.conversionAccepted) return record;

        const proposed = {...record, converted: next},
              event    = next ? me.onConvertIn : me.onConvertOut;
        let admission;
        try {
            admission = event.call(me, proposed)
        } catch {
            return record
        }

        if (admission === true) {
            me.conversionAccepted = next;
            return proposed
        }
        if (typeof admission?.then !== 'function') return record;

        const token = ++me.generation,
              state = {promise: null, targetConverted: next, token};
        me.transition = state;
        state.promise = Promise.resolve(admission).then(value => {
            if (me.isDestroyed || me.transition !== state || me.generation !== token) return false;
            value === true && (me.conversionAccepted = next);
            me.transition = null;
            return value === true
        }, () => {
            if (!me.isDestroyed && me.transition === state && me.generation === token) me.transition = null;
            return false
        });
        return {...record, transitioning: true}
    }

    /**
     * @summary Requires both actuator seams.
     * @param {Object} config Effective class defaults plus instance overrides.
     * @protected
     */
    validateConfig({onConvertIn, onConvertOut}) {
        if (typeof onConvertIn !== 'function' || typeof onConvertOut !== 'function') {
            throw new Error(`${this.className}: onConvertIn and onConvertOut are required function seams`)
        }
    }
}

export default Neo.setupClass(VesselConversion);
