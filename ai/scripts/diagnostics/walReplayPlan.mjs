/**
 * @module ai/scripts/diagnostics/walReplayPlan
 * @summary Plans a fork-then-replay of a pilot plane's WAL onto the native plane, and issues the
 * continuity receipt that proves no loss and no double-apply.
 *
 * ## The idempotence guard is not invented here — it already exists on disk
 *
 * Each WAL date is a **triad**, and the shape decides the design:
 *
 * - `wal-<date>.jsonl` — the payload, one entry per line, keyed by a stable `id`
 * - `wal-<date>.embedded.jsonl` — `{id, embeddedAt}`
 * - `wal-<date>.graph.jsonl` — `{id, projectedAt}`
 *
 * The sidecars are per-stage **receipts**: an id present in `.embedded` has been embedded, an id in
 * `.graph` has been projected. So the native plane already carries a durable record of what it has
 * applied, and replay needs no new watermark, no new sequence column, and no new dedup store — it
 * needs to *read the receipts that are already there*. Inventing a parallel idempotence scheme beside
 * a working one is how two sources of truth get created.
 *
 * ## The two invariants, and why each is stated as a count rather than a vibe
 *
 * **No loss** — every source payload entry must land in exactly one bucket: `toApply`,
 * `alreadyApplied`, or `duplicateInSource`. The planner asserts the buckets sum to the input, so an
 * entry cannot be quietly dropped. A replay that silently skips is indistinguishable from one that
 * succeeded, which is precisely the failure a receipt exists to prevent.
 *
 * **No double-apply** — an id already in the target's receipt set is excluded, which makes the plan
 * **idempotent by construction**: re-planning after a successful replay yields an empty `toApply`.
 * That is asserted as a property, not assumed from the filter.
 *
 * ## Refusals, and their direction
 *
 * A payload entry without an `id` is **unreplayable** and refuses the whole plan rather than being
 * skipped — a skipped entry is silent loss, and silent loss in a promotion path is the worst outcome
 * available. Likewise a target receipt set that *shrinks* across replay refuses: losing a previously
 * applied id is non-monotonic and means the target regressed, which no successful replay can cause.
 *
 * Pure and dependency-free: every input arrives as an argument, so the whole contract is testable
 * without a plane, a socket, or a clock.
 */

/**
 * @summary Parses JSONL text into records, refusing on the first malformed line.
 *
 * Refuses rather than skipping: a corpus with one unparseable line is a corpus of unknown size, and
 * silently continuing would under-count the replay set — the same direction of error as a scan that
 * misses a subdirectory.
 * @param {String} text JSONL content.
 * @param {String} label Source name, surfaced in the refusal.
 * @returns {Object} `{ok, records?, reason?}`
 */
export function parseJsonl(text, label = 'jsonl') {
    if (typeof text !== 'string') return {ok: false, reason: `${label}: expected string content`};

    const records = [],
          lines   = text.split('\n');

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();

        if (!line) continue;

        try {
            records.push(JSON.parse(line));
        } catch (error) {
            return {ok: false, reason: `${label}: line ${index + 1} is not valid JSON (${error.message})`};
        }
    }

    return {ok: true, records};
}

/**
 * @summary Collects the applied-id set from a stage's receipt records.
 * @param {Object[]} receiptRecords Parsed `.embedded` / `.graph` sidecar records.
 * @returns {Set<String>}
 */
export function receiptIdSet(receiptRecords) {
    return new Set((receiptRecords ?? []).map(record => record?.id).filter(id => typeof id === 'string'));
}

/**
 * @summary Plans the replay and returns the continuity receipt.
 *
 * Ordering is by `timestamp` then `id`: the WAL is append-only per segment, but a replay reads
 * *across* segments, so segment order alone does not establish a total order. `id` breaks ties
 * deterministically, which matters because two runs over the same corpus must produce the same plan —
 * a non-deterministic plan cannot be verified twice.
 * @param {Object}   spec
 * @param {Object[]} spec.payloadEntries Parsed `wal-<date>.jsonl` records from the SOURCE plane.
 * @param {Set}      spec.appliedIds     Ids the TARGET plane has already applied (from its receipts).
 * @returns {Object} `{ok, reason?, toApply, alreadyApplied, duplicateInSource, receipt}`
 */
