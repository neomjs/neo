import crypto              from 'crypto';
import {AsyncLocalStorage} from 'node:async_hooks';

const providerActivityContext = new AsyncLocalStorage();

/**
 * @summary Stable low-cardinality operation stages allowed in provider activity telemetry.
 * @type {ReadonlyArray<String>}
 */
export const PROVIDER_ACTIVITY_STAGES = Object.freeze([
    'embedding-canary',
    'kb-ask-synthesis',
    'kb-query-embedding',
    'kb-tenant-ingestion-embedding',
    'mc-mini-summary',
    'mc-session-summary',
    'mc-wal-drain-embedding',
    'rem-topology',
    'rem-tri-vector',
    'unknown'
]);

/**
 * @summary Maximum SQLite lock wait allowed on provider-activity telemetry writes.
 * @type {Number}
 */
export const PROVIDER_ACTIVITY_BUSY_TIMEOUT_MS = 50;

/**
 * @summary Multiplier on an activity's own role-class deadline before its in-flight row may be reaped.
 *
 * Reaping is NOT liveness inference: a dead writer's fresh row and a live writer's slow row are
 * byte-identical to age alone, so age only earns a reap past `factor x deadline`, where
 * the row is definitionally leaked regardless of who wrote it — every provider request carries a hard
 * client-side `timeoutMs`, and the row settles when that promise settles, so a started row that
 * outlives its class deadline by a wide margin has lost its settle by construction. The factor is the
 * safety margin that keeps this true across services whose per-class deadlines differ (a reader reaps
 * another service's rows with its own bounds; 4x dwarfs that variance) and across clock skew between
 * writer and reader processes. Unknown roles and unsupplied classes are never reaped: when in doubt,
 * the ledger over-reports demand rather than blinding it — fabricating idle is the unsafe direction
 * for every recovery consumer of this projection.
 * @type {Number}
 */
export const PROVIDER_ACTIVITY_REAP_FACTOR = 4;

/**
 * @summary Runs one collection operation with source-owned provider attribution in async context.
 * @param {Object} activity Stable stage/service attribution.
 * @param {Function} task Collection-operation thunk.
 * @returns {*}
 */
export function runWithProviderActivityContext(activity, task) {
    if (typeof task !== 'function') {
        throw new TypeError('providerActivityLedger: task must be a function');
    }

    return providerActivityContext.run({
        operationStage: activity?.operationStage || 'unknown',
        service       : activity?.service || 'unknown'
    }, task);
}

/**
 * @summary Returns the current source-owned collection attribution without inferring one.
 * @returns {Object|null}
 */
export function getProviderActivityContext() {
    return providerActivityContext.getStore() || null;
}

const ACTIVITY_ROLES       = new Set(['chat', 'embedding', 'unknown']);
const FAILURE_STAGES       = new Set(['provider', 'queue', 'unknown']);
const PRIORITIES           = new Set(['batch', 'interactive', 'unknown']);
const PROVIDERS            = new Set(['gemini', 'ollama', 'openAiCompatible', 'unknown']);
const QUEUE_DISPOSITIONS   = new Set(['neo-queued', 'not-applicable', 'unknown']);
const SERVICES             = new Set(['dream-pipeline', 'knowledge-base', 'memory-core', 'orchestrator', 'unknown']);
const STAGES               = new Set(PROVIDER_ACTIVITY_STAGES);
const MAX_MODEL_NAME_CHARS = 160;

/**
 * @summary Normalizes one value against a closed telemetry vocabulary.
 * @param {*} value Candidate value.
 * @param {Set<String>} allowed Allowed values.
 * @returns {String}
 */
function normalizeEnum(value, allowed) {
    return typeof value === 'string' && allowed.has(value) ? value : 'unknown';
}

/**
 * @summary Retains only a bounded non-secret model identifier.
 * @param {*} value Candidate model identifier.
 * @returns {String}
 */
