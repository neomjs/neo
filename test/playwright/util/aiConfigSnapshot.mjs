/**
 * @summary Capture/restore helper for spec setups that mutate the shared `aiConfig` Provider singleton.
 *
 * `aiConfig` is imported once per module graph; a mutation in a spec's setup (e.g.
 * `aiConfig.storagePaths.graph = tmp`) STICKS across files in a full-suite `--workers=1` run and bleeds
 * into later specs — a latent live-DB-bleed hazard that per-file isolation and CI retries mask. This util
 * generalizes the in-tree capture/restore precedent
 * (`test/playwright/unit/ai/mcp/server/shared/services/DestructiveOperationGuard.spec.mjs`) so a spec can
 * snapshot exactly the keys it mutates and restore them in `afterEach` / `afterAll`.
 *
 * Pure by design — it operates on the object handed in, so it is unit-testable with a plain object and
 * carries no import-time coupling to the singleton. Dotted deep paths (`storagePaths.graph`) are supported.
 *
 * @module test/playwright/util/aiConfigSnapshot
 */

/**
 * @summary Read a dotted deep path off an object, tolerating missing intermediate nodes.
 * @param {Object} obj
 * @param {String} dottedKey e.g. `storagePaths.graph`
 * @returns {*} The value at the path, or `undefined` if any segment is missing.
 */
function getPath(obj, dottedKey) {
    return dottedKey.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

/**
 * @summary Assign a dotted deep path on an object; no-op if an intermediate node is missing.
 * @param {Object} obj
 * @param {String} dottedKey
 * @param {*} value
 * @returns {void}
 */
function setPath(obj, dottedKey, value) {
    const keys = dottedKey.split('.'),
          last = keys.pop(),
          host = keys.reduce((node, key) => (node == null ? undefined : node[key]), obj);

    if (host != null) {
        host[last] = value;
    }
}

/**
 * @summary Snapshot the given dotted keys on `target` and return a `restore()` closure that puts them back.
 *
 * Captures each key's current value at call time; the returned `restore()` re-assigns every captured key to
 * that value. Idempotent — calling `restore()` more than once is safe.
 *
 * Usage in a spec that mutates `aiConfig`:
 * ```js
 * import {snapshotConfigKeys} from '../../../util/aiConfigSnapshot.mjs';
 * let restore;
 * test.beforeEach(() => {
 *     restore = snapshotConfigKeys(aiConfig, ['storagePaths.graph', 'autoIngestFileSystem']);
 *     aiConfig.storagePaths.graph = tmpGraphPath;
 * });
 * test.afterEach(() => restore());
 * ```
 *
 * @param {Object} target The object to snapshot (e.g. the `aiConfig` singleton).
 * @param {String[]} keys Dotted key paths to capture (and later restore).
 * @returns {Function} `restore()` — re-assigns each captured key to its original value.
 */
export function snapshotConfigKeys(target, keys) {
    const captured = (Array.isArray(keys) ? keys : []).map(key => [key, getPath(target, key)]);

    return function restore() {
        for (const [key, value] of captured) {
            setPath(target, key, value);
        }
    };
}