export function planWalReplay({payloadEntries, appliedIds} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!Array.isArray(payloadEntries)) return refuse('payloadEntries must be an array');
    if (!(appliedIds instanceof Set))   return refuse('appliedIds must be a Set of already-applied ids');

    const missing = payloadEntries.findIndex(entry => typeof entry?.id !== 'string' || entry.id === '');

    if (missing !== -1) {
        return refuse(
            `payload entry at index ${missing} has no usable id, so it cannot be replayed or deduplicated. ` +
            'Refusing the whole plan rather than skipping it: a skipped entry is silent loss, and silent ' +
            'loss in a promotion path cannot be distinguished from success.'
        );
    }

    const toApply           = [],
          alreadyApplied    = [],
          duplicateInSource = [],
          seen              = new Set();

    for (const entry of payloadEntries) {
        if (seen.has(entry.id)) {
            // The same id across two segments is one logical write, not two — a rewritten or
            // re-flushed segment must not double-apply.
            duplicateInSource.push(entry.id);
        } else if (appliedIds.has(entry.id)) {
            alreadyApplied.push(entry.id);
            seen.add(entry.id);
        } else {
            toApply.push(entry);
            seen.add(entry.id);
        }
    }

    toApply.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.id.localeCompare(b.id));

    const accounted = toApply.length + alreadyApplied.length + duplicateInSource.length;

    // The no-loss invariant, asserted rather than trusted: the buckets MUST sum to the input.
    if (accounted !== payloadEntries.length) {
        return refuse(`accounting mismatch: ${accounted} entries bucketed from ${payloadEntries.length} inputs`);
    }

    return {
        ok     : true,
        toApply,
        alreadyApplied,
        duplicateInSource,
        receipt: {
            sourceEntries      : payloadEntries.length,
            toApplyCount       : toApply.length,
            alreadyAppliedCount: alreadyApplied.length,
            duplicateCount     : duplicateInSource.length,
            targetAppliedBefore: appliedIds.size
        }
    };
}

/**
 * @summary Verifies a completed replay against its plan: monotonic growth, exact delta, nothing lost.
 *
 * This is the half that makes AC3's claim falsifiable. A replay that reports success while the target
 * grew by the wrong amount, or lost an id it already had, has violated continuity — and a receipt that
 * cannot detect that is decoration.
 * @param {Object} spec
 * @param {Set}    spec.appliedBefore Target receipt ids before replay.
 * @param {Set}    spec.appliedAfter  Target receipt ids after replay.
 * @param {Object} spec.plan          The `ok` {@link planWalReplay} result that was executed.
 * @returns {Object} `{ok, reason?, applied, monotonic, receipt}`
 */
export function verifyReplayContinuity({appliedBefore, appliedAfter, plan} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!(appliedBefore instanceof Set)) return refuse('appliedBefore must be a Set');
    if (!(appliedAfter instanceof Set))  return refuse('appliedAfter must be a Set');
    if (!plan?.ok)                       return refuse(`plan is not a successful plan: ${plan?.reason ?? 'absent'}`);

    const lost = [...appliedBefore].filter(id => !appliedAfter.has(id));

    // Non-monotonic: the target lost something it had already applied. No successful replay can do
    // this, so it is a refusal and never a warning.
    if (lost.length > 0) {
        return refuse(
            `target lost ${lost.length} previously-applied id(s) (e.g. ${lost[0]}) — replay must be ` +
            'monotonic; a shrinking receipt set means the target regressed, not that replay succeeded.'
        );
    }

    const expectedIds = new Set(plan.toApply.map(entry => entry.id)),
          gained      = [...appliedAfter].filter(id => !appliedBefore.has(id)),
          unexpected  = gained.filter(id => !expectedIds.has(id)),
          notApplied  = [...expectedIds].filter(id => !appliedAfter.has(id));

    if (notApplied.length > 0) {
        return refuse(`${notApplied.length} planned id(s) never landed (e.g. ${notApplied[0]}) — loss, not success`);
    }

    if (unexpected.length > 0) {
        return refuse(`${unexpected.length} unplanned id(s) appeared (e.g. ${unexpected[0]}) — the target gained writes the plan did not authorise`);
    }

    return {
        ok       : true,
        applied  : gained.length,
        monotonic: true,
        receipt  : {
            appliedBefore: appliedBefore.size,
            appliedAfter : appliedAfter.size,
            delta        : appliedAfter.size - appliedBefore.size,
            planned      : plan.toApply.length
        }
    };
}
