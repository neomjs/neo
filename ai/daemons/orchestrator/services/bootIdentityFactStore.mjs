import {mkdir, readFile, rename, stat, writeFile} from 'fs/promises';
import path                                       from 'path';

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
 * `{v, generatedAt, bootId, fact}`:
 *  - **Atomic replace** (write-temp → `rename`) so a concurrent reader never observes a torn,
 *    half-written JSON (which would read as corrupt → a spurious `unknown`).
 *  - **Generation metadata** (`generatedAt`, `bootId`) so the reader can tell a fresh snapshot from a
 *    stale prior-process one, and a future format change from the current version.
 *  - **Byte bound** (`MAX_FACT_BYTES`) so a pathological oversized field can never be written or parsed.
 *  - **Schema validation** on read (version + required-key shape) so a wrong-version / wrong-shape file
 *    degrades to `unknown` rather than serving garbage.
 *
 * **Latest-wins, not a ledger:** the boot-identity fact is a single CURRENT snapshot (which source is
 * this process running, plus the latest scheduler cycle), so the write overwrites rather than appends
 * — there is no history to retain and thus no prune machinery.
 *
 * **Advisory-fail-soft read (the control-plane contract):** the read is on the control-plane path,
 * which must NEVER be gated by this store — so a missing / unreadable / corrupt / wrong-version /
 * **stale-prior-process** file resolves to an honest `unknown` (a `null` for the absent/unreadable
 * classes, or an explicit stale advisory), never a fabricated fact and never a thrown control-plane
 * read. The write, by contrast, fails LOUD (a bad fact / oversized envelope / I/O fault throws) so the
 * orchestrator's per-cycle writer (`recordBootIdentityFact`) can route it to observability instead of
 * swallowing it blind.
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
     * than serving a dead process's snapshot as if live. The reader wiring overrides it from config.
     */
    DEFAULT_MAX_FACT_AGE_MS     = 6 * 60 * 60 * 1000;

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
 * version, a finite generation timestamp, and a fact carrying the produce-shape's required keys.
 * A failure degrades the read to `unknown` (never a throw, never a fabricated fact).
 * @param {*} envelope The parsed file contents.
 * @returns {Boolean}
 * @protected
 */
export function isValidBootIdentityEnvelope(envelope) {
    return !!envelope
        && typeof envelope === 'object'
        && envelope.v === BOOT_IDENTITY_FACT_VERSION
        && Number.isFinite(envelope.generatedAt)
        && !!envelope.fact
        && typeof envelope.fact                === 'object'
        && typeof envelope.fact.classification === 'string'
        && typeof envelope.fact.advisory       === 'boolean';
}

/**
 * @summary Persists the latest advisory boot-identity fact as a versioned, atomically-replaced
 * snapshot envelope, creating the dir if needed. The orchestrator calls this at its cycle boundary;
 * `fact` is the full `produceBootIdentityFact()` shape `{fact, classification, advisory, reason}`.
 * Fails LOUD (bad fact / oversized envelope / I/O fault) — the caller routes the error to observability.
 * @param {Object} fact The advisory boot-identity fact to persist.
 * @param {Object} options
 * @param {String} options.dir The shared runtime state directory.
 * @param {String|Number|null} [options.bootId=null] Producing-process boot generation id (metadata).
 * @param {Function} [options.nowFn=Date.now] Injected epoch-ms clock (stamps `generatedAt`).
 * @returns {Promise<String>} The file path written to.
 * @throws {TypeError} when `fact` is not an object or `dir` is missing/empty.
 * @throws {RangeError} when the serialized envelope exceeds `MAX_FACT_BYTES`.
 */
export async function writeBootIdentityFact(fact, {dir, bootId = null, nowFn = Date.now} = {}) {
    if (!fact || typeof fact !== 'object') {
        throw new TypeError('writeBootIdentityFact: fact object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('writeBootIdentityFact: dir is required');
    }

    const
        envelope   = {v: BOOT_IDENTITY_FACT_VERSION, generatedAt: nowFn(), bootId, fact},
        serialized = JSON.stringify(envelope);

    if (Buffer.byteLength(serialized, 'utf8') > MAX_FACT_BYTES) {
        throw new RangeError(`writeBootIdentityFact: envelope exceeds ${MAX_FACT_BYTES} bytes`);
    }

    await mkdir(dir, {recursive: true});

    const
        filePath = getBootIdentityFactFilePath(dir),
        tmpPath  = `${filePath}.tmp`;

    // Atomic replace: write the whole envelope to a sibling temp then rename over the target, so a
    // concurrent cross-process reader observes either the old file or the new one — never a torn write.
    await writeFile(tmpPath, serialized, 'utf8');
    await rename(tmpPath, filePath);

    return filePath;
}

/**
 * @summary Reads the latest advisory boot-identity snapshot. ADVISORY-FAIL-SOFT: a missing /
 * unreadable / oversized / corrupt / wrong-version file resolves to `null`; a valid-but-STALE snapshot
 * (older than `maxAgeMs` → the producing process is gone) resolves to an explicit `unknown` advisory
 * carrying a `stale-boot-identity-fact` reason. Either way the control-plane read is never gated and
 * never throws — the consumer degrades to an honest `unknown`, never a dead process's fact-as-live.
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
        return null; // wrong version / wrong shape → advisory-unknown, never garbage-as-fact
    }

    // Stale prior-process guard: a fact older than the horizon means the producing orchestrator is
    // gone → surface an explicit `unknown` (never a dead process's snapshot as if live). Distinct from
    // the `null` absent-class so the fleet reader can render the stale reason.
    if (Number.isFinite(maxAgeMs) && (nowFn() - envelope.generatedAt) > maxAgeMs) {
        return {fact: null, classification: 'unknown', advisory: true, reason: 'stale-boot-identity-fact'};
    }

    return envelope.fact;
}
