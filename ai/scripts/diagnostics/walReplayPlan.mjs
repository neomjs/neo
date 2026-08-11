/**
 * @plane in-plane
 */
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
 * ## A continuity receipt binds THREE authorities, not two
 *
 * **1. Target pre-state.** A plan is computed against a specific pre-state, and verifying it against a
 * *different* one is meaningless — it used to pass: a plan built against `{seed}` verified clean against
 * an empty target. So the plan carries a digest of the pre-state it was computed from and the verifier
 * refuses a mismatch. A size comparison would not do — two different sets of the same size would agree.
 *
 * **2. The planned work.** This was the missing one, and its absence made the central claim vacuously
 * true. The verifier read `plan.toApply` — a *mutable projection* — so a queue-consuming executor that
 * drained its own work list turned "no replay happened" into a clean continuity receipt with
 * `plannedTotal: 0`. The planned ids are now captured in the frozen receipt at plan time, the verifier
 * reads them from there, and it reconciles the projection against them before trusting either. Freezing
 * alone would not be enough: a hand-built or partially-copied plan object never passes through the freeze,
 * and this verifier's whole purpose is to be un-foolable by the executor it audits.
 *
 * **3. The resulting post-state.** Every planned stage landed, and nothing previously applied was lost.
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
 * @summary Collects one stage's receipted ids, refusing any row whose id is unusable.
 *
 * ## Why a malformed row refuses instead of being skipped
 *
 * This set is consumed as *prior-application state*: an id present means "already applied, do not replay".
 * A syntactically valid sidecar row carrying no usable id is therefore **unknown** prior state, not absent
 * prior state — and silently dropping it converts "I do not know whether this was applied" into "it was
 * not applied", which schedules a re-apply. That is precisely the double-apply the no-double-apply claim
 * rules out, arriving through the one path that reports success.
 *
 * Fails closed for the same reason `planWalReplay` refuses a payload entry with no id: on an integrity
 * boundary, an unreadable input is an integrity event, not a detail to filter out.
 * @param {Object[]} receiptRecords Parsed `.embedded` or `.graph` sidecar records.
 * @returns {Object} `{ok, reason?, ids?}` — `ids` is a `Set<String>` when `ok`.
 */
export function receiptIdSet(receiptRecords) {
    if (!Array.isArray(receiptRecords)) {
        return {ok: false, reason: `receiptRecords must be an array, received ${JSON.stringify(receiptRecords)}`};
    }

    const ids = new Set();

    for (let index = 0; index < receiptRecords.length; index++) {
        const record = receiptRecords[index],
              id     = record?.id;

        if (typeof id !== 'string' || id === '') {
            return {
                ok    : false,
                reason: `receipt row at index ${index} has no usable id (${JSON.stringify(record)}). A row ` +
                        'without an id is UNKNOWN prior-application state, not absent state — skipping it ' +
                        'would schedule a re-apply of work that may already have landed.'
            };
        }

        if (ids.has(id)) {
            return {
                ok    : false,
                reason: `receipt row at index ${index} repeats id "${id}". A duplicated receipt means the ` +
                        'sidecar itself is inconsistent, so prior-application state cannot be trusted.'
            };
        }

        ids.add(id);
    }

    return {ok: true, ids};
}

/**
 * @summary Order-independent digest of a target's per-stage receipt state, over an injective encoding.
 *
 * This is what binds a plan to the pre-state it was computed from. Sorted before hashing so two reads of
 * the same target agree regardless of enumeration order.
 *
 * ## Two separate ambiguities had to be closed, and the second is the instructive one
 *
 * **1. Values.** The original wrote `${value}\n`, which is not injective because a newline is legal inside
 * an id: `{embedded: ["a\nb"]}` and `{embedded: ["a", "b"]}` produced the *same* digest. Values are now
 * **length-prefixed by byte count**, so no value can be mistaken for a concatenation of shorter ones
 * whatever bytes it contains. That beats escaping or forbidding delimiters, because it needs no cooperation
 * from the id grammar and stays injective if the grammar later widens.
 *
 * **2. The partition.** Length-prefixing every element made the *element* encoding injective while leaving
 * the mapping from **stage-partitioned state → flattened element sequence** ambiguous. An id equal to the
 * next stage's name migrated across the boundary invisibly:
 *
 * ```
 * {embedded: ["graph"], graph: []}   →  "embedded" "graph" | "graph"
 * {embedded: [], graph: ["graph"]}   →  "embedded" | "graph" "graph"
 * ```
 *
 * Identical byte streams, so a plan computed against one verified clean against the other. Each stage now
 * writes **its name followed by its id count** before the ids, which makes every stage a fixed-arity header
 * plus exactly that many elements — a canonical serialization of the whole structure rather than of its
 * leaves.
 *
 * The lesson worth keeping: an injective encoding of the parts is not an injective encoding of the shape.
 * Both levels need framing, and fixing the one that was reported is not the same as closing the class.
 * @param {Object} appliedStages `{<stage>: Set<String>}`
 * @param {String[]} [stages] Stage names to include, in a fixed order.
 * @returns {String} sha256 hex.
 */
