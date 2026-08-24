import {appendHealEvent}                                                            from './healEventLedgerStore.mjs';
import {getFreezeRecord, readFreezeRecords, removeFreezeRecord, upsertFreezeRecord} from './freezeRecordStore.mjs';
import {runFreezeReprobeCycle}                                                      from './freezeReprobeDecision.mjs';

/**
 * @module ai/services/memory-core/helpers/freezeReprobeRunner
 * @summary Orchestrator-agnostic wiring for the autonomous freeze → re-probe → auto-unfreeze lifecycle: the
 * `freeze` heal-operation factory (fence + persist a freeze-record) and the periodic re-probe runner (read the
 * records → `runFreezeReprobeCycle` with `freezeRecordStore`-backed ops). Extracted from the orchestrator so the
 * wiring is unit-testable against injected fence/unfence/probe collaborators — mirrors how the re-embed heal op
 * lives in `createReEmbedMissingHealOperation` rather than inline in the daemon. I/O is delegated to the
 * already-tested `freezeRecordStore` CRUD + `runFreezeReprobeCycle` decider; this module is the seam that wires them.
 */

/**
 * Default contained-recovery cooldown. A collection capped at the thrash limit (`contained`) is re-opened for a
 * fresh round of auto-unfreeze attempts after this long — so a *transient* fault that happened to flap past the cap
 * is never permanently stranded (the #1 weeks-bar risk the freeze cycle exists to kill), while thrash stays bounded to one
 * recovery round per cooldown. This is the time-based realisation of the "reopen path" the decider anticipates.
 * Overridable via `runFreezeReprobe`'s `containedCooldownMs` (e.g. an AiConfig leaf) per deployment.
 * @type {Number}
 */
export const DEFAULT_CONTAINED_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h

/**
 * Default flap window — the anti-thrash MEMORY HORIZON across a successful auto-unfreeze. A cleared fault does NOT
 * delete the freeze-record; it leaves a RELEASED tombstone (`unfrozenAt` set, fence already lifted) carrying the
 * climbing `unfreezeAttempts`. A re-freeze WITHIN this window is a FLAP and inherits that count, so a collection that
 * repeatedly freeze → healthy-unfreeze → re-freezes reaches the `contained` cap instead of resetting to zero each
 * cycle and thrashing forever (the bounded-anti-thrash AC). A re-freeze AFTER the window is a fresh fault (the count
 * resets), and a tombstone left untouched this long is garbage-collected. Aligned with
 * `DEFAULT_CONTAINED_COOLDOWN_MS` so the "same fault episode?" horizon is one value across the contained-recovery and
 * flap paths. Overridable via `runFreezeReprobe` / `createFreezeHealOperation`'s `flapWindowMs` per deployment.
 * @type {Number}
 */
export const DEFAULT_FLAP_WINDOW_MS = DEFAULT_CONTAINED_COOLDOWN_MS; // 6h

/**
 * The escalation a SERVING FENCE publishes on its `freeze` ledger row — deliberately not one of
 * `FUTILITY_ESCALATIONS`. A fenced collection is waiting on the autonomous re-probe, which will either
 * lift the fence or escalate it to `contained`; there is nothing for a human to do at this transition. The
 * futility escalations mean the opposite (a remedy that does not work, or a class with no remedy at all), so
 * borrowing one here would ask a reader to go fix a remedy that was never invoked.
 * @type {String}
 */
export const FREEZE_ESCALATION_SERVING_FENCED = 'serving-fenced-pending-reprobe';

/**
 * @summary Builds the SYMMETRIC store-level fence/unfence pair. A store-level fault (e.g. `mc-server`) fences
 * every served collection in the store (memory + session) via `expand` (`storeFenceTargets`); the matching
 * unfence MUST lift exactly that expanded set. Co-locating both in one factory makes them symmetric by
 * construction — they cannot diverge into the bug where a freeze fences N collections but the auto-unfreeze lifts
 * only the record key, reporting `unfrozen` while the served collections stay fenced. The quarantine primitives +
 * served set are injected, so the pair is unit-testable without a live Chroma store.
 * @param {Object} options
 * @param {Function} options.quarantine `async (collection, opts) => any` — fence one collection from serving.
 * @param {Function} options.unquarantine `async (collection, opts) => any` — lift one collection's fence.
 * @param {Function} options.expand `(collection, servedCollections) => String[]` — the store→served expansion.
 * @param {ReadonlyArray<String>} options.servedCollections The served collections a store-level freeze fences.
 * @param {Object} [options.quarantineOptions={}] Options forwarded to quarantine/unquarantine (`{dir}`, etc.).
 * @returns {{fence: Function, unfence: Function, expandTargets: Function}} A symmetric-by-construction pair.
 */
