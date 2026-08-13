import {setup} from '../../../../setup.mjs';

const appName = 'ManualHeavyMaintenanceScriptLeaseAdoptionTest';

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
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * @summary Verifies that operator-runnable heavy-maintenance CLI scripts wrap their
 * substrate-heavy work with the shared `withHeavyMaintenanceLease` primitive and handle
 * the `held` outcome with declared bounded exit semantics.
 *
 * Content-verification approach (parse the script source for the expected import +
 * wrapper call + held-status branch) rather than subprocess execution because each script
 * boots Neo + lifecycle services on module load, making subprocess-per-test runs slow and
 * contention-flaky. The underlying `withHeavyMaintenanceLease` is covered separately by
 * `HeavyMaintenanceLeaseService.spec.mjs`; this spec verifies the WIRING per script.
 */
test.describe('Manual heavy-maintenance script lease adoption', () => {
    const scriptsRoot = path.resolve(process.cwd(), 'ai/scripts');
    const scriptPath  = file => path.join(scriptsRoot, file);

    /**
     * Maps each script to its expected lease `owner` string. Owner strings are stable
     * identifiers used by both the wrapper-side defer message and the orchestrator-side
     * task names — keep these in sync with `MaintenanceBackpressureService.mjs` DEFAULT_HEAVY_MAINTENANCE_TASK_NAMES.
     */
    const SCRIPTS = [
        {
            file           : 'runners/runSandman.mjs',
            owner          : 'sandman',
            invocation     : 'withLease(',
            heldExitPattern: /exit\(0\)/
        },
        {
            file                 : 'lifecycle/backfill-memory-summaries.mjs',
            owner                : 'memory-summary-backfill',
            invocation           : 'withHeavyMaintenanceLease(',
            heldExitPattern      : /process\.exit\(0\)/,
            heldDiagnosticPattern: /heavy-maintenance-lease-held/
        },
        {
            file           : 'maintenance/syncKnowledgeBase.mjs',
            owner          : 'kbSync',
            invocation     : 'withHeavyMaintenanceLease(',
            heldExitPattern: /process\.exit\(0\)/
        },
        {
            file           : 'maintenance/defragChromaDB.mjs',
            owner          : 'defrag',
            invocation     : 'withLease(',
            heldExitPattern: /exit\(0\)/
        },
        {
            file           : 'maintenance/backup.mjs',
            owner          : 'backup',
            invocation     : 'withLeaseImpl ?? withHeavyMaintenanceLease',
            heldExitPattern: /process\.exit\(0\)/
        },
        {
            file           : 'maintenance/syncGithubWorkflow.mjs',
            owner          : 'syncGithubWorkflow',
            invocation     : 'withHeavyMaintenanceLease(',
            heldExitPattern: /process\.exit\(0\)/
        },
        {
            file           : 'maintenance/ingestTenant.mjs',
            owner          : 'kbIngest',
            invocation     : 'withHeavyMaintenanceLease(',
            heldExitPattern: /process\.exit\(0\)/
        },
        {
            file           : 'maintenance/syncTenantRepos.mjs',
            owner          : 'tenant-repo-sync',
            reason         : 'container-one-shot',
            invocation     : 'withLeaseImpl ?? withHeavyMaintenanceLease',
            heldExitPattern: /process\.exit\(4\)/
        }
    ];

    for (const {
        file,
        owner,
        reason = 'manual-cli',
        invocation,
        heldExitPattern,
        heldDiagnosticPattern = /Deferred:.*lease held by/i
    } of SCRIPTS) {
        test(`${file}: imports withHeavyMaintenanceLease`, async () => {
            const source          = await fs.readFile(scriptPath(file), 'utf-8');
            const canonicalImport = /import\s*\{[^}]*\}\s*from\s*['"]\.\.\/\.\.\/daemons\/orchestrator\/services\/HeavyMaintenanceLeaseService\.mjs['"]/;

            expect(source).toMatch(canonicalImport);
            expect(source.match(canonicalImport)[0]).toContain('withHeavyMaintenanceLease');
            expect(source.match(canonicalImport)[0]).toContain('resolveHeavyMaintenanceLeasePath');
        });

        test(`${file}: wraps heavy work with withHeavyMaintenanceLease + correct owner '${owner}'`, async () => {
            const source = await fs.readFile(scriptPath(file), 'utf-8');
            // Assert the wrapper is INVOKED (not just imported)
            const invocationIndex = source.indexOf(invocation);
            expect(invocationIndex).toBeGreaterThanOrEqual(0);

            // Scope all wiring assertions to the actual wrapper-options object. A leasePath
            // occurrence elsewhere in the file must not self-confirm this caller contract.
            const leasePathMatch = /leasePath\s*:\s*resolveHeavyMaintenanceLeasePath\(\{dataDir\s*:\s*AiConfig\.orchestrator\.dataDir\}\)/g;
            leasePathMatch.lastIndex = invocationIndex;
            const leasePathWiring = leasePathMatch.exec(source);
            expect(leasePathWiring, `${file}: configured leasePath must follow the wrapper invocation`).not.toBeNull();

            const optionsStart = source.lastIndexOf('{', leasePathWiring.index);
            expect(optionsStart, `${file}: wrapper options must begin before leasePath`).toBeGreaterThan(invocationIndex);

            const wrapperOptions = source.slice(optionsStart);
            expect(wrapperOptions).toMatch(new RegExp(
                `^\\{\\s*leasePath\\s*:\\s*resolveHeavyMaintenanceLeasePath\\(\\{dataDir\\s*:\\s*AiConfig\\.orchestrator\\.dataDir\\}\\)\\s*,` +
                `\\s*owner\\s*:\\s*['"]${owner}['"]\\s*,\\s*reason\\s*:\\s*['"]${reason}['"]`
            ));
        });

        test(`${file}: handles 'held' outcome with declared exit + diagnostic message`, async () => {
            const source = await fs.readFile(scriptPath(file), 'utf-8');
            // Assert the held-status branch exists
            expect(source).toMatch(/status\s*===\s*['"]held['"]/);
            // Interactive CLIs emit prose naming the holder; supervised children emit the structured
            // heavy-maintenance-lease-held outcome consumed by the orchestrator.
            expect(source).toMatch(heldDiagnosticPattern);
            // Assert the script's declared bounded held exit is present.
            expect(source).toMatch(heldExitPattern);
        });
    }

    test('runSandman.mjs: fail-closed on lease-acquisition error — does NOT continue to the REM cycle', async () => {
        // GPT's cycle-1 review caught: prior code set
        // process.exitCode=1 in the outer catch but FELL THROUGH to GraphService.decayGlobalTopology()
        // which mutates SQLite graph edges + _SYSTEM_STATE. That defeats the substrate protection the
        // lease exists to provide. ticket-ref-ok: load-bearing review-history anchor for this spec's existence.
        // PR is shipping — the one path where the lease was NOT acquired could still mutate the graph.
        //
        // Fix: exit(1) directly in the catch block to short-circuit before the canonical REM cycle.
        // This test pins the fail-closed contract via source inspection (subprocess test would require
        // heavy Neo + LifecycleService bootstrap; content-grep matches this spec's existing pattern).
        const source = await fs.readFile(scriptPath('runners/runSandman.mjs'), 'utf-8');

        // Find the catch block that handles withHeavyMaintenanceLease acquisition failure.
        const acquisitionCatchMatch = source.match(/\}\s*catch\s*\([^)]+\)\s*\{[^}]*REM cycle lease acquisition failed[\s\S]*?\n\s{4}\}/);
        expect(acquisitionCatchMatch).not.toBeNull();
        const catchBlock = acquisitionCatchMatch[0];

        // The catch block MUST call exit(1) to short-circuit (not just set exitCode then fall through).
        expect(catchBlock).toMatch(/exit\(1\)/);

        // Defensive: ensure the catch block does NOT contain the prior buggy pattern
        // (`process.exitCode = 1` without a subsequent `process.exit`).
        const hasExitCodeAssignment = /process\.exitCode\s*=\s*1/.test(catchBlock);
        const hasExitCall           = /exit\(1\)/               .test(catchBlock);
        if (hasExitCodeAssignment) {
            expect(hasExitCall).toBe(true);
        }
    });

    test('runSandman.mjs: canonical REM cycle runs INSIDE the lease window with graph decay enabled', async () => {
        // GPT's cycle-2 review caught: `withHeavyMaintenanceLease` releases the lease in its
        // own `finally` BEFORE returning, so calling `GraphService.decayGlobalTopology()` AFTER
        // `await withHeavyMaintenanceLease(...)` settles would mutate Memory Core graph state
        // OUTSIDE the lease — defeating the substrate protection this PR is shipping.
        //
        // Current SSOT shape: DreamService.executeRemCycle() owns graph decay. The CLI must call
        // that canonical cycle with `includeDecay: true` from inside the async task passed to
        // `withHeavyMaintenanceLease`; any post-wrapper call would run after lease release.
        //
        // This test pins the release-timing invariant via source-offset comparison:
        // the REM call MUST appear before the wrapper's owner-config trailer AND before any
        // post-wrapper outcome handling — both of which mark the boundary where the lease has
        // already been released by the wrapper.
        const source = await fs.readFile(scriptPath('runners/runSandman.mjs'), 'utf-8');

        const remCallMatch = source.match(/dreamService\.executeRemCycle\(\{[\s\S]*?includeDecay\s*:\s*true[\s\S]*?\}\)/);
        expect(remCallMatch, 'DreamService.executeRemCycle({includeDecay:true}) call must exist in runSandman.mjs').not.toBeNull();

        // The wrapper's options trailer `}, {owner: 'sandman', ...})` marks the end of the
        // async-task argument. The REM cycle must appear textually BEFORE this trailer to be inside
        // the wrapped task.
        const wrapperOptionsMatch = source.match(
            /\}\s*,\s*\{\s*leasePath\s*:\s*resolveHeavyMaintenanceLeasePath\([^)]*\)\s*,\s*owner\s*:\s*['"]sandman['"]/
        );
        expect(wrapperOptionsMatch, "withHeavyMaintenanceLease wrapper's owner-config trailer must exist").not.toBeNull();
        expect(
            remCallMatch.index,
            'the REM cycle must run INSIDE the wrapped task (before the wrapper-options trailer) so its graph decay executes while the lease is still held'
        ).toBeLessThan(wrapperOptionsMatch.index);

        // Defensive: also assert the REM call appears BEFORE post-wrapper held-handling. Any
        // call after the `if (outcome?.status === 'held')` branch would necessarily run after
        // the wrapper's release and outside the lease window.
        const postWrapperMarkerMatch = source.match(/if\s*\(\s*outcome\?\.status\s*===\s*['"]held['"]\s*\)/);
        expect(postWrapperMarkerMatch, 'post-wrapper held-handling branch must exist').not.toBeNull();
        expect(
            remCallMatch.index,
            'the REM cycle must NOT appear after the post-wrapper held-check — that position is outside the lease window'
        ).toBeLessThan(postWrapperMarkerMatch.index);
    });

    test('all heavy maintenance scripts share the same lease-wrapper pattern (no per-script private locks)', async () => {
        // Empirical anchor: the original lease-work explicitly named "per-script private locks" as
        // an avoided trap (ticket-ref-ok: load-bearing design-history anchor). This test pins that
        // none of the heavy-maintenance scripts introduces an alternative
        // lock-file or in-process mutex — they all consume the shared lease primitive.
        for (const {file} of SCRIPTS) {
            const source = await fs.readFile(scriptPath(file), 'utf-8');
            expect(source).not.toMatch(/private.*lock|local.*mutex|script.*lock.*file/i);
            // Each script must import from the same canonical lease module path; no alternate
            // lease implementations.
            expect(source).toContain('daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs');
        }
    });
});
