/**
 * @summary Snapshot/restore isolation for the shared `aiConfig` Provider singleton in tests.
 *
 * `aiConfig` is a Neo Provider singleton — one instance per module graph; dynamic
 * re-imports do NOT yield a clean instance. So any spec that mutates it in setup
 * (`storagePaths.graph`, `collections`, `autoIngestFileSystem`, `handoffFilePath`, …)
 * leaks that mutation into every later spec under a full-suite `--workers=1` run.
 * Per-file isolation (`--workers>1`) + CI retries mask the collision — this is the
 * class that passes CI but is latently wrong.
 *
 * Capture the mutated keys BEFORE the spec writes them, restore in the matching
 * `afterAll` / `afterEach`. Precedent: the capture/restore-in-`finally` pattern in
 * `DestructiveOperationGuard.spec`.
 *
 * @example
 *   import {captureAiConfigKeys} from '../../../fixtures/aiConfigIsolation.mjs';
 *
 *   let restoreAiConfig;
 *   test.beforeAll(() => {
 *       // capture first, then the spec's existing mutations are free to write
 *       restoreAiConfig = captureAiConfigKeys(aiConfig, ['storagePaths.graph', 'collections', 'autoIngestFileSystem']);
 *       aiConfig.storagePaths.graph   = testDbPath;
 *       aiConfig.autoIngestFileSystem = false;
 *   });
 *   test.afterAll(() => { restoreAiConfig(); });
 */

/**
 * Reads a dotted path off an object, tolerating absent intermediate segments.
 * @param {Object} obj
 * @param {String} path Dotted path, e.g. `'storagePaths.graph'`.
 * @returns {*} The value, or `undefined` if any segment is absent.
 */
const getByPath = (obj, path) => path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);

/**
 * Writes a value at a dotted path, materializing absent intermediate objects.
 * @param {Object} obj
 * @param {String} path Dotted path.
 * @param {*} value
 */
const setByPath = (obj, path, value) => {
    const keys = path.split('.'),
          last = keys.pop(),
          node = keys.reduce((node, key) => (node[key] ??= {}), obj);

    node[last] = value;
};

/**
 * Snapshots the current values of the given dotted `aiConfig` keys and returns a
 * zero-arg `restore()` that writes them back. Capture BEFORE the spec mutates the
 * keys; call the returned function in `afterAll` / `afterEach`. Object captures are
 * deep-cloned so a later in-place mutation of the live config cannot corrupt the
 * snapshot. Pass the granularity you mutate: a leaf (`'storagePaths.graph'`) when the
 * parent object already exists, or the whole key (`'collections'`) when the spec
 * creates it (so restore returns it to its original `undefined`).
 *
 * @param {Object}   aiConfig The shared Provider singleton.
 * @param {String[]} keys     Dotted paths to snapshot.
 * @returns {Function} `restore()` — re-applies the captured values (idempotent).
 */
export function captureAiConfigKeys(aiConfig, keys) {
    const saved = keys.map(path => {
        const value = getByPath(aiConfig, path);
        return [path, (value !== null && typeof value === 'object') ? structuredClone(value) : value];
    });

    return function restoreAiConfigKeys() {
        for (const [path, value] of saved) setByPath(aiConfig, path, value);
    };
}
