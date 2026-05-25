#!/usr/bin/env node
/**
 * @summary Manual / operator-facing run path for the tenant-repo-sync lane.
 *
 * Forces a single sweep of the cloud-deployable tenant-repo-sync cycle outside the
 * Orchestrator's periodic schedule. Operators run this for: bootstrap (initial
 * ingest after first deploy), one-off after a config change, or scoped re-sync of a
 * specific tenant repo.
 *
 * Usage:
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs                # all configured tenantRepos
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug <slug>  # subset
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug a/b --repo-slug c/d  # multiple
 *
 * Exit code: 0 on `completed`, 1 on `failed` or `skipped` (no-tenant-repos-configured).
 *
 * Mirrors the operator-side pattern of `ai/scripts/maintenance/backup.mjs` and the
 * other `./maintenance/*` scripts — bootstrap Neo namespace then invoke a service.
 *
 * @see ai/daemons/orchestrator/services/TenantRepoSyncService.mjs
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md
 */

import Neo from '../../../src/Neo.mjs';
import * as core from '../../../src/core/_export.mjs';

import TenantRepoSyncService from '../../daemons/orchestrator/services/TenantRepoSyncService.mjs';

function parseArgs(argv) {
    const args = {repoSlugs: []};
    for (let i = 2; i < argv.length; i++) {
        const v = argv[i];
        if (v === '--repo-slug' || v === '-r') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error(`--repo-slug requires a value (got ${next || 'nothing'})`);
            }
            args.repoSlugs.push(next);
            i++;
        } else if (v === '--help' || v === '-h') {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${v}`);
        }
    }
    return args;
}

function printHelp() {
    console.log(`Usage: node ./ai/scripts/maintenance/syncTenantRepos.mjs [--repo-slug <slug>]...

Forces a single tenant-repo-sync sweep. With no flags, processes every configured
tenantRepo. Pass --repo-slug to scope to a specific repo (repeatable).

Exit codes:
  0  completed (or partial-completed with at least one repo successful)
  1  failed (all repos failed) or skipped (no configured tenantRepos)
  3  --repo-slug requested but the named repo is not configured (KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED)
  2  argument-parse error`);
}

/**
 * Stand-in TaskStateService for the manual run path: provides only the methods the
 * service touches (markStarted/markCompleted/markSkipped/markFailed/getTaskState) so
 * the lane-runner doesn't need a real persistent state file for a one-shot CLI invoke.
 */
function createInMemoryTaskStateService() {
    const taskState = {};
    return {
        getTaskState(taskName) {
            return taskState[taskName];
        },
        markStarted(taskName, reason) {
            taskState[taskName] = {running: true, reason, startedAt: Date.now()};
        },
        markCompleted(taskName) {
            taskState[taskName] = {...taskState[taskName], running: false, completedAt: Date.now()};
        },
        markSkipped(taskName) {
            taskState[taskName] = {...taskState[taskName], running: false, skippedAt: Date.now()};
        },
        markFailed(taskName) {
            taskState[taskName] = {...taskState[taskName], running: false, failedAt: Date.now()};
        }
    };
}

async function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv);
    } catch (e) {
        console.error(e.message);
        printHelp();
        process.exit(2);
    }

    if (parsed.help) {
        printHelp();
        process.exit(0);
    }

    const taskStateService = createInMemoryTaskStateService();
    const writeLog = (level, msg) => console.log(`[${level}] ${msg}`);

    const result = await TenantRepoSyncService.runTask({
        reason          : 'manual',
        taskStateService,
        writeLog,
        onlyRepoSlugs   : parsed.repoSlugs.length > 0 ? parsed.repoSlugs : undefined
    });

    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'completed') {
        process.exit(0);
    }
    if (result.status === 'failed' && result.details?.reasonCode === 'KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED') {
        process.exit(3);
    }
    process.exit(1);
}

main().catch(err => {
    console.error('Fatal:', err.message);
    if (err.stack) console.error(err.stack);
    process.exit(2);
});
