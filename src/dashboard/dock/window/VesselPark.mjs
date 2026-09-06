import Base from '../../../core/Base.mjs';

/**
 * @class Neo.dashboard.dock.window.VesselPark
 * @extends Neo.core.Base
 * @summary The in-gesture vessel lifecycle authority — the pure choreography deciding what happens
 * to a dragged popup's REAL OS window between conversion and the gesture terminal: park it, never
 * close it; re-show the SAME window; dispose exactly once, on commit only.
 *
 * Why park exists (the platform law this machine encodes): popup acquisition consumes WHATWG
 * transient user activation, and `windowOpen` reports failure by BOOLEAN — a blocked popup never
 * throws. A popup→proxy→popup round-trip within ONE continuous gesture therefore cannot count on
 * re-acquisition: the activation that opened the vessel may be consumed, and a mid-gesture reopen
 * reads as unsolicited to popup blocking. Close-and-reopen is a one-way door — the user drags over
 * a target, changes their mind, drags out, and their window is unrecoverable without a fresh
 * gesture. The park contract removes the door: **conversion parks the vessel (a render-target
 * effect behind a host seam), out-conversion re-shows the same OS window, and the activation wall
 * is unreachable BY CONSTRUCTION — this machine has no acquisition seam to call.**
 *
 * The choreography contract this implements (the docking design record, multi-window amendment):
 * - **The in-gesture segment only.** The conversion DECISION belongs to the companion sensor
 *   ({@link Neo.dashboard.dock.window.VesselConversion}); the gesture terminals belong to the outcome
 *   machine; the reintegration close POLICY belongs to the host behind the dispose seam. This
 *   machine owns the ordering between them: convert-in → park; convert-out → re-show; terminal →
 *   dispose (commit) or restore (everything else).
 * - **Commit is the ONLY disposition.** A committed target owns the item now, so the parked vessel
 *   retires through the host's one `disposeVessel` settlement — one in-flight close at a time, and
 *   the slot clears only after strict success. A refusal retains exact retry authority. EVERY other
 *   outcome — cancel, reject, or any terminal the host routes while parked — fails toward RESTORE:
 *   the machine never loses the user's window to a lifecycle edge.
 * - **Two rect sources, one rule.** Out-conversion re-shows at the out-event's LIVE rect when the
 *   caller supplies one (the design record's `resumeWindowDrag(widgetName, proxyRect)` semantics —
 *   the popup resumes under the pointer, where the drag is NOW); absent a supplied rect it falls
 *   back to the recorded pre-conversion rect (origin semantics — the restore path's meaning). The
 *   recorded rect preserves the user's own mid-session sizing either way.
 * - **Stale events are no-ops, not errors.** Duplicate convert-in with a live slot, convert-out or
 *   terminal with no slot, and terminals for a different `itemId` all return silently — the
 *   exact-once/idempotent cleanup bar every gesture surface owes its terminals.
 */
class VesselPark extends Base {
    static config = {
        /** @member {String} className='Neo.dashboard.dock.window.VesselPark' @protected */
        className: 'Neo.dashboard.dock.window.VesselPark',
        /**
         * Receives `{itemId, windowName}`. Only strict success releases committed cleanup authority.
         * @member {Function|null} disposeVessel=null
         */
        disposeVessel: null,
        /**
         * Receives `{itemId, windowName}`. Only strict success admits parking the existing window.
         * @member {Function|null} parkVessel=null
         */
        parkVessel: null,
        /**
         * Receives `{itemId, rect, terminal, windowName}`. Only strict success releases the park slot.
         * @member {Function|null} reshowVessel=null
         */
        reshowVessel: null
    }

    /**
     * @summary Validates required host effects before allocating the registered owner.
     * @param {Object} [config={}]
     */
    construct(config={}) {
        const effective = {...this.constructor.config, ...config};
        if (['disposeVessel', 'parkVessel', 'reshowVessel'].some(key => typeof effective[key] !== 'function')) {
            throw new Error('VesselPark: disposeVessel, parkVessel and reshowVessel are required function seams')
        }
        super.construct(config)
    }

