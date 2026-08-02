/**
 * @module ai/services/shared/captureOutcome
 * @summary The single definition of what a backup export's row count MEANS — one vocabulary, shared by
 * the two peer DatabaseServices that produce it and the backup orchestrator that reads it.
 *
 * A count of `0` answers "how many rows did I write". It does not answer "was there a corpus here",
 * and the backup receipt has only ever recorded the first. Live evidence for the gap: 4 of 36 bundles
 * in one store carry `expected: 0, exported: 0` with the message `"Export complete."`, spread across
 * four separate dates — byte-identical to a legitimately empty deployment.
 *
 * The producing seam is a resolver, not a counter. Both vector stores create a missing collection on
 * read (`knowledge-base/ChromaManager#resolveKnowledgeBaseCollection` catches not-found and creates;
 * `memory-core/managers/ChromaManager` uses `getOrCreateCollection` by construction), and the native
 * graph export returns `0` for an uninitialized database. So the store the backup measures can be one
 * the backup's own read brought into existence — and every layer above then reports that zero honestly.
 *
 * Centralized rather than duplicated per service, unlike the deliberately-mirrored `#exportCollection`
 * helpers: those are private implementation, this is the wire contract persisted into
 * `bundle-meta.json` and branched on by `verifyBundleIntegrity`. A vocabulary spelled in three places
 * drifts, and a receipt whose producer and reader disagree is worse than one that says nothing.
 *
 * @see https://github.com/neomjs/neo/issues/16348
 */

/**
 * The source was reached and returned rows.
 * @type {String}
 */
export const CAPTURE_OUTCOME_CAPTURED = 'captured';

/**
 * The source was reached, positively pre-existed, and genuinely held nothing.
 * @type {String}
 */
export const CAPTURE_OUTCOME_EMPTY = 'empty';

/**
 * Zero rows WITHOUT a positively-established pre-existing source: the collection was absent before the
 * read that measured it, the backing store was not initialized, or pre-existence could not be
 * established at all.
 * @type {String}
 */
export const CAPTURE_OUTCOME_UNAVAILABLE = 'unavailable';

/**
 * Severity order, worst first. `worstCaptureOutcome` folds a bundle's per-collection verdicts through
 * this, so a subsystem is only as trustworthy as its least-trustworthy part.
 * @type {String[]}
 */
const OUTCOME_SEVERITY = [CAPTURE_OUTCOME_UNAVAILABLE, CAPTURE_OUTCOME_EMPTY, CAPTURE_OUTCOME_CAPTURED];

/**
 * @summary Classifies one export's row count against whether its source was positively established to
 * pre-exist the read.
 *
 * **An allowlist of positively-established states, never a denylist of known-bad ones.** Only a
 * `sourceExisted === true` earns `empty`; every other input — `false`, `null` from a probe that could
 * not answer, `undefined` from a caller that never asked — lands on `unavailable`. Unanticipated cases
 * therefore fail toward "I cannot vouch for this" by construction rather than by someone remembering
 * to enumerate the next failure mode. Over-condemning a genuinely-empty store is the safe direction:
 * it costs a loud receipt, where the inverse costs a false recovery source.
 *
 * **`rowCount > 0` short-circuits to `captured` and deliberately ignores `sourceExisted`.** Rows are
 * self-evidencing — a collection created by this very read holds nothing — so a probe that failed or
 * was never run can never downgrade a genuine capture. That asymmetry is what makes the probe safe to
 * treat as best-effort at its call sites.
 *
 * @param {Object}         options
 * @param {Boolean|null}  [options.sourceExisted] `true` only when pre-existence was positively
 *                        established by a non-mutating probe; `false` when positively absent; `null`
 *                        when the probe itself could not answer.
 * @param {Number}         options.rowCount       Rows the export actually wrote.
 * @returns {String} One of `captured` / `empty` / `unavailable`.
 */
export function classifyCaptureOutcome({sourceExisted = null, rowCount} = {}) {
    if (Number.isFinite(rowCount) && rowCount > 0) {
        return CAPTURE_OUTCOME_CAPTURED
    }

    return sourceExisted === true ? CAPTURE_OUTCOME_EMPTY : CAPTURE_OUTCOME_UNAVAILABLE
}

/**
 * @summary Folds several per-collection verdicts into the one a subsystem reports.
 *
 * A subsystem that captured its memories but whose summaries collection was absent is NOT a healthy
 * capture, so the fold takes the worst member rather than the majority or the first. The May-2026
 * recovery specimen is exactly this shape — a bundle with memories and no summaries file at all —
 * which is why the verdict is per collection and the subsystem's is derived, not measured separately.
 *
 * An empty list yields `unavailable`: nothing was measured, so nothing was established.
 *
 * @param {String[]} outcomes
 * @returns {String} One of `captured` / `empty` / `unavailable`.
 */
export function worstCaptureOutcome(outcomes = []) {
    const present = OUTCOME_SEVERITY.filter(outcome => outcomes.includes(outcome));

    return present[0] ?? CAPTURE_OUTCOME_UNAVAILABLE
}

/**
 * @summary Runs the pre-existence enumeration once, best-effort, and records why if it could not.
 *
 * **Best-effort by design, and the design only holds because of the classifier's asymmetry.** A probe
 * failure can never downgrade a real capture — `rowCount > 0` short-circuits to `captured` — so the only
 * reachable consequence is that a genuinely-empty source reports `unavailable`. That is the safe
 * direction, and it is far cheaper than the alternative: propagating would let a `listCollections`
 * hiccup abort a priority-zero backup lane that would otherwise have written a perfectly good bundle.
 *
 * The failure is recorded, never swallowed. It warns, and the returned `probeError` is meant to travel
 * into the receipt — a carve-out that quiets a guard without leaving a trace is how a silent channel
 * gets opened.
 *
 * One enumeration serves every collection a caller checks, so all their verdicts describe the same
 * instant rather than a drifting sequence of instants.
 *
 * @param {Object}    options
 * @param {Function}  options.listNames A zero-arg async returning existing source names.
 * @param {Object}   [options.logger]   Warn sink; `console`-shaped.
 * @param {String}   [options.label]    Subsystem name for the warning.
 * @returns {Promise<{existing: Set<String>|null, probeError: String|null}>} `existing` is `null` exactly
 *          when the probe could not answer.
 */
export async function probeExistingSources({listNames, logger, label = 'source'} = {}) {
    try {
        return {existing: new Set(await listNames()), probeError: null}
    } catch (error) {
        const probeError = error?.message ?? String(error);

        logger?.warn?.(
            `[CaptureOutcome] Could not establish pre-existence for ${label}: ${probeError}. Zero-row ` +
            `exports will be reported as 'unavailable' rather than 'empty', because an unestablished ` +
            `source is not a source known to be empty.`
        );

        return {existing: null, probeError}
    }
}

/**
 * @summary Reads one name out of a probe result, preserving "could not answer" as `null`.
 *
 * Deliberately NOT `probe?.existing?.has(name) ?? false`: collapsing an unanswerable probe to `false`
 * would be indistinguishable from a positively-absent source, and the whole point of the tri-state is
 * that "I did not establish this" is its own fact.
 *
 * @param {{existing: Set<String>|null}} probe
 * @param {String}                       name
 * @returns {Boolean|null}
 */
export function sourceExistedIn(probe, name) {
    return probe?.existing ? probe.existing.has(name) : null
}
