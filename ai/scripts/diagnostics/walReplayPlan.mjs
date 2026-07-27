import crypto from 'node:crypto';

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
 * So the native plane already records what it has applied, and replay needs no new watermark, no
 * sequence column, and no dedup store. Building a parallel idempotence scheme beside a working one is
 * how two sources of truth get created.
 *
 * ## Receipts are STAGE-TYPED, and collapsing them loses work silently
 *
 * `.embedded` and `.graph` are **different stages of the same row**, which the WAL store keeps
 * distinct. An earlier version of this planner collapsed them into one untyped applied-id set — and
 * that made a row which had been embedded but **not** graph-projected look fully applied, so replay
 * skipped it and the graph projection was **lost with no error**. Losing half a row is worse than
 * losing a whole one, because the row still appears present.
 *
 * A row therefore counts as applied only when **every required stage** carries its receipt; otherwise
 * it is replayed for exactly the stages still pending, and those stages are named in the plan.
 *
 * ## The verifier is BOUND to the plan it verifies
 *
 * A plan is computed against a specific target pre-state. Verifying it against a *different* pre-state
 * is meaningless, and it used to pass: a plan built against `{seed}` verified clean against an empty
 * target. So the plan carries a digest of the pre-state it was computed from, and the verifier refuses
 * a mismatch. A size comparison would not do — two different sets of the same size would agree.
 *
 * ## The two invariants, stated as arithmetic rather than intent
 *
 * **No loss** — every source entry lands in exactly one bucket, and the planner asserts the buckets
 * sum to the input. A duplicate id **refuses** rather than being collapsed: two entries sharing an id
 * with different payloads would apply one and discard the other while the arithmetic still balanced.
 *
 * **No double-apply** — a stage already receipted is never re-applied, which makes the plan idempotent
 * by construction: re-planning after a successful replay yields an empty `toApply`.
 *
 * ## What the verifier may NOT assume
 *
 * It does not assume exclusive ownership of the target. A one-seat pilot runs beside a shared
 * native-primary plane where other seats keep writing, so unrelated receipts appearing during replay
 * are expected and are reported rather than judged. Continuity is scoped to the planned work: every
 * planned stage must land, nothing previously applied may vanish. Establishing writer quiescence is a
 * lease question for the promotion runbook, not something a verifier may presume.
 *
 * Pure and dependency-free apart from `node:crypto` for the binding digest.
 */

/**
 * The receipt stages a fully-applied row must carry, in pipeline order.
 * @type {String[]}
 */
export const WAL_RECEIPT_STAGES = Object.freeze(['embedded', 'graph']);

/**
 * @summary Parses JSONL text into records, refusing on the first malformed line.
 *
 * Refuses rather than skipping: a corpus with one unparseable line is a corpus of unknown size, and
 * continuing would under-count the replay set.
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
 * @summary Collects one stage's receipted ids.
 * @param {Object[]} receiptRecords Parsed `.embedded` or `.graph` sidecar records.
 * @returns {Set<String>}
 */
export function receiptIdSet(receiptRecords) {
    return new Set((receiptRecords ?? []).map(record => record?.id).filter(id => typeof id === 'string'));
}

/**
 * @summary Order-independent digest of a target's per-stage receipt state.
 *
 * This is what binds a plan to the pre-state it was computed from. Sorted before hashing so two reads
 * of the same target agree regardless of enumeration order.
 * @param {Object} appliedStages `{<stage>: Set<String>}`
 * @param {String[]} [stages] Stage names to include, in a fixed order.
 * @returns {String} sha256 hex.
 */
export function digestAppliedStages(appliedStages, stages = WAL_RECEIPT_STAGES) {
    const hash = crypto.createHash('sha256');

    for (const stage of stages) {
        hash.update(`${stage}\n`);

        for (const id of [...(appliedStages?.[stage] ?? [])].sort()) {
            hash.update(`${id}\n`);
        }
    }

    return hash.digest('hex');
}