    /**
     * @summary Invalidates pending gesture work without actuating Group-owned native windows.
     * @param {...*} args
     */
    destroy(...args) {
        this.clearState();
        super.destroy(...args)
    }

    /** @member {Number} generation=0 @protected */
    generation = 0
    /** @member {Object|null} parked=null @protected */
    parked = null
    /** @member {Object|null} parking=null @protected */
    parking = null
    /** @member {Object|null} pendingOut=null @protected */
    pendingOut = null
    /** @member {Object|null} pendingRetirement=null @protected */
    pendingRetirement = null
    /** @member {Object|null} pendingTerminal=null @protected */
    pendingTerminal = null
    /** @member {Object|null} reshowing=null @protected */
    reshowing = null

    /**
     * @summary Normalizes a synchronous host throw into strict refusal.
     * @param {Function} fn
     * @param {Object} data
     * @returns {*}
     */
    callEffect(fn, data) {
        try {
            return fn(data)
        } catch {
            return false
        }
    }

    /**
     * @summary Converts sync or async host results into strict Boolean admission.
     * @param {*} value
     * @returns {Boolean|Promise<Boolean>}
     */
    settleEffect(value) {
        return typeof value?.then === 'function'
            ? Promise.resolve(value).then(result => result === true, () => false)
            : value === true
    }

    /**
     * @summary Re-shows one admitted vessel without clearing ownership before strict success.
     * @param {Object} vessel
     * @param {Object|null} rect
     * @param {Boolean} [terminal=false]
     * @returns {Boolean|Promise<Boolean>}
     */
    restore(vessel, rect, terminal=false) {
        if (this.reshowing) return this.reshowing.promise;

        const result = this.settleEffect(this.callEffect(this.reshowVessel, {
            itemId    : vessel.itemId,
            rect      : rect ?? vessel.preConversionRect,
            terminal,
            windowName: vessel.windowName
        }));

        if (this.isDestroyed) return false;

        if (typeof result?.then !== 'function') {
            result && this.parked === vessel && (this.parked = null);
            return result
        }

        const state = {generation: vessel.generation, phase: 'reshowing', promise: null, vessel};

        this.reshowing = state;
        state.promise = result.then(admitted => {
            if (this.reshowing !== state || state.generation !== vessel.generation) return false;

            admitted && this.parked === vessel && (this.parked = null);
            this.reshowing = null;

            return admitted
        });

        return state.promise
    }

    /**
     * @summary Applies one admitted vessel's exact-once committed or restorative disposition.
     * @param {Object} vessel
     * @param {Object} data
     * @param {Boolean} [compensate=false] Restore even when async invalidation withheld admission
     * @returns {Boolean|Promise<Boolean>}
     */
    finishTerminal(vessel, data, compensate=false) {
        if (data.outcome === 'committed') {
            const disposed = this.settleEffect(this.callEffect(this.disposeVessel, {
                itemId: vessel.itemId, windowName: vessel.windowName
            }));

            if (this.isDestroyed) return false;

            if (typeof disposed?.then !== 'function') {
                disposed && this.parked === vessel && (this.parked = null);
                return disposed
            }

            return disposed.then(admitted => {
                admitted && this.parked === vessel && (this.parked = null);
                return admitted
            })
        }

        return this.parked === vessel || compensate
            ? this.restore(vessel, vessel.preConversionRect, true)
            : true
    }