function normalizeModel(value) {
    if (typeof value !== 'string') return 'unknown';

    const trimmed        = value.trim(),
          slashCount     = (trimmed.match(/\//g) || []).length,
          credentialLike = /^(?:sk-|ghp_|github_pat_|glpat-|AIza)/i.test(trimmed),
          endpointLike   = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:]+\]|[a-z0-9.-]+\.[a-z]{2,}):\d+$/i.test(trimmed),
          pathLike       = /^(?:\/|[A-Za-z]:[\\/])/.test(trimmed) || trimmed.includes('..');

    return trimmed
        && trimmed.length <= MAX_MODEL_NAME_CHARS
        && !trimmed.includes('://')
        && !trimmed.includes('@')
        && slashCount <= 1
        && !credentialLike
        && !endpointLike
        && !pathLike
        && /^[A-Za-z0-9._:+/-]+$/.test(trimmed)
        ? trimmed
        : 'unknown';
}

/**
 * @summary Creates the bounded provider-activity table and its observer indexes.
 * @param {Object} db Open better-sqlite3 database.
 * @returns {void}
 */
export function ensureProviderActivitySchema(db) {
    if (!db) return;

    db.exec(`
        CREATE TABLE IF NOT EXISTS provider_activity_log (
            activity_id       TEXT PRIMARY KEY,
            service           TEXT NOT NULL,
            operation_stage   TEXT NOT NULL,
            role              TEXT NOT NULL,
            provider          TEXT NOT NULL,
            model             TEXT NOT NULL,
            priority          TEXT NOT NULL,
            enqueued_at       INTEGER NOT NULL,
            started_at        INTEGER,
            completed_at      INTEGER,
            queue_disposition TEXT NOT NULL,
            queue_wait_ms     INTEGER,
            execution_ms      INTEGER,
            success           INTEGER,
            failure_stage     TEXT,
            reaped_at         INTEGER,
            reap_disposition  TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_provider_activity_enqueued
            ON provider_activity_log(enqueued_at);
        CREATE INDEX IF NOT EXISTS idx_provider_activity_completed
            ON provider_activity_log(completed_at);
        CREATE INDEX IF NOT EXISTS idx_provider_activity_stage
            ON provider_activity_log(operation_stage);
    `);

    // Additive migration for tables created before reaping existed. Column order must match the
    // CREATE above, so a migrated table and a fresh one are indistinguishable to readers.
    const columns = db.prepare(`PRAGMA table_info(provider_activity_log)`).all().map(column => column.name);

    if (!columns.includes('reaped_at')) {
        db.exec(`ALTER TABLE provider_activity_log ADD COLUMN reaped_at INTEGER`);
    }
    if (!columns.includes('reap_disposition')) {
        db.exec(`ALTER TABLE provider_activity_log ADD COLUMN reap_disposition TEXT`);
    }
}

/**
 * @summary Persists one provider activity admission boundary without retaining payloads or identity.
 * @param {Object} db Open better-sqlite3 database.
 * @param {Object} entry Bounded activity descriptor.
 * @returns {String} Opaque activity id.
 */
export function beginProviderActivity(db, entry = {}) {
    const
        activityId       = crypto.randomUUID(),
        enqueuedAt       = Number.isFinite(entry.enqueuedAt) ? entry.enqueuedAt : Date.now(),
        queueDisposition = normalizeEnum(entry.queueDisposition, QUEUE_DISPOSITIONS),
        startedAt        = Number.isFinite(entry.startedAt) ? entry.startedAt : null,
        queueWaitMs      = queueDisposition === 'neo-queued' && startedAt !== null
            ? Math.max(0, startedAt - enqueuedAt)
            : null;

    db.prepare(`
        INSERT INTO provider_activity_log (
            activity_id, service, operation_stage, role, provider, model, priority,
            enqueued_at, started_at, completed_at, queue_disposition, queue_wait_ms,
            execution_ms, success, failure_stage
        ) VALUES (
            @activity_id, @service, @operation_stage, @role, @provider, @model, @priority,
            @enqueued_at, @started_at, NULL, @queue_disposition, @queue_wait_ms,
            NULL, NULL, NULL
        )
    `).run({
        activity_id      : activityId,
        service          : normalizeEnum(entry.service, SERVICES),
        operation_stage  : normalizeEnum(entry.operationStage, STAGES),
        role             : normalizeEnum(entry.role, ACTIVITY_ROLES),
        provider         : normalizeEnum(entry.provider, PROVIDERS),
        model            : normalizeModel(entry.model),
        priority         : normalizeEnum(entry.priority, PRIORITIES),
        enqueued_at      : enqueuedAt,
        started_at       : startedAt,
        queue_disposition: queueDisposition,
        queue_wait_ms    : queueWaitMs
    });

    return activityId;
}

