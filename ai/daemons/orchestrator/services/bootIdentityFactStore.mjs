import {mkdir, readFile, writeFile} from 'fs/promises';
import path                         from 'path';

/**
 * @module ai/daemons/orchestrator/services/bootIdentityFactStore
 * @summary Durable single-fact store that carries the advisory boot-identity fact ACROSS the
 * orchestrator↔fleet-server process boundary. The producer (`BootIdentityHealthService`) + its
 * REM-run-state fact-gatherer live in the orchestrator process; the control-plane consumer seam
 * (`FleetControlBridge.getBootIdentity`) lives in the separate fleet-bridge-server process (Option-B
 * dev path). So the fact cannot be injected in-process there — instead the orchestrator WRITES its
 * latest advisory fact to this shared runtime-state file (the same shared-dir pattern the REM
 * run-state + heal-event stores use), and the fleet-server READS it. Mode-agnostic: the in-process
 * Electron path (Option A) reads the same file, so nothing forks on deployment mode.
 *
 * **Latest-wins, not a ledger:** the boot-identity fact is a single CURRENT snapshot (which source is
 * this process running, plus the latest scheduler cycle), so the write overwrites rather than appends
 * — there is no history to retain and thus no prune machinery.
 *
 * **Advisory-fail-soft read (the control-plane contract):** the read is on the control-plane path,
 * which must NEVER be gated by this store — so a missing OR unreadable OR corrupt file resolves to
 * `null` (the consumer renders the honest advisory-`unknown`, never a fabricated fact and never a
 * thrown control-plane read). The write, by contrast, surfaces its own I/O error to the orchestrator
 * caller (which swallows it fail-soft at its cycle boundary) so a persistent write failure is at least
 * loggable rather than silent.
 */

const BOOT_IDENTITY_FACT_FILENAME = 'boot-identity-fact.json';

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
 * @summary Persists the latest advisory boot-identity fact (overwrite-latest), creating the dir if
 * needed. The orchestrator calls this at its cycle boundary; the fact is the full
 * `produceBootIdentityFact()` shape `{fact, classification, advisory, reason}`.
 * @param {Object} fact The advisory boot-identity fact to persist.
 * @param {Object} options
 * @param {String} options.dir The shared runtime state directory.
 * @returns {Promise<String>} The file path written to.
 * @throws {TypeError} when `fact` is not an object or `dir` is missing/empty.
 */
export async function writeBootIdentityFact(fact, {dir} = {}) {
    if (!fact || typeof fact !== 'object') {
        throw new TypeError('writeBootIdentityFact: fact object is required');
    }
    if (typeof dir !== 'string' || dir.length === 0) {
        throw new TypeError('writeBootIdentityFact: dir is required');
    }

    await mkdir(dir, {recursive: true});
    const filePath = getBootIdentityFactFilePath(dir);
    await writeFile(filePath, JSON.stringify(fact), 'utf8');

    return filePath;
}

/**
 * @summary Reads the latest advisory boot-identity fact from the shared file. ADVISORY-FAIL-SOFT: a
 * missing / unreadable / corrupt file resolves to `null` so the control-plane read is never gated and
 * never throws — the consumer degrades to the honest advisory-`unknown`.
 * @param {Object} options
 * @param {String} options.dir The shared runtime state directory.
 * @returns {Promise<Object|null>} The persisted fact, or `null` when none is readable.
 */
export async function readBootIdentityFact({dir} = {}) {
    if (typeof dir !== 'string' || dir.length === 0) {
        return null; // no dir → nothing to read (advisory: unknown, never a throw on the control-plane path)
    }

    try {
        const text = await readFile(getBootIdentityFactFilePath(dir), 'utf8');
        const fact = JSON.parse(text);

        return fact && typeof fact === 'object' ? fact : null;
    } catch (error) {
        // missing (ENOENT) / unreadable / corrupt → advisory-unknown, never a definitive verdict or a throw
        return null;
    }
}
