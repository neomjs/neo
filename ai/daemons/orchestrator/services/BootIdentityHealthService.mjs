import Base                                            from '../../../../src/core/Base.mjs';
import {classifyBootFreshness, SCHEDULER_RESUME_STATE} from './bootIdentityFreshness.mjs';

/**
 * @summary Read-only advisory boot-identity health surface for long-lived Agent-OS processes.
 *
 * Produces the boot-identity fact `{bootAt, sourceRef, schedulerResumeState, lastCycleRef, lastCycleAt}`
 * and delegates to the pure `classifyBootFreshness` discriminator ({@link ./bootIdentityFreshness.mjs}),
 * so a stale-wake alarm is answered by a fact-compare instead of a forensic probe.
 *
 * **Read-only + advisory only:** this producer never emits a definitive `stale` verdict and never carries
 * a restart command. Restart authority lives in a separate control-plane actuator, not here. It is
 * orthogonal to config/schema-digest freshness tracking (`RuntimeFreshnessService`) and to wake/heartbeat
 * emission control — this surface answers "which source is this long-lived process actually running".
 *
 * The raw-fact gathering (process boot time, source ref, scheduler resume state, last scheduler cycle) is
 * an injected collaborator, so the discriminator stays testable without the live scheduler/boot surfaces.
 *
 * @class Neo.ai.daemons.services.BootIdentityHealthService
 * @extends Neo.core.Base
 */
export class BootIdentityHealthService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.BootIdentityHealthService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.BootIdentityHealthService',
        /**
         * Injected async collaborator returning the raw boot-identity facts for this process:
         * `async () => {bootAt, sourceRef, schedulerResumeState, lastCycleAt, lastCycleRef, deferralReason}`.
         * Injected (not read here) so the discriminator is testable without the live boot/scheduler surfaces.
         * @member {Function|null} factGatherer_=null
         * @protected
         * @reactive
         */
        factGatherer_: null,
        /**
         * Freshness thresholds `{designedCadenceMs, marginMs}`, read at the use site (never re-derived).
         * @member {Object|null} freshnessConfig_=null
         * @protected
         * @reactive
         */
        freshnessConfig_: null,
        /**
         * Injected epoch-ms clock; keeps the classify path free of an ambient `Date.now`.
         * @member {Function|null} nowFn_=null
         * @protected
         * @reactive
         */
        nowFn_: null
    }

    /**
     * Gathers the current boot-identity fact and classifies its freshness. Read-only + advisory:
     * returns `{fact, classification, advisory:true, reason}`, never a restart command. An absent
     * gatherer or absent facts yield an `unknown` advisory, never a definitive `stale` verdict.
     * @returns {Promise<Object>}
     */
    async produceBootIdentityFact() {
        const gather = this.factGatherer;

        if (!gather) {
            return {fact: null, classification: 'unknown', advisory: true, reason: 'no-fact-gatherer'};
        }

        const
            raw = await gather() || {},
            now = (this.nowFn || Date.now)(),
            cfg = this.freshnessConfig || {};

        return {
            fact: {
                bootAt              : Number.isFinite(raw.bootAt) ? raw.bootAt : null,
                sourceRef           : raw.sourceRef ?? null,
                schedulerResumeState: raw.schedulerResumeState ?? SCHEDULER_RESUME_STATE.none,
                lastCycleRef        : raw.lastCycleRef ?? null,
                lastCycleAt         : Number.isFinite(raw.lastCycleAt) ? raw.lastCycleAt : null
            },
            ...classifyBootFreshness({...raw, now}, cfg)
        };
    }
}

export default Neo.setupClass(BootIdentityHealthService);
