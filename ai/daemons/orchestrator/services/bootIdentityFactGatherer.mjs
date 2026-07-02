import {SCHEDULER_RESUME_STATE} from './bootIdentityFreshness.mjs';

/**
 * Live fact-gatherer factory for the boot-identity health surface — the integration layer the
 * advisory service injects. Reads the last scheduler cycle from the REM run-state store (the same
 * source the consolidation liveness watchdog reads) and pairs it with the process boot time so the
 * pure discriminator can classify a stale-wake.
 *
 * Conservative first cut: `schedulerResumeState` defaults to `'none'` (no scheduler re-arm signal
 * surface exists yet, so a boot-after-last-cycle conservatively reads as restart-explains), and
 * `deferralReason` / `sourceRef` are read best-effort (null when unavailable). Each is behind an
 * optional injected resolver, so the domain-specific derivations refine in place without restructuring.
 *
 * @param {Object}   options
 * @param {Number}   options.bootAt                          Epoch-ms captured at process/service construction.
 * @param {Function} options.readRecentRemRunStates          Async `({dir, limit}) => Promise<Object[]>` reader.
 * @param {String}   options.remRunStateDir                  Directory holding the REM run-state JSONL artifacts.
 * @param {Function} [options.resolveSourceRef]              `() => (String|null)` advisory source ref (never gitHead-primary).
 * @param {Function} [options.resolveDeferralReason]         `async () => (String|null)` why the scheduler deferred.
 * @param {Function} [options.resolveSchedulerResumeState]   `() => String` refines the conservative `'none'` default.
 * @returns {Function} async `() => {bootAt, sourceRef, schedulerResumeState, lastCycleAt, lastCycleRef, deferralReason}`
 */
export function createBootIdentityFactGatherer({
    bootAt,
    readRecentRemRunStates,
    remRunStateDir,
    resolveSourceRef            = null,
    resolveDeferralReason       = null,
    resolveSchedulerResumeState = null
} = {}) {
    return async function gatherBootIdentityFacts() {
        let lastCycleAt  = null,
            lastCycleRef = null;

        // Read the most-recent REM cycle from the same store the liveness watchdog reads. Fail soft:
        // a read fault leaves the cycle facts null -> the discriminator returns `unknown`, never a
        // definitive stale.
        try {
            const entries = typeof readRecentRemRunStates === 'function'
                ? await readRecentRemRunStates({dir: remRunStateDir, limit: 1})
                : null;
            const latest = Array.isArray(entries) && entries.length > 0 ? entries[0] : null;

            if (latest) {
                lastCycleAt  = Number.isFinite(Number(latest.completedAt)) ? Number(latest.completedAt) : null;
                lastCycleRef = latest.runId ?? null;
            }
        } catch {
            // fail soft — cycle facts stay null
        }

        return {
            bootAt              : Number.isFinite(bootAt) ? bootAt : null,
            sourceRef           : resolveSourceRef            ? resolveSourceRef()            : null,
            schedulerResumeState: resolveSchedulerResumeState ? resolveSchedulerResumeState() : SCHEDULER_RESUME_STATE.none,
            lastCycleAt,
            lastCycleRef,
            deferralReason      : resolveDeferralReason       ? await resolveDeferralReason() : null
        };
    };
}
