/**
 * @module ai/services/fleet/fleetTasksSource
 * @summary Brain-side, viewer-bound source for the Fleet cockpit's Tasks pane — WHAT the
 * deployment is doing, as three sections of provenance-labeled rows: running, queued / next, and
 * recently completed. It reads the existing truth verbs only (the orchestrator's deployment-state
 * snapshot, the Memory Core REM pipeline state, and — where the process can reach it — the
 * Knowledge Base's own ingestion progress), reduces each to bounded rows SERVER-SIDE, and answers
 * one envelope whose `sources` block names every axis as itself. No scheduler is simulated, no
 * progress is invented: a source that did not answer renders as its own typed state, and a row's
 * `progress` exists only where the wire reported a fraction or a backlog.
 *
 * The snapshot verb returns ~100 KB per read; only its task-shaped facts leave this module
 * (tenant repo sync, maintenance retry, recovery runs, self-heal freezes). Tenant and repository
 * NAMES never leave either — rows are labeled by the snapshot's identity hashes, so the cockpit's
 * own wire stays free of tenant identifiers by construction.
 */

import {redactReadFailure} from './redactReadFailure.mjs';

const
    CANONICAL_IDENTITY = /^@[A-Za-z0-9][A-Za-z0-9._-]*$/,
    /** @summary Rows per section; a section beyond it is a search problem, not a glance. */
    MAX_ROWS           = 12,
    /** @summary A REM cycle younger than this counts as "running", older ones are a queue fact. */
    REM_FRESH_MS       = 10 * 60 * 1000;

/**
 * @summary Coerce one supported time value to finite epoch milliseconds, or `null`.
 * @param {Date|String|Number|null|undefined} value
 * @returns {Number|null}
 * @private
 */
function toMsOrNull(value) {
    if (value === null || value === undefined || value === '') return null;

    const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value);

    return Number.isFinite(ms) ? ms : null
}

/**
 * @summary Render one epoch/ISO value as an ISO instant, or `null` when it is not a time.
 * @param {*} value
 * @returns {String|null}
 * @private
 */
function toIso(value) {
    const ms = toMsOrNull(value);

    return ms === null ? null : new Date(ms).toISOString()
}

/**
 * @summary A finite, non-negative integer or `null` — counts that are not counts do not render.
 * @param {*} value
 * @returns {Number|null}
 * @private
 */