/**
 * @summary Plans the replay per stage and returns the continuity receipt.
 *
 * Ordering is `timestamp` then `id`: replay reads ACROSS segments, so per-segment append order is not
 * a total order, and two runs over one corpus must produce the same plan or the plan cannot be
 * verified twice.
 * @param {Object}   spec
 * @param {Object[]} spec.payloadEntries   Parsed `wal-<date>.jsonl` records from the SOURCE plane.
 * @param {Object}   spec.appliedStages    `{<stage>: Set<String>}` — the TARGET's receipts, per stage.
 * @param {String[]} [spec.requiredStages] Stages a row must carry to count as applied.
 * @returns {Object} `{ok, reason?, toApply, alreadyApplied, receipt}`
 */
export function planWalReplay({payloadEntries, appliedStages, requiredStages = WAL_RECEIPT_STAGES} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!Array.isArray(payloadEntries)) return refuse('payloadEntries must be an array');

    if (!Array.isArray(requiredStages) || requiredStages.length === 0) {
        return refuse('requiredStages must be a non-empty array of stage names');
    }

    // A bare `Set` is the OLD API's shape and the most likely caller mistake, so it gets the explicit
    // collapse rejection rather than falling through to a per-stage type error that explains nothing.
    if (!appliedStages || typeof appliedStages !== 'object' || appliedStages instanceof Set || appliedStages instanceof Map) {
        return refuse(
            'appliedStages must be an object of {stage: Set} — a single untyped id set is rejected because ' +
            'collapsing `embedded` and `graph` makes a half-applied row look complete, and replay then ' +
            'skips the pending stage with no error.'
        );
    }

    for (const stage of requiredStages) {
        if (!(appliedStages[stage] instanceof Set)) {
            return refuse(`appliedStages.${stage} must be a Set of receipted ids for that stage`);
        }
    }

    const missing = payloadEntries.findIndex(entry => typeof entry?.id !== 'string' || entry.id === '');

    if (missing !== -1) {
        return refuse(
            `payload entry at index ${missing} has no usable id, so it cannot be replayed or deduplicated. ` +
            'Refusing the whole plan rather than skipping it: a skipped entry is silent loss, and silent ' +
            'loss in a promotion path cannot be distinguished from success.'
        );
    }

    // Fail closed on every source duplicate. Bucketing a repeat as a benign re-flush let the arithmetic
    // lie: two entries sharing an id with different payloads applied one and discarded the other while
    // the buckets still balanced. "The counts add up" is not "nothing was lost". The live corpus
    // measured 8168 rows against 8168 unique ids, so a repeat is a WAL-integrity event, not a detail.
    const firstSeen = new Map();

    for (let index = 0; index < payloadEntries.length; index++) {
        const {id} = payloadEntries[index];

        if (firstSeen.has(id)) {
            return refuse(
                `duplicate source id "${id}" at indices ${firstSeen.get(id)} and ${index}. Refusing rather ` +
                'than deduplicating: if the two entries differ, collapsing them discards a payload while the ' +
                'bucket arithmetic still balances — loss that reports as success.'
            );
        }

        firstSeen.set(id, index);
    }

    const toApply        = [],
          alreadyApplied = [];

    for (const entry of payloadEntries) {
        // Per STAGE, not per row: a row embedded but not graph-projected is replayed for `graph` only.
        const pendingStages = requiredStages.filter(stage => !appliedStages[stage].has(entry.id));

        if (pendingStages.length === 0) {
            alreadyApplied.push(entry.id);
        } else {
            toApply.push({...entry, pendingStages});
        }
    }

    toApply.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0) || a.id.localeCompare(b.id));

    const accounted = toApply.length + alreadyApplied.length;

    if (accounted !== payloadEntries.length) {
        return refuse(`accounting mismatch: ${accounted} entries bucketed from ${payloadEntries.length} inputs`);
    }

    return {
        ok     : true,
        toApply,
        alreadyApplied,
        receipt: {
            sourceEntries      : payloadEntries.length,
            toApplyCount       : toApply.length,
            alreadyAppliedCount: alreadyApplied.length,
            requiredStages     : [...requiredStages],
            // The binding. Verifying a plan against a pre-state it was not computed from is meaningless,
            // and used to pass silently.
            targetStateDigest: digestAppliedStages(appliedStages, requiredStages),
            pendingByStage   : Object.fromEntries(requiredStages.map(stage =>
                [stage, toApply.filter(entry => entry.pendingStages.includes(stage)).length]
            ))
        }
    };
}

