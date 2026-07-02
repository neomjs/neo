/**
 * Pure boot-identity freshness discriminator for the boot-identity health surface.
 *
 * Standalone + Neo-free so it stays hermetically unit-testable (no `Neo.setupClass`, no socket,
 * no live scheduler/boot surface). `BootIdentityHealthService` delegates to `classifyBootFreshness`;
 * the raw-fact gathering is that service's injected integration layer.
 */

/**
 * Boot-identity health fact classifications. Advisory-only — never a definitive `stale` verdict and
 * never a restart command; the restart cure belongs to a separate control-plane actuator.
 * @type {Object}
 */
export const BOOT_FRESHNESS_CLASS = Object.freeze({
    designedDeferral: 'designed-deferral',    // gap is a designed-cadence deferral -> close/recalibrate the alarm
    restartExplains : 'restart-explains-gap', // gap explained by a stale/restart-lost scheduler -> a restart cures it
    unknown         : 'unknown'               // insufficient/absent facts -> advisory, never a definitive stale
});

/**
 * Scheduler resume states carried by the boot-identity fact.
 * @type {Object}
 */
export const SCHEDULER_RESUME_STATE = Object.freeze({
    reArmed: 're-armed', // scheduler re-armed its timers after boot/restart
    fresh  : 'fresh',    // fresh boot, timers armed from scratch
    none   : 'none'      // no scheduler resume observed
});

/**
 * @summary Classifies a long-lived process's boot-identity fact against its last scheduler cycle,
 * collapsing the "stale-wake" question to a single deterministic, advisory fact-compare.
 *
 * Pure — no I/O, no ambient clock, no restart authority. Gathering the input facts (bootAt, sourceRef,
 * schedulerResumeState, lastCycleAt) is the injected integration layer; this is the discriminator.
 * Worked example: a scheduler gap larger than the cadence classifies as `designed-deferral` when a
 * deferral reason is present (e.g. deferred behind heavy maintenance), but as `restart-explains-gap`
 * when the same gap follows a fresh boot with an un-re-armed scheduler.
 *
 * @param {Object}      facts
 * @param {Number|null} facts.bootAt                Epoch-ms the process booted.
 * @param {Number|null} facts.lastCycleAt           Epoch-ms of the last completed scheduler cycle.
 * @param {String|null} facts.schedulerResumeState  One of {@link SCHEDULER_RESUME_STATE}.
 * @param {String|null} [facts.deferralReason=null] Present when the scheduler deliberately deferred.
 * @param {Number}      facts.now                   Epoch-ms now (injected; no ambient clock).
 * @param {Object}      config
 * @param {Number}      config.designedCadenceMs    The scheduler's designed cadence, ms.
 * @param {Number}      [config.marginMs=0]         Tolerance added to the cadence before a gap is suspicious.
 * @returns {{classification:String, advisory:Boolean, reason:String}}
 */
export function classifyBootFreshness(facts, config) {
    const
        {bootAt                      = null, lastCycleAt = null, schedulerResumeState = null, deferralReason = null, now} = facts  || {},
        {designedCadenceMs, marginMs = 0}                                                            = config || {};

    // Insufficient facts to compare -> `unknown`. Absent facts NEVER assert a definitive stale.
    if (!Number.isFinite(now) || !Number.isFinite(lastCycleAt) || !Number.isFinite(designedCadenceMs)) {
        return {classification: BOOT_FRESHNESS_CLASS.unknown, advisory: true, reason: 'insufficient-facts'};
    }

    // Designed-deferral: within cadence+margin, or the scheduler deliberately deferred (e.g. behind
    // heavy maintenance). Close the alarm + recalibrate its threshold to cadence+margin.
    if (deferralReason || now - lastCycleAt < designedCadenceMs + marginMs) {
        return {
            classification: BOOT_FRESHNESS_CLASS.designedDeferral,
            advisory      : true,
            reason        : deferralReason ? 'deferral-reason-present' : 'within-cadence-margin'
        };
    }

    // Restart-explains-gap: the process booted AFTER the last cycle AND the scheduler did not re-arm
    // its timers -> a stale / restart-lost scheduler. The cure is a separate restart actuator, never
    // triggered here (this is a read-only advisory producer).
    if (Number.isFinite(bootAt) && bootAt > lastCycleAt && schedulerResumeState !== SCHEDULER_RESUME_STATE.reArmed) {
        return {
            classification: BOOT_FRESHNESS_CLASS.restartExplains,
            advisory      : true,
            reason        : 'boot-after-last-cycle-and-not-re-armed'
        };
    }

    // Gap exceeds cadence+margin but the boot-identity does not explain it -> `unknown` (advisory).
    return {classification: BOOT_FRESHNESS_CLASS.unknown, advisory: true, reason: 'gap-unexplained-by-boot-identity'};
}