/**
 * @summary Marks the provider execution boundary for an admitted queued activity.
 *
 * A start is positive proof of life, so it clears a prior `abandoned` reap: that disposition inferred
 * "no live caller remains to dispatch this" from age alone, and the start refutes it. Clearing
 * resurrects the row into the in-flight counts it truthfully belongs to.
 * @param {Object} db Open better-sqlite3 database.
 * @param {String} activityId Opaque activity id.
 * @param {Number} [startedAt=Date.now()] Provider-start timestamp.
 * @returns {void}
 */
export function startProviderActivity(db, activityId, startedAt = Date.now()) {
    if (!activityId || !Number.isFinite(startedAt)) return;

    db.prepare(`
        UPDATE provider_activity_log
           SET started_at = @startedAt,
               queue_wait_ms = CASE
                   WHEN queue_disposition = 'neo-queued' THEN MAX(0, @startedAt - enqueued_at)
                   ELSE NULL
               END,
               reaped_at        = NULL,
               reap_disposition = NULL
         WHERE activity_id = @activityId
           AND completed_at IS NULL
    `).run({activityId, startedAt});
}

/**
 * @summary Refines one admitted row with the model selected by provider-owned dispatch code.
 * @param {Object} db Open better-sqlite3 database.
 * @param {String} activityId Opaque activity id.
 * @param {Object} activity Dispatch-bound activity refinement.
 * @returns {void}
 */
export function refineProviderActivity(db, activityId, activity = {}) {
    if (!activityId || !Object.hasOwn(activity, 'model')) return;

    db.prepare(`
        UPDATE provider_activity_log
           SET model = @model
         WHERE activity_id = @activityId
           AND completed_at IS NULL
    `).run({
        activityId,
        model: normalizeModel(activity.model)
    });
}

/**
 * @summary Completes one provider activity lifecycle with bounded structural outcome data.
 *
 * A reaped row is terminal bookkeeping, not an in-flight request: its settle arriving after the reap
 * is the lost settle finally landing, so the guard absorbs it — a reaped record is neither success
 * nor failure and must never surface as a completion.
 * @param {Object} db Open better-sqlite3 database.
 * @param {String} activityId Opaque activity id.
 * @param {Object} outcome Completion data.
 * @returns {void}
 */
export function completeProviderActivity(db, activityId, outcome = {}) {
    if (!activityId) return;

    const completedAt = Number.isFinite(outcome.completedAt) ? outcome.completedAt : Date.now();

    db.prepare(`
        UPDATE provider_activity_log
           SET completed_at = @completedAt,
               execution_ms = CASE
                   WHEN started_at IS NULL THEN NULL
                   ELSE MAX(0, @completedAt - started_at)
               END,
               success = @success,
               failure_stage = @failureStage
         WHERE activity_id = @activityId
           AND completed_at IS NULL
           AND reaped_at IS NULL
    `).run({
        activityId,
        completedAt,
        success     : outcome.success === true ? 1 : 0,
        failureStage: outcome.success === true ? null : normalizeEnum(outcome.failureStage, FAILURE_STAGES)
    });
}

/**
 * @summary Creates queue lifecycle callbacks that forward only bounded activity metadata to a recorder.
 * Recorder failures are swallowed so diagnostics cannot change provider scheduling or results.
 * @param {Object} options Lifecycle configuration.
 * @returns {Object}
 */
