import {setup} from '../../../setup.mjs';

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

import {test, expect} from '@playwright/test';
import {execFile}     from 'child_process';
import {promisify}    from 'util';
import path           from 'path';
import {fileURLToPath} from 'url';

const execFileAsync = promisify(execFile);

const __filename  = fileURLToPath(import.meta.url);
const __dirname   = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
const scriptPath  = path.join(projectRoot, 'ai', 'scripts', 'sweepExpiredTasks.mjs');

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
test.describe('ai/scripts/sweepExpiredTasks.mjs regression guard (#10595)', () => {
    test('script exits 0 with success JSON on stdout (no Neo-not-defined regression)', async () => {
        const {stdout, stderr} = await execFileAsync('node', [scriptPath], {
            cwd: projectRoot,
            // 30s ceiling; happy path completes in <500ms based on measurement page
            timeout: 30000
        });

        // Stderr should NOT contain the regression-class signature.
        expect(stderr).not.toContain('ReferenceError: Neo is not defined');

        // Stdout should be exactly one JSON line: {"success":true,"sweptCount":<n>}
        const trimmed = stdout.trim();
        expect(trimmed).toMatch(/^\{"success":true,"sweptCount":\d+\}$/);

        const payload = JSON.parse(trimmed);
        expect(payload.success).toBe(true);
        expect(typeof payload.sweptCount).toBe('number');
        expect(payload.sweptCount).toBeGreaterThanOrEqual(0);
    });

    test('script imports Neo prelude before LifecycleService (regression-class structural guard)', async () => {
        // Static check: the file's top imports MUST include `Neo` and `core/_export` before
        // any `mcp/server/memory-core/services/` module that transitively uses Neo.gatekeep.
        // This is the structural invariant the runtime test above verifies behaviorally.
        const {default: fs}   = await import('fs-extra');
        const content         = await fs.readFile(scriptPath, 'utf-8');
        const lines           = content.split('\n');
        const neoImportIdx    = lines.findIndex(l => /^import\s+Neo\s+from\s+['"]\.\.\/\.\.\/src\/Neo\.mjs['"]/.test(l));
        const coreImportIdx   = lines.findIndex(l => /^import\s+\*\s+as\s+core\s+from\s+['"]\.\.\/\.\.\/src\/core\/_export\.mjs['"]/.test(l));
        const lifecycleIdx    = lines.findIndex(l => /^import\s+LifecycleService\s+from\s+['"]\.\.\/mcp\/server\/memory-core\/services\/lifecycle\/SystemLifecycleService\.mjs['"]/.test(l));

        // All three imports MUST be present and ordered correctly.
        expect(neoImportIdx).toBeGreaterThanOrEqual(0);
        expect(coreImportIdx).toBeGreaterThanOrEqual(0);
        expect(lifecycleIdx).toBeGreaterThanOrEqual(0);
        expect(neoImportIdx).toBeLessThan(lifecycleIdx);
        expect(coreImportIdx).toBeLessThan(lifecycleIdx);
    });
});