export function createStoreFenceOperations({quarantine, unquarantine, expand, servedCollections, quarantineOptions = {}}) {
    if (typeof quarantine !== 'function' || typeof unquarantine !== 'function' || typeof expand !== 'function') {
        throw new TypeError('createStoreFenceOperations: quarantine, unquarantine, and expand functions are required');
    }

    const expandTargets = collection => expand(collection, servedCollections);

    return {
        expandTargets,
        // The `freeze` heal-op's fence: expand to the served set + quarantine each; return the fenced targets.
        fence: async ({collection, reason, now}) => {
            const targets = expandTargets(collection);
            for (const target of targets) await quarantine(target, {...quarantineOptions, reason, now});
            return targets;
        },
        // The re-probe's unfence: expand to the SAME served set + unquarantine each (symmetric to fence).
        unfence: async collection => {
            const targets = expandTargets(collection);
            for (const target of targets) await unquarantine(target, quarantineOptions);
            return targets;
        }
    };
}

/**
 * @summary The `freeze` heal-operation: fence the collection from serving (the safe terminal for a systemic /
 * dimension-systemic fault) AND persist a durable freeze-record so the re-probe cycle can later auto-unfreeze it
 * without an operator. Lossless — no data mutated. The fence is injected so the op is testable without the live
 * quarantine store (production passes a fence that quarantines the served collections).
 *
 * **Flap re-activation (anti-thrash).** A successful unfreeze leaves a RELEASED tombstone rather than deleting the
 * record (see `runFreezeReprobe`). When this freeze lands on such a tombstone WITHIN the flap window it is a flap:
 * re-activate the record (null-clear the released / back-off / contained markers) but INHERIT the climbing
 * `unfreezeAttempts`, so a repeatedly-flapping fault reaches the `contained` cap instead of resetting to zero each
 * cycle and thrashing forever. A fresh fault — no record, or a tombstone past the window — starts a clean budget.
 * @param {Object} options
 * @param {String} options.freezeRecordsDir Durable freeze-record state directory.
 * @param {Function} options.fence `async ({collection, reason, now}) => fencedTargets` — lifts the collection out of serving.
 * @param {String|null} [options.healLedgerDir=null] Durable heal-event ledger directory. Supplying it is what makes
 * the freeze OBSERVABLE — see the asymmetry note below. Omitted ⇒ the fence and the record still happen and no
 * ledger row is written (the unit seams that inject no ledger).
 * @param {{maxEvents: Number, triggerBytes: Number}|null} [options.healLedgerRetention=null] Explicit retention pair
 * from the AiConfig leaves, forwarded to the append so the observability sink stays self-bounding.
 * @param {Number} [options.flapWindowMs=DEFAULT_FLAP_WINDOW_MS] How recently a release must precede this freeze to count as a flap (inherit the count) vs a fresh fault (reset).
 * @returns {Function} The `async ({collection, evidence, now}) => {status, detail}` heal-operation.
 */
