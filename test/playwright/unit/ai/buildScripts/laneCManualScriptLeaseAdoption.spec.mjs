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
            expect(source).toMatch(/import\s*\{[^}]*withHeavyMaintenanceLease[^}]*\}\s*from\s*['"]\.\.\/\.\.\/ai\/daemons\/orchestrator\/services\/HeavyMaintenanceLeaseService\.mjs['"]/);
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

    test('runSandman.mjs: fail-closed on lease-acquisition error — does NOT fall through to GraphService.decayGlobalTopology (per GPT review PRR_kwDODSospM8AAAABAJIdTg)', async () => {
        // GPT's cycle-1 review (PR #11509 PRR_kwDODSospM8AAAABAJIdTg) caught: my prior code set
        // process.exitCode=1 in the outer catch but FELL THROUGH to GraphService.decayGlobalTopology()
        // which mutates SQLite graph edges + _SYSTEM_STATE. That defeats the substrate protection the
        // PR is shipping — the one path where the lease was NOT acquired could still mutate the graph.
        //
        // Fix: process.exit(1) directly in the catch block to short-circuit before the decay call.
        // This test pins the fail-closed contract via source inspection (subprocess test would require
        // heavy Neo + LifecycleService bootstrap; content-grep matches this spec's existing pattern).
        const source = await fs.readFile(path.join(scriptDir, 'runSandman.mjs'), 'utf-8');

        // Find the catch block that handles withHeavyMaintenanceLease acquisition failure.
        const acquisitionCatchMatch = source.match(/\}\s*catch\s*\([^)]+\)\s*\{[^}]*REM cycle lease acquisition failed[\s\S]*?\n\s{4}\}/);
        expect(acquisitionCatchMatch).not.toBeNull();
        const catchBlock = acquisitionCatchMatch[0];

        // The catch block MUST call process.exit(1) to short-circuit (not just set exitCode then fall through).
        expect(catchBlock).toMatch(/process\.exit\(1\)/);

        // Defensive: ensure the catch block does NOT contain the prior buggy pattern
        // (`process.exitCode = 1` without a subsequent `process.exit`).
        const hasExitCodeAssignment = /process\.exitCode\s*=\s*1/.test(catchBlock);
        const hasExitCall           = /process\.exit\(1\)/      .test(catchBlock);
        if (hasExitCodeAssignment) {
            expect(hasExitCall).toBe(true);
        }
    });

    test('runSandman.mjs: decayGlobalTopology runs INSIDE the lease window (per GPT review PRR_kwDODSospM8AAAABAJKF8w)', async () => {
        // GPT's cycle-2 review caught: `withHeavyMaintenanceLease` releases the lease in its
        // own `finally` BEFORE returning, so calling `GraphService.decayGlobalTopology()` AFTER
        // `await withHeavyMaintenanceLease(...)` settles would mutate Memory Core graph state
        // OUTSIDE the lease — defeating the substrate protection this PR is shipping.
        //
        // Fix: decay is invoked inside an inner `finally` block within the async task passed
        // to `withHeavyMaintenanceLease`. JS guarantees the inner finally runs before the
        // task's returned promise settles, so the wrapper's own finally (release) runs strictly
        // after decay.
        //
        // This test pins the release-timing invariant via source-offset comparison:
        // the decay call MUST appear before the wrapper's owner-config trailer AND before any
        // post-wrapper outcome handling — both of which mark the boundary where the lease has
        // already been released by the wrapper.
        const source = await fs.readFile(path.join(scriptDir, 'runSandman.mjs'), 'utf-8');

        const decayMatch = source.match(/GraphService\.decayGlobalTopology\(\)/);
        expect(decayMatch, 'decayGlobalTopology() call must exist in runSandman.mjs').not.toBeNull();

        // The wrapper's options trailer `}, {owner: 'sandman', ...})` marks the end of the
        // async-task argument. Decay must appear textually BEFORE this trailer to be inside
        // the wrapped task.
        const wrapperOptionsMatch = source.match(/\}\s*,\s*\{\s*owner\s*:\s*['"]sandman['"]/);
        expect(wrapperOptionsMatch, "withHeavyMaintenanceLease wrapper's owner-config trailer must exist").not.toBeNull();
        expect(
            decayMatch.index,
            'decay must run INSIDE the wrapped task (before the wrapper-options trailer) so it executes while the lease is still held'
        ).toBeLessThan(wrapperOptionsMatch.index);

        // Defensive: also assert decay appears BEFORE post-wrapper held-handling. Any decay
        // call after the `if (outcome?.status === 'held')` branch would necessarily run after
        // the wrapper's release.
        const postWrapperMarkerMatch = source.match(/if\s*\(\s*outcome\?\.status\s*===\s*['"]held['"]\s*\)/);
        expect(postWrapperMarkerMatch, 'post-wrapper held-handling branch must exist').not.toBeNull();
        expect(
            decayMatch.index,
            'decay must NOT appear after the post-wrapper held-check — that position is outside the lease window'
        ).toBeLessThan(postWrapperMarkerMatch.index);

        // Defensive: the inner-task structure must contain a `finally {` block. This pins the
        // structural mechanism (finally-block placement) rather than just the offset ordering,
        // so a future refactor that accidentally moves decay into the wrapper's catch (which
        // only fires on lease-acquisition failure → graph mutation outside the lease) is caught.
        const innerFinallyMatch = source.match(/\}\s*finally\s*\{[\s\S]*?GraphService\.decayGlobalTopology\(\)/);
        expect(
            innerFinallyMatch,
            'decayGlobalTopology must be invoked from inside a `finally {` block of the lease-wrapped task'
        ).not.toBeNull();
    });

    test('all four scripts share the same lease-wrapper pattern (no per-script private locks)', async () => {
        // Empirical anchor: #11503 explicitly named "per-script private locks" as an avoided
        // trap. This test pins that none of the four scripts introduces an alternative
        // lock-file or in-process mutex — they all consume the shared lease primitive.
        for (const {file} of SCRIPTS) {
            const source = await fs.readFile(path.join(scriptDir, file), 'utf-8');
            expect(source).not.toMatch(/private.*lock|local.*mutex|script.*lock.*file/i);
            // Each script must import from the same canonical lease module path; no alternate
            // lease implementations.
            expect(source).toContain('ai/daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs');
        }
    });
});