function toCount(value) {
    return Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * @summary Build one row. Every row carries the same grammar so the pane renders one shape.
 * @param {Object} row
 * @param {String} row.id Stable, source-scoped identity (the Store key).
 * @param {'running'|'queued'|'recent'} row.section
 * @param {String} row.name One-line task name; never a tenant or repository name.
 * @param {'orchestrator'|'mc'|'kb'} row.source Provenance axis.
 * @param {String} row.state The state WORD the pane renders ("in progress" is first-class).
 * @param {String|null} [row.at] The row's governing instant, ISO.
 * @param {Object|null} [row.progress] `{kind:'determinate'|'backlog', done, total}` or null.
 * @param {String|null} [row.detail] One short qualifier line.
 * @returns {Object}
 * @private
 */
function makeRow({id, section, name, source, state, at = null, progress = null, detail = null}) {
    return {id, section, name, source, state, at, progress, detail}
}

/**
 * @summary A determinate-or-backlog progress fact — only when both numbers are real counts and
 * the total is non-zero; anything else is `null`, which the pane renders as the state word alone.
 * @param {'determinate'|'backlog'} kind
 * @param {*} done
 * @param {*} total
 * @returns {Object|null}
 * @private
 */
function makeProgress(kind, done, total) {
    const d = toCount(done),
          t = toCount(total);

    return d === null || t === null || t === 0 ? null : {kind, done: Math.min(d, t), total: t}
}

/**
 * @summary Reduce the deployment-state snapshot payload (the `get_deployment_state_snapshot`
 * result) to task rows. Pure: no clock reads, no I/O. Exported for the witness.
 *
 * Sources inside the snapshot, in the order the operator asks about them:
 * - `tenantRepoSync.task` — the pull-mode ingestion sweep: running now (running row) or its last
 *   completion (recent row);
 * - `tenantRepoSync.repos[]` — one queued row per repository carrying a `nextDueAt`, labeled by
 *   identity hash, with a backlog gauge where `corpusOutstanding` reports outstanding work;
 * - `maintenance.retry` — the next maintenance attempt, rendered under its own phase word;
 * - `recoveryRuns.entries[]` — actuator runs: in flight → running, otherwise recent;
 * - `selfHeal.summary.currentlyFrozen[]` — a frozen collection is a task the deployment is
 *   holding open, so it renders as running under the word "frozen".
 *
 * @param {Object|null} payload The verb's parsed result `{ok, status, snapshot}`.
 * @returns {{rows: Object[], state: String, reason: String|null, observedAt: String|null}}
 */
export function extractDeploymentRows(payload) {
    if (!payload || typeof payload !== 'object' || payload.ok !== true || !payload.snapshot || typeof payload.snapshot !== 'object') {
        return {
            rows      : [],
            state     : 'unavailable',
            reason    : typeof payload?.reason === 'string' ? payload.reason : 'deployment-snapshot-unavailable',
            observedAt: null
        }
    }

    const
        {snapshot}  = payload,
        state       = payload.status === 'stale' ? 'stale' : 'wired',
        observedAt  = toIso(snapshot.generatedAt),
        sync        = snapshot.tenantRepoSync && typeof snapshot.tenantRepoSync === 'object' ? snapshot.tenantRepoSync : null,
        task        = sync?.task && typeof sync.task === 'object' ? sync.task : null,
        repos       = Array.isArray(sync?.repos) ? sync.repos : [],
        retry       = snapshot.maintenance?.retry && typeof snapshot.maintenance.retry === 'object' ? snapshot.maintenance.retry : null,
        recoveries  = Array.isArray(snapshot.recoveryRuns?.entries) ? snapshot.recoveryRuns.entries : [],
        frozen      = Array.isArray(snapshot.selfHeal?.summary?.currentlyFrozen) ? snapshot.selfHeal.summary.currentlyFrozen : [],
        rows        = [];

    if (task) {
        if (task.running === true) {
            rows.push(makeRow({
                id     : 'orchestrator:tenant-sync:run',
                section: 'running',
                name   : 'Tenant repo sync',
                source : 'orchestrator',
                state  : 'in progress',
                at     : toIso(task.lastRunAt),
                detail : typeof task.lastReason === 'string' ? task.lastReason : null
            }))
        } else if (task.lastCompletion && typeof task.lastCompletion === 'object') {
            const
                done   = task.lastCompletion,
                counts = [
                    toCount(done.completedCount) !== null ? `${done.completedCount} synced` : null,
                    toCount(done.notDueCount)    !== null ? `${done.notDueCount} not due`   : null,
                    toCount(done.failedCount)    !== null ? `${done.failedCount} failed`    : null
                ].filter(Boolean);

            rows.push(makeRow({
                id     : 'orchestrator:tenant-sync:last',
                section: 'recent',
                name   : 'Tenant repo sync',
                source : 'orchestrator',
                state  : typeof done.status === 'string' ? done.status : 'completed',
                at     : toIso(task.lastSuccessAt ?? task.lastRunAt),
                detail : counts.length > 0 ? counts.join(' · ') : (typeof done.reason === 'string' ? done.reason : null)
            }))
        }
    }

    for (const repo of repos) {
        if (!repo || typeof repo !== 'object' || typeof repo.identityHash !== 'string' || repo.disabled === true) continue;

        const
            at          = toIso(repo.nextDueAt),
            outstanding = repo.corpusOutstanding && typeof repo.corpusOutstanding === 'object' ? repo.corpusOutstanding : null,
            settled     = toCount(outstanding?.settled),
            remaining   = toCount(outstanding?.remaining),
            failures    = toCount(repo.consecutiveFailures),
            detailBits  = [
                typeof repo.lastIngestedRev === 'string' && repo.lastIngestedRev ? `rev ${repo.lastIngestedRev.slice(0, 7)}` : null,
                failures > 0 ? `${failures} consecutive failures` : null
            ].filter(Boolean);

        if (!at) continue;

        rows.push(makeRow({
            id      : `orchestrator:tenant-sync:${repo.identityHash}`,
            section : 'queued',
            name    : `Repo sync · ${repo.identityHash.slice(0, 8)}`,
            source  : 'orchestrator',
            state   : repo.due === true ? 'due' : 'scheduled',
            at,
            progress: remaining > 0 && settled !== null ? makeProgress('backlog', settled, settled + remaining) : null,
            detail  : detailBits.length > 0 ? detailBits.join(' · ') : null
        }))
    }

    if (retry && toMsOrNull(retry.nextAttemptAtMs) !== null) {
        const remainingRetries = toCount(retry.retriesRemaining);

        rows.push(makeRow({
            id     : 'orchestrator:maintenance:retry',
            section: 'queued',
            name   : 'Maintenance retry',
            source : 'orchestrator',
            state  : typeof retry.phase === 'string' && retry.phase ? retry.phase : 'scheduled',
            at     : toIso(retry.nextAttemptAtMs),
            detail : remainingRetries !== null ? `${remainingRetries} retries remaining` : null
        }))
    }

    for (const entry of recoveries) {
        if (!entry || typeof entry !== 'object' || typeof entry.recoveryRunId !== 'string') continue;

        const
            target   = entry.targetIdentity && typeof entry.targetIdentity === 'object' ? entry.targetIdentity : null,
            label    = target && typeof target.id === 'string' ? `${typeof target.kind === 'string' ? target.kind + ' ' : ''}${target.id}` : 'unnamed target',
            finished = toIso(entry.completedAt),
            reason   = typeof entry.details?.reasonCode === 'string' ? entry.details.reasonCode : null;

        rows.push(makeRow({
            id     : `orchestrator:recovery:${entry.recoveryRunId}`,
            section: finished ? 'recent' : 'running',
            name   : `Recovery · ${label}`,
            source : 'orchestrator',
            state  : typeof entry.status === 'string' && entry.status ? entry.status : (finished ? 'completed' : 'in progress'),
            at     : finished ?? toIso(entry.updatedAt ?? entry.startedAt),
            detail : reason
        }))
    }

    for (const collection of frozen) {
        if (typeof collection !== 'string' || !collection) continue;

        rows.push(makeRow({
            id     : `orchestrator:self-heal:frozen:${collection}`,
            section: 'running',
            name   : `Self-heal freeze · ${collection}`,
            source : 'orchestrator',
            state  : 'frozen'
        }))
    }

    return {rows, state, reason: null, observedAt}
}

/**
 * @summary Reduce the REM pipeline state (`get_rem_pipeline_state`) to its one row: the digest
 * backlog. It is a RUNNING row only while a recent cycle is younger than {@link REM_FRESH_MS};
 * otherwise it is a queue fact, labeled "backlog" — a queue is not a task. Pure; exported for
 * the witness.
 * @param {Object|null} state The verb's parsed result `{undigested, digested, recentCycles}`.
 * @param {Number} nowMs
 * @returns {{rows: Object[], state: String, reason: String|null}}
 */
export function extractRemRows(state, nowMs) {
    const undigested = toCount(state?.undigested),
          digested   = toCount(state?.digested);

    if (undigested === null || digested === null) {
        return {rows: [], state: 'unavailable', reason: 'rem-payload-unrecognized'}
    }

    const
        cycles   = Array.isArray(state.recentCycles) ? state.recentCycles : [],
        latestMs = cycles.reduce((latest, cycle) => {
            const ms = toMsOrNull(cycle?.completedAt ?? cycle?.finishedAt ?? cycle?.at ?? cycle?.timestamp ?? cycle?.startedAt);

            return ms !== null && ms > latest ? ms : latest
        }, null),
        fresh    = latestMs !== null && nowMs - latestMs <= REM_FRESH_MS,
        total    = digested + undigested;

    return {
        rows: [makeRow({
            id      : 'mc:rem:digest',
            section : fresh ? 'running' : 'queued',
            name    : 'REM digest',
            source  : 'mc',
            state   : fresh ? 'in progress' : 'backlog',
            at      : latestMs === null ? null : new Date(latestMs).toISOString(),
            progress: makeProgress('backlog', digested, total),
            detail  : `${undigested} undigested · ${digested} digested`
        })],
        state : 'wired',
        reason: null
    }
}

/**
 * @summary Reduce the Knowledge Base's own ingestion progress (`get_ingestion_progress`) to rows:
 * an active run is a RUNNING row with a determinate fraction where chunks are counted (the
 * `stalled` flag earns the wedged word — text, never hue); an idle process contributes its last
 * run as a RECENT row. The verb is explicitly this-process-only, and the row's detail carries
 * that scope — the caveat is part of the truth. Tenant and repository identifiers in the payload
 * are deliberately NOT rendered. Pure; exported for the witness.
 * @param {Object|null} progress The verb's parsed result.
 * @returns {{rows: Object[], state: String, reason: String|null, scope: String|null}}
 */
export function extractIngestionRows(progress) {
    if (!progress || typeof progress !== 'object' || typeof progress.status !== 'string') {
        return {rows: [], state: 'unavailable', reason: 'ingestion-payload-unrecognized', scope: null}
    }

    const
        scope = typeof progress.observedScope === 'string' ? progress.observedScope : null,
        rows  = [];

    if (progress.active === true) {
        rows.push(makeRow({
            id      : 'kb:ingestion:run',
            section : 'running',
            name    : 'KB ingestion',
            source  : 'kb',
            state   : progress.stalled === true ? 'stalled' : (typeof progress.phase === 'string' && progress.phase ? progress.phase : 'in progress'),
            at      : toIso(progress.startedAt),
            progress: makeProgress('determinate', progress.embeddedChunks, progress.totalChunks),
            detail  : scope
        }))
    } else if (progress.lastRunSummary && typeof progress.lastRunSummary === 'object') {
        const
            last   = progress.lastRunSummary,
            chunks = toCount(last.embeddedChunks),
            errors = toCount(last.errorCount),
            bits   = [
                chunks !== null ? `${chunks} chunks` : null,
                errors !== null && errors > 0 ? `${errors} errors` : null,
                scope
            ].filter(Boolean);

        rows.push(makeRow({
            id     : 'kb:ingestion:last',
            section: 'recent',
            name   : 'KB ingestion',
            source : 'kb',
            state  : typeof last.status === 'string' && last.status ? last.status : 'completed',
            at     : toIso(last.completedAt ?? progress.completedAt),
            detail : bits.length > 0 ? bits.join(' · ') : null
        }))
    }

    return {rows, state: 'wired', reason: null, scope}
}

/**
 * @summary Order one section and cap it: running and recent newest-first, queued soonest-first;
 * rows without an instant sink to the end of their section.
 * @param {Object[]} rows
 * @param {'running'|'queued'|'recent'} section
 * @returns {Object[]}
 * @private
 */
function orderSection(rows, section) {
    const direction = section === 'queued' ? 1 : -1;

    return rows
        .filter(row => row.section === section)
        .sort((a, b) => {
            const am = toMsOrNull(a.at),
                  bm = toMsOrNull(b.at);

            if (am === null && bm === null) return 0;
            if (am === null) return 1;
            if (bm === null) return -1;

            return (am - bm) * direction
        })
        .slice(0, MAX_ROWS)
}

/**
 * @summary Create the process-lifetime Fleet tasks source.
 *
 * The transport-stamped viewer is resolved at EACH call (the trust-boundary discipline every
 * fleet source shares); the operations receive no viewer claim. `getIngestionProgress` is
 * OPTIONAL: the Knowledge Base's own ingestion verb is reachable only where this process holds a
 * Knowledge Base client (in-process mode), and an absent operation answers as the typed
 * `unwired` source state rather than a failure — the snapshot carries the deployment's real
 * ingestion lane in both modes.
 *
 * @param {Object} options
 * @param {Function} options.getDeploymentStateSnapshot Injected `get_deployment_state_snapshot`
 *     operation returning the parsed payload.
 * @param {Function} options.getRemPipelineState Injected `get_rem_pipeline_state` operation.
 * @param {Function} [options.getIngestionProgress] Injected `get_ingestion_progress` operation.
 * @param {Function} options.resolveViewerIdentity Returns the transport-stamped canonical @identity.
 * @param {Function} [options.now] Clock returning a Date/epoch/ISO value.
 * @returns {{readTasks: Function}}
 */
export function createFleetTasksSource({
    getDeploymentStateSnapshot,
    getRemPipelineState,
    getIngestionProgress = null,
    resolveViewerIdentity,
    now = () => new Date()
} = {}) {
    if (typeof getDeploymentStateSnapshot !== 'function' || typeof getRemPipelineState !== 'function' ||
        typeof resolveViewerIdentity !== 'function' || typeof now !== 'function') {
        throw new TypeError('createFleetTasksSource: getDeploymentStateSnapshot, getRemPipelineState, resolveViewerIdentity, and now are required')
    }

    if (getIngestionProgress !== null && typeof getIngestionProgress !== 'function') {
        throw new TypeError('createFleetTasksSource: getIngestionProgress must be a function when supplied')
    }

    const resolveViewer = async () => {
        const viewer = await resolveViewerIdentity();

        if (typeof viewer !== 'string' || !CANONICAL_IDENTITY.test(viewer)) {
            throw new Error('fleet tasks: authenticated ingress did not bind a canonical viewer identity')
        }

        return viewer
    };

    /**
     * @summary Run one operation and reduce its result; a throw becomes the typed `unavailable`
     * state carrying a sanitized detail, never a fabricated empty section.
     * @param {String} label
     * @param {Function} operation
     * @param {Function} reduce
     * @returns {Promise<Object>}
     */
    const readAxis = async (label, operation, reduce) => {
        try {
            return reduce(await operation({}))
        } catch (error) {
            const detail = redactReadFailure(error);

            console.warn(`[fleet] tasks ${label} read failed: ${detail ?? 'no legible error'}`);

            return {rows: [], state: 'unavailable', reason: `${label}-read-failed`, ...(detail ? {detail} : {})}
        }
    };

    return {
        /**
         * @summary Read the deployment's task picture: every wired axis is read, each reduces to
         * its rows and its own typed state, and the envelope's `capability` is the honest fold —
         * `wired` when every wired axis answered, `partial` when some did, `unavailable` when
         * none. Sections are ordered and capped here so the wire carries a glance, not a dump.
         * @param {Object} [params] Reserved; the verb takes no caller input today.
         * @returns {Promise<Object>}
         */
        async readTasks(params = {}) {
            const
                viewer     = await resolveViewer(),
                nowMs      = toMsOrNull(now()),
                capturedAt = new Date(nowMs ?? Date.now()).toISOString();

            if (nowMs === null) {
                throw new TypeError('fleet tasks: now must be a finite timestamp')
            }

            const [deployment, rem, ingestion] = await Promise.all([
                readAxis('deployment', getDeploymentStateSnapshot, extractDeploymentRows),
                readAxis('rem',        getRemPipelineState,        state => extractRemRows(state, nowMs)),
                getIngestionProgress
                    ? readAxis('ingestion', getIngestionProgress, extractIngestionRows)
                    : {rows: [], state: 'unwired', reason: 'ingestion-verb-unreachable-from-this-process', scope: null}
            ]);

            const
                axes     = [deployment, rem, ingestion],
                answered = axes.filter(axis => axis.state === 'wired' || axis.state === 'stale').length,
                wiredAxes= axes.filter(axis => axis.state !== 'unwired').length,
                state    = answered === 0 ? 'unavailable' : answered === wiredAxes ? 'wired' : 'partial',
                rows     = [...deployment.rows, ...rem.rows, ...ingestion.rows],
                running  = orderSection(rows, 'running'),
                queued   = orderSection(rows, 'queued'),
                recent   = orderSection(rows, 'recent');

            return {
                capability: {
                    state,
                    capturedAt,
                    ...(state === 'unavailable' ? {reason: 'no-task-source-answered'} : {})
                },
                viewer,
                sources: {
                    deployment: {state: deployment.state, reason: deployment.reason ?? null, ...(deployment.detail ? {detail: deployment.detail} : {}), observedAt: deployment.observedAt ?? null},
                    rem       : {state: rem.state,        reason: rem.reason        ?? null, ...(rem.detail        ? {detail: rem.detail}        : {})},
                    ingestion : {state: ingestion.state,  reason: ingestion.reason  ?? null, ...(ingestion.detail  ? {detail: ingestion.detail}  : {}), scope: ingestion.scope ?? null}
                },
                running,
                queued,
                recent,
                counts: {running: running.length, queued: queued.length, recent: recent.length}
            }
        }
    }
}

export default createFleetTasksSource;
