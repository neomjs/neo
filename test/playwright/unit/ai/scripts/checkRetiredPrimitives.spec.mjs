import {setup} from '../../../setup.mjs';

const appName = 'CheckRetiredPrimitivesTest';

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
import {execFileSync} from 'child_process';
import path           from 'path';
import fs             from 'fs/promises';

/**
 * @summary Coverage for `ai/scripts/check-retired-primitives.mjs` — the mechanical-enforcement
 * layer that complements ADR 0004's discipline-only §1.3/§2.6/§5.6 substrate-evolution-guard.
 *
 * Test axes (matching ticket #11406 ACs):
 *
 * 1. **AC3 — clean substrate**: running the script against the current working tree (substrate
 *    is post-PR-#11403-clean-cut, no retired-primitive imports remain) must exit 0 and emit the
 *    PASS narrative naming the ADR 0004 §2.6 reference.
 *
 * 2. **AC4 — canary regression**: planting a deliberate retired-primitive import in a non-spec
 *    source file under `ai/` must cause the script to exit 1 and emit the FAIL narrative
 *    naming the offending file:line and the ADR 0004 §2.6 cross-reference.
 *
 * The canary is created/torn-down inside the test scope so cross-suite parallel runs cannot
 * see a transient retired-primitive import that would mask other failures. Test placement
 * deliberately uses `__retired_test_canary_*` prefix to make grep-discovery / cleanup unambiguous.
 */
// `describe.serial` is REQUIRED: tests plant on-disk canary files under `ai/` whose visibility
// would otherwise leak across Playwright's parallel workers (fullyParallel default). With serial
// execution, the AC3 clean-substrate test runs first against a verified-clean tree, and each
// canary-planting test cleans up before the next runs (`feedback_symmetric_spec_cleanup.md`).
test.describe.serial('ai/scripts/check-retired-primitives', () => {
    const scriptPath = path.resolve(process.cwd(), 'ai/scripts/check-retired-primitives.mjs');

    test('AC3: exits 0 with PASS narrative on a clean substrate', async () => {
        const output = execFileSync('node', [scriptPath], {encoding: 'utf-8'});

        expect(output).toContain('PASS');
        expect(output).toContain('no retired-primitive imports found');
        expect(output).toContain('ADR 0004 §2.6');
    });

    test('AC4: exits 1 with FAIL narrative when a non-spec source imports a retired primitive', async () => {
        // Plant a deliberate canary under ai/services/github-workflow/sync/ (a path that lies
        // INSIDE the script's SEARCH_ROOT and OUTSIDE its excluded *.spec.mjs / *.test.mjs glob).
        const canaryPath = path.resolve(
            process.cwd(),
            'ai/services/github-workflow/sync/__retired_test_canary_check_retired_primitives.mjs'
        );

        const canaryContent = [
            '// Auto-generated test canary for check-retired-primitives.mjs AC4.',
            "// This file deliberately imports a retired primitive to verify the CI grep-fail check.",
            "// The script under test (ai/scripts/check-retired-primitives.mjs) MUST detect this import",
            "// and exit 1; the test cleanup unlinks this file regardless of pass/fail.",
            "import chunkPath from '../shared/chunkPath.mjs';",
            'export default chunkPath;',
            ''
        ].join('\n');

        await fs.writeFile(canaryPath, canaryContent, 'utf-8');

        let exitCode = null;
        let stdout   = '';
        let stderr   = '';

        try {
            execFileSync('node', [scriptPath], {encoding: 'utf-8'});
            // Reaching here means script exited 0 — that's the bug.
            exitCode = 0;
        } catch (err) {
            exitCode = err.status;
            stdout   = err.stdout || '';
            stderr   = err.stderr || '';
        } finally {
            // Always cleanup so a failing assertion doesn't leak the canary into other tests.
            await fs.unlink(canaryPath).catch(() => {});
        }

        expect(exitCode).toBe(1);
        const combined = stdout + stderr;
        expect(combined).toContain('FAIL');
        expect(combined).toContain('__retired_test_canary_check_retired_primitives.mjs');
        expect(combined).toContain('shared/chunkPath.mjs');
        expect(combined).toContain('ADR 0004 §2.6');
    });

    test('AC4 (assignees-deletion variant): catches archivePath.mjs imports too', async () => {
        const canaryPath = path.resolve(
            process.cwd(),
            'ai/services/github-workflow/sync/__retired_test_canary_archive_path.mjs'
        );

        await fs.writeFile(
            canaryPath,
            "import archivePath from '../shared/archivePath.mjs';\nexport default archivePath;\n",
            'utf-8'
        );

        let exitCode = null;
        let combined = '';

        try {
            execFileSync('node', [scriptPath], {encoding: 'utf-8'});
            exitCode = 0;
        } catch (err) {
            exitCode = err.status;
            combined = (err.stdout || '') + (err.stderr || '');
        } finally {
            await fs.unlink(canaryPath).catch(() => {});
        }

        expect(exitCode).toBe(1);
        expect(combined).toContain('shared/archivePath.mjs');
        expect(combined).toContain('__retired_test_canary_archive_path.mjs');
    });

    test('script does NOT flag a spec file that imports a retired primitive (excluded glob)', async () => {
        // Spec files are excluded by design — they may legitimately reference retired primitives
        // for negative-test fixtures (e.g., regression coverage proving the primitive is gone).
        const canaryPath = path.resolve(
            process.cwd(),
            'ai/services/github-workflow/sync/__retired_test_canary_spec_exclusion.spec.mjs'
        );

        await fs.writeFile(
            canaryPath,
            "import chunkPath from '../shared/chunkPath.mjs';\nexport default chunkPath;\n",
            'utf-8'
        );

        let exitCode = null;

        try {
            execFileSync('node', [scriptPath], {encoding: 'utf-8'});
            exitCode = 0;
        } catch (err) {
            exitCode = err.status;
        } finally {
            await fs.unlink(canaryPath).catch(() => {});
        }

        // Substrate is still clean from the script's perspective because spec files are excluded.
        expect(exitCode).toBe(0);
    });
});