    /**
     * @summary Parks the existing window when the conversion sensor admits a proxy transition.
     * The sensor converted the dragged vessel into a proxy: PARK the OS window — never close
     * it (the one-way activation door this module exists to remove). Records the vessel's
     * pre-conversion rect as the restore anchor. A convert-in while a slot is live is a stale
     * re-fire: ignored.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Object} [data.sourceRect] The vessel's live rect at the conversion moment —
     *     recorded as the restore/origin anchor
     * @param {String} data.windowName
     * @returns {Boolean|Promise<Boolean>}
     */
    onConversionIn(data) {
        if (this.isDestroyed) return false;
        if (this.parked || this.parking || this.reshowing || this.pendingRetirement || this.pendingTerminal) return false;

        let {itemId, sourceRect, windowName} = data,
            vessel                           = {itemId, preConversionRect: sourceRect ?? null, windowName},
            result                           = this.settleEffect(this.callEffect(this.parkVessel, {itemId, windowName}));

        if (this.isDestroyed) return false;

        Object.defineProperty(vessel, 'generation', {value: ++this.generation});

        if (typeof result?.then !== 'function') {
            result && (this.parked = vessel);
            return result
        }

        const state = {generation: vessel.generation, phase: 'parking', promise: null, vessel};

        this.parking = state;
        state.promise = result.then(admitted => {
            if (this.parking !== state || state.generation !== vessel.generation) return false;

            this.parking = null;
            admitted && (this.parked = vessel);

            return admitted
        });

        return state.promise
    }

    /**
     * @summary Re-shows the same parked window after conversion reverses.
     * The sensor reverted the conversion: RE-SHOW the same parked window. At the supplied live
     * rect when the out-event carries one (the popup resumes under the pointer); at the
     * recorded pre-conversion rect otherwise (origin semantics). No slot = stale event = no-op.
     * @param {Object} [data]
     * @param {Object} [data.rect] The live rect to resume at (the sensor's out-record
     *     `sourceRect` is the natural feed)
     * @returns {Boolean|Promise<Boolean>}
     */
    onConversionOut(data) {
        if (this.isDestroyed) return false;
        if (this.pendingRetirement) return this.pendingRetirement.promise;
        if (this.pendingTerminal) return false;
        if (this.pendingOut) return this.pendingOut.promise;
        if (this.reshowing) return this.reshowing.promise;

        if (this.parking) {
            const state = {generation: this.parking.generation, phase: 'queued-out', promise: null, vessel: this.parking.vessel};

            this.pendingOut = state;
            state.promise = this.parking.promise.then(admitted => {
                if (this.isDestroyed) return false;
                return admitted && !this.pendingRetirement ? this.restore(state.vessel, data?.rect) : !admitted
            }).then(restored => {
                this.pendingOut === state && (this.pendingOut = null);
                return restored
            });

            return state.promise
        }

        return this.parked ? this.restore(this.parked, data?.rect) : false
    }