export function digestAppliedStages(appliedStages, stages = WAL_RECEIPT_STAGES) {
    const hash = crypto.createHash('sha256'),
          // Byte length, not string length: two different strings can share a `.length` under
          // surrogate pairs, which would reintroduce the ambiguity this prefix exists to remove.
          write = value => {
              const bytes = Buffer.from(String(value), 'utf8');

              hash.update(`${bytes.length}:`);
              hash.update(bytes);
          };

    for (const stage of stages) {
        const ids = [...(appliedStages?.[stage] ?? [])].sort();

        write(stage);
        // THE PARTITION BOUNDARY. Without this count an id may impersonate the next stage's name.
        write(ids.length);

        for (const id of ids) {
            write(id);
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

    // The authoritative per-stage work list, captured at plan time and frozen. `verifyReplayContinuity`
    // reads THIS rather than `plan.toApply`, because a work list a queue-consuming executor can drain is
    // not evidence of what was planned: truncating it to zero used to make "no replay happened" verify as
    // a clean continuity receipt. A receipt must bind three authorities — target pre-state, planned work,
    // and resulting post-state — and this is the second of them.
    const plannedIdsByStage = Object.freeze(Object.fromEntries(requiredStages.map(stage =>
        [stage, Object.freeze(toApply.filter(entry => entry.pendingStages.includes(stage)).map(entry => entry.id))]
    )));

    return Object.freeze({
        ok: true,
        // Frozen so a truncation attempt THROWS in strict mode rather than silently succeeding. The
        // verifier still reconciles independently, since a hand-built plan object never passed through here.
        toApply       : Object.freeze(toApply.map(entry => Object.freeze({...entry, pendingStages: Object.freeze(entry.pendingStages)}))),
        alreadyApplied: Object.freeze(alreadyApplied),
        receipt       : Object.freeze({
            sourceEntries      : payloadEntries.length,
            toApplyCount       : toApply.length,
            alreadyAppliedCount: alreadyApplied.length,
            requiredStages     : Object.freeze([...requiredStages]),
            // The binding. Verifying a plan against a pre-state it was not computed from is meaningless,
            // and used to pass silently.
            targetStateDigest: digestAppliedStages(appliedStages, requiredStages),
            plannedIdsByStage,
            pendingByStage   : Object.freeze(Object.fromEntries(requiredStages.map(stage =>
                [stage, plannedIdsByStage[stage].length]
            )))
        })
    });
}

/**
 * @summary Checks a plan's mutable `toApply` projection against the immutable receipt it was built with.
 *
 * Returns a refusal reason, or `null` when they agree. Split out so the reconciliation is one named idea
 * rather than inline noise in the verifier, and so its absence would be conspicuous.
 * @param {Object} plan
 * @param {String[]} stages
 * @returns {String|null}
 */
function reconcilePlannedWork(plan, stages) {
    const {receipt} = plan,
          planned   = receipt.plannedIdsByStage;

    if (!planned || typeof planned !== 'object') {
        return 'plan.receipt.plannedIdsByStage is missing, so the planned work cannot be authenticated. ' +
               'A continuity receipt must bind the planned work, not just the target state.';
    }

    if (!Array.isArray(plan.toApply)) return 'plan.toApply must be an array';

    if (plan.toApply.length !== receipt.toApplyCount) {
        return `plan.toApply holds ${plan.toApply.length} entr(ies) but its receipt recorded ` +
               `${receipt.toApplyCount}. The work list was mutated after planning, so it is not evidence ` +
               'of what was planned — a drained list would otherwise verify "no replay happened" as a ' +
               'clean continuity receipt.';
    }

    for (const stage of stages) {
        const fromReceipt    = planned[stage],
              fromProjection = plan.toApply.filter(entry => entry?.pendingStages?.includes(stage)).map(entry => entry.id);

        if (!Array.isArray(fromReceipt)) {
            return `plan.receipt.plannedIdsByStage.${stage} must be an array of planned ids`;
        }

        if (fromReceipt.length !== fromProjection.length ||
            fromReceipt.some((id, index) => id !== fromProjection[index])) {
            return `plan.toApply disagrees with plan.receipt.plannedIdsByStage.${stage} ` +
                   `(receipt ${fromReceipt.length} id(s), projection ${fromProjection.length}). The plan ` +
                   'was altered after it was receipted.';
        }
    }

    return null;
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

    const stages = plan.receipt?.requiredStages;

    if (!Array.isArray(stages) || stages.length === 0) {
        return refuse('plan.receipt.requiredStages is missing, so there is no planned work to verify against');
    }

    // RECONCILE THE WORK LIST AGAINST ITS RECEIPT before trusting either. The plan returned by
    // `planWalReplay` is frozen, but a hand-built or partially-copied plan object never passed through that
    // freeze — and this verifier's whole purpose is to be un-foolable by the executor it audits. Checking
    // the projection against the receipt costs nothing and closes the gap for both shapes.
    const reconciliation = reconcilePlannedWork(plan, stages);

    if (reconciliation) return refuse(reconciliation);

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

        // Read from the RECEIPT, not from `plan.toApply`. Reconciled above, so the two agree — but taking
        // it from the receipt makes the authority explicit at the point of use instead of implied.
        const planned   = plan.receipt.plannedIdsByStage[stage],
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
            plannedTotal  : plan.receipt.toApplyCount,
            appliedByStage,
            unrelatedTotal: Object.values(unrelatedGainsByStage).reduce((sum, ids) => sum + ids.length, 0)
        }
    };
}