export function createProviderActivityLifecycle({recorder, activity = {}, queueDisposition = 'neo-queued'} = {}) {
    let activityId              = null,
        dispatchedModel         = null,
        dispatchModelConflicted = false;

    const invoke = (method, ...args) => {
        try {
            return recorder?.[method]?.(...args);
        } catch {
            return null;
        }
    };

    return {
        onEnqueued({enqueuedAt}) {
            activityId = invoke('beginProviderActivity', {
                ...activity,
                enqueuedAt,
                queueDisposition
            }) || null;
        },

        onStarted({startedAt}) {
            invoke('startProviderActivity', activityId, startedAt);
        },

        onDispatch(dispatchActivity = {}) {
            if (!Object.hasOwn(dispatchActivity, 'model')) return;

            const model = dispatchActivity.model;

            if (dispatchModelConflicted) return;
            if (dispatchedModel === null) {
                dispatchedModel = model;
            } else if (model !== dispatchedModel) {
                dispatchModelConflicted = true;
            } else {
                return;
            }

            invoke('refineProviderActivity', activityId, {
                model: dispatchModelConflicted ? 'unknown' : model
            });
        },

        onSettled({completedAt, failureStage = 'provider', success}) {
            invoke('completeProviderActivity', activityId, {
                completedAt,
                failureStage,
                success
            });
        }
    };
}

/**
 * @summary Executes a provider call that has no Neo-owned queue while recording a truthful null wait.
 * @param {Object} options Activity wrapper options.
 * @param {Function} options.task Provider-call thunk.
 * @param {Object} [options.recorder] Best-effort provider activity recorder.
 * @param {Object} [options.activity] Bounded activity descriptor.
 * @param {Function} [options.now=Date.now] Clock seam.
 * @returns {Promise<*>}
 */
export async function observeUnqueuedProviderActivity({task, recorder, activity = {}, now = Date.now}) {
    const lifecycle = createProviderActivityLifecycle({
        recorder,
        activity,
        queueDisposition: 'not-applicable'
    });
    const startedAt = now();

    lifecycle.onEnqueued({enqueuedAt: startedAt});
    lifecycle.onStarted({startedAt});

    try {
        const result = await task();

        lifecycle.onSettled({completedAt: now(), success: true});
        return result;
    } catch (error) {
        lifecycle.onSettled({completedAt: now(), success: false});
        throw error;
    }
}

/**
 * @summary Reaps in-flight rows whose age exceeds their own role-class deadline by `factor`.
 *
 * Marks — never deletes — definitionally-leaked records so the live-demand projections stop counting
 * them while the evidence stays queryable. Two dispositions, because the two leak shapes differ:
 *
 * - `unsettled` (started, never completed): the provider request carries a hard client-side
 *   `timeoutMs` and the row settles when that promise settles, so a started row older than
 *   `factor x deadline` has lost its settle by construction (process death, provider-side work
 *   stranded past a client disconnect, a boundary crossed mid-flight). Terminal: a settle landing
 *   after the reap is the lost settle, and `completeProviderActivity` absorbs it.
 * - `abandoned` (never started): the abort path settles a live caller's queued row, so a queued row
 *   older than `factor x deadline` is a lost settle with overwhelming probability — but a caller
 *   without a cancellation signal in a starvation regime could still be legitimately waiting.
 *   Reversible on proof of life: `startProviderActivity` clears the reap and the row rejoins the
 *   counts.
 *
 * The bound derives from the item's own class — `deadlineMsByRole` maps the row's `role` to the
 * widest deadline the CALLER can cite for that class from its own config (the embedding deadline is
 * a shared leaf; chat deadlines vary by service and the factor absorbs the variance). Rows whose
 * role has no supplied deadline, and `unknown` rows, are never reaped: when provenance is missing the
 * ledger keeps counting, because fabricated idleness is the unsafe direction for recovery consumers.
 *
 * @param {Object} db Open better-sqlite3 database.
 * @param {Object} options Reap bounds.
 * @param {Object<String,Number>} [options.deadlineMsByRole=null] Role-class deadline map, e.g. `{embedding: 300000}`.
 * @param {Number} [options.now=Date.now()] Observation epoch.
 * @param {Number} [options.factor=PROVIDER_ACTIVITY_REAP_FACTOR] Deadline multiplier.
 * @returns {{abandoned: Number, unsettled: Number}} Rows reaped by this call, per disposition.
 */
