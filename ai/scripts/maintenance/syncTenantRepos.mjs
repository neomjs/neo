#!/usr/bin/env node
/**
 * @summary Container-plane one-shot run path for the tenant-repo-sync lane.
 *
 * Forces a single sweep of the cloud-deployable tenant-repo-sync cycle outside the
 * Orchestrator's periodic schedule. Deployment owners invoke it inside the
 * orchestrator container for bootstrap (initial ingest after first deploy), a
 * one-off after a config change, or scoped re-sync of a specific tenant repo.
 *
 * Usage:
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs                # all configured tenantRepos
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug <slug>  # subset
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --repo-slug a/b --repo-slug c/d  # multiple
 *   node ./ai/scripts/maintenance/syncTenantRepos.mjs --full --repo-slug <slug>  # scoped full replay
 *
 * Exit code: 0 on `completed`, 1 on `failed` or `skipped`
 * (no-tenant-repos-configured), 2 on argument error, 3 when a selected
 * repo slug is not configured, and 4 when another heavy-maintenance task or
 * tenant-repo-sync process holds either cross-process lease. The outer global
 * lease prevents overlap with Dream/REM and other heavy lanes; the existing inner
 * lease serializes tenant-sync entry paths over the shared revisions manifest.
 * A held lease is a bounded busy result, never a silent race.
 *
 * Mirrors the container-side pattern of `ai/scripts/maintenance/backup.mjs` and the
 * other `./maintenance/*` scripts — bootstrap Neo namespace then invoke a service.
 *
 * @see ai/daemons/orchestrator/services/TenantRepoSyncService.mjs
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md
 */

import Neo             from '../../../src/Neo.mjs';
import * as core       from '../../../src/core/_export.mjs';
import {pathToFileURL} from 'url';

import AiConfig              from '../../config.mjs';
import TenantRepoSyncService from '../../daemons/orchestrator/services/TenantRepoSyncService.mjs';
import {
    resolveHeavyMaintenanceLeasePath,
    shouldYieldHeavyMaintenanceLease,
    withHeavyMaintenanceLease
} from '../../daemons/orchestrator/services/HeavyMaintenanceLeaseService.mjs';
import {
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED
} from '../../daemons/orchestrator/services/TenantRepoSyncErrors.mjs';

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
    const args = {fullReplay: false, repoSlugs: [], clearBackoff: false};
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
        } else if (v === '--clear-backoff') {
            args.clearBackoff = true;
        } else if (v === '--help' || v === '-h') {
            args.help = true;
        } else {
            throw new Error(`Unknown argument: ${v}`);
        }
    }

    if (args.fullReplay && args.repoSlugs.length === 0) {
        throw new Error('--full requires at least one --repo-slug selector.')
    }

    // The two modes answer different questions and must not be combined: --full says "re-ingest
    // this repo from a null base", --clear-backoff says "let this repo attempt again on its normal
    // cadence". Silently running one while the operator asked for both is the kind of no-op this
    // path exists to eliminate.
    if (args.clearBackoff && args.fullReplay) {
        throw new Error('--clear-backoff cannot be combined with --full; clear the backoff, then run the replay if you still want one.')
    }

    return args;
}

function printHelp() {
    console.log(`Usage: node ./ai/scripts/maintenance/syncTenantRepos.mjs [--repo-slug <slug>]... [--full | --clear-backoff]

Forces a single tenant-repo-sync sweep. With no flags, processes every configured
tenantRepo. Pass --repo-slug to scope to a specific repo (repeatable).
Pass --full only with one or more --repo-slug selectors to rebuild those repos
from a null revision base. Stored checkpoints advance only after an error-free replay.

Runs first acquire the deployment-wide heavy-maintenance lease, then the
tenant-repo-sync lease next to the revisions manifest. If Dream/REM, another
heavy lane, or another sync is active, this CLI exits immediately with code 4
instead of racing it. Crashed lease owners recover automatically; simply re-run.

Pass --clear-backoff to reset the per-repo failure streak that drives suppression,
without a process restart and without touching stored checkpoints. Scope it with
--repo-slug, or omit the selector to clear every configured repo. The next sweep
re-reads the manifest, so the release is observed without restarting the daemon.
Use it after repairing a shared dependency, when the streak recorded during the
outage would otherwise suppress a lane that now works.

Exit codes:
  0  completed (or partial-completed with at least one repo successful)
  1  failed (all repos failed) or skipped (no configured tenantRepos)
  3  --repo-slug requested but the named repo is not configured (KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED)
  4  another heavy task or tenant sync holds a required lease — retry after it finishes
  2  argument-parse error`);
}

/**
 * Stand-in TaskStateService for the container one-shot path: provides only the methods the
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
function buildRunTaskOptions({parsed, taskStateService, writeLog, leaseShouldYield = null}) {
    return {
        reason       : 'manual',
        taskStateService,
        writeLog,
        onlyRepoSlugs: parsed.repoSlugs.length > 0 ? parsed.repoSlugs : undefined,
        fullReplay   : parsed.fullReplay,
        leaseShouldYield
    }
}

/**
 * @summary Builds the outer heavy-maintenance lease's fairness vote for the sweep beneath it.
 *
 * `maxActiveHoldMs` is on `orchestrator.heavyMaintenance`, not the sibling `heavyMaintenanceLease`
 * (which carries only `staleAfterMs`); a falsy bound never votes to yield.
 *
 * @param {Object|null} acquisition The descriptor `withHeavyMaintenanceLease` passes to its task.
 * @returns {Function|null} `() => Boolean`, or `null` when no lease is held — the sweep then runs on
 *     its slice budget alone.
 */
