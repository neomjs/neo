import Base from '../../../core/Base.mjs';

/**
 * @summary Owns one vessel's transient conversion decision and asynchronous admission.
 * Geometry and decision methods are overridable independently of transition ownership. The default
 * uses overlap divided by the smaller extent on each axis, with a live pointer claim for entry and
 * an observed exit or geometric retreat for reversion. Reset and destruction invalidate pending
 * admission without firing either actuator; no conversion state enters the dock document.
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
         * Inclusive entry threshold; strictly greater than revertThreshold.
         * @member {Number} convertThreshold=0.55
         */
        convertThreshold: 0.55,
        /**
         * Strict entry admission: only true or Promise<true> accepts the proposal.
         * @member {Function|null} onConvertIn=null
         */
        onConvertIn: null,
        /**
         * Strict reversion admission; refusal retains conversion for retry.
         * @member {Function|null} onConvertOut=null
         */
        onConvertOut: null,
        /**
         * A converted vessel reverts below this threshold, leaving a dead band.
         * @member {Number} revertThreshold=0.35
         */
        revertThreshold: 0.35
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
     * @summary Validates effective policy before allocating a registered instance.
     * @param {Object} [config={}]
     */
    construct(config={}) {
        this.validateConfig({...this.constructor.config, composeRatios: this.composeRatios, ...config});
        super.construct(config)
    }

    /**
     * @summary Requires a finite threshold in (0, 1].
     * @param {String} name
     * @param {Number} value
     * @protected
     */
    assertThreshold(name, value) {
        if (!Number.isFinite(value) || value <= 0 || value > 1) {
            throw new Error(`${this.className}: ${name} must be a finite number in (0, 1] — got ${value}`)
        }
    }

    /**
     * @summary Measures one axis against the smaller live extent.
     * @param {Object} a
     * @param {Object} b
     * @param {String} axis
     * @param {String} extent
     * @returns {Number}
     */
    axisRatio(a, b, axis, extent) {
        const overlap = Math.min(a[axis] + a[extent], b[axis] + b[extent]) - Math.max(a[axis], b[axis]),
              minimum = Math.min(a[extent], b[extent]);
        return minimum > 0 ? this.clampRatio(Math.max(0, overlap) / minimum) : 0
    }

    /**
     * @summary Bounds a ratio, treating non-finite geometry as no overlap.
     * @param {Number} value
     * @returns {Number}
     */
    clampRatio(value) {
        return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0
    }

    /**
     * @summary Requires both axes to cover the smaller footprint by default.
     * @param {Object} ratios
     * @param {Number} ratios.rx
     * @param {Number} ratios.ry
     * @returns {Number}
     */
    composeRatios({rx, ry}) {
        return Math.min(rx, ry)
    }

    /**
     * @summary Invalidates pending admission before Base unregisters this sensor.
     */
    destroy() {
        this.reset();
        super.destroy()
    }

    /**
     * @summary Admits finite rectangles with positive extents before composition.
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
     * A false observed exit holds through a lapsed claim; absent exit evidence keeps strict
     * claim-loss behavior. Entry always requires a current pointer claim.
     * @param {Object} record Measured sample and admitted state.
     * @param {Boolean|null} pointerExitedTarget Tri-state observed departure.
     * @returns {Boolean}
     */
    resolveConversion(record, pointerExitedTarget) {
        const {composed, converted, pointerInTarget} = record;
        if (!converted) return pointerInTarget && composed >= this.convertThreshold;
        const exited = pointerExitedTarget === true || (pointerExitedTarget == null && !pointerInTarget);
        return !exited && composed >= this.revertThreshold
    }

    /**
     * @summary Measures a live frame and submits at most one strict proposal.
     * Invalid geometry dominates composition. Pending admission preserves the previously admitted
     * state; reset or destruction makes a late completion inert.
     * @param {Object} [data={}]
     * @param {Boolean} data.pointerInTarget Current claim on the accepting region.
     * @param {Boolean|null} [data.pointerExitedTarget] Observed exit/still-inside evidence.
     * @param {Object} data.sourceRect Live {x, y, width, height}.
     * @param {Object} data.targetRect Live {x, y, width, height}.
     * @returns {Object} Sample with rx, ry, composed, converted and optional transitioning.
     */
    sample({pointerExitedTarget, pointerInTarget, sourceRect, targetRect} = {}) {
        const me         = this,
              measurable = me.isMeasurableRect(sourceRect) && me.isMeasurableRect(targetRect),
              rx         = measurable ? me.axisRatio(sourceRect, targetRect, 'x', 'width') : 0,
              ry         = measurable ? me.axisRatio(sourceRect, targetRect, 'y', 'height') : 0,
              composed   = measurable ? me.clampRatio(me.composeRatios({rx, ry})) : 0,
              record     = {composed, converted: me.conversionAccepted,
                  pointerInTarget: pointerInTarget === true, rx, ry, sourceRect, targetRect};

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
     * @summary Checks the default policy's band and required callbacks.
     * @param {Object} config Effective class defaults plus instance overrides.
     * @protected
     */
    validateConfig({composeRatios, convertThreshold, revertThreshold, onConvertIn, onConvertOut}) {
        this.assertThreshold('convertThreshold', convertThreshold);
        this.assertThreshold('revertThreshold', revertThreshold);
        if (convertThreshold <= revertThreshold) {
            throw new Error(`${this.className}: convertThreshold must sit strictly above revertThreshold`)
        }
        if (typeof composeRatios !== 'function') {
            throw new Error(`${this.className}: composeRatios must be a function seam`)
        }
        if (typeof onConvertIn !== 'function' || typeof onConvertOut !== 'function') {
            throw new Error(`${this.className}: onConvertIn and onConvertOut are required function seams`)
        }
    }
}

export default Neo.setupClass(VesselConversion);
