// ---------------------------------------------------------------------------------------------
// DELIBERATE, TEMPORARY SDK-BOUNDARY EXCEPTION — retirement is enforced mechanically, see below.
//
// The canonical entry point is `ai/services.mjs` and this file's own SDK-boundary note still
// describes the rule correctly. The barrel is an EAGER 65-import graph, and two of its leaves
// (`services/knowledge-base/ChromaManager.mjs`, `services/memory-core/managers/ChromaManager.mjs`)
// import `chromadb` at module scope. `chromadb` ships only in the Brain install tier, so merely
// LOADING the barrel fails in the Body-tier CI this script runs in:
//
//   Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'chromadb'
//     imported from ai/services/knowledge-base/ChromaManager.mjs
//   [DataSync] stage "GitHub Workflow corpus" failed
//
// That freezes `resources/content/issues` AND `resources/content/discussions` — the corpus the
// duplicate-sweep fallback and semantic retrieval both read — for as long as it stands.
//
// The correct fix defers those two leaf imports, which is a real initialization refactor of both
// managers with ~20 external readers of `.client` plus a documented test seam. That is deliberately
// NOT bundled into a pipeline restore. This exception is the bridge, and it is not trusted to a
// comment: `syncGithubWorkflowImportException.spec.mjs` FAILS the moment the barrel becomes safe to
// import, which is what makes this self-expiring rather than permanent.
// ---------------------------------------------------------------------------------------------

// Neo namespace bootstrap, normally supplied by the barrel. Both look unused and are not: they
// populate `globalThis.Neo` before any service module body runs `Neo.setupClass`.
import Neo       from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

import GH_Config      from '../../mcp/server/github-workflow/config.mjs';
import GH_SyncService from '../../services/github-workflow/SyncService.mjs';
import AiConfig       from '../../config.mjs';

import {
    resolveHeavyMaintenanceLeasePath,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {pathToFileURL}             from 'url';
import {
    buildSyncGithubWorkflowDevBranchGuard,
    defaultSyncGithubWorkflowBranchDetector
} from './syncGithubWorkflowBranchGuard.mjs';

/**
 * @module ai/scripts/maintenance/syncGithubWorkflow
 * @summary CLI wrapper for full manual GitHub Workflow emission/delivery and pull-only
 * scheduled corpus emission into `resources/content/`.
 *
 * **Why this operator CLI is the canonical manual entry point:**
 *
 * The scheduled Data Sync pipeline invokes this CLI with `--emit-only`, delegating to
 * `GH_SyncService.emitGeneratedContentAndDerive({pushLocalChanges: false})`. Operators
 * retain the default `GH_SyncService.runFullSync()` mode, including its intentional
 * local-to-GitHub issue push. Native Graph projection is absent: the container-plane
 * core-corpus projection owner is its only admitted writer. The long-running emission is absent from the
 * agent MCP surface: clean-slate emission can span
 * ~8.5k issues + ~2.8k PRs + ~165 discussions + ~166 release notes and must stay
 * behind the shared heavy-maintenance lease rather than an MCP request timeout.
 *
 * The CLI:
 * - avoids an MCP request-timeout ceiling
 * - surfaces full stderr/stdout progress (each syncer logs phase-by-phase via
 *   `ai/mcp/server/github-workflow/logger.mjs`)
 * - keeps scheduled CI read-only at the GitHub API boundary while preserving the
 *   operator's full bi-directional mode
 *
 * **SDK boundary exception:** the file header owns the temporary direct-import rationale and its
 * self-expiring test. Neo/core imports preserve namespace bootstrap. There is no sync-on-startup
 * override anymore: that config leaf and its service branch were retired with the exclusive
 * container-plane projection owner.
 *
 * The authority boundary is the regeneratable-cache model: this script exists
 * to rebuild workflow mirrors outside the MCP request-timeout envelope.
 *
 * @example
 *   npm run ai:sync-github-workflow
 *   npm run ai:sync-github-workflow -- --verbose
 *   npm run ai:sync-github-workflow -- --emit-only
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
 * @summary CLI entry point for full manual sync or scheduled pull-only corpus emission.
 * @returns {Promise<void>}
 */
async function syncGithubWorkflow() {
    const
        emitOnly = process.argv.includes('--emit-only'),
        verbose  = process.argv.includes('--verbose');

    GH_Config.data.logLevel = verbose ? 'debug' : 'info';

    try {
        await assertSyncGithubWorkflowDevBranch();
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }

    console.log(emitOnly
        ? '🔄 Starting pull-only GitHub Workflow corpus emission...'
        : '🔄 Starting full GitHub Workflow sync via GH_SyncService.runFullSync()...');

    // Run the full workflow sync under the shared heavy-maintenance lease so this CLI
    // cannot collide with orchestrator maintenance tasks or another manual graph-heavy
    // script. The whole-run guard keeps graph ingestion protected until the sync stages
    // have a narrower concurrency boundary.
    let outcome;
    try {
        outcome = await withHeavyMaintenanceLease(
            async () => emitOnly
                ? GH_SyncService.emitGeneratedContentAndDerive({pushLocalChanges: false})
                : GH_SyncService.runFullSync(),
            {
                leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
                owner       : 'syncGithubWorkflow',
                reason      : 'manual-cli',
                staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
                metadata    : {emitOnly, script: 'ai/scripts/maintenance/syncGithubWorkflow.mjs', verbose}
            }
        );
    } catch (e) {
        console.error('❌ Sync failed:', e);
        process.exit(1);
    }

    if (outcome.status === 'held') {
        const held = outcome.lease;
        console.log(`⏸️  Deferred: heavy-maintenance lease held by '${held.owner}' (reason='${held.reason}', pid=${held.pid}, acquiredAt=${held.acquiredAt}).`);
        console.log('   This script will not run while another heavy-maintenance task is active.');
        process.exit(emitOnly ? 1 : 0);
    }

    console.log(emitOnly ? '✅ Corpus emission complete:' : '✅ Sync complete:', outcome.result);
    process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    syncGithubWorkflow();
}

export {assertSyncGithubWorkflowDevBranch, syncGithubWorkflow};
