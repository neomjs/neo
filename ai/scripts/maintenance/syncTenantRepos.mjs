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
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --full --repo-slug <slug>  # scoped full replay
 *
 * Exit code: 0 on `completed`, 1 on `failed` or `skipped`
 * (no-tenant-repos-configured), 2 on argument error, and 3 when a selected
 * repo slug is not configured.
 *
 * Mirrors the operator-side pattern of `ai/scripts/maintenance/backup.mjs` and the
 * other `./maintenance/*` scripts — bootstrap Neo namespace then invoke a service.
 *
 * @see ai/daemons/orchestrator/services/TenantRepoSyncService.mjs
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md
 */

import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import {pathToFileURL} from 'url';

import TenantRepoSyncService from '../../daemons/orchestrator/services/TenantRepoSyncService.mjs';

/**
 * @summary Parses manual tenant-repo-sync selectors and scoped replay intent.
 *
 * Full replay is intentionally unavailable without at least one explicit repo
 * selector. This prevents an accidental deployment-wide reset of incremental
 * envelope bases.
 *
 * @param {String[]} argv Node-style argv including executable and script path.
 * @returns {Object} Parsed replay intent, optional help flag, and selected repo slugs.
 */
function parseArgs(argv) {
    const args = {fullReplay: false, repoSlugs: []};
    for (let i = 2; i < argv.length; i++) {
        const v = argv[i];
        if (v === '--repo-slug' || v === '-r') {
            const next = argv[i + 1];
            if (!next || next.startsWith('-')) {
                throw new Error(`--repo-slug requires a value (got ${next || 'nothing'})`);
            }
            args.repoSlugs.push(next);
            i++;
        } else if (v === '--full') {
            args.fullReplay = true;
        } else if (v === '--help' || v === '-h') {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${v}`);
        }
    }

    if (args.fullReplay && args.repoSlugs.length === 0) {
        throw new Error('--full requires at least one --repo-slug selector.')
    }

    return args;
}

function printHelp() {
    console.log(`Usage: node ./ai/scripts/maintenance/syncTenantRepos.mjs [--repo-slug <slug>]... [--full]

Forces a single tenant-repo-sync sweep. With no flags, processes every configured
tenantRepo. Pass --repo-slug to scope to a specific repo (repeatable).
Pass --full only with one or more --repo-slug selectors to rebuild those repos
from a null revision base. Stored checkpoints advance only after an error-free replay.

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

/**
 * @summary Builds the service dispatch envelope from validated CLI arguments.
 * @param {Object} options
 * @param {{fullReplay: Boolean, repoSlugs: String[]}} options.parsed
 * @param {Object} options.taskStateService
 * @param {Function} options.writeLog
 * @returns {Object}
 */
function buildRunTaskOptions({parsed, taskStateService, writeLog}) {
    return {
        reason       : 'manual',
        taskStateService,
        writeLog,
        onlyRepoSlugs: parsed.repoSlugs.length > 0 ? parsed.repoSlugs : undefined,
        fullReplay   : parsed.fullReplay
    }
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
    const writeLog         = (level, msg) => console.log(`[${level}] ${msg}`);

    const result = await TenantRepoSyncService.runTask(buildRunTaskOptions({
        parsed,
        taskStateService,
        writeLog
    }));

    console.log(JSON.stringify(result, null, 2));

    if (result.status === 'completed') {
        process.exit(0);
    }
    if (result.status === 'failed' && result.details?.reasonCode === 'KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED') {
        process.exit(3);
    }
    process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main().catch(err => {
        console.error('Fatal:', err.message);
        if (err.stack) console.error(err.stack);
        process.exit(2);
    })
}

export {buildRunTaskOptions, parseArgs};
