import {writeFileAtomicSync} from '../../../../services/shared/atomicFileWrite.mjs';
import {readFile}            from 'node:fs/promises';

/**
 * @module ai/mcp/server/shared/helpers/patValidationCache
 * @summary Disk-backed store for the PAT validation cache — the restart-survivable half of the
 * admission cache that lets a freshly-redeployed plane admit previously-validated identities
 * while the provider's validation endpoint is down.
 *
 * **Why hash-only.** The store maps SHA-256 token hashes to the identity the provider resolved
 * for them. The raw bearer token never touches disk: the hash is not replayable against any
 * endpoint, so a leaked cache file is an identity-disclosure at worst, never a credential.
 *
 * **Why the caller owns all freshness semantics.** This module is a durable key-value store and
 * nothing else: TTLs, stale windows, provider probes, and admission decisions stay in
 * `AuthService`'s verifier, which already owns them for the in-process tier. A cache file that
 * invents its own expiry policy would create a second authority that could disagree with the
 * first.
 */

/**
 * @summary Reads the persisted validation entries at `filePath`.
 *
 * A missing file is an empty store, not an error — the first successful validation creates it. A
 * CORRUPT file is also treated as empty rather than fatal, because admission must degrade to its
 * pre-feature behavior (provider-only) instead of refusing to boot over a cache; the reason is
 * returned so the caller can log it loudly. Callers decide staleness; timestamps cross the boundary
 * untouched.
 * @param {String}   filePath              Absolute path to the JSON store (parent created on write).
 * @param {Object}   [options]
 * @param {Object}   [options.fsModule]    Injection seam for tests; defaults to `node:fs/promises`.
 * @param {Function} [options.now=Date.now] Injectable clock for tests.
 * @returns {{entries: Map<String, {user: Object, scopes: String[], verifiedAt: Number}>, warning: String|null}}
 */
export async function readPatValidationCache(filePath, {fsModule, now = Date.now} = {}) {
    const fsPromises = fsModule ?? {readFile};
    let raw;

    try {
        raw = await fsPromises.readFile(filePath, 'utf8');
    } catch (error) {
        if (error?.code === 'ENOENT') {
            return {entries: new Map(), warning: null}
        }

        return {entries: new Map(), warning: `unreadable (${error.message})`}
    }

    let parsed;

    try {
        parsed = JSON.parse(raw);
    } catch {
        return {entries: new Map(), warning: 'corrupt JSON — ignored'}
    }

    const entries = new Map();
    const cutoff  = now();

    for (const [tokenHash, entry] of Object.entries(parsed ?? {})) {
        // Shape-guard each row rather than trusting the file: one malformed row must not poison
        // the others, and a row missing the fields admission needs is worse than absent.
        if (
            typeof tokenHash === 'string' && tokenHash.length > 0 &&
            entry && typeof entry === 'object' &&
            typeof entry.verifiedAt === 'number' && entry.verifiedAt <= cutoff + 60000 &&
            entry.user && typeof entry.user.login === 'string'
        ) {
            entries.set(tokenHash, {
                user      : entry.user,
                scopes    : Array.isArray(entry.scopes) ? entry.scopes : [],
                verifiedAt: entry.verifiedAt
            })
        }
    }

    return {entries, warning: null}
}

/**
 * @summary Persists the validation entries atomically (tmp + rename), creating parent directories.
 *
 * Sync-write by design: it rides the same event-loop turn as the validation that earned it, so a
 * process killed mid-admission cannot lose the entry that a post-restart outage window will need.
 * Callers treat write failure as a loud degradation (log + continue admitting), never as an
 * admission failure — losing the cache must never look like losing the credential.
 * @param {String} filePath Absolute target path.
 * @param {Map<String, {user: Object, scopes: String[], verifiedAt: Number}>} entries
 * @param {Object} [options]
 * @param {Object} [options.fsModule] Injection seam for tests; defaults to `node:fs/promises` (mkdir).
 * @throws {Error} When the write itself fails — the CALLER decides logging vs failing; see above.
 */
export async function writePatValidationCache(filePath, entries, {fsModule} = {}) {
    const fsPromises = fsModule ?? await import('node:fs/promises');
    const payload    = {};

    for (const [tokenHash, entry] of entries) {
        payload[tokenHash] = entry
    }

    const {mkdir}    = fsPromises;
    const pathModule = await import('node:path');

    await mkdir(pathModule.dirname(filePath), {recursive: true});
    writeFileAtomicSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}
