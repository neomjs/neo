/**
 * @module Neo.ai.daemons.orchestrator.services.leaseMonitor
 * @summary The hung-lease watchdog INTEGRATION — wires the pure `isHungLeaseHolder` decision into a
 * periodic lease-monitor that ps-samples the active heavy-lease holder's cpu and force-releases +
 * records a `failed` outcome when the holder is HUNG (alive + within-TTL but sustained-idle), which
 * the pid-death / TTL stale-check (HeavyMaintenanceLeaseService) cannot catch. The 2026-06-21 incident:
 * a heavy task hung ~59min at 0% cpu holding the lease idle, starving all periodic maintenance until
 * the Golden Path froze.
 *
 * INTERVAL-COUPLING (critical, per the watchdog review's forward-flag): `minConsecutiveIdle` × the
 * sample interval MUST be minutes-scale. A tight window (e.g. 3 × the daemon's 250ms tick = 750ms)
 * would force-release a holder legitimately I/O-blocked for <1s, ironically re-creating the DRAIN. The
 * monitor therefore samples on its OWN slow cadence — the caller drives `tick()` at the sample
 * interval (minutes), NOT the fast daemon tick.
 *
 * The recorded outcome uses the EXISTING `recordTaskOutcome` `'failed'` state — a hung holder ran then
 * stalled (a FAILURE, distinct from `skipped`=never-ran, `deferred`=postponed, task-state `markSkipped`).
 * The observability convergence may add a hung-specific typed-outcome later; this uses the live primitive
 * now without overloading `skipped` into a green-looking no-op.
 */

import {isHungLeaseHolder} from './leaseWatchdog.mjs';

/**
 * @summary Creates a lease-monitor with injected seams (`inspectLease` / `sampleCpuPercent` /
 * `releaseLease` / `recordOutcome`) plus a closure-held per-pid cpu-sample history. Each `tick()`
 * samples the active holder's cpu and force-releases a sustained-idle hung holder. All I/O is
 * seam-injected, so the monitor is fully unit-testable; the orchestrator wires the real seams and
 * drives `tick()` at the (slow) sample interval. The history resets whenever there is no active holder.
 * @param {Object} [options]
 * @param {Function} options.inspectLease `async () → {active: Boolean, lease: {pid: Number, owner: String}} | falsy` — the live lease.
 * @param {Function} options.sampleCpuPercent `async (pid) → Number` — the holder's instantaneous cpu%.
 * @param {Function} options.releaseLease `async (lease) → void` — force-release the held lease.
 * @param {Function} options.recordOutcome `(owner, state, details) → void` — the HealthService outcome record.
 * @param {Number} [options.idleThresholdPct=1] At-or-below this cpu% counts as idle (forwarded to `isHungLeaseHolder`).
 * @param {Number} [options.minConsecutiveIdle=4] Trailing idle samples required to call it hung (× the interval = minutes).
 * @param {Number} [options.maxHistory=12] Cap on retained per-pid cpu samples.
 * @returns {{tick: Function}}
 */
export function createLeaseMonitor({
    inspectLease,
    sampleCpuPercent,
    releaseLease,
    recordOutcome,
    idleThresholdPct   = 1,
    minConsecutiveIdle = 4,
    maxHistory         = 12
} = {}) {
    const history = new Map();

    return {
        /**
         * @summary One monitor pass. Returns a terminal action tag for observability + tests. Never throws:
         * a failed lease-read, cpu-sample, OR release/record seam is fail-SAFE — a bad/non-finite sample
         * RESETS the idle window (never bridges a gap into a false consecutive-idle run) and a release/record
         * exception returns `release-failed` without breaking the orchestrator loop. Never force-releases on bad data.
         * @returns {Promise<Object>} A terminal action tag — `{action}` plus `pid`/`owner` when a holder was seen.
         */
        async tick() {
            let current;
            try {
                current = await inspectLease();
            } catch {
                return {action: 'inspect-failed'};
            }

            const lease = current && current.active ? current.lease : null;
            if (!lease || typeof lease.pid !== 'number') {
                history.clear();
                return {action: 'no-active-lease'};
            }

            const {pid, owner} = lease;

            // A bad or non-finite cpu sample RESETS the per-pid idle window (history.delete) — it must NOT
            // be silently dropped while the prior window survives, which would bridge a gap into a false
            // 'consecutive-idle' run (the 0,0,0,NaN,0 false-positive). Fail-SAFE: never release on bad data.
            let cpu;
            try {
                cpu = await sampleCpuPercent(pid);
            } catch {
                history.delete(pid);
                return {action: 'sample-failed', pid};
            }
            if (!Number.isFinite(cpu)) {
                history.delete(pid);
                return {action: 'sample-failed', pid};
            }

            const samples = [...(history.get(pid) || []), cpu].slice(-maxHistory);
            history.set(pid, samples);

            if (isHungLeaseHolder({cpuPercentSamples: samples, idleThresholdPct, minConsecutiveIdle})) {
                // The no-throw contract: a release/record seam exception must NOT break the orchestrator
                // loop. On failure keep the history (a still-hung holder is retried next tick) + report it.
                try {
                    await releaseLease(lease);
                    // A hung holder RAN (it held the lease) but stalled — that is a FAILURE, not a skip
                    // (skipped = never ran). Honoring the typed-outcome vocabulary separation: a force-released
                    // hung holder records 'failed', so it is not collapsed into a green-looking skipped no-op.
                    recordOutcome(owner, 'failed', {
                        reason      : 'watchdog-released-hung-holder',
                        failurePhase: 'hung-lease-holder',
                        pid,
                        idleSamples : samples.length,
                        releasedAt  : new Date().toISOString()
                    });
                } catch {
                    return {action: 'release-failed', pid, owner};
                }
                history.delete(pid);
                return {action: 'released-hung', pid, owner};
            }

            return {action: 'monitoring', pid, owner};
        }
    };
}
