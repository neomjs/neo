import {mkdir, readFile, stat} from 'fs/promises';
import {writeFileAtomic}       from '../../../services/shared/atomicFileWrite.mjs';
import path                    from 'path';
import {BOOT_FRESHNESS_CLASS}  from './bootIdentityFreshness.mjs';

/**
 * @module ai/daemons/orchestrator/services/bootIdentityFactStore
 * @summary Durable single-fact carrier that moves the advisory boot-identity fact ACROSS the
 * orchestrator↔fleet-server process boundary. The producer (`BootIdentityHealthService`) + its
 * REM-run-state fact-gatherer live in the orchestrator process; the control-plane consumer seam
 * (`FleetControlBridge.getBootIdentity`) lives in the separate fleet-bridge-server process (Option-B
 * dev path). So the fact cannot be injected in-process there — instead the orchestrator WRITES its
 * latest advisory fact to this shared runtime-state file (the same shared-dir pattern the REM
 * run-state + heal-event stores use), and the fleet-server READS it. Mode-agnostic: the in-process
 * Electron path (Option A) reads the same file, so nothing forks on deployment mode.
 *
 * **Explicit cross-process snapshot contract (not a raw blob).** Because a writer and a reader in two
 * OS processes share this file, the on-disk form is a versioned, self-describing envelope
 * `{v, generatedAt, fact}`:
 *  - **Concurrency-safe atomic replace.** Each write goes to a UNIQUE per-write sibling temp
 *    (`…json.<pid>.<ts>.<seq>.tmp`) then `rename`s over the target — so overlapping writers (a poll
 *    racing a restart) never share a temp path and a reader never observes a torn, half-written JSON.
 *    A fixed temp name would collide under concurrency (one writer's `rename` unlinks the temp another
 *    is still writing → `ENOENT` / an unreadable final snapshot); the per-write name is the same shape
 *    `deploymentStateBridgeStore` uses.
 *  - **Generation metadata** (`generatedAt`) so the reader can tell a fresh snapshot from a stale
 *    prior-process one, and a future format change from the current version.
 *  - **Byte bound** (`MAX_FACT_BYTES`) so a pathological oversized field can never be written or parsed.
 *  - **Canonical-codebook validation** on read — the envelope version, plus the fact's `classification`
 *    against the producer's `BOOT_FRESHNESS_CLASS` codebook, `advisory === true`, and a non-empty
 *    `reason` — so a wrong-version / wrong-shape / non-codebook file degrades to `unknown`, never a
 *    fabricated classification served as a real one.
 *
 * **Latest-wins, not a ledger:** the boot-identity fact is a single CURRENT snapshot (which source is
 * this process running, plus the latest scheduler cycle), so the write overwrites rather than appends
 * — there is no history to retain and thus no prune machinery.
 *
 * **Advisory-fail-soft read (the control-plane contract):** the read is on the control-plane path,
 * which must NEVER be gated by this store — so a missing / unreadable / corrupt / wrong-version /
 * non-codebook / **stale-prior-process** file resolves to an honest `unknown` (a `null` for the
 * absent/unreadable/invalid classes, or an explicit stale advisory), never a fabricated fact and never
 * a thrown control-plane read. The write, by contrast, fails LOUD (a bad fact / oversized envelope /
 * I/O fault throws) so the orchestrator's per-cycle writer (`recordBootIdentityFact`) can route it to
 * observability instead of swallowing it blind.
 */

const
    BOOT_IDENTITY_FACT_FILENAME = 'boot-identity-fact.json',
    /** Envelope schema version — bump on any breaking on-disk shape change; a mismatch reads as unknown. */
    BOOT_IDENTITY_FACT_VERSION  = 1,
    /**
     * A single advisory boot-identity snapshot is a small fixed-shape record; this generous cap only
     * guards against a pathological oversized field, never a legitimate fact.
     */
    MAX_FACT_BYTES              = 16 * 1024,
    /**
     * Default staleness horizon. A live orchestrator rewrites the fact every scheduler cycle, so a fact
     * older than this means the producing process is gone → the advisory degrades to `unknown` rather
     * than serving a dead process's snapshot as if live. The reader wiring overrides it via `maxAgeMs`.
     */
    DEFAULT_MAX_FACT_AGE_MS     = 6 * 60 * 60 * 1000;

// Per-process monotonic write counter — disambiguates two writes within the same millisecond so the
// unique-temp name never collides even under a tight write loop in one process.

export {BOOT_IDENTITY_FACT_VERSION, DEFAULT_MAX_FACT_AGE_MS, MAX_FACT_BYTES};

/**
 * @summary The boot-identity fact file path within a runtime state directory.
 * @param {String} dir
 * @returns {String}
 * @throws {TypeError} when `dir` is missing/empty.
 */
export function getBootIdentityFactFilePath(dir) {
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('getBootIdentityFactFilePath: dir is required');
    }
    return path.join(dir, BOOT_IDENTITY_FACT_FILENAME);
}

/**
 * @summary Validates a parsed envelope against the cross-process snapshot contract: the current
 * version, a finite generation timestamp, and a fact whose `classification` is a member of the
 * producer's canonical `BOOT_FRESHNESS_CLASS` codebook, is `advisory === true`, and carries a
 * non-empty `reason`. A failure degrades the read to `unknown` (never a throw, never a fabricated fact).
 * @param {*} envelope The parsed file contents.
 * @returns {Boolean}
 * @protected
 */