    /**
     * @summary Disposes on committed transfer and restores on every other terminal outcome.
     * The gesture resolved while the vessel is parked — the outcome machine's terminal routed
     * here decides the parked window's fate:
     * - `committed`: the target owns the item now — the ONE `disposeVessel` call fires (the
     *   host's close policy takes it from there). Duplicate terminals coalesce while close is
     *   pending; strict refusal retains the slot, and strict success clears it.
     * - anything else (cancel, reject, host-routed disconnect): RESTORE — re-show at the
     *   pre-conversion rect with zero disposition. The machine fails toward never losing the
     *   user's window.
     * A terminal for a different `itemId` than the parked one is stale: no-op.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {String} data.outcome `'committed'` disposes; every other value restores
     * @returns {Boolean|Promise<Boolean>}
     */
    onGestureTerminal(data) {
        if (this.isDestroyed) return false;
        if (this.pendingRetirement) {
            return this.pendingRetirement.vessel.itemId === data.itemId
                ? this.pendingRetirement.promise
                : false
        }
        if (this.pendingTerminal) {
            return this.pendingTerminal.vessel.itemId === data.itemId
                ? this.pendingTerminal.promise
                : false
        }

        let vessel = this.parked ?? this.parking?.vessel ?? this.reshowing?.vessel;

        if (!vessel || vessel.itemId !== data.itemId) return false;

        if (this.parking || this.reshowing) {
            const prerequisite = this.parking?.promise ?? this.reshowing.promise,
                  state        = {generation: vessel.generation, phase: 'terminal', promise: null, vessel};

            this.pendingTerminal = state;
            state.promise = prerequisite.then(() => {
                if (
                    this.pendingTerminal !== state || this.pendingRetirement ||
                    state.generation !== vessel.generation
                ) return false;

                // False-after-reset does not prove the native park move never happened: Main
                // can observe the move, then invalidate pointer-follow before the worker sees
                // its terminal. Always run the compensating disposition for this generation.
                return this.finishTerminal(vessel, data, true)
            }).then(result => {
                this.pendingTerminal === state && (this.pendingTerminal = null);
                return result
            });

            return state.promise
        }

        const state = {generation: vessel.generation, phase: 'terminal', promise: null, vessel};

        this.pendingTerminal = state;

        const result = this.finishTerminal(vessel, data);

        if (this.isDestroyed) return false;

        if (typeof result?.then !== 'function') {
            this.pendingTerminal = null;
            return result
        }

        state.promise = Promise.resolve(result).then(admitted => {
            if (this.pendingTerminal !== state || state.generation !== vessel.generation) return false;

            this.pendingTerminal = null;
            return admitted
        }, () => {
            this.pendingTerminal === state && (this.pendingTerminal = null);
            return false
        });

        return state.promise
    }

    /**
     * @summary Forgets a vessel another owning lifecycle has already retired.
     *
     * A detached cancel is owned by the tear-out machine: it consumes and closes the same
     * empty source vessel. This clear-only seam invalidates every pending effect generation
     * so no late park/re-show completion can resurrect ownership after that external close.
     * @param {Object} data
     * @param {String} data.itemId
     * @param {Boolean|Promise<Boolean>} [data.retirement=true] Strict outer-lifecycle close
     * @returns {Boolean|Promise<Boolean>}
     */
    onVesselRetired({itemId, retirement=true} = {}) {
        if (this.isDestroyed) return false;
        if (this.pendingRetirement) {
            return this.pendingRetirement.vessel.itemId === itemId
                ? this.pendingRetirement.promise
                : false
        }

        const vessel = this.pendingTerminal?.vessel ?? this.pendingOut?.vessel ?? this.reshowing?.vessel
            ?? this.parking?.vessel ?? this.parked;

        if (!vessel || vessel.itemId !== itemId) return false;

        if (typeof retirement?.then === 'function') {
            const state = {
                generation: vessel.generation,
                phase     : 'retiring',
                promise   : null,
                vessel
            };

            this.pendingRetirement = state;
            state.promise = Promise.resolve(retirement).then(retired => {
                if (this.pendingRetirement !== state || state.generation !== vessel.generation) return false;

                this.pendingRetirement = null;

                return retired === true ? this.clearState() : false
            }, () => {
                this.pendingRetirement === state && (this.pendingRetirement = null);
                return false
            });

            return state.promise
        }

        return retirement === true ? this.clearState() : false
    }

    /**
     * @summary Invalidates all pending gesture generations without calling a platform effect.
     * @returns {Boolean}
     * @protected
     */
    clearState() {
        this.generation++;
        this.parked = this.parking = this.pendingOut = this.pendingRetirement = this.pendingTerminal = this.reshowing = null;
        return true
    }

    /**
     * @member {Object|null} parkedVessel
     */
    get parkedVessel() {
        return this.parked ?? null
    }

    /**
     * @member {Object|null} transition
     */
    get transition() {
        return this.pendingRetirement ?? this.pendingTerminal ?? this.pendingOut ?? this.reshowing ?? this.parking ?? null
    }
}

export default Neo.setupClass(VesselPark);
