import {setup} from '../../../setup.mjs';

const appName = 'LaneCManualScriptLeaseAdoptionTest';

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
import fs             from 'fs/promises';
import path           from 'path';

/**
 * @summary Lane C of #11503 — verifies that the four operator-runnable heavy-maintenance CLI
 * scripts wrap their substrate-heavy work with the shared `withHeavyMaintenanceLease` primitive
 * (PR #11506 / #11505) and handle the `held` outcome with a clean non-error exit.
 *
 * This spec uses content-verification (parse the script source for the expected import +
 * wrapper call + held-status branch) rather than subprocess execution because:
 * - Each script imports services.mjs / Neo / lifecycle services that initialize on module load,
 *   making subprocess-per-test runs slow (multi-second) and flaky if any background daemon
 *   is contending the same Chroma instance.
 * - The underlying `withHeavyMaintenanceLease` is already tested by PR #11506's
 *   `HeavyMaintenanceLeaseService.spec.mjs` (8/8 passing); Lane C just needs to verify the
 *   WIRING is in place across all four scripts.
 *
 * Empirical anchor: today's wedge cascade at 2026-05-16T19:27Z showed the orchestrator's own
 * kbSync subprocess in a collision class that would have allowed a manual `npm run ai:sync-kb`
 * to compound the contention. Lane C closes that class at the script surface; this spec
 * proves the wiring landed.
 *
 * @see #11503 (umbrella)
 * @see #11505 (lease primitive ticket) / PR #11506 (lease primitive implementation)
 * @see #11507 (this ticket)
 */
test.describe('Lane C / #11507 — manual heavy-maintenance script lease adoption', () => {
    const scriptDir = path.resolve(process.cwd(), 'buildScripts/ai');

    /**
     * Maps each script to its expected lease `owner` string. Owner strings are stable
     * identifiers used by both the wrapper-side defer message and the orchestrator-side
     * task names — keep these in sync with `Orchestrator.mjs` DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES.
     */
    const SCRIPTS = [
        {file: 'runSandman.mjs',           owner: 'sandman'},
        {file: 'syncKnowledgeBase.mjs',    owner: 'kbSync'},
        {file: 'backup.mjs',               owner: 'backup'},
        {file: 'syncGithubWorkflow.mjs',   owner: 'syncGithubWorkflow'}
    ];

    for (const {file, owner} of SCRIPTS) {
        test(`${file}: imports withHeavyMaintenanceLease`, async () => {
            const source = await fs.readFile(path.join(scriptDir, file), 'utf-8');
            expect(source).toMatch(/import\s*\{[^}]*withHeavyMaintenanceLease[^}]*\}\s*from\s*['"]\.\.\/\.\.\/ai\/daemons\/services\/HeavyMaintenanceLeaseService\.mjs['"]/);
        });

        test(`${file}: wraps heavy work with withHeavyMaintenanceLease + correct owner '${owner}'`, async () => {
            const source = await fs.readFile(path.join(scriptDir, file), 'utf-8');
            // Assert the wrapper is INVOKED (not just imported)
            expect(source).toContain('withHeavyMaintenanceLease(');
            // Assert the correct owner string is passed
            expect(source).toMatch(new RegExp(`owner\\s*:\\s*['"]${owner}['"]`));
            // Assert the manual-cli reason tag is in place (distinguishes CLI invocations from orchestrator-spawned ones in lease telemetry)
            expect(source).toMatch(/reason\s*:\s*['"]manual-cli['"]/);
        });

        test(`${file}: handles 'held' outcome with non-error exit + diagnostic message`, async () => {
            const source = await fs.readFile(path.join(scriptDir, file), 'utf-8');
            // Assert the held-status branch exists
            expect(source).toMatch(/status\s*===\s*['"]held['"]/);
            // Assert the deferred message names the active owner (so the user sees who holds the lease)
            expect(source).toMatch(/Deferred:.*lease held by/i);
            // Assert process.exit(0) is called on held — non-error semantics per AC2
            expect(source).toMatch(/process\.exit\(0\)/);
        });
    }

    test('all four scripts share the same lease-wrapper pattern (no per-script private locks)', async () => {
        // Empirical anchor: #11503 explicitly named "per-script private locks" as an avoided
        // trap. This test pins that none of the four scripts introduces an alternative
        // lock-file or in-process mutex — they all consume the shared lease primitive.
        for (const {file} of SCRIPTS) {
            const source = await fs.readFile(path.join(scriptDir, file), 'utf-8');
            expect(source).not.toMatch(/private.*lock|local.*mutex|script.*lock.*file/i);
            // Each script must import from the same canonical lease module path; no alternate
            // lease implementations.
            expect(source).toContain('ai/daemons/services/HeavyMaintenanceLeaseService.mjs');
        }
    });
});
