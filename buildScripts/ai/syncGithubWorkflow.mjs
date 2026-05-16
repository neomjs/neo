import {GH_Config, GH_SyncService}     from '../../ai/services.mjs';
import {withHeavyMaintenanceLease}     from '../../ai/daemons/services/HeavyMaintenanceLeaseService.mjs';

/**
 * @module buildScripts/ai/syncGithubWorkflow
 * @summary CLI wrapper invoking `GH_SyncService.runFullSync()` for full
 * issue / PR / discussion / release-notes substrate emission into
 * `resources/content/`.
 *
 * **Why a CLI dual to the MCP `sync_all` tool exists:**
 *
 * Both invocation surfaces resolve to the same `GH_SyncService.runFullSync()`
 * orchestration entry point (referenced at `ai/services/github-workflow/SyncService.mjs`
 * + delegated to by `ai/services/github-workflow/toolService.mjs`'s `sync_all`
 * MCP handler). The MCP path is bound to MCP-request-response timing — fine for
 * delta-syncs (the "cached for fast no-ops" path) but inadequate for clean-slate
 * full emission post-ADR-0004 §3.6 purge (~8.5k issues + ~2.8k PRs + ~165
 * discussions + ~166 release notes via GraphQL pagination = many minutes).
 *
 * The CLI dual:
 * - bypasses the MCP request-timeout ceiling
 * - surfaces full stderr/stdout progress (each syncer logs phase-by-phase via
 *   `ai/mcp/server/github-workflow/logger.mjs`)
 * - leaves the underlying service untouched (no special-case "full vs delta"
 *   code path — the same `runFullSync()` runs in both invocations)
 *
 * **SDK boundary**: imports route through `ai/services.mjs` (the canonical SDK
 * entry point per `Neo.ai.services`), which handles Neo namespace bootstrap +
 * auto-disables sync-on-startup side-effects + applies Zod validation at the
 * service boundary. Mirrors the pattern established by `backup.mjs`,
 * `defragChromaDB.mjs`, and other operator-runnable CLI scripts. No direct
 * `ai/mcp/server/...` or `ai/services/...` deep imports.
 *
 * **Authority anchors:**
 * - ADR 0004 §1.3 (regeneratable cache) + §3.6 (clean-slate purge) — the workflow
 *   this script enables
 * - #11451 / PR #11461 — Phase 1 Task 10 close-out that surfaced the CLI gap
 * - #11469 — this ticket
 *
 * @example
 *   npm run ai:sync-github-workflow
 *   npm run ai:sync-github-workflow -- --verbose
 *
 *   # Full output streamed to stdout/stderr (no MCP timeout ceiling).
 *   # Exit code 0 on success / 1 on failure.
 */

async function syncGithubWorkflow() {
    const verbose = process.argv.includes('--verbose');
    GH_Config.data.logLevel = verbose ? 'debug' : 'info';

    console.log('🔄 Starting full GitHub Workflow sync via GH_SyncService.runFullSync()...');

    // Lane C of #11503 — wrap the heavy-maintenance work in the shared lease so this
    // CLI cannot collide with the orchestrator's kbSync / summary / dream / golden-path
    // tasks or with another manual heavy script (#11507 / #11505 lease primitive). Stage 2
    // graph ingestion in particular is the substrate-heavy concern (per AC7 / #11503);
    // whole-run guard is the v1 prescription pending future Stage 1 / Stage 2 split.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(
            async () => GH_SyncService.runFullSync(),
            {owner: 'syncGithubWorkflow', reason: 'manual-cli', metadata: {script: 'buildScripts/ai/syncGithubWorkflow.mjs', verbose}}
        );
    } catch (e) {
        console.error('❌ Sync failed:', e);
        process.exit(1);
    }

    if (outcome.status === 'held') {
        const held = outcome.lease;
        console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        console.log('   This script will not run while another heavy-maintenance task is active. Re-invoke once the active owner completes.');
        process.exit(0);
    }

    console.log('✅ Sync complete:', outcome.result);
    process.exit(0);
}

syncGithubWorkflow();
