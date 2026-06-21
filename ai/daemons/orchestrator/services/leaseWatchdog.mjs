/**
 * @module Neo.ai.daemons.orchestrator.services.leaseWatchdog
 * @summary Pure decision for the hung-heavy-lease watchdog. The exclusive-heavy-maintenance lease
 * releases on pid-death + TTL-expiry (`isLeaseStale` in `HeavyMaintenanceLeaseService`), but neither
 * catches a holder that is ALIVE + within-TTL yet HUNG (sustained ~0% cpu — e.g. blocked on a wedged
 * embedder). A hung holder otherwise monopolizes the lease until the full TTL, starving every other
 * maintenance task (the orchestrator DRAIN). The orchestrator lease-monitor loop samples the active
 * lease holder's cpu% over time and force-releases on a true verdict; THIS module is the pure verdict
 * only — the ps-sampling and the force-release are the integration (kept out of this slice).
 */

/**
 * @summary Decides whether the heavy-lease holder is HUNG — a sustained-idle process holding the lease
 * without progressing. Returns `true` iff the last `minConsecutiveIdle` cpu samples are ALL at or below
 * `idleThresholdPct`: a single idle sample between work bursts is normal, so only a sustained trailing
 * run counts as a hang. Total + never-throws (it runs inside the orchestrator loop, where a throw would
 * trap the daemon): a non-array, too-short, or malformed sample list returns `false` — fail-SAFE, the
 * watchdog never force-releases on bad/insufficient data. A non-finite sample is treated as non-idle
 * (same fail-safe: don't conclude "hung" from a missing reading). Exported + unit-tested.
 * @param {Object} [options]
 * @param {Number[]} [options.cpuPercentSamples=[]] Recent cpu% samples for the lease holder pid, oldest→newest.
 * @param {Number} [options.idleThresholdPct=1] A sample at or below this cpu% counts as idle.
 * @param {Number} [options.minConsecutiveIdle=3] Consecutive trailing idle samples required to call it hung.
 * @returns {Boolean}
 */
export function isHungLeaseHolder({
    cpuPercentSamples  = [],
    idleThresholdPct   = 1,
    minConsecutiveIdle = 3
} = {}) {
    if (!Array.isArray(cpuPercentSamples))                              return false;
    if (!Number.isFinite(minConsecutiveIdle) || minConsecutiveIdle < 1) return false;
    if (cpuPercentSamples.length < minConsecutiveIdle)                 return false;

    return cpuPercentSamples
        .slice(-minConsecutiveIdle)
        .every(sample => Number.isFinite(sample) && sample <= idleThresholdPct);
}
