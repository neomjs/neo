/**
 * @module ai/scripts/maintenance/detectionRetentionSlaInputs
 * @summary Pure input-resolution half for the backup-reliability detect-vs-retention SLA: adapts the
 * live config shapes into the two durations `evaluateDetectionRetentionSla` consumes.
 *
 * `detectionRetentionSla.mjs` owns the SLA *math* and takes `{detectCadenceMs, backupRetentionMs}`.
 * Neither duration exists in that form in config: the detect cadence is an interval leaf, and the
 * retention window lives inside an object leaf as a **day count**. This module owns that adaptation
 * so the math stays free of config shape and the entrypoint stays free of validation logic.
 *
 * **Why this is a separate module and not part of the verdict-half:** config-shape adaptation and SLA
 * arithmetic decay for different reasons — a retention leaf can be restructured without the invariant
 * changing, and vice versa. Keeping them apart also keeps this half Neo-free, so its unit tests never
 * import `AiConfig` — config reads belong to the thread-entrypoint that runs the guard, not to the
 * pure half a test imports directly.
 *
 * ## Every unresolvable input is a BREACH, never a pass
 *
 * This is the module's load-bearing decision. `cleanOldBackups` defaults a missing `maxDays` to `30`
 * — correct there, because *pruning* must keep working when config is partial. Reproducing that
 * default here would be actively harmful: the guard would invent the very window it exists to verify
 * and report a pass it cannot justify. A guard that fabricates its input is worse than an absent
 * guard, because an absent guard leaves the question open while a fabricating one closes it green.
 *
 * A **disabled** detect lane gets its own branch for a different reason. `dataIntegritySweep.mjs`
 * treats a cadence of `<= 0` as "lane disabled", and the verdict-half already refuses a non-positive
 * cadence — it *throws* (see `detectionRetentionSla.spec.mjs`, which pins `0` among the rejected
 * inputs), so passing it through cannot produce a false pass. The problem is the failure *mode*: a
 * deliberately disabled lane is a legitimate operational state, and surfacing it as a thrown
 * type-error reads as a bug in the guard rather than as the policy breach it is. Resolving it to an
 * explicit breach reason turns a stack trace into an actionable sentence, and keeps the throw path
 * meaning what it should — a shape the guard never expected.
 * @plane in-plane
 */

/**
 * Milliseconds per day — the unit the retention leaf's `maxDays` is expressed in.
 * @type {Number}
 */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * @summary Answers whether a value is a usable positive duration/count.
 *
 * Rejects `NaN`, `Infinity`, non-numbers, and non-positive values in one predicate, so callers never
 * branch on `typeof` and a numeric-looking string can never reach the arithmetic.
 * @param {*} value Candidate value.
 * @returns {Boolean}
 */
function isPositiveFinite(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * @summary Resolves the live config shapes into the two durations the SLA verdict-half consumes.
 *
 * Takes the values a caller has already read from the config SSOT (the caller reads at its own use
 * site; this module never imports `AiConfig`) and returns either both durations or a single breach
 * reason naming which input failed and why.
 *
 * Resolution order is deliberate: the detect cadence is checked first because a disabled detect lane
 * is a breach regardless of how generous retention is.
 * @param {Object} options
 * @param {Number} options.dataIntegritySweepCheckMs Live detect-sweep cadence in ms
 *     (`AiConfig.orchestrator.intervals.dataIntegritySweepCheckMs`). `<= 0` means the lane is
 *     disabled, which resolves to a breach rather than to a zero cadence.
 * @param {Object} options.retention Live backup retention policy
 *     (`AiConfig.maintenance.backup.retention`), whose `maxDays` expresses the window in days.
 * @returns {{ok: Boolean, detectCadenceMs: Number|undefined, backupRetentionMs: Number|undefined, reason: String|undefined}}
 *     `ok: true` carries both durations; `ok: false` carries a `reason` suitable for a failing
 *     guard's output. Never partially resolved.
 */
export function resolveDetectionRetentionInputs({dataIntegritySweepCheckMs, retention} = {}) {
    if (typeof dataIntegritySweepCheckMs !== 'number' || !Number.isFinite(dataIntegritySweepCheckMs)) {
        return {
            ok    : false,
            reason: `detect cadence is unresolvable (${JSON.stringify(dataIntegritySweepCheckMs)}); ` +
                    'worst-case detect latency is unknown, so the SLA cannot be certified'
        };
    }

    if (dataIntegritySweepCheckMs <= 0) {
        return {
            ok    : false,
            reason: `the data-integrity detect lane is DISABLED (cadence ${dataIntegritySweepCheckMs} <= 0); ` +
                    'worst-case detect latency is unbounded, so no retention window can satisfy the SLA'
        };
    }

    if (!retention || typeof retention !== 'object') {
        return {
            ok    : false,
            reason: `backup retention policy is unresolvable (${JSON.stringify(retention)}); ` +
                    'the recoverability window is unknown, so the SLA cannot be certified'
        };
    }

    if (!isPositiveFinite(retention.maxDays)) {
        return {
            ok    : false,
            reason: `backup retention \`maxDays\` is unresolvable (${JSON.stringify(retention.maxDays)}); ` +
                    'refusing to assume a default window — a guard that invents its own input ' +
                    'reports a pass it cannot justify'
        };
    }

    return {
        ok               : true,
        detectCadenceMs  : dataIntegritySweepCheckMs,
        backupRetentionMs: retention.maxDays * MS_PER_DAY
    };
}

/**
 * @summary Explains why `keepMinimum` is deliberately excluded from the resolved window.
 *
 * Exported as documentation-in-code rather than prose-only because the omission looks like an
 * oversight at a glance and a future reader is likely to "fix" it.
 *
 * `retention.keepMinimum` floors pruning at the N newest bundles regardless of age, so it can only
 * ever **extend** real recoverability, never shorten it. Excluding it therefore makes the resolved
 * window a **lower bound**, which biases the verdict toward declaring a breach — the correct
 * direction for a safety guard to be wrong in. Including it (e.g. `max(maxDays, ageOfNthNewest)`)
 * would be more precise and strictly less safe, and it would make the guard's verdict depend on
 * whether backup runs are currently healthy: a stalled backup schedule is exactly when `keepMinimum`
 * preserves an old bundle past `maxDays`, so a guard counting on it would be trusting the failure
 * mode to save it.
 * @type {String}
 */
export const KEEP_MINIMUM_EXCLUSION_RATIONALE =
    '`keepMinimum` can only extend recoverability, so excluding it makes the window a lower bound ' +
    '(bias toward breach) rather than an over-estimate (bias toward a false pass).';

export {MS_PER_DAY};