function buildLeaseYieldPredicate(acquisition) {
    if (!acquisition?.lease) {
        return null
    }

    return () => shouldYieldHeavyMaintenanceLease(acquisition.lease, {
        maxActiveHoldMs: AiConfig.orchestrator.heavyMaintenance.maxActiveHoldMs
    })
}

/**
 * @summary Runs one container-plane tenant sync under the global heavy-maintenance lease.
 *
 * The service retains its narrower tenant-repo-sync lease inside `runTask`; this
 * outer lease adds the scheduler's deployment-wide exclusion contract without
 * duplicating the service's checkpoint or result handling.
 *
 * @param {Object} options
 * @param {{fullReplay: Boolean, repoSlugs: String[]}} options.parsed
 * @param {Object} options.taskStateService
 * @param {Function} options.writeLog
 * @param {Function} [options.runTaskImpl] Test seam for the service dispatch.
 * @param {Function|null} [options.withLeaseImpl] Test seam for the lease wrapper.
 * @param {Function} [options.clearBackoffImpl] Test seam for the clear-backoff dispatch.
 * @returns {Promise<Object>} Global lease outcome containing the service result when admitted.
 */
function runTenantRepoSyncWithGlobalLease({
    parsed,
    taskStateService,
    writeLog,
    runTaskImpl      = options => TenantRepoSyncService.runTask(options),
    withLeaseImpl    = null,
    clearBackoffImpl = options => TenantRepoSyncService.clearTenantRepoBackoff(options)
}) {
    const withLease = withLeaseImpl ?? withHeavyMaintenanceLease;

    // Both modes run UNDER the same lease, and that is not symmetry for its own sake: the clear
    // rewrites the very revisions manifest a concurrent sweep reads at its top and writes at its
    // end. Outside the lease this would race a sweep mid-flight and could drop a checkpoint the
    // sweep had just committed — losing ingestion progress to fix a backoff, which is a strictly
    // worse trade than the wait it removes.
    const invoke = parsed.clearBackoff
        ? () => clearBackoffImpl({
            onlyRepoSlugs: parsed.repoSlugs.length > 0 ? parsed.repoSlugs : null,
            writeLog
        })
        // The sweep alone gets the lease vote: a sweep across N repos honours every per-repo slice
        // budget yet occupies the shared slot for roughly N × sliceBudgetMs. The clear-backoff branch
        // is a short manifest rewrite that must finish atomically, so a yield there could half-apply it.
        : acquisition => runTaskImpl(buildRunTaskOptions({
            parsed,
            taskStateService,
            writeLog,
            leaseShouldYield: buildLeaseYieldPredicate(acquisition)
        }));

    return withLease(
        invoke,
        {
            leasePath   : resolveHeavyMaintenanceLeasePath({dataDir: AiConfig.orchestrator.dataDir}),
            owner       : 'tenant-repo-sync',
            reason      : parsed.clearBackoff ? 'container-clear-backoff' : 'container-one-shot',
            staleAfterMs: AiConfig.orchestrator.heavyMaintenanceLease.staleAfterMs,
            metadata    : {script: 'ai/scripts/maintenance/syncTenantRepos.mjs'}
        }
    );
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

    const outcome = await runTenantRepoSyncWithGlobalLease({
        parsed,
        taskStateService,
        writeLog
    });

    if (outcome.status === 'held') {
        const holder = outcome.lease?.owner || 'unknown';
        console.error(`Deferred: heavy-maintenance lease held by ${holder}. Retry after it finishes.`);
        process.exit(4);
    }

    const result = outcome.result;

    console.log(JSON.stringify(result, null, 2));

    if (result.details?.reasonCode === KB_TENANT_REPO_SYNC_LEASE_HELD) {
        console.error(
            `Another tenant-repo sync holds the cross-process lease (owner: ${result.details.leaseOwner}, ` +
            `expires: ${result.details.leaseExpiresAt}). Retry after it finishes.`
        );
    }

    process.exit(resolveExitCode(result));
}

/**
 * @summary Maps a `TenantRepoSyncService.runTask` result to the CLI's documented exit code.
 *
 * Kept pure and exported so the exit-code contract is unit-testable without
 * spawning the CLI. The mapping is part of the operator interface: runbooks and
 * pipelines branch on these codes, so changes here are contract changes.
 *
 * @param {Object} result `{status, details}` shape returned by `runTask`.
 * @returns {Number} 0 completed · 4 cross-process lease held · 3 requested repo not configured · 1 failed/skipped otherwise.
 */
function resolveExitCode(result) {
    if (result.status === 'completed') {
        return 0;
    }
    if (result.details?.reasonCode === KB_TENANT_REPO_SYNC_LEASE_HELD) {
        return 4;
    }
    if (result.status === 'failed' && result.details?.reasonCode === KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED) {
        return 3;
    }
    return 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
    main().catch(err => {
        console.error('Fatal:', err.message);
        if (err.stack) console.error(err.stack);
        process.exit(2);
    })
}

export {buildLeaseYieldPredicate, buildRunTaskOptions, parseArgs, resolveExitCode, runTenantRepoSyncWithGlobalLease};
