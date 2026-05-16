// Neo namespace bootstrap (entry-point invariant) — required for any consumer
// of the Neo singleton API. `InstanceManager` binds Neo.find/findFirst/get aliases
// and consumes pre-singleton `Neo.idMap`. Symmetric with `syncKnowledgeBase.mjs`.
import Neo               from '../../src/Neo.mjs';
import * as core         from '../../src/core/_export.mjs';
import InstanceManager   from '../../src/manager/Instance.mjs';
import GH_Config         from '../../ai/mcp/server/github-workflow/config.mjs';
import GH_SyncService    from '../../ai/services/github-workflow/SyncService.mjs';

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
 * **Pattern parallel:** `buildScripts/ai/syncKnowledgeBase.mjs` — same shape
 * (Neo namespace bootstrap + service singleton + `.runFullSync()` analog +
 * exit-on-completion).
 *
 * **Authority anchors:**
 * - ADR 0004 §1.3 (regeneratable cache) + §3.6 (clean-slate purge) — the workflow
 *   this script enables
 * - #11451 / PR #11461 — Phase 1 Task 10 close-out that surfaced the CLI gap
 * - #11469 — this ticket
 *
 * @example
 *   npm run ai:sync-github-workflow
 *
 *   # Full output streamed to stdout/stderr (no MCP timeout ceiling).
 *   # Exit code 0 on success / 1 on failure.
 */

async function syncGithubWorkflow() {
    GH_Config.data.debug = true;

    console.log('🔄 Starting full GitHub Workflow sync via GH_SyncService.runFullSync()...');

    try {
        const result = await GH_SyncService.runFullSync();
        console.log('✅ Sync complete:', result);
        process.exit(0);
    } catch (e) {
        console.error('❌ Sync failed:', e);
        process.exit(1);
    }
}

syncGithubWorkflow();