/**
 * @summary Verifies a completed replay against the plan it executed: bound pre-state, every planned
 * stage landed, nothing previously applied lost.
 *
 * This is the half that makes the continuity claim falsifiable. A replay reporting success while a
 * planned stage never landed, or while the target lost a prior receipt, has violated continuity.
 * @param {Object} spec
 * @param {Object} spec.appliedStagesBefore `{<stage>: Set}` before replay — must match the plan's digest.
 * @param {Object} spec.appliedStagesAfter  `{<stage>: Set}` after replay.
 * @param {Object} spec.plan                The `ok` {@link planWalReplay} result that was executed.
 * @returns {Object} `{ok, reason?, appliedByStage, unrelatedGainsByStage, monotonic, receipt}`
 */
export function verifyReplayContinuity({appliedStagesBefore, appliedStagesAfter, plan} = {}) {
    const refuse = reason => ({ok: false, reason});

    if (!plan?.ok) return refuse(`plan is not a successful plan: ${plan?.reason ?? 'absent'}`);

    const stages = plan.receipt.requiredStages;

    for (const [label, value] of [['appliedStagesBefore', appliedStagesBefore], ['appliedStagesAfter', appliedStagesAfter]]) {
        if (!value || typeof value !== 'object') return refuse(`${label} must be an object of {stage: Set}`);

        for (const stage of stages) {
            if (!(value[stage] instanceof Set)) return refuse(`${label}.${stage} must be a Set`);
        }
    }

    // THE BINDING. Without this, a plan computed against one target verified clean against another.
    const beforeDigest = digestAppliedStages(appliedStagesBefore, stages);

    if (beforeDigest !== plan.receipt.targetStateDigest) {
        return refuse(
            'appliedStagesBefore does not match the pre-state this plan was computed from ' +
            `(expected digest ${plan.receipt.targetStateDigest.slice(0, 12)}…, got ${beforeDigest.slice(0, 12)}…). ` +
            "Verifying a plan against a different target is meaningless — the plan's already-applied " +
            'decisions were made about a state that is not the one being checked.'
        );
    }

    const appliedByStage        = {},
          unrelatedGainsByStage = {};

    for (const stage of stages) {
        const before = appliedStagesBefore[stage],
              after  = appliedStagesAfter[stage],
              lost   = [...before].filter(id => !after.has(id));

        // Non-monotonic: the target lost a receipt it already had. No successful replay does this.
        if (lost.length > 0) {
            return refuse(
                `stage "${stage}" lost ${lost.length} previously-applied id(s) (e.g. ${lost[0]}) — replay must ` +
                'be monotonic; a shrinking receipt set means the target regressed, not that replay succeeded.'
            );
        }

        const planned   = plan.toApply.filter(entry => entry.pendingStages.includes(stage)).map(entry => entry.id),
              notLanded = planned.filter(id => !after.has(id)),
              gained    = [...after].filter(id => !before.has(id));

        if (notLanded.length > 0) {
            return refuse(
                `stage "${stage}": ${notLanded.length} planned id(s) never landed (e.g. ${notLanded[0]}) — ` +
                'loss, not success.'
            );
        }

        appliedByStage[stage] = planned.length;
        // Unrelated gains are ALLOWED and reported. Refusing them would assert exclusive ownership of a
        // shared native plane where other seats legitimately keep writing during the replay window.
        unrelatedGainsByStage[stage] = gained.filter(id => !planned.includes(id));
    }

    return {
        ok       : true,
        monotonic: true,
        appliedByStage,
        unrelatedGainsByStage,
        receipt  : {
            requiredStages: [...stages],
            plannedTotal  : plan.toApply.length,
            appliedByStage,
            unrelatedTotal: Object.values(unrelatedGainsByStage).reduce((sum, ids) => sum + ids.length, 0)
        }
    };
}