export function createFreezeHealOperation({freezeRecordsDir, fence, healLedgerDir = null, healLedgerRetention = null, flapWindowMs = DEFAULT_FLAP_WINDOW_MS}) {
    if (typeof fence !== 'function') {
        throw new TypeError('createFreezeHealOperation: a fence function is required');
    }

    return async ({collection, evidence, now} = {}) => {
        const faultFingerprint = evidence?.reasonCode ?? evidence?.mode ?? collection,
              fenced           = await fence({collection, reason: faultFingerprint, now}),
              existing         = await getFreezeRecord({dir: freezeRecordsDir, collectionName: collection}),
              // A released tombstone from a RECENT unfreeze = a flap → inherit its climbing unfreezeAttempts so the
              // freeze → unfreeze → re-freeze loop reaches the `contained` cap. No record, or a tombstone whose flap
              // window has elapsed (the fault is considered recovered), is a fresh fault → reset the count.
              flap             = Boolean(existing) && Number.isFinite(existing.unfrozenAt) && (now - existing.unfrozenAt) < flapWindowMs;

        await upsertFreezeRecord({
            dir           : freezeRecordsDir,
            collectionName: collection,
            faultFingerprint,
            frozenAt      : now,
            // Re-activate: null-clear the released / back-off / contained markers (a field delete, NOT a record
            // delete), then inherit unfreezeAttempts on a flap (undefined = preserve) or reset it on a fresh fault.
            unfrozenAt      : null,
            lastProbeAt     : null,
            containedAt     : null,
            unfreezeAttempts: flap ? undefined : null
        });

        // LEDGER THE TRANSITION. This op previously fenced the collection, persisted the record, returned
        // `frozen` — and wrote nothing to the heal ledger, while its partner `runFreezeReprobe` DID ledger the
        // matching `unfreeze`. Both readers of the frozen set (`summarizeHealLedger.currentlyFrozen` and
        // `foldFutilityFreezeState`) ADD on `freeze` and REMOVE on `unfreeze`, so the set could only ever be
        // empty: the add was never written and the remove was. That is strictly worse than no surface at all,
        // because an empty `currentlyFrozen` reads as healthy — it is why the 2026-08-13 incident reported
        // `currentlyFrozen: []` through 4,692 heal events while real fences were up, and why
        // `fleetTasksSource` could never raise a frozen-target task.
        //
        // `at: now` is load-bearing, not decoration: `foldFutilityFreezeState` requires a FINITE `at` on a
        // freeze row and silently drops the row without one, so a freeze stamped from a missing clock would
        // reproduce the same invisible-freeze bug one layer down.
        //
        // A failing append THROWS rather than being swallowed, matching the `unfreeze` partner. Both the fence
        // and `upsertFreezeRecord` are idempotent, so the caller's retry is safe — and a silently missing
        // freeze row is the exact defect this block repairs, so failing loudly is the correct bias here.
        if (typeof healLedgerDir === 'string' && healLedgerDir.length > 0) {
            await appendHealEvent({
                type  : 'freeze',
                collection,
                status: 'frozen',
                at    : now,
                // `escalation` and `verdict` are the two fields `foldFutilityFreezeState` surfaces to an
                // operator. A serving fence needs no human yet — the autonomous re-probe lifts it or escalates
                // to `contained` — so it says so, rather than borrowing a futility escalation that would ask
                // someone to go fix a remedy nothing invoked.
                detail    : {escalation: FREEZE_ESCALATION_SERVING_FENCED, verdict: faultFingerprint, fenced, reactivated: flap}
            }, {dir: healLedgerDir, now, ...(healLedgerRetention ?? {})});
        }

        return {status: 'frozen', detail: {collection, fenced, faultFingerprint, reactivated: flap}};
    };
}

/**
 * @summary Runs one freeze re-probe tick: read the durable freeze-records and, for each ACTIVELY-frozen collection,
 * auto-unfreeze a cleared fault / stay frozen on a persisting one / contain past the thrash cap — all under
 * `decideFreezeReprobe`'s back-off, never an operator. A no-op (one cheap read, no probe) when nothing is frozen,
 * so it is cheap to call every poll. The probe + unfence are injected; persist/release are `freezeRecordStore`-backed.
 *
 * **Anti-thrash release (not delete).** A successful unfreeze lifts the fence, ledgers an `unfreeze` event, and
 * RELEASES the record to a tombstone (`unfrozenAt` set) — NOT a delete — so the just-climbed `unfreezeAttempts`
 * survives. A re-freeze within the flap window inherits that count (see `createFreezeHealOperation`), so a flapping
 * fault reaches `contained` instead of thrashing forever; a tombstone left untouched past the flap window is
 * garbage-collected. Released tombstones are excluded from the active set, so they are never re-probed.
 * @param {Object} options
 * @param {String} options.freezeRecordsDir Durable freeze-record state directory.
 * @param {String} options.healLedgerDir Durable heal-event ledger directory (for the `unfreeze` event).
 * @param {{maxEvents: Number, triggerBytes: Number}} [options.healLedgerRetention] Explicit retention pair supplied
 * by the AiConfig-aware orchestrator boundary and passed through to every shared heal-ledger append.
 * @param {Number} options.now Injected clock (epoch ms).
 * @param {Function} options.probe `async (collectionName) => {embedderHealthy, dimensionConsistent}`.
 * @param {Function} options.unfence `async (collectionName) => void` — lifts the serving fence (production: unquarantine).
 * @param {Number} [options.containedCooldownMs=DEFAULT_CONTAINED_COOLDOWN_MS] How long a `contained` collection waits before it is re-opened for a fresh round of auto-unfreeze attempts — the bounded contained-recovery path (never a permanent strand).
 * @param {Number} [options.flapWindowMs=DEFAULT_FLAP_WINDOW_MS] Released-tombstone retention / flap horizon: a tombstone older than this is garbage-collected, and a re-freeze past it starts a fresh recovery budget.
 * @returns {Promise<Object[]>} Per-collection re-probe outcomes, or `[]` when nothing is actively frozen.
 */