export function reapProviderActivity(db, {deadlineMsByRole = null, now = Date.now(), factor = PROVIDER_ACTIVITY_REAP_FACTOR} = {}) {
    const reaped = {abandoned: 0, unsettled: 0};

    if (!db || !deadlineMsByRole || !Number.isFinite(now)) return reaped;

    const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : PROVIDER_ACTIVITY_REAP_FACTOR;

    for (const [role, deadlineMs] of Object.entries(deadlineMsByRole)) {
        if (!ACTIVITY_ROLES.has(role) || role === 'unknown') continue;
        if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) continue;

        const bound = deadlineMs * safeFactor;

        reaped.unsettled += db.prepare(`
            UPDATE provider_activity_log
               SET reaped_at        = @now,
                   reap_disposition = 'unsettled'
             WHERE completed_at IS NULL
               AND reaped_at    IS NULL
               AND started_at   IS NOT NULL
               AND role = @role
               AND @now - started_at > @bound
        `).run({now, role, bound}).changes;

        reaped.abandoned += db.prepare(`
            UPDATE provider_activity_log
               SET reaped_at        = @now,
                   reap_disposition = 'abandoned'
             WHERE completed_at IS NULL
               AND reaped_at    IS NULL
               AND started_at   IS NULL
               AND role = @role
               AND @now - enqueued_at > @bound
        `).run({now, role, bound}).changes;
    }

    return reaped;
}

/**
 * @summary Returns bounded aggregate, in-flight, and recent provider activity projections.
 *
 * When `activityDeadlineMs` is supplied the read reaps first (`reapProviderActivity`), so a snapshot
 * never reports a count the ledger itself can see is stale — the reap cadence rides the existing
 * poll/read paths rather than a dedicated timer. Reaped rows stay in the table and surface under
 * `reaped` with their disposition; they are excluded from every in-flight count and are never
 * reported as completions.
 * @param {Object} db Open better-sqlite3 database.
 * @param {Object} options Observer bounds.
 * @param {Object<String,Number>} [options.activityDeadlineMs=null] Role-class deadline map enabling reap-on-read.
 * @param {Number} [options.reapFactor=PROVIDER_ACTIVITY_REAP_FACTOR] Deadline multiplier for reap-on-read.
 * @returns {Object}
 */