export function isValidBootIdentityEnvelope(envelope) {
    if (!envelope || typeof envelope !== 'object' || envelope.v !== BOOT_IDENTITY_FACT_VERSION) {
        return false;
    }
    if (!Number.isFinite(envelope.generatedAt)) {
        return false;
    }

    const fact = envelope.fact;

    return !!fact
        && typeof fact === 'object'
        && Object.values(BOOT_FRESHNESS_CLASS).includes(fact.classification) // the producer's codebook, not any string
        && fact.advisory === true                                            // advisory-only invariant (never a certainty verdict)
        && typeof fact.reason === 'string' && fact.reason.length > 0;
}

/**
 * @summary Persists the latest advisory boot-identity fact as a versioned, concurrency-safe
 * atomically-replaced snapshot envelope, creating the dir if needed. The orchestrator calls this at its
 * cycle boundary; `fact` is the full `produceBootIdentityFact()` shape `{fact, classification, advisory,
 * reason}`. Fails LOUD (bad fact / oversized envelope / I/O fault) — the caller routes it to observability.
 * @param {Object} fact The advisory boot-identity fact to persist.
 * @param {Object} options
 * @param {String} options.dir The shared runtime state directory.
 * @param {Function} [options.nowFn=Date.now] Injected epoch-ms clock (stamps `generatedAt`).
 * @returns {Promise<String>} The file path written to.
 * @throws {TypeError} when `fact` is not an object or `dir` is missing/empty.
 * @throws {RangeError} when the serialized envelope exceeds `MAX_FACT_BYTES`.
 */
export async function writeBootIdentityFact(fact, {dir, nowFn = Date.now} = {}) {
    if (!fact || typeof fact !== 'object') {
        throw new TypeError('writeBootIdentityFact: fact object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('writeBootIdentityFact: dir is required');
    }

    const
        envelope   = {v: BOOT_IDENTITY_FACT_VERSION, generatedAt: nowFn(), fact},
        serialized = JSON.stringify(envelope);

    if (Buffer.byteLength(serialized, 'utf8') > MAX_FACT_BYTES) {
        throw new RangeError(`writeBootIdentityFact: envelope exceeds ${MAX_FACT_BYTES} bytes`);
    }

    await mkdir(dir, {recursive: true});

    const filePath = getBootIdentityFactFilePath(dir);

    // The pid+timestamp+seq temp naming this used to build by hand — so no two concurrent writers
    // (overlapping polls, a restart racing a poll) share a scratch — is the primitive's contract now,
    // along with the cleanup that used to sit in the catch.
    await writeFileAtomic(filePath, serialized);

    return filePath;
}

/**
 * @summary Reads the latest advisory boot-identity snapshot. ADVISORY-FAIL-SOFT: a missing /
 * unreadable / oversized / corrupt / wrong-version / non-codebook file resolves to `null`; a
 * valid-but-STALE snapshot (older than `maxAgeMs` → the producing process is gone) resolves to an
 * explicit `unknown` advisory carrying a `stale-boot-identity-fact` reason. Either way the control-plane
 * read is never gated and never throws — the consumer degrades to an honest `unknown`, never a dead
 * process's fact-as-live.
 * @param {Object} options
 * @param {String} options.dir The shared runtime state directory.
 * @param {Number} [options.maxAgeMs=DEFAULT_MAX_FACT_AGE_MS] Staleness horizon; `Infinity` disables it.
 * @param {Function} [options.nowFn=Date.now] Injected epoch-ms clock (for the staleness compare).
 * @returns {Promise<Object|null>} The persisted `{fact, classification, advisory, reason}` when fresh,
 *     an explicit stale `unknown` advisory when too old, or `null` when absent/unreadable/invalid.
 */
export async function readBootIdentityFact({dir, maxAgeMs = DEFAULT_MAX_FACT_AGE_MS, nowFn = Date.now} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        return null; // no dir → nothing to read (advisory-unknown, never a throw on the control-plane path)
    }

    let text;

    try {
        const filePath = getBootIdentityFactFilePath(dir);

        // Byte-bound the read too: never parse an oversized file (defensive against a corrupt/huge file).
        if ((await stat(filePath)).size > MAX_FACT_BYTES) {
            return null;
        }
        text = await readFile(filePath, 'utf8');
    } catch (error) {
        return null; // missing (ENOENT) / unreadable → advisory-unknown, never a throw
    }

    let envelope;

    try {
        envelope = JSON.parse(text);
    } catch (error) {
        return null; // corrupt JSON → advisory-unknown
    }

    if (!isValidBootIdentityEnvelope(envelope)) {
        return null; // wrong version / non-codebook shape → advisory-unknown, never garbage-as-fact
    }

    // Stale prior-process guard: a fact older than the horizon means the producing orchestrator is
    // gone → surface an explicit `unknown` (never a dead process's snapshot as if live). Distinct from
    // the `null` absent-class so the fleet reader can render the stale reason.
    if (Number.isFinite(maxAgeMs) && (nowFn() - envelope.generatedAt) > maxAgeMs) {
        return {fact: null, classification: BOOT_FRESHNESS_CLASS.unknown, advisory: true, reason: 'stale-boot-identity-fact'};
    }

    return envelope.fact;
}
