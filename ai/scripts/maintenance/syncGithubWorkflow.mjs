import {GH_Config, GH_SyncService}     from '../../services.mjs';
import {withHeavyMaintenanceLease}     from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {pathToFileURL}                 from 'url';
import {
    buildSyncGithubWorkflowDevBranchGuard,
    defaultSyncGithubWorkflowBranchDetector
} from './syncGithubWorkflowBranchGuard.mjs';

/**
 * @module ai/scripts/maintenance/syncGithubWorkflow
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
 * full emission after a clean-slate mirror purge (~8.5k issues + ~2.8k PRs + ~165
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
 * The authority boundary is the regeneratable-cache model: this script exists
 * to rebuild workflow mirrors outside the MCP request-timeout envelope while preserving
 * the same service path as `sync_all`.
 *
 * @example
 *   npm run ai:sync-github-workflow
 *   npm run ai:sync-github-workflow -- --verbose
 *
 *   # Full output streamed to stdout/stderr (no MCP timeout ceiling).
 *   # Exit code 0 on success / 1 on failure.
 */

/**
 * @summary Asserts that the GitHub Workflow sync CLI is running from dev.
 * @returns {Promise<void>}
 */
async function assertSyncGithubWorkflowDevBranch() {
    const
        projectRoot = GH_Config.projectRoot || GH_Config.data?.projectRoot || process.cwd(),
        guard       = buildSyncGithubWorkflowDevBranchGuard(
            async () => true,
            () => defaultSyncGithubWorkflowBranchDetector({projectRoot})
        );

    await guard();
}

/**
 * @summary CLI entry point for the full GitHub Workflow mirror sync.
 * @returns {Promise<void>}
 */
async function syncGithubWorkflow() {
    const verbose = process.argv.includes('--verbose');
    GH_Config.data.logLevel = verbose ? 'debug' : 'info';

    try {
        await assertSyncGithubWorkflowDevBranch();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    console.log('🔄 Starting full GitHub Workflow sync via GH_SyncService.runFullSync()...');

    // Run the full workflow sync under the shared heavy-maintenance lease so this CLI
    // cannot collide with incompatible maintenance tasks or another manual graph-heavy
    // script. `kbSync` is explicitly compatible: local KB embedding must not starve
    // issue graph refresh, and Golden Path waits on this task before reading the graph.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(
            async () => GH_SyncService.runFullSync(),
            {
                owner                : 'syncGithubWorkflow',
                reason               : 'manual-cli',
                compatibleLeaseOwners: ['kbSync'],
                metadata             : {script: 'ai/scripts/maintenance/syncGithubWorkflow.mjs', verbose}
            }
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

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    syncGithubWorkflow();
}

export {assertSyncGithubWorkflowDevBranch, syncGithubWorkflow};