export async function runFreezeReprobe({freezeRecordsDir, healLedgerDir, healLedgerRetention = null, now, probe, unfence, containedCooldownMs = DEFAULT_CONTAINED_COOLDOWN_MS, flapWindowMs = DEFAULT_FLAP_WINDOW_MS}) {
    const freezeRecords           = await readFreezeRecords({dir: freezeRecordsDir});
    const healLedgerAppendOptions = () => ({dir: healLedgerDir, now, ...(healLedgerRetention ?? {})});

    if (Object.keys(freezeRecords).length === 0) {
        return []; // nothing frozen or tombstoned → no probe, no unfreeze, no further I/O
    }

    // Garbage-collect released tombstones whose flap window has elapsed. A successful unfreeze leaves a tombstone
    // (carrying the climbing unfreezeAttempts) so a re-freeze within the window inherits the count; once the window
    // passes with no re-freeze the collection is considered recovered, so the tombstone is pruned — bounding tombstone
    // accumulation to the flap horizon and letting a later fault start with a clean recovery budget.
    for (const [collectionName, record] of Object.entries(freezeRecords)) {
        if (Number.isFinite(record?.unfrozenAt) && (now - record.unfrozenAt) >= flapWindowMs) {
            await removeFreezeRecord({dir: freezeRecordsDir, collectionName});
            delete freezeRecords[collectionName];
        }
    }

    // Contained-recovery (the reopen path the decider anticipates): a collection capped at the thrash limit is NOT
    // permanently stranded. Once its containment is older than the cooldown, reset the attempt count + restart the
    // cooldown clock so it re-enters the normal probe flow THIS cycle — a transient fault that has since cleared then
    // auto-unfreezes; a still-flapping one simply re-caps. At most one recovery round per cooldown, so thrash stays
    // bounded. Without this, a transient fault that flapped past the cap would freeze forever (the #1 weeks-bar risk).
    for (const [collectionName, record] of Object.entries(freezeRecords)) {
        if (Number.isFinite(record?.containedAt) && (now - record.containedAt) >= containedCooldownMs) {
            freezeRecords[collectionName] = await upsertFreezeRecord({dir: freezeRecordsDir, collectionName, unfreezeAttempts: 0, containedAt: now});
            await appendHealEvent({type: 'contained-reopen', collection: collectionName, status: 'reopened'}, healLedgerAppendOptions());
        }
    }

    // The ACTIVE frozen set excludes released tombstones (`unfrozenAt` set): their fence is already lifted, so they
    // are not frozen and must never be re-probed — they linger only as the anti-thrash memory a re-freeze inherits.
    const activeRecords = Object.fromEntries(
        Object.entries(freezeRecords).filter(([, record]) => !Number.isFinite(record?.unfrozenAt))
    );

    if (Object.keys(activeRecords).length === 0) {
        return []; // only released tombstones remain → nothing actively frozen to re-probe this tick
    }

    const outcomes = await runFreezeReprobeCycle({
        freezeRecords    : activeRecords,
        now,
        probe,
        unfreezeAndReheal: async collectionName => {
            // Lift the serving fence + ledger the unfreeze; the next poll's diagnosis re-heals any residue.
            await unfence(collectionName);
            await appendHealEvent({type: 'unfreeze', collection: collectionName, status: 'unfrozen'}, healLedgerAppendOptions());
        },
        persistProbe: async ({collectionName, lastProbeAt, unfreezeAttempts}) => upsertFreezeRecord({dir: freezeRecordsDir, collectionName, lastProbeAt, unfreezeAttempts}),
        // RELEASE (not delete) on a successful unfreeze: mark a tombstone (`unfrozenAt`) that carries the just-climbed
        // unfreezeAttempts, so a re-freeze within the flap window inherits the count and the freeze↔unfreeze loop is
        // bounded. The fence is already lifted; the tombstone holds no serving state, only anti-thrash memory — so the
        // stale back-off / contained markers are null-cleared (a released collection is neither probed nor contained).
        clearFreeze : async collectionName => { await upsertFreezeRecord({dir: freezeRecordsDir, collectionName, unfrozenAt: now, lastProbeAt: null, containedAt: null}); }
    });

    // Ledger the contained transition (the thrash-cap terminal) exactly once: a persistent fault that exhausted
    // its auto-unfreeze attempts must be observable in the heal-ledger + deployment-state surface (the decider's
    // contract says contained is "ledgered"), or a capped collection stays invisibly frozen. Dedup on the
    // `containedAt` marker so a collection that remains contained across polls is ledgered on the transition only.
    for (const outcome of outcomes) {
        if (outcome.status === 'contained' && !activeRecords[outcome.collectionName]?.containedAt) {
            await appendHealEvent({type: 'contained', collection: outcome.collectionName, status: 'contained', detail: {reason: outcome.reason}}, healLedgerAppendOptions());
            await upsertFreezeRecord({dir: freezeRecordsDir, collectionName: outcome.collectionName, containedAt: now});
        }
    }

    return outcomes;
}
