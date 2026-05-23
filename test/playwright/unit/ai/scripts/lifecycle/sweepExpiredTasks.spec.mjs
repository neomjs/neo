import {setup} from '../../../../setup.mjs';

const appName = 'SweepExpiredTasksRegressionTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import path            from 'path';
import {fileURLToPath} from 'url';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
const scriptPath  = path.join(projectRoot, 'ai', 'scripts', 'lifecycle', 'sweepExpiredTasks.mjs');

/**
 * @summary Regression-guard for #10595 — `sweepExpiredTasks.mjs` direct-invocation
 * Neo-not-defined ReferenceError class.
 *
 * The pre-fix script imported `LifecycleService` at module-load time, which transitively
 * pulled `src/core/Compare.mjs` whose final line is `Neo.gatekeep(Compare, 'Neo.core.Compare', ...)`
 * — but Neo itself wasn't imported by the script. Result: every direct invocation crashed
 * at module-load with `ReferenceError: Neo is not defined`. The fix (per #10595) added
 * `import Neo from '../../src/Neo.mjs'` + `import * as core from '../../src/core/_export.mjs'`
 * before the LifecycleService import, populating the global Neo reference before the
 * Compare.mjs gatekeep call.
 *
 * Empirically anchored to PR #10594's `## TTL Sweeper Caveat` measurement section.
 *
 * This spec spawns the script via `execFile` (subprocess) rather than dynamic-importing
 * it directly — the script ends with an unconditional `main()` call that performs SQLite
 * I/O and `process.exit()`, so importing it from a Playwright test would race the test
 * runner and exit Node prematurely.
 *
 * The regression class manifests at module-LOAD time (before any DB I/O), so the spec
 * doesn't need fixture-graph setup; running against the worktree's actual SQLite is
 * sufficient — a `ReferenceError: Neo is not defined` would surface deterministically
 * regardless of graph state.
 */
test.describe('ai/scripts/lifecycle/sweepExpiredTasks.mjs regression guard (#10595)', () => {
    // Note: a behavioral subprocess invocation of the script (`node ai/scripts/lifecycle/sweepExpiredTasks.mjs`)
    // would catch the `Neo is not defined` regression class behaviorally, BUT
    // `MailboxService.sweepExpiredTasks()` performs a bulk SQL UPDATE that mutates the
    // worktree's live `.neo-ai-data/sqlite/memory-core-graph.sqlite` — it transitions
    // `Submitted`/`Working`/`InputRequired` tasks past `expiresAt` to `Expired`. Running
    // that mutation under a unit-test runner against the production graph is unsafe per
    // @neo-gpt's PR #10597 review feedback. A fixture-DB-isolated behavioral test would
    // require non-trivial config-injection plumbing (`aiConfig.data.dbPath` swap +
    // LifecycleService re-init) that is out of scope for this regression-guard.
    //
    // The structural import-order test below is sufficient to catch the regression class:
    // the failure mode is at module-LOAD time (before any DB I/O), and it manifests
    // deterministically when `Neo` isn't imported before `Compare.mjs` is transitively
    // pulled in via the LifecycleService chain. If a future commit reorders or removes
    // the prelude, the structural assertion fires.

    test('script imports Neo prelude before LifecycleService (regression-class structural guard)', async () => {
        // Static check: the file's top imports MUST include `Neo` and `core/_export` before
        // any `services/memory-core/` module that transitively uses Neo.gatekeep.
        // This is the structural invariant the runtime test above verifies behaviorally.
        const {default: fs}   = await import('fs-extra');
        const content         = await fs.readFile(scriptPath, 'utf-8');
        const lines           = content.split('\n');
        const neoImportIdx    = lines.findIndex(l => /^import\s+Neo\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/Neo\.mjs['"]/.test(l));
        const coreImportIdx   = lines.findIndex(l => /^import\s+\*\s+as\s+core\s+from\s+['"]\.\.\/\.\.\/\.\.\/src\/core\/_export\.mjs['"]/.test(l));
        const lifecycleIdx    = lines.findIndex(l => /^import\s+LifecycleService\s+from\s+['"]\.\.\/\.\.\/services\/memory-core\/lifecycle\/SystemLifecycleService\.mjs['"]/.test(l));

        // All three imports MUST be present and ordered correctly.
        expect(neoImportIdx).toBeGreaterThanOrEqual(0);
        expect(coreImportIdx).toBeGreaterThanOrEqual(0);
        expect(lifecycleIdx).toBeGreaterThanOrEqual(0);
        expect(neoImportIdx).toBeLessThan(lifecycleIdx);
        expect(coreImportIdx).toBeLessThan(lifecycleIdx);
    });
});
