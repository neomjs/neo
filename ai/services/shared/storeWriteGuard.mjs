/**
 * @module ai/services/shared/storeWriteGuard
 * @summary Shared test-write isolation primitives: a test context MUST NOT write to a production store.
 *
 * The single classifier behind every Agent-OS persistent-store write guard — the SQLite graph store
 * (`Neo.ai.graph.storage.SQLite`), the concept ontology, and (pending) trajectories/handoff. Centralizing
 * it here means one definition of "disposable (test-isolated) vs production", rather than a classifier
 * drifting per store (the review note on the first guard).
 *
 * The danger it closes: a bare `npx playwright test` never sets `UNIT_TEST_MODE`, so a store path that
 * resolves test/prod by construction falls back to the **production** path — and the test silently writes
 * into the live store (the orphan-bleed / backlog-corruption class). By-construction config isolation can't
 * reach that bypass; this guard is the config-INDEPENDENT defense-in-depth that fires regardless of harness.
 */

import os from 'node:os';

/**
 * @summary Classifies a store path as disposable (test-isolated) versus a live production store.
 *
 * Disposable = SQLite `:memory:`, a path under `os.tmpdir()` (the canonical OS temp dir — macOS's
 * `/var/folders/.../T` carries no `tmp`/`test` substring, so this prefix arm is load-bearing for any
 * file-store guard whose tests use `os.tmpdir()`), a repo-`tmp/` path, or any `*test*` path. This shared
 * classifier is what the graph store's `clear()` production-wipe guard also consults, so the destructive-
 * and write-isolation guards classify production paths identically.
 * @param {String|null} storePath
 * @returns {Boolean}
 */
export function isDisposableStorePath(storePath) {
    return !storePath || storePath === ':memory:' || storePath.includes('tmp') ||
        storePath.includes('test') || storePath.startsWith(os.tmpdir());
}

/**
 * @summary True when a test runner is executing (so a production-store write would be test pollution).
 *
 * Playwright sets `TEST_WORKER_INDEX` in every worker process; `UNIT_TEST_MODE` covers the unit harness.
 * The live runtime (MCP server / orchestrator / daemons) sets neither, so callers early-return — zero
 * production blast.
 * @param {Object} [env=process.env] Injectable for tests.
 * @returns {Boolean}
 */
export function isTestRunnerContext(env=process.env) {
    return env.TEST_WORKER_INDEX !== undefined || env.UNIT_TEST_MODE === 'true';
}

/**
 * @summary Fail-closed guard: throws when a test runner is about to write a production-store path.
 *
 * Fires only at the intersection (test runner AND production-like path); a disposable target or the live
 * runtime passes through. Each caller passes its `subsystem` for the diagnostic.
 * @param {Object}  options
 * @param {String}  options.storePath           The resolved store path about to be written.
 * @param {String}  options.subsystem           Owning subsystem identifier for the diagnostic.
 * @param {Object} [options.env=process.env]    Injectable for tests.
 * @throws {Error} `STORE_WRITE_GUARD` when a test context targets a production store path.
 */
export function assertTestWriteIsolated({storePath, subsystem='store', env=process.env}={}) {
    if (!isTestRunnerContext(env) || isDisposableStorePath(storePath)) {
        return;
    }

    throw new Error(
        `STORE_WRITE_GUARD: refusing a ${subsystem} write to the production store "${storePath}" from a test ` +
        `context (TEST_WORKER_INDEX/UNIT_TEST_MODE detected). Tests MUST resolve a test/tmp store path — a bare ` +
        `\`npx playwright test\` would otherwise pollute the live store.`
    );
}