export function getProviderActivityMetrics(db, {sinceTs, limit, now = Date.now(), nativeAdmissionCaps = null, activityDeadlineMs = null, reapFactor = PROVIDER_ACTIVITY_REAP_FACTOR} = {}) {
    const reapedThisRead = activityDeadlineMs
        ? reapProviderActivity(db, {deadlineMsByRole: activityDeadlineMs, now, factor: reapFactor})
        : {abandoned: 0, unsettled: 0};

    const
        aggregates = db.prepare(`
            SELECT service, operation_stage, role, provider, model, priority, queue_disposition,
                   COUNT(*) AS calls,
                   SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) AS failures,
                   SUM(CASE WHEN completed_at IS NULL AND reaped_at IS NULL THEN 1 ELSE 0 END) AS in_flight,
                   ROUND(AVG(queue_wait_ms), 2) AS avg_queue_wait_ms,
                   MAX(queue_wait_ms) AS max_queue_wait_ms,
                   ROUND(AVG(execution_ms), 2) AS avg_execution_ms,
                   MAX(execution_ms) AS max_execution_ms,
                   MAX(COALESCE(completed_at, started_at, enqueued_at)) AS last_seen_at
              FROM provider_activity_log
             WHERE enqueued_at >= @sinceTs
             GROUP BY service, operation_stage, role, provider, model, priority, queue_disposition
             ORDER BY calls DESC, operation_stage ASC
             LIMIT @limit
        `).all({sinceTs, limit}),
        totalActivities = db.prepare(`
            SELECT COUNT(*) AS total
              FROM provider_activity_log
             WHERE enqueued_at >= @sinceTs
        `).get({sinceTs})?.total || 0,
        // In-flight work is bounded by `limit`, never by the historical lookback. A caller may narrow
        // `sinceTs` to recent completions, but an unresolved provider call older than that window is
        // still live demand. Filtering it out manufactures an "idle" provider from an active one — the
        // unsafe direction for every recovery consumer of this projection. REAPED rows are excluded:
        // they are leaked bookkeeping, not demand.
        totalInFlight = db.prepare(`
            SELECT COUNT(*) AS total
              FROM provider_activity_log
             WHERE completed_at IS NULL
               AND reaped_at    IS NULL
        `).get()?.total || 0,
        totalRecentCompletions = db.prepare(`
            SELECT COUNT(*) AS total
              FROM provider_activity_log
             WHERE completed_at >= @sinceTs
        `).get({sinceTs})?.total || 0,
        inFlightRows = db.prepare(`
            SELECT activity_id, service, operation_stage, role, provider, model, priority,
                   enqueued_at, started_at, queue_disposition, queue_wait_ms
              FROM provider_activity_log
             WHERE completed_at IS NULL
               AND reaped_at    IS NULL
             ORDER BY enqueued_at ASC, activity_id ASC
             LIMIT @limit
        `).all({limit}),
        recentRows = db.prepare(`
            SELECT activity_id, service, operation_stage, role, provider, model, priority,
                   enqueued_at, started_at, completed_at, queue_disposition, queue_wait_ms,
                   execution_ms, success, failure_stage
              FROM provider_activity_log
             WHERE completed_at >= @sinceTs
             ORDER BY completed_at DESC, activity_id ASC
             LIMIT @limit
        `).all({sinceTs, limit}),
        // Reaped rows are retained evidence, not demand and not completions. `reaped_at` is Neo
        // bookkeeping, so it deliberately does NOT feed `last_seen_at` — that field answers "when
        // did the provider last see traffic", and a reap is not provider traffic.
        totalReaped = db.prepare(`
            SELECT COUNT(*) AS total
              FROM provider_activity_log
             WHERE reaped_at IS NOT NULL
        `).get()?.total || 0,
        reapedRows = db.prepare(`
            SELECT activity_id, service, operation_stage, role, provider, model, priority,
                   enqueued_at, started_at, queue_disposition, queue_wait_ms,
                   reaped_at, reap_disposition
              FROM provider_activity_log
             WHERE reaped_at IS NOT NULL
             ORDER BY reaped_at DESC, activity_id ASC
             LIMIT @limit
        `).all({limit});

    const projectBase = row => ({
        activityId      : row.activity_id,
        service         : row.service,
        operationStage  : row.operation_stage,
        role            : row.role,
        provider        : row.provider,
        model           : row.model,
        priority        : row.priority,
        enqueuedAt      : new Date(row.enqueued_at).toISOString(),
        startedAt       : row.started_at === null ? null : new Date(row.started_at).toISOString(),
        queueDisposition: row.queue_disposition,
        queueWaitMs     : row.queue_wait_ms ?? null
    });

    // NATIVE ADMISSION DEMAND, derived from rows rather than from a second source of truth.
    //
    // Once the producer opens its row BEFORE admission and starts it only after acquiring a slot,
    // the queue's live state is already in the table: a row with no `started_at` is waiting, a
    // started row with no `completed_at` is executing. No separate admission store is needed, and a
    // process-local getter could not have answered this anyway — the observer is a different OS
    // process from the producer.
    //
    // A LIMITER IS PER PROCESS, SO THE PROJECTION MUST BE PER SERVICE. This table is shared: the
    // Knowledge Base and Memory Core are separate OS processes, each with its OWN static
    // `TextEmbeddingService` limiter. Grouping by provider alone sums them, so two well-behaved
    // processes at cap 4 project as `{cap: 4, executing: 8}` — a cap violation that never happened.
    // A fabricated alarm is worse than no instrument: it sends an operator to fix a limiter that is
    // working. @neo-gpt found this by reasoning about the deployment topology, not the row shape.
    //
    // Keyed `service::provider`, and the caller supplies caps under the same key, so a cap can only
    // ever label the demand of the process that declared it.
    //
    // `cap` is INJECTED by the caller, which reads the config leaf at its own use site — this module
    // must not import AiConfig. A caller supplies a cap for ITS OWN service only, so any other
    // service's rows report `cap: null`: unknown, honestly. A fabricated `0` would read as
    // "admission is closed", the most alarming possible value, when the truth is only that this
    // reader has no authority over that process's ceiling.
    const nativeAdmission = {};

    for (const row of db.prepare(`
        SELECT service, provider,
               SUM(CASE WHEN started_at IS NULL THEN 1 ELSE 0 END) AS waiting,
               SUM(CASE WHEN started_at IS NOT NULL THEN 1 ELSE 0 END) AS executing
          FROM provider_activity_log
         WHERE completed_at IS NULL AND reaped_at IS NULL AND queue_disposition = 'neo-queued'
         GROUP BY service, provider
    `).all()) {
        nativeAdmission[`${row.service}::${row.provider}`] = {
            service  : row.service,
            provider : row.provider,
            cap      : nativeAdmissionCaps?.[`${row.service}::${row.provider}`] ?? null,
            executing: row.executing || 0,
            waiting  : row.waiting   || 0
        }
    }

    // A cap that was declared but has no live demand must still be reported. Omitting it makes a
    // configured-but-idle queue indistinguishable from one that does not exist, and "no rows" is
    // exactly what a wedged plane looks like from the wrong angle.
    for (const [key, cap] of Object.entries(nativeAdmissionCaps || {})) {
        const [service, provider] = key.split('::');

        // A malformed key is SKIPPED, not emitted with `provider: undefined`. A garbage row in a
        // public projection is worse than a missing one: a consumer cannot tell it from a real
        // provider it has never heard of, and the field is declared required-and-typed.
        if (!service || !provider) continue;

        nativeAdmission[key] ??= {service, provider, cap, executing: 0, waiting: 0}
    }

    return {
        status                    : 'ok',
        nativeAdmission,
        totalActivities,
        totalInFlight,
        totalRecentCompletions,
        totalReaped,
        inFlightTruncated         : totalInFlight > inFlightRows.length,
        recentCompletionsTruncated: totalRecentCompletions > recentRows.length,
        reapedTruncated           : totalReaped > reapedRows.length,
        reapedThisRead,
        aggregates                : aggregates.map(row => ({
            service         : row.service,
            operationStage  : row.operation_stage,
            role            : row.role,
            provider        : row.provider,
            model           : row.model,
            priority        : row.priority,
            queueDisposition: row.queue_disposition,
            calls           : row.calls,
            failures        : row.failures || 0,
            inFlight        : row.in_flight || 0,
            avgQueueWaitMs  : row.avg_queue_wait_ms ?? null,
            maxQueueWaitMs  : row.max_queue_wait_ms ?? null,
            avgExecutionMs  : row.avg_execution_ms ?? null,
            maxExecutionMs  : row.max_execution_ms ?? null,
            lastSeenAt      : row.last_seen_at === null ? null : new Date(row.last_seen_at).toISOString()
        })),
        inFlight: inFlightRows.map(row => ({
            ...projectBase(row),
            elapsedMs: Math.max(0, now - row.enqueued_at)
        })),
        recentCompletions: recentRows.map(row => ({
            ...projectBase(row),
            completedAt : new Date(row.completed_at).toISOString(),
            executionMs : row.execution_ms ?? null,
            success     : row.success === 1,
            failureStage: row.failure_stage ?? null
        })),
        reaped: reapedRows.map(row => ({
            ...projectBase(row),
            reapedAt   : new Date(row.reaped_at).toISOString(),
            disposition: row.reap_disposition,
            ageMs      : Math.max(0, now - row.enqueued_at)
        }))
    };
}
