import {appendHealEvent}                                           from './healEventLedgerStore.mjs';
import {readFreezeRecords, removeFreezeRecord, upsertFreezeRecord} from './freezeRecordStore.mjs';
import {runFreezeReprobeCycle}                                     from './freezeReprobeDecision.mjs';

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
 * @param {Object} options
 * @param {String} options.freezeRecordsDir Durable freeze-record state directory.
 * @param {Function} options.fence `async ({collection, reason, now}) => fencedTargets` — lifts the collection out of serving.
 * @returns {Function} The `async ({collection, evidence, now}) => {status, detail}` heal-operation.
 */
export function createFreezeHealOperation({freezeRecordsDir, fence}) {
    if (typeof fence !== 'function') {
        throw new TypeError('createFreezeHealOperation: a fence function is required');
    }

    return async ({collection, evidence, now} = {}) => {
        const faultFingerprint = evidence?.reasonCode ?? evidence?.mode ?? collection,
              fenced           = await fence({collection, reason: faultFingerprint, now});

        await upsertFreezeRecord({dir: freezeRecordsDir, collectionName: collection, faultFingerprint, frozenAt: now});

        return {status: 'frozen', detail: {collection, fenced, faultFingerprint}};
    };
}

/**
 * @summary Runs one freeze re-probe tick: read the durable freeze-records and, for each frozen collection,
 * auto-unfreeze a cleared fault / stay frozen on a persisting one / contain past the thrash cap — all under
 * `decideFreezeReprobe`'s back-off, never an operator. A no-op (one cheap read, no probe) when nothing is frozen,
 * so it is cheap to call every poll. The probe + unfence are injected; persist/clear are `freezeRecordStore`-backed.
 * A successful unfreeze lifts the fence, ledgers an `unfreeze` event (the heal-ledger frozen-set), and removes the
 * freeze-record; the next diagnosis re-heals any residue.
 * @param {Object} options
 * @param {String} options.freezeRecordsDir Durable freeze-record state directory.
 * @param {String} options.healLedgerDir Durable heal-event ledger directory (for the `unfreeze` event).
 * @param {Number} options.now Injected clock (epoch ms).
 * @param {Function} options.probe `async (collectionName) => {embedderHealthy, dimensionConsistent}`.
 * @param {Function} options.unfence `async (collectionName) => void` — lifts the serving fence (production: unquarantine).
 * @param {Number} [options.containedCooldownMs=DEFAULT_CONTAINED_COOLDOWN_MS] How long a `contained` collection waits before it is re-opened for a fresh round of auto-unfreeze attempts — the bounded contained-recovery path (never a permanent strand).
 * @returns {Promise<Object[]>} Per-collection re-probe outcomes, or `[]` when nothing is frozen.
 */
export async function runFreezeReprobe({freezeRecordsDir, healLedgerDir, now, probe, unfence, containedCooldownMs = DEFAULT_CONTAINED_COOLDOWN_MS}) {
    const freezeRecords = await readFreezeRecords({dir: freezeRecordsDir});

    if (Object.keys(freezeRecords).length === 0) {
        return []; // nothing frozen → no probe, no unfreeze, no further I/O
    }

    // Contained-recovery (the reopen path the decider anticipates): a collection capped at the thrash limit is NOT
    // permanently stranded. Once its containment is older than the cooldown, reset the attempt count + restart the
    // cooldown clock so it re-enters the normal probe flow THIS cycle — a transient fault that has since cleared then
    // auto-unfreezes; a still-flapping one simply re-caps. At most one recovery round per cooldown, so thrash stays
    // bounded. Without this, a transient fault that flapped past the cap would freeze forever (the #1 weeks-bar risk).
    for (const [collectionName, record] of Object.entries(freezeRecords)) {
        if (Number.isFinite(record?.containedAt) && (now - record.containedAt) >= containedCooldownMs) {
            freezeRecords[collectionName] = await upsertFreezeRecord({dir: freezeRecordsDir, collectionName, unfreezeAttempts: 0, containedAt: now});
            await appendHealEvent({type: 'contained-reopen', collection: collectionName, status: 'reopened'}, {dir: healLedgerDir, now});
        }
    }

    const outcomes = await runFreezeReprobeCycle({
        freezeRecords,
        now,
        probe,
        unfreezeAndReheal: async collectionName => {
            // Lift the serving fence + ledger the unfreeze; the next poll's diagnosis re-heals any residue.
            await unfence(collectionName);
            await appendHealEvent({type: 'unfreeze', collection: collectionName, status: 'unfrozen'}, {dir: healLedgerDir, now});
        },
        persistProbe: async ({collectionName, lastProbeAt, unfreezeAttempts}) => upsertFreezeRecord({dir: freezeRecordsDir, collectionName, lastProbeAt, unfreezeAttempts}),
        clearFreeze : async collectionName => { await removeFreezeRecord({dir: freezeRecordsDir, collectionName}); }
    });

    // Ledger the contained transition (the thrash-cap terminal) exactly once: a persistent fault that exhausted
    // its auto-unfreeze attempts must be observable in the heal-ledger + deployment-state surface (the decider's
    // contract says contained is "ledgered"), or a capped collection stays invisibly frozen. Dedup on the
    // `containedAt` marker so a collection that remains contained across polls is ledgered on the transition only.
    for (const outcome of outcomes) {
        if (outcome.status === 'contained' && !freezeRecords[outcome.collectionName]?.containedAt) {
            await appendHealEvent({type: 'contained', collection: outcome.collectionName, status: 'contained', detail: {reason: outcome.reason}}, {dir: healLedgerDir, now});
            await upsertFreezeRecord({dir: freezeRecordsDir, collectionName: outcome.collectionName, containedAt: now});
        }
    }

    return outcomes;
}
