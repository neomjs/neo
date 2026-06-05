import Neo from '../../../src/Neo.mjs';

/**
 * @module test/playwright/fixtures/aiConfigIsolation
 * @summary Snapshot/restore isolation for the reactive `aiConfig` Provider singleton in unit specs.
 *
 * `aiConfig` is a Neo Provider **singleton** — imported once per module graph, with mutations
 * that stick (dynamic re-imports do NOT yield a clean instance). Specs that write
 * `aiConfig.storagePaths.graph`, `aiConfig.autoIngestFileSystem`, `aiConfig.engines.chroma.database`,
 * etc. in their setup blocks **without restoring** leak that state into every later spec.
 *
 * Single-spec runs and parallel (`--workers>1`, per-file isolation) runs MASK the collision;
 * a full-suite `--workers=1` run is where one spec's config bleeds into the next. CI's per-file
 * isolation + retries hide it — exactly the class that passes CI but is latently wrong.
 *
 * Precedent: `test/playwright/unit/ai/mcp/server/shared/services/DestructiveOperationGuard.spec.mjs`
 * captures `aiConfig.storagePaths.graph` and restores it in a `finally`; this generalises that
 * capture/restore pattern to N keys across `afterEach`/`afterAll`.
 */

/**
 * Capture the current LEAF VALUES at the given `aiConfig` key-paths so a spec can restore them
 * after mutating them in setup, preventing cross-spec config bleed under a full-suite `--workers=1` run.
 *
 * It captures resolved leaf values only — it never clones or re-wraps the Provider proxy, so it is
 * safe under the reactive-Provider SSOT contract: passing a Provider/config proxy through
 * `clone`/`JSON.stringify`/`setData` is a known corruption hazard, so this helper deliberately does not.
 *
 * @param {Object}   aiConfig The `aiConfig` Provider singleton as imported by the spec. Every server
 *                            `config.mjs` (memory-core, knowledge-base, …) resolves to the same singleton,
 *                            so pass whichever the spec already imports.
 * @param {String[]} keyPaths Dot-paths to snapshot, e.g.
 *                            `['storagePaths.graph', 'autoIngestFileSystem', 'engines.chroma.database']`.
 * @returns {Function} `restore()` — writes the captured values back. Call it in `afterEach`/`afterAll`.
 *
 * @example
 * import aiConfig            from '../../../../../ai/mcp/server/memory-core/config.mjs';
 * import {snapshotAiConfig} from '../../../../fixtures/aiConfigIsolation.mjs';
 *
 * let restoreAiConfig;
 *
 * beforeAll(() => {
 *     // snapshot BEFORE mutating
 *     restoreAiConfig = snapshotAiConfig(aiConfig, ['storagePaths.graph', 'autoIngestFileSystem']);
 *     aiConfig.storagePaths.graph   = testDbPath;
 *     aiConfig.autoIngestFileSystem = false;
 * });
 *
 * afterAll(() => {
 *     restoreAiConfig?.()
 * });
 */
export function snapshotAiConfig(aiConfig, keyPaths) {
    const captured = keyPaths.map(keyPath => ({
        keyPath,
        value: Neo.ns(keyPath, false, aiConfig)
    }));

    return function restore() {
        for (const {keyPath, value} of captured) {
            const segments = keyPath.split('.'),
                  leaf     = segments.pop(),
                  // create=true: rebuild any parent chain a spec may have introduced (e.g. a spec that
                  // did `aiConfig.storagePaths = {}`), so restore can always assign the captured leaf.
                  parent   = Neo.ns(segments, true, aiConfig);

            parent[leaf] = value
        }
    }
}
