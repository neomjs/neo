import fs                        from 'fs-extra';
import {createHmac, randomBytes} from 'node:crypto';
import path                      from 'node:path';
import Base                      from '../../../../src/core/Base.mjs';
import AiConfig                  from '../../../config.mjs';
import GitMirror                 from '../../../services/knowledge-base/helpers/gitMirror.mjs';
import TextEmbeddingService      from '../../../services/memory-core/TextEmbeddingService.mjs';
// The outstanding-chunk observable is derived from the run's OWN totals rather than recomputed here.
// A second implementation of "which chunks are missing" can disagree with the embedder that produced
// them, and a backlog figure that disagrees with the embedder is worse than none.
import {
    deriveOutstanding,
    describeCorpusOutstanding
}                                from '../../../services/knowledge-base/helpers/corpusOutstanding.mjs';
import {createBoundedRetryGate}   from '../../../services/shared/boundedRetryGate.mjs';
import {writeFileAtomic}          from '../../../services/shared/atomicFileWrite.mjs';
import {buildEmbeddingProbeBlock} from '../../../services/shared/embeddingProbe.mjs';
// The filter below and the codes it admits are one contract. Importing the pattern from the module
// that PRODUCES bounded codes keeps a re-declared copy from drifting into a pair that separately
// look right — the producer widening a code the filter still rejects is exactly this ticket's defect.
import {
    BOUNDED_KB_ERROR_CODE_PATTERN,
    EMBED_DISPOSITION,
    KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN,
    classifyEmbedDisposition,
    isDurableFenceRow,
    isEmbedFailureCode
}                                from '../../../services/knowledge-base/helpers/embedFailureClassification.mjs';
import {
    buildIngestEnvelope,
    createTenantRepoMaterializationDigest
} from '../../../services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs';
import {
    classifyTenantRepoAccessFailure,
    isTenantRepoAccessReadinessOutcome,
    normalizeTenantRepoCredentialRef,
    TenantRepoAccessCode,
    TenantRepoAccessStatus
} from '../../../services/knowledge-base/helpers/tenantRepoAccessContract.mjs';
import {
    assertSliceBudgetMs,
    createSliceBudgetPredicate,
    classifyEmbeddingRecoveryState,
    detectStarvedTenantSync,
    hasPendingEmbeddingRecoveryBypass,
    isBackoffMarginCollapsed,
    isRepoDue,
    isStarvedOrderInverted,
    resolveMinimumBackoffCapMs,
    resolveRepoBaseCadenceMs,
    resolveUnknownRepoSelectorFailure
} from '../scheduling/tenantRepoSync.mjs';
import {
    KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE,
    KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
    KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN,
    KB_TENANT_REPO_SYNC_SYNC_FAILED,
    KB_TENANT_REPO_SYNC_LEASE_HELD,
    KB_TENANT_REPO_SYNC_LEASE_LOST,
    KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
    KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
    KB_TENANT_REPO_SYNC_INVALID_SLICE_BUDGET,
    KB_TENANT_REPO_SYNC_STARVED,
    TenantRepoSyncError,
    isTenantRepoSyncErrorCode
} from './TenantRepoSyncErrors.mjs';
import {
    appendHealEvent,
    validateHealLedgerRetention
} from '../../../services/memory-core/helpers/healEventLedgerStore.mjs';
import {
    acquireHeavyMaintenanceLease,
    inspectHeavyMaintenanceLease,
    releaseHeavyMaintenanceLease,
    renewHeavyMaintenanceLease
} from './heavyMaintenanceLeasePrimitives.mjs';
import {
    enterLifecycleGuard,
    exitLifecycleGuard,
    verifyLifecycleGuardOwnership
} from '../../shared/lifecycleGuard.mjs';
import {
    classifyTenantRepoCheckpoint,
    isEmbeddingRecoverySourceCode,
    normalizeTenantRepoCheckpointState,
    requiresTenantRepoCheckpointRevalidation,
    TENANT_REPO_INGEST_CONTRACT_VERSION,
    TenantRepoCheckpointStatus
} from './tenantRepoCheckpointValidity.mjs';

const
    ACCESS_CONFIG_FINGERPRINT_KEY         = randomBytes(32),
    ACCESS_READINESS_MIN_TTL_MS           = 15 * 60 * 1000,
    EMBEDDING_RECOVERY_FAILURE_TTL_MS     = 30 * 1000,
    EMBEDDING_RECOVERY_FAILURE_TTL_MAX_MS = 10 * 60 * 1000,
    EMBEDDING_RECOVERY_PROBE_TIMEOUT_MS   = 30 * 1000,
    PERSISTED_REVISIONS_FILE_NAME         = 'tenant-repo-sync-revisions.json',
    TENANT_REPO_SYNC_LEASE_FILE_NAME      = 'tenant-repo-sync-lease.json';

/**
 * @summary In-memory async semaphore with optional slot-acquisition timeout.
 *
 * Caps the number of concurrent acquirers to `limit`. Acquirers beyond the limit
 * queue and resolve as slots are released (FIFO). If `timeoutMs > 0`, queued
 * acquirers reject with `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT` after the
 * configured duration.
 *
 * Lifecycle is bounded to a single `runTask` invocation — a fresh semaphore is
 * created per call from the current reactive `concurrencyLimit` /
 * `concurrencyGateTimeoutMs` config values, so live config edits take effect
 * on the next cycle.
 *
 * @param {Object} options
 * @param {Number} options.limit Maximum concurrent acquirers.
 * @param {Number} [options.timeoutMs=0] Per-acquire slot-wait timeout. `0` disables.
 * @returns {{acquire: Function, release: Function}}
 */
function createConcurrencySemaphore({limit, timeoutMs = 0}) {
    let   active  = 0;
    const waiters = [];

    const handoffSlot = () => {
        while (active < limit && waiters.length > 0) {
            const waiter = waiters.shift();
            if (waiter.timeoutId) clearTimeout(waiter.timeoutId);
            active++;
            waiter.resolve();
        }
    };

    return {
        async acquire() {
            if (active < limit) {
                active++;
                return;
            }
            return new Promise((resolve, reject) => {
                const waiter = {resolve, reject, timeoutId: null};
                if (timeoutMs > 0) {
                    waiter.timeoutId = setTimeout(() => {
                        const idx = waiters.indexOf(waiter);
                        if (idx !== -1) {
                            waiters.splice(idx, 1);
                            reject(new TenantRepoSyncError(
                                KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT,
                                `Concurrency gate timeout after ${timeoutMs}ms (limit=${limit})`,
                                {limit, timeoutMs, phase: 'concurrency-gate'}
                            ));
                        }
                    }, timeoutMs);
                }
                waiters.push(waiter);
            });
        },
        release() {
            if (active > 0) active--;
            handoffSlot();
        }
    };
}

/**
 * Classifies a SYNC-path failure into the access vocabulary.
 *
 * Delegates to the shared lane classifier so a discriminating cause — under-scoped credential,
 * rejected credential, absent-or-denied repository, unreachable host — survives into the readiness
 * cache and the persisted checkpoint instead of being flattened.
 *
 * The one remapping: `PROBE_FAILED` means "no exit status, unclassifiable", which is honest on the
 * probe path but would over-claim here, since it names a probe that did not run. On this path we DO
 * know the sync failed, so an unclassifiable cause is `SYNC_FAILED` — the fallback stays accurate
 * while everything the classifier can actually name comes through intact.
 *
 * @param {Error} error Redacted failure.
 * @returns {String} A `TenantRepoAccessCode` value.
 */
function classifySyncFailure(error) {
    const classified = classifyTenantRepoAccessFailure(error);

    return classified === TenantRepoAccessCode.PROBE_FAILED
        ? TenantRepoAccessCode.SYNC_FAILED
        : classified;
}

function getSourceErrorCode(error, outerCode) {
    const sourceCode = error?.sourceErrorCode || error?.code;

    if (typeof sourceCode !== 'string' || sourceCode === outerCode) {
        return null;
    }

    return BOUNDED_KB_ERROR_CODE_PATTERN.test(sourceCode) ? sourceCode : null;
}

/**
 * @summary Selects the first bounded embedding cause from one failed ingestion attempt.
 * @param {Error} error Failed operation.
 * @param {String|null} sourceErrorCode Existing first-source compatibility code.
 * @returns {String|null}
 */
function getEmbeddingRecoveryCauseCode(error, sourceErrorCode) {
    return [sourceErrorCode, ...(Array.isArray(error?.sourceErrorCodes) ? error.sourceErrorCodes : [])]
        .find(isEmbeddingRecoverySourceCode) || null;
}

/**
 * @summary Creates or advances one durable embedding recovery episode after a sync attempt that
 * made no checkpoint progress for an embedding-class reason.
 *
 * **Both a failure and a DEFERRAL qualify, and deliberately share one episode shape.** A deferred
 * outcome proves exactly what the canary measures — no checkpoint progress against the embedding
 * dependency — so it is recovery-eligible on the same terms. Giving deferral its own episode kind
 * would fork the resumption authority in two; the top-level and per-repo `deferred` outcomes
 * already name the disposition, while the episode names only recovery eligibility.
 *
 * A repeated embedding-class outcome stays in the SAME episode, including after its one recovery
 * grant was consumed. Minting a fresh episode each time would let a still-broken provider acquire
 * one immediate retry per sweep and silently defeat the durable backoff this lane protects — which
 * is the whole reason deferral must not mint its own.
 *
 * @param {Object} options
 * @param {Object|null} options.priorRecovery Existing normalized episode.
 * @param {String} options.causeCode Bounded embedding cause.
 * @param {Number} options.failedAt Attempt timestamp (failure or deferral).
 * @returns {Object}
 */
function buildEmbeddingRecoveryEpisode({priorRecovery, causeCode, failedAt}) {
    if (priorRecovery) {
        const consumedGenerationId = priorRecovery.generationId && priorRecovery.bypassConsumedAt
            ? priorRecovery.generationId
            : null;

        return {
            episodeId               : priorRecovery.episodeId,
            causeCode,
            detectedAt              : priorRecovery.detectedAt,
            generationId            : null,
            observedAt              : null,
            bypassConsumedAt        : null,
            lastConsumedGenerationId: consumedGenerationId
                || priorRecovery.lastConsumedGenerationId
                || null,
            lastConsumedAt: consumedGenerationId
                ? priorRecovery.bypassConsumedAt
                : (priorRecovery.lastConsumedAt || null)
        };
    }

    return {
        episodeId               : randomBytes(16).toString('hex'),
        causeCode,
        detectedAt              : failedAt,
        generationId            : null,
        observedAt              : null,
        bypassConsumedAt        : null,
        lastConsumedGenerationId: null,
        lastConsumedAt          : null
    };
}

/**
 * @summary Builds an internal-only digest of the effective access configuration.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {String}
 * @private
 */
function hashTenantRepoAccessConfig(repo) {
    return createHmac('sha256', ACCESS_CONFIG_FINGERPRINT_KEY).update(JSON.stringify({
        branchRef    : repo.branchRef || 'HEAD',
        cloneUrl     : repo.cloneUrl,
        credentialRef: normalizeTenantRepoCredentialRef(repo.credentialRef)
    })).digest('hex');
}

/**
 * @summary Returns the stable internal key for one effective tenant repository.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {String}
 * @private
 */
function createTenantRepoAccessKey(repo) {
    return `${repo.tenantId}/${repo.repoSlug}`;
}

/**
 * @summary Returns true when a configured tenant repository is disabled.
 * @param {Object} repo Effective tenant-repo entry.
 * @returns {Boolean}
 * @private
 */
function isTenantRepoDisabled(repo) {
    return repo.disabled === true || repo.enabled === false;
}

/**
 * @summary Normalizes a readiness timestamp without copying arbitrary upstream data.
 * @param {*} value Candidate ISO timestamp.
 * @param {String} fallback Current observation timestamp.
 * @returns {String}
 * @private
 */
function safeAccessReadinessTimestamp(value, fallback) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value))
        ? new Date(value).toISOString()
        : fallback;
}

/**
 * @summary Derives a bounded evidence lifetime from the repo's normal acquisition cadence.
 *
 * Two cadence windows avoid an extra remote probe immediately beside every scheduled
 * fetch. The fifteen-minute floor prevents high-frequency repos from turning readiness
 * into a network poller.
 *
 * @param {Object} repo Effective tenant-repo entry.
 * @param {Number} globalCadenceMs Global per-repo cadence fallback.
 * @returns {Number}
 * @private
 */
function getAccessReadinessMaxAgeMs(repo, globalCadenceMs) {
    const cadenceMs = Number.isFinite(repo.cadenceMs) && repo.cadenceMs > 0
        ? repo.cadenceMs
        : globalCadenceMs;

    return Math.max(
        Number.isFinite(cadenceMs) && cadenceMs > 0 ? cadenceMs * 2 : 0,
        ACCESS_READINESS_MIN_TTL_MS
    );
}

/**
 * @summary Tenant-aware chunk hash, the shape a fence row's `chunkId` must carry.
 * @type {RegExp}
 */
const CHUNK_ID_PATTERN = /^[a-f0-9]{64}$/u;

/**
 * @summary Decides whether an ingestion run COMPLETED, DEFERRED, or FAILED.
 *
 * `KnowledgeBaseIngestionService.ingestSourceFiles()` is intentionally fail-soft: failures are
 * returned inside `summary.errors` rather than rejecting the promise. This function is where the
 * sync lane turns that array into a scheduling decision.
 *
 * **It used to have two outcomes and needed three.** Any error at all failed the run, so a single
 * slow embedding discarded the checkpoint for every chunk that DID embed, the repo took a backoff
 * step, and the corpus never grew. Measured on an external deployment: four repos at
 * `consecutiveFailures: 13`, cadence pinned to its cap, `count: 0`. The parse and chunk work of
 * every one of those runs was thrown away because the tail of it was late.
 *
 * The third outcome is `deferred` — *incomplete, not failed*. The caller holds the checkpoint where
 * it is, leaves `consecutiveFailures` untouched, and lets the lane come back at base cadence.
 * Nothing is lost by waiting: `VectorService` never re-embeds a chunk whose content-derived id is
 * already present, so a later run resumes rather than restarts.
 *
 * **Deferral is opt-in by DOMAIN and default WITHIN it**, and the `every` below is the whole
 * safety argument. A summary carries parse failures and tenant-guard rejections alongside embed
 * failures — fourteen distinct push sites in `IngestionService`, two of them the embed path. So a
 * run defers only when EVERY error is a deferrable embed failure; one rejected code, one non-embed
 * error, or one error with no code at all fails the run exactly as before. Deferring a permanently
 * malformed file would be silently stuck, which is worse than loudly broken.
 *
 * **Within the deferrable domain there is a fourth distinction, and it decides `complete` vs
 * `deferred`: a durable FENCE is not incomplete work.** A fenced chunk is excised until its
 * generation, geometry, ceiling, or content changes, so deferring on one asserts a return that can
 * change nothing — and the held checkpoint makes every later sweep re-materialise the same delta.
 * A run whose every error is a fence (either family) completes; the persisted censuses, not a held
 * checkpoint, carry the fenced chunks to the operator. See {@link isDurableFenceRow} for why the
 * row's details rather than its code answer this, and for the fail-closed gate that read takes.
 *
 * Error messages and details are still never copied into the thrown error. The bounded `KB_*` codes
 * are retained separately as source provenance for `lastSourceErrorCode`.
 *
 * @param {Object} summary Returned KB ingestion summary.
 * @returns {{outcome: 'complete'|'deferred', summary: Object, deferredCodes: String[]}} `deferredCodes`
 *     carries the codes of LIVE rows only — never a fence row's code, which would otherwise be
 *     indistinguishable downstream and could arm an embedding-recovery episode.
 * @throws {Error} When the summary shape is ambiguous, or it carries any error that is not a
 *     deferrable embed failure.
 */
function classifyIngestionOutcome(summary) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary) || !Array.isArray(summary.errors)) {
        throw new Error('Knowledge Base ingestion returned an invalid summary.')
    }

    if (summary.errors.length > 0) {
        // The three-outcome decision, evaluated before the failure is constructed. `every` is
        // deliberate: one non-embed error, one rejected code, or one error carrying no code at all
        // (`isEmbedFailureCode(undefined)` is false) drops the whole run back to the failure path.
        // A codeless error is unclassifiable, and unclassifiable must fail loudly rather than wait.
        const deferrable = summary.errors.every(item =>
            isEmbedFailureCode(item?.code) &&
            classifyEmbedDisposition(item.code) === EMBED_DISPOSITION.deferrable
        );

        if (deferrable) {
            // Deferral means "incomplete, come back": the checkpoint holds because a later run may
            // finish the work. A durable fence asserts the OPPOSITE — the chunk is excised until the
            // generation, geometry, ceiling, or content changes, so no amount of coming back changes
            // anything. A run whose every error is a fence therefore COMPLETES: the checkpoint
            // advances, sibling rotation proceeds, and the censuses (not a held checkpoint) are what
            // keep the fenced chunks visible to the operator. One live failure beside the fences
            // still defers the run as before.
            //
            // BOTH fence families qualify. Restricting this to the undeliverable code left every
            // content-poisoned repo deferring forever — re-materialising and re-parsing the same
            // delta each sweep for a state no later sweep can change.
            const liveRows = summary.errors.filter(item => !isDurableFenceRow(item));

            if (liveRows.length > 0) {
                // Live rows ONLY. Both families carry ordinary embed-domain codes, so a flat set of
                // every row's code cannot be filtered back to live causes downstream — the row
                // identity that distinguishes a fenced `KB_VECTOR_EMBED_TIMEOUT` from a live one
                // exists here and nowhere after. Selecting the cause anywhere else would let a fence
                // arm the embedding-recovery canary: a health probe whose success cannot re-offer
                // the fenced chunk, because only a generation change can.
                return {
                    outcome      : 'deferred',
                    summary,
                    deferredCodes: [...new Set(liveRows.map(item => item.code))]
                }
            }

            return {outcome: 'complete', summary, deferredCodes: []}
        }

        const error = new Error('Knowledge Base ingestion returned an error-bearing summary.');

        // Every DISTINCT bounded code, not only the first. A failing ingest can carry several
        // independent causes (an embed failure alongside a per-file parse failure, say), and
        // reporting one of them made a multi-cause failure read as single-cause — the operator
        // fixes the reported code and the lane fails identically on the next sweep.
        //
        // This stays inside the credential boundary by construction: BOUNDED_KB_ERROR_CODE_PATTERN
        // admits only `KB_[A-Z0-9_]{1,120}`, so a code cannot carry a clone URL, a token, or
        // stderr. That is exactly why the codes are safe to widen while the messages and details
        // remain deliberately uncopied (see this function's docblock).
        const sourceCodes = [...new Set(summary.errors
            .map(item => item?.code)
            .filter(code => typeof code === 'string' && BOUNDED_KB_ERROR_CODE_PATTERN.test(code)))];

        if (sourceCodes.length > 0) {
            // `sourceErrorCode` keeps its exact prior meaning (the first bounded code) so every
            // existing consumer — `getSourceErrorCode`, `lastSourceErrorCode` — is unchanged.
            error.sourceErrorCode  = sourceCodes[0];
            error.sourceErrorCodes = sourceCodes
        }

        // Total error count, INCLUDING entries whose code was unbounded or absent. Without it,
        // "one reported code" is indistinguishable from "one error", so a partial ingest that
        // failed 400 files looks like it failed one.
        error.sourceErrorCount = summary.errors.length;

        throw error
    }

    // Reached only on a CLEAN summary, and the ordering is the contract: an error-bearing run is
    // classified above regardless of whether it also yielded. A slice that both hit a live failure
    // and ran out of budget is a failure — the budget is the less urgent fact, and letting it
    // reclassify the run would launder a real fault into a benign rotation.
    if (summary.yielded === true) {
        // Neither success nor failure. The corpus is not exhausted, so the checkpoint must not
        // advance as though it were; but nothing went wrong, so no failure accounting applies.
        // Distinct from `deferred`, which is the same STATE arrived at for the opposite REASON:
        // deferral carries a retained cause and arms the recovery canary, because something is
        // broken and a later health observation is what un-breaks it. A budgeted slice has no
        // cause to retain and nothing to recover — it needs another turn, not a diagnosis.
        return {outcome: 'partial-progress', summary, deferredCodes: []}
    }

    return {outcome: 'complete', summary, deferredCodes: []}
}

/**
 * @summary Creates the bounded reason used to stop never-dispatched repository embeds in one sweep.
 * @returns {Error} Internal circuit-open error safe for the KB failure classifier.
 */
function createProviderTimeoutCircuitError() {
    const error = new Error('Tenant-repo embedding deferred because an earlier native provider request timed out in this sweep.');

    error.code = KB_VECTOR_EMBED_PROVIDER_CIRCUIT_OPEN;
    return error
}

/**
 * @summary Builds one repo's corpus-outstanding observation from the run's own ingestion summary.
 *
 * ## Why the mapping is not one-to-one with the summary's field names
 *
 * The summary carries primitives, not the derived pair: `ingested` (chunks accepted into the run),
 * `skippedOversized` (guardrail rejections that will never embed), and `embeddingsGenerated` (chunks
 * that actually landed). The progress projection derives `totalChunks` / `embeddedChunks` from those,
 * but that projection is a KB-server-process surface and cannot answer for this lane — so the mapping
 * happens here, from the primitives, once.
 *
 * `skippedOversized` appears on BOTH sides — inside the total and as the skip — so it cancels, and the
 * remainder is exactly "accepted minus embedded". Passing it explicitly rather than pre-subtracting it
 * keeps the intent legible: an oversized chunk is declined work, not outstanding work, and a backlog
 * that silently counted it could never reach zero.
 *
 * @param {Object}      options
 * @param {Object}      options.summary   Ingestion summary returned by the run.
 * @param {Object|null} options.priorState Previously persisted per-repo state, for the movement stamp.
 * @param {Number}      options.observedAt Epoch ms for this observation.
 * @returns {Object} The `describeCorpusOutstanding` observation.
 */
function buildCorpusOutstandingObservation({summary, priorState, observedAt}) {
    const
        accepted = summary?.ingested,
        skipped  = summary?.skippedOversized ?? 0,
        embedded = summary?.embeddingsGenerated,
        // Number.isFinite guards rather than `?? 0`: a summary missing these fields is UNMEASURED, and
        // defaulting it to zero would publish "nothing outstanding" for a run nobody observed — the
        // empty-is-not-success defect this observable exists to close.
        total    = Number.isFinite(accepted) && Number.isFinite(skipped) ? accepted + skipped : undefined;

    return describeCorpusOutstanding({
        outstanding: deriveOutstanding({total, embedded, skipped}),
        observedAt,
        previous   : priorState?.corpusOutstanding ?? null
    })
}

/**
 * @summary Retention cap for the census id list persisted per repository checkpoint.
 *
 * The count always carries the true total; the id list is what an operator pastes into a replay or
 * a parser ticket, and past this bound the poison-store marker (which retains up to 256 rows) is the
 * right surface to enumerate from. Checkpoint rows project to a remote client, so they stay small.
 * @type {Number}
 */
export const UNDELIVERABLE_CENSUS_MAX_IDS = 32;

/**
 * @summary Builds one fence census (`{count, ids}`) from one run's own ingestion summary.
 *
 * The census answers "how many documents is this plane fencing, and which" — the observable that
 * replaces silence when a chunk is fenced instead of blocking the corpus. Once a fence-only run
 * COMPLETES, it is also the only standing signal left: the held checkpoint that used to say
 * "something is wrong here" is gone by design.
 *
 * Derived from the summary's own rows rather than re-reading the poison store: the run's summary is
 * what the sync lane already trusts for every other scheduling decision, and a second reader could
 * disagree with the writer that produced it.
 *
 * The two families stay SEPARATE censuses rather than one total. `IngestionService` writes them
 * apart for the operator-facing reason that a merged number destroys — a content poison is a file to
 * fix, an undeliverable chunk is a ceiling to raise, and a single count tells you to do the wrong one.
 *
 * Ids are tenant-aware chunk hashes, re-validated here even though {@link isDurableFenceRow} already
 * gated them — this builder must stay correct if it is ever pointed at rows from another path.
 * A row that cannot name its chunk never reaches here: it fails the fence gate and keeps its run
 * DEFERRING, which is the load-bearing direction now that completion hands observability to this
 * census. Completing on rows nobody can enumerate would leave an operator with a fenced corpus and
 * no signal at all. `null` means "no census observed" (no rows of this family), never "zero measured".
 *
 * @param {Object}   summary   Ingestion summary returned by the run.
 * @param {String}   dispositionValue One closed durable-fence disposition selecting a family.
 * @returns {{count: Number, ids: String[]}|null}
 */
function buildFenceCensus(summary, dispositionValue) {
    const rows = (Array.isArray(summary?.errors) ? summary.errors : [])
        .filter(item => isDurableFenceRow(item) && item.details.disposition === dispositionValue);

    if (rows.length === 0) {
        return null;
    }

    const ids = [...new Set(
        rows.map(item => item.details.chunkId)
            .filter(id => typeof id === 'string' && CHUNK_ID_PATTERN.test(id))
    )].sort();

    return {
        count: rows.length,
        ids  : ids.slice(0, UNDELIVERABLE_CENSUS_MAX_IDS)
    };
}

/**
 * @summary Builds the undeliverable-at-geometry census — healthy content the plane cannot deliver.
 * @param {Object} summary Ingestion summary returned by the run.
 * @returns {{count: Number, ids: String[]}|null}
 */
function buildUndeliverableCensus(summary) {
    return buildFenceCensus(summary, 'undeliverable-at-geometry');
}

/**
 * @summary Builds the proven-content-poison census — content whose own shape defeated embedding.
 * @param {Object} summary Ingestion summary returned by the run.
 * @returns {{count: Number, ids: String[]}|null}
 */
function buildContentPoisonCensus(summary) {
    return buildFenceCensus(summary, 'proven-content-poison');
}

/**
 * @summary Verifies a graph receipt against the current full-materialization identity.
 * @param {*} receipt Candidate graph receipt.
 * @param {String} expectedDigest Digest of the current manifest-bearing envelope.
 * @returns {Boolean}
 */
function isMatchingMaterializationReceipt(receipt, expectedDigest) {
    return Boolean(
        receipt
        && receipt.ingestContractVersion === TENANT_REPO_INGEST_CONTRACT_VERSION
        && receipt.envelopeDigest === expectedDigest
        && /^[a-f0-9]{32}$/u.test(receipt.attemptId)
        && Number.isSafeInteger(receipt.recordedAt)
        && receipt.recordedAt > 0
    )
}

/**
 * @summary Requires a durable positive-effect proof before a full materialization can commit.
 *
 * A manifest-bearing envelope represents bootstrap, non-linear fallback, manual full
 * replay, or legacy revalidation. It must reach ingestion before this check so an
 * empty manifest can reconcile and delete stale rows. A fresh attempt must prove a
 * safely-counted ingest/delete effect or a source-observed empty manifest, and persist
 * its matching graph receipt. A zero-effect retry may settle an unacknowledged
 * receipt left by a prior positive attempt whose checkpoint commit failed, and — only on a
 * manifest that authoritatively declares NO content — a receipt whose attempt is already
 * committed, because that is proof of a prior success rather than an absence of proof. On a
 * manifest that declares content, a zero-effect attempt still cannot manufacture a receipt.
 * Incremental envelopes have no manifest and may remain healthy zero-delta checkpoints.
 *
 * @param {Object} envelope Tenant-repo ingestion envelope.
 * @param {Object} summary Validated completion-compatible ingestion summary. May carry coherent
 *     durable-fence rows; those remain operator evidence while no longer representing live work.
 * @param {Object|null} priorState Previous durable checkpoint.
 * @param {Object|null} materializationAttempt Current opaque full-attempt identity.
 * @returns {Object|null} Receipt to acknowledge in the final checkpoint.
 * @throws {TenantRepoSyncError} When a full materialization has no proved effect.
 */
function assertFullMaterializationEffect(envelope, summary, priorState, materializationAttempt) {
    if (envelope?.manifestSnapshot == null) {
        return null
    }

    const
        expectedDigest = createTenantRepoMaterializationDigest(envelope),
        receipt        = summary.materializationReceipt,
        validReceipt   = isMatchingMaterializationReceipt(receipt, expectedDigest),
        hasEffect      = [summary.ingested, summary.deleted]
            .some(value => Number.isSafeInteger(value) && value > 0),
        // The envelope's own manifest, not a proxy for it: `pathsAfterPush` is what the repo carries
        // after the push, so an EMPTY array is a positive statement that there is nothing to ingest —
        // and a non-empty one is what makes zero effect a finding.
        declaredPaths     = envelope.manifestSnapshot.pathsAfterPush,
        declaresNoContent = Array.isArray(declaredPaths) && declaredPaths.length === 0,
        // Chunks that reached the pipeline and were refused before the provider. Disjoint from
        // `ingested`, which counts embeddable chunks only.
        skippedOversized  = Number.isSafeInteger(summary.skippedOversized) ? summary.skippedOversized : 0,
        provesCurrentAttempt = validReceipt
            && receipt.attemptId === materializationAttempt?.attemptId,
        provesUncommittedRetry = validReceipt
            && receipt.attemptId !== materializationAttempt?.attemptId
            && receipt.attemptId !== priorState?.lastCommittedMaterializationAttemptId,
        // **The third receipt state, and its absence is what made a repeated full replay fail.** The two
        // predicates above are not exhaustive over "a matching receipt exists": a receipt can
        // be neither the current attempt's nor uncommitted, because it is COMMITTED AND OLDER. That is
        // what a manual `fullReplay` of an unchanged repo produces — the producer reuses the stored
        // receipt on a digest match, so `provesCurrentAttempt` is false (its id predates this attempt)
        // and `provesUncommittedRetry` is false (that id IS the committed one). Both proof paths declined
        // the same receipt for opposite reasons and it fell through to a throw describing the reverse
        // situation. A receipt whose attempt is already committed is *proof of a prior success*, not an
        // absence of proof.
        provesCommittedSuccess = validReceipt
            && Boolean(priorState?.lastCommittedMaterializationAttemptId)
            && receipt.attemptId === priorState.lastCommittedMaterializationAttemptId;

    // These two arms are OPPOSITE findings and they used to share one code and one message. The
    // message described the second arm, so an operator hitting the first would be told the reverse of
    // what happened.
    //
    // **Asymmetric warrant, stated because it governs how much this is worth trusting.** The
    // zero-effect arm below is the observed one — `ingested=0` with no committed proof is what the
    // live `ingested=50, embeddings=50, errors=0`-with-no-receipt report reduces to once you notice
    // the receipt was ABSENT rather than mismatched. The effect-bearing arm above is
    // defence-in-depth: no known producer path delivers effect-plus-unmatched-proof, because
    // `persistManifestSnapshot` mints a matching receipt on positive effect and reuses a prior one
    // only on a digest match. It is refused here because a fail-closed guard must refuse it, not
    // because it has been seen.
    //
    // They are separate CODES rather than one code plus a discriminating field because the durable
    // per-repo state persists `lastErrorCode` alone; there is no `lastErrorDetails` in `ai/`, so a
    // field would be dropped at the persistence boundary and reach nobody. `details` is still
    // populated for a log reader, but the code is what has to carry the distinction.
    if (hasEffect && !provesCurrentAttempt) {
        throw new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN,
            'Tenant-repo full materialization took effect but no receipt proves this attempt.',
            {
                phase               : 'full-materialization',
                // Counts and booleans only — no paths, filenames, or repo content, matching the
                // credential discipline already applied to ingestion error messages.
                ingested            : summary.ingested,
                deleted             : summary.deleted,
                receiptPresent      : Boolean(receipt),
                receiptMatchesDigest: validReceipt
            }
        )
    }

    // **A repo with nothing to ingest is a SUCCESS, but success still needs durable proof.** Returning
    // `null` here used to let the caller report `completed` while persisting no committed attempt id;
    // checkpoint classification then remained FAILED and every later sweep replayed from a null base.
    // The producer now emits the same digest-bound current-attempt receipt used for effect-bearing
    // materializations, but only after it observes a zero-error authoritative empty manifest.
    // Requiring the manifest fact prevents a forged receipt on a non-empty manifest from laundering a
    // silent drop into success — either predicate alone would look correct in review, and the
    // conjunction is what refuses the forgery.
    //
    // **`provesCommittedSuccess` joins `provesCurrentAttempt` because the two are the same claim at
    // different ages.** A repeated manual `fullReplay` of an unchanged empty repo carries the stored
    // receipt, whose attempt is already committed: nothing new happened, and nothing new needed to.
    // Refusing it reported `degraded` with a failure streak on a repo whose checkpoint was `complete`.
    if (!hasEffect && declaresNoContent && (provesCurrentAttempt || provesCommittedSuccess)) {
        return receipt
    }

    // Content arrived and every chunk was refused before the provider. Sharing the code below told the
    // operator *nothing arrived, look at the embed stage* — the reverse of what happened, and the same
    // mislabelling the arm above was split out to end. Still fail-closed: a repo whose content cannot
    // be embedded is not synced, and calling it `completed` would make a broken tenant read as healthy.
    // Whether this case should instead commit is a product judgement recorded as open on the ticket.
    if (!hasEffect && skippedOversized > 0) {
        throw new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE,
            'Tenant-repo materialization produced no ingestible chunk: every candidate was refused before the provider.',
            {
                phase               : 'full-materialization',
                ingested            : summary.ingested,
                deleted             : summary.deleted,
                skippedOversized,
                declaredPathCount   : Array.isArray(declaredPaths) ? declaredPaths.length : null,
                receiptPresent      : Boolean(receipt),
                receiptMatchesDigest: validReceipt
            }
        )
    }

    if (!hasEffect && !provesUncommittedRetry) {
        throw new TenantRepoSyncError(
            KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION,
            'Tenant-repo full materialization produced no durable positive-effect proof.',
            {
                phase               : 'full-materialization',
                ingested            : summary.ingested,
                deleted             : summary.deleted,
                receiptPresent      : Boolean(receipt),
                receiptMatchesDigest: validReceipt
            }
        )
    }

    return receipt
}

/**
 * @summary Cloud-deployable scheduler lane that pulls tenant repos into the deployment KB.
 *
 * Bridges the `tenant-repo-sync` Orchestrator periodic lane (registered via
 * `taskDefinitions.mjs` `serviceTask: true`) to the per-repo refresh cycle:
 *
 * ```
 *   tenantRepos[] config (normalized via TenantRepoAccessContract)
 *     -> per-repo loop
 *          -> GitMirror.cloneIfMissing + GitMirror.fetch
 *          -> buildIngestEnvelope({tenantId, repoSlug, mirrorRoot, lastIngestedRev, ...})
 *          -> KnowledgeBaseIngestionService.ingestSourceFiles(envelope) (viaMcp: false)
 *          -> require an explicit error-free ingestion summary
 *          -> persist lastIngestedRev for next cycle
 * ```
 *
 * The push-based ingestion path (`ingest_source_files`, `npm run ai:kb-push-client`,
 * `npm run ai:ingest-tenant`) is unchanged. This lane is the additive PULL complement
 * for cloud tenant deployments. Local-only lanes (`primary-dev-sync`, `kbSync`,
 * `bridgeDaemon`) are unaffected — `kbSync` is never re-pointed at tenant content per
 * the cloud-deployment lane-classification ADR's separation invariant.
 *
 * Per-repo failure isolation: a failure on one tenantRepo entry does NOT halt the
 * sweep; it is logged + healthService-recorded + the remaining repos continue. The
 * outer task lifecycle reports `completed` when no repos failed OR at least one repo
 * succeeded (partial-success contract — per-repo isolation precludes all-or-nothing
 * semantics); `failed` only when every configured repo failed; `skipped` when no
 * repos were configured; `starved` when the sweep attempted nothing because EVERY
 * configured repo is backoff-suppressed with zero lifetime successes (the lane
 * machinery is healthy, but the knowledge base it feeds cannot receive content;
 * the detector emits one heal-ledger record per episode once the oldest suppression
 * exceeds `tenantRepoSync.starvedAfterMs`).
 *
 * @class Neo.ai.daemons.services.TenantRepoSyncService
 * @extends Neo.core.Base
 * @singleton
 * @see ai/services/knowledge-base/helpers/gitMirror.mjs
 * @see ai/services/knowledge-base/helpers/tenantRepoIngestEnvelopeBuilder.mjs
 * @see ai/services/knowledge-base/helpers/tenantRepoAccessContract.mjs
 * @see learn/agentos/cloud-deployment/TenantIngestionModel.md
 * @see https://github.com/neomjs/neo/issues/16045
 */

/**
 * Filename suffix of the in-flight attempt sidecar, resolved beside the revisions manifest.
 *
 * Attempt state (`lastRunAttemptAt`, `consecutiveFailures`) is the only input to the backoff
 * decision, and both used to advance ONLY after the work returned. A failure that prevents
 * the work from returning — OOM, SIGKILL, host sleep, container stop mid-sweep — therefore
 * left no record that anything was tried, `due` stayed true, and the lane retried at full
 * cadence forever. A crash loop is precisely what backoff exists to dampen, and it was the
 * one failure class where backoff could not engage: the dampening was available only to
 * failures polite enough to return.
 *
 * The record cannot live in the manifest itself. That file is a commit log, and its
 * commit-point fence is a hard contract: an evicted writer must abort *without writing*, and a
 * renewal failure must leave no manifest at all. An in-flight attempt is by definition
 * uncommitted, so it belongs beside the manifest rather than inside it. Sweep start folds any
 * residue in, at which point it IS a committed fact and travels through the normal path.
 *
 * @member {String} IN_FLIGHT_SUFFIX='.in-flight'
 */
const IN_FLIGHT_SUFFIX = '.in-flight';

/**
 * How many repo identities the collapsed-backoff-margin WARN names per required-minimum group.
 *
 * The message is the guard's only user-visible surface and an operator edits config from it, so the
 * identities have to be there — but a deployment with a hundred repos on one cadence would otherwise
 * put a hundred labels in one line. Grouping by required minimum keeps the useful part bounded by the
 * number of distinct cadences; this bounds the tail inside each group, and the elision is printed as
 * `+N more` rather than dropped, because a truncated list that looks complete is worse than a long one.
 *
 * @member {Number} IDENTITIES_PER_WARN_GROUP=3
 */
const IDENTITIES_PER_WARN_GROUP = 3;

class TenantRepoSyncService extends Base {
    /**
     * Latches the once-per-process inverted-leaf-order warning (runTask boundary): the
     * first sweep emits it, later sweeps stay quiet. Deliberately not reactive — it is
     * process-local latch state, not configuration.
     * @member {Boolean} starvedOrderWarned=false
     * @protected
     */
    starvedOrderWarned = false
    /**
     * Latches the once-per-process collapsed-backoff-margin warning (sweep boundary, where the
     * repo set is resolved): the first sweep emits it, later sweeps stay quiet. Sibling of
     * {@link TenantRepoSyncService#starvedOrderWarned} and process-local latch state for the
     * same reason — it is not configuration.
     * @member {Boolean} backoffMarginWarned=false
     * @protected
     */
    backoffMarginWarned = false

    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.TenantRepoSyncService'
         * @protected
         */
        className: 'Neo.ai.daemons.services.TenantRepoSyncService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true,
        /**
         * Concurrency cap on simultaneous tenant-repo git/ingest work within one
         * `runTask` invocation. Default `2` is conservative for multi-tenant
         * cloud deployments. Set to `1` to serialize all work when deployment
         * capacity is constrained. Set higher when network/CPU headroom permits.
         * @member {Number} concurrencyLimit_=2
         * @reactive
         */
        concurrencyLimit_: 2,
        /**
         * Maximum time a per-repo task waits to acquire a concurrency slot before
         * surfacing `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT`. Default `0`
         * keeps ordinary work in the FIFO until a slot is released: timing out a
         * waiter cannot bound `runTask` while the active holder is still pending,
         * and recording that waiter as failed creates backoff without an attempt.
         * A positive value remains an explicit fail-fast override.
         * @member {Number} concurrencyGateTimeoutMs_=0
         * @reactive
         */
        concurrencyGateTimeoutMs_: 0
    }

    /**
     * Process-local tenant-repo capability evidence. Hidden fingerprints exist
     * only to detect effective config or credential rotation; the public getter
     * projects status, code, and timestamp only. Container restart deliberately
     * clears the cache and returns readiness to unknown until bootstrap probes run.
     * @member {Map<String, Object>} accessReadinessCache
     * @protected
     */
    accessReadinessCache = new Map()

    /**
     * Process-owned cadence gate for the embedding recovery canary. Never replaces or hydrates the
     * durable per-repo scheduler.
     * @member {Object|null} embeddingRecoveryGate
     * @protected
     */
    embeddingRecoveryGate = null

    /**
     * Latest bounded canary delivery, retained only for deployment-state classification.
     * @member {Object|null} embeddingRecoveryLastResult
     * @protected
     */
    embeddingRecoveryLastResult = null

    /**
     * Mutable attempt seam read by the stable gate closure; tests replace it without replacing the gate.
     * @member {Function|null} embeddingRecoveryProbeFn
     * @protected
     */
    embeddingRecoveryProbeFn = null

    /**
     * Clock seam read by the stable gate closure.
     * @member {Function} embeddingRecoveryClock
     * @protected
     */
    embeddingRecoveryClock = Date.now

    /**
     * Rejects non-positive-integer `concurrencyLimit` values. `0` would create a
     * never-acquirable semaphore; negatives and fractional values produce ambiguous
     * `active < limit` semantics (1.5 admits two slots, etc.). Invalid values fall
     * back to the previous valid value, or the template default if no prior value.
     *
     * @param {*} value
     * @param {Number} oldValue
     * @returns {Number}
     */
    beforeSetConcurrencyLimit(value, oldValue) {
        if (!Number.isInteger(value) || value < 1) return oldValue ?? 2;
        return value;
    }

    /**
     * Rejects non-finite or negative `concurrencyGateTimeoutMs` values. `0` is a
     * valid sentinel meaning "no timeout — slots wait indefinitely until release".
     *
     * @param {*} value
     * @param {Number} oldValue
     * @returns {Number}
     */
    beforeSetConcurrencyGateTimeoutMs(value, oldValue) {
        if (!Number.isFinite(value) || value < 0) return oldValue ?? 0;
        return value;
    }

    /**
     * @summary Returns a bounded readiness result for one effective repository.
     * @param {Object} repo Tenant and repository identity.
     * @param {Object} [options]
     * @param {Number} [options.observedAt=Date.now()] Observation epoch.
     * @returns {{status: String, code: String, checkedAt: String}|null}
     */
    getTenantRepoAccessReadiness(repo = {}, {observedAt = Date.now()} = {}) {
        const entry = this.accessReadinessCache.get(createTenantRepoAccessKey(repo));

        if (!entry) {
            return null;
        }

        if (!Number.isFinite(entry.expiresAt) || entry.expiresAt <= observedAt) {
            return {
                status   : TenantRepoAccessStatus.UNKNOWN,
                code     : TenantRepoAccessCode.EVIDENCE_EXPIRED,
                checkedAt: entry.checkedAt
            };
        }

        return {
            status   : entry.status,
            code     : entry.code,
            checkedAt: entry.checkedAt
        };
    }

    /**
     * @summary Clears volatile access evidence, mirroring a process restart.
     * @returns {void}
     * @protected
     */
    clearTenantRepoAccessReadiness() {
        this.accessReadinessCache.clear();
    }

    /**
     * @summary Clears process-local recovery-probe state, mirroring an orchestrator restart.
     * @returns {void}
     * @protected
     */
    clearEmbeddingRecoveryProbeState() {
        this.embeddingRecoveryGate       = null;
        this.embeddingRecoveryLastResult = null;
        this.embeddingRecoveryProbeFn    = null;
        this.embeddingRecoveryClock      = Date.now;
    }

    /**
     * @summary Returns a bounded, read-only recovery canary projection for deployment diagnostics.
     * @returns {Object}
     */
    getEmbeddingRecoveryProbeSnapshot() {
        const snapshot = this.embeddingRecoveryGate?.snapshot?.() || {
                  status       : 'never-started',
                  failureStreak: 0,
                  backoffMs    : 0,
                  nextAttemptAt: null,
                  terminal     : false,
                  stopReason   : null,
                  cached       : null
              },
              delivered = this.embeddingRecoveryLastResult,
              failure   = delivered?.status === 'healthy'
                  ? null
                  : (delivered || snapshot.cached?.result || null);

        return {
            status             : snapshot.status,
            checkedAt          : delivered?.gate?.checkedAt ?? snapshot.cached?.checkedAt ?? null,
            lastDemandCached   : delivered?.gate?.cached ?? null,
            failureStreak      : snapshot.failureStreak,
            backoffMs          : snapshot.backoffMs,
            nextAttemptAt      : snapshot.nextAttemptAt,
            terminal           : snapshot.terminal,
            stopReason         : snapshot.stopReason,
            errorClassification: failure?.errorClassification || null,
            errorCode          : failure?.errorCode || null
        };
    }

    /**
     * @summary Runs or reuses one process-owned embedding recovery canary generation.
     *
     * The cohort's durable episode ids participate in the gate key, so a later outage rotates to a
     * fresh process generation even when the configured provider is unchanged. Gate state governs
     * probe cadence/backoff only; callers decide whether a healthy observation can be committed.
     *
     * @param {Object} options
     * @param {String[]} options.episodeKeys Awaiting durable episode/generation-history keys.
     * @param {Function} [options.runProbe] Attempt seam.
     * @param {Function} [options.clock=Date.now] Clock seam.
     * @param {Number} [options.timeoutMs=30000] Consumer-owned provider deadline.
     * @param {Number} [options.failureTtlMs=30000] Probe failure backoff floor.
     * @param {Number} [options.failureTtlMaxMs=600000] Probe failure backoff ceiling.
     * @returns {Promise<Object|null>}
     */
    async probeEmbeddingRecovery({
        episodeKeys,
        runProbe,
        clock = Date.now,
        timeoutMs = EMBEDDING_RECOVERY_PROBE_TIMEOUT_MS,
        failureTtlMs = EMBEDDING_RECOVERY_FAILURE_TTL_MS,
        failureTtlMaxMs = EMBEDDING_RECOVERY_FAILURE_TTL_MAX_MS
    } = {}) {
        if (!Array.isArray(episodeKeys) || episodeKeys.length === 0) return null;

        this.embeddingRecoveryClock = clock;
        this.embeddingRecoveryProbeFn = runProbe || (() => buildEmbeddingProbeBlock({
            cfg      : AiConfig,
            embedText: (text, explicitProvider, options) =>
                TextEmbeddingService.embedText(text, explicitProvider, options),
            input         : 'neo-tenant-repo-sync-embedding-recovery-canary',
            operationLabel: 'Tenant repo sync embedding recovery probe',
            now           : this.embeddingRecoveryClock,
            timeoutMs
        }));

        if (!this.embeddingRecoveryGate) {
            this.embeddingRecoveryGate = createBoundedRetryGate({
                run: async context => {
                    try {
                        return await this.embeddingRecoveryProbeFn(context);
                    } catch {
                        return {
                            status             : 'failed',
                            error              : 'probe-could-not-run:EMBEDDING_PROBE_EXECUTION_ERROR',
                            errorClassification: 'probe-could-not-run',
                            errorCode          : 'EMBEDDING_PROBE_EXECUTION_ERROR'
                        };
                    }
                },
                failureTtlMs,
                failureTtlMaxMs,
                now: () => this.embeddingRecoveryClock()
            });
        }

        const key = `${AiConfig.embeddingProvider}:${AiConfig.vectorDimension}:${[...episodeKeys].sort().join(',')}`;

        this.embeddingRecoveryLastResult = await this.embeddingRecoveryGate.tick({key});
        return this.embeddingRecoveryLastResult;
    }

    /**
     * @summary Probes every enabled effective repository at bootstrap or access-config rotation.
     *
     * Local credential resolution runs on every sweep so file/key replacement is observed.
     * Remote capability work runs only when the process-local config or credential fingerprint
     * changes. A failure remains isolated to its repository and never prevents other probes or
     * the authoritative scheduled clone/fetch path.
     *
     * @param {Object} options
     * @param {Object[]} options.repos Effective tenant repositories.
     * @param {Object} [options.gitMirror=GitMirror] GitMirror-compatible primitive.
     * @param {Function} [options.writeLog] Optional orchestrator logger.
     * @param {Number} [options.globalCadenceMs] Global per-repo cadence fallback.
     * @returns {Promise<void>}
     */
    async refreshTenantRepoAccessReadiness({
        repos = [],
        gitMirror = GitMirror,
        writeLog,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs
    } = {}) {
        const enabledRepos = repos.filter(repo => !isTenantRepoDisabled(repo));
        const activeKeys   = new Set(enabledRepos.map(createTenantRepoAccessKey));

        for (const key of this.accessReadinessCache.keys()) {
            if (!activeKeys.has(key)) {
                this.accessReadinessCache.delete(key);
            }
        }

        const semaphore = createConcurrencySemaphore({
            limit: this.concurrencyLimit
        });

        await Promise.all(enabledRepos.map(async repo => {
            await semaphore.acquire();

            try {
                await this.refreshTenantRepoAccessReadinessEntry({
                    repo,
                    gitMirror,
                    writeLog,
                    globalCadenceMs
                });
            } finally {
                semaphore.release();
            }
        }));
    }

    /**
     * @summary Refreshes one process-local access-readiness cache entry.
     * @param {Object} options
     * @param {Object} options.repo Effective tenant repository.
     * @param {Object} options.gitMirror GitMirror-compatible primitive.
     * @param {Function} [options.writeLog] Optional orchestrator logger.
     * @param {Number} options.globalCadenceMs Global per-repo cadence fallback.
     * @returns {Promise<void>}
     * @protected
     */
    async refreshTenantRepoAccessReadinessEntry({repo, gitMirror, writeLog, globalCadenceMs}) {
        const
            key        = createTenantRepoAccessKey(repo),
            checkedAt  = new Date().toISOString(),
            maxAgeMs   = getAccessReadinessMaxAgeMs(repo, globalCadenceMs),
            nextExpiry = Date.now() + maxAgeMs;

        let configFingerprint;

        try {
            configFingerprint = hashTenantRepoAccessConfig(repo);
        } catch {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.DEGRADED,
                code                 : TenantRepoAccessCode.CREDENTIAL_INVALID,
                checkedAt,
                configFingerprint    : null,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            return;
        }

        if (
            typeof gitMirror?.inspectCredentialReadiness !== 'function'
            || typeof gitMirror?.probeRemoteAccess !== 'function'
        ) {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.UNKNOWN,
                code                 : TenantRepoAccessCode.PROBE_UNAVAILABLE,
                checkedAt,
                configFingerprint,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            return;
        }

        let local;

        try {
            local = await gitMirror.inspectCredentialReadiness({
                credentialRef: repo.credentialRef
            });
        } catch {
            local = null;
        }

        if (
            local?.status !== TenantRepoAccessStatus.READY
            || typeof local.cacheFingerprint !== 'string'
            || !local.cacheFingerprint
        ) {
            this.accessReadinessCache.set(key, {
                status               : TenantRepoAccessStatus.DEGRADED,
                code                 : TenantRepoAccessCode.CREDENTIAL_INVALID,
                checkedAt,
                configFingerprint,
                credentialFingerprint: null,
                expiresAt            : nextExpiry,
                maxAgeMs
            });
            writeLog?.('WARN', `[TenantRepoSync] Access preflight degraded for ${key}: ${TenantRepoAccessCode.CREDENTIAL_INVALID}.`);
            return;
        }

        const previous = this.accessReadinessCache.get(key);

        if (
            previous?.configFingerprint === configFingerprint
            && previous?.credentialFingerprint === local.cacheFingerprint
            && Number.isFinite(previous.expiresAt)
            && previous.expiresAt > Date.now()
        ) {
            return;
        }

        let probe;

        try {
            probe = await gitMirror.probeRemoteAccess({
                cloneUrl     : repo.cloneUrl,
                credentialRef: repo.credentialRef,
                mirrorRoot   : repo.mirrorRoot,
                ref          : repo.branchRef || 'HEAD'
            });
        } catch {
            probe = null;
        }

        const
            validOutcome = isTenantRepoAccessReadinessOutcome(probe?.status, probe?.code),
            status       = validOutcome ? probe.status : TenantRepoAccessStatus.DEGRADED,
            code         = validOutcome ? probe.code : TenantRepoAccessCode.PROBE_FAILED;

        this.accessReadinessCache.set(key, {
            status,
            code,
            checkedAt            : safeAccessReadinessTimestamp(probe?.checkedAt, checkedAt),
            configFingerprint,
            credentialFingerprint: typeof probe?.cacheFingerprint === 'string' && probe.cacheFingerprint
                ? probe.cacheFingerprint
                : local.cacheFingerprint,
            expiresAt: nextExpiry,
            maxAgeMs
        });

        if (status !== TenantRepoAccessStatus.READY) {
            writeLog?.('WARN', `[TenantRepoSync] Access preflight degraded for ${key}: ${code}.`);
        }
    }

    /**
     * @summary Lets an authoritative clone/fetch result supersede cached probe evidence.
     * @param {Object} options
     * @param {Object} options.repo Effective tenant repository.
     * @param {Boolean} options.ready Whether Git acquisition succeeded.
     * @param {Error} [options.error] GitMirror failure when acquisition did not succeed.
     * @param {Number} [options.globalCadenceMs] Global per-repo cadence fallback.
     * @returns {void}
     * @protected
     */
    recordTenantRepoAccessOutcome({
        repo,
        ready,
        error,
        globalCadenceMs = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs
    } = {}) {
        const
            key       = createTenantRepoAccessKey(repo),
            previous  = this.accessReadinessCache.get(key) || {},
            checkedAt = new Date().toISOString(),
            maxAgeMs  = getAccessReadinessMaxAgeMs(repo, globalCadenceMs),
            // Classified through the shared lane classifier, NOT flattened to SYNC_FAILED. This
            // previously recognised one error code and collapsed every other cause, so an
            // under-scoped credential, an absent repository and an unreachable host all persisted
            // as "sync failed" — three different operator fixes behind one indistinguishable code,
            // which is exactly the state that left a wedged deployment undiagnosable from outside.
            code      = ready
                ? TenantRepoAccessCode.READY
                : classifySyncFailure(error);

        this.accessReadinessCache.set(key, {
            ...previous,
            status   : ready ? TenantRepoAccessStatus.READY : TenantRepoAccessStatus.DEGRADED,
            code,
            checkedAt,
            expiresAt: Date.now() + maxAgeMs,
            maxAgeMs
        });
    }

    /**
     * Runs the tenant-repo-sync task under orchestrator state + health envelopes.
     *
     * Error code taxonomy (see `./TenantRepoSyncErrors.mjs`). Operators branch on
     * `details.repos[i].lastErrorCode` for per-repo failures,
     * `details.repos[i].lastSourceErrorCode` for redacted sibling-subsystem
     * provenance, and `details.reasonCode` for outer-task structural failures.
     * Underlying transport errors
     * (GitMirror auth, ChromaDB write, etc.) are wrapped as
     * `KB_TENANT_REPO_SYNC_SYNC_FAILED` so callers can rely on the stable prefix
     * without parsing message prose. When the underlying error already carried a
     * stable `KB_*` code (for example `KB_GITMIRROR_FETCH_FAILED`), that code is
     * preserved as `lastSourceErrorCode` without copying raw stderr, URLs, or
     * credential material.
     *
     * | Code | Surface | Trigger |
     * |---|---|---|
     * | `KB_TENANT_REPO_SYNC_SYNC_FAILED` | per-repo `lastErrorCode` | underlying clone/fetch/envelope/ingest failure (wraps the original error) |
     * | `KB_TENANT_REPO_SYNC_EMPTY_MATERIALIZATION` | per-repo `lastErrorCode` | full materialization produced NO positive effect and no matching unacknowledged retry receipt — nothing arrived; look at the embed stage |
     * | `KB_TENANT_REPO_SYNC_MATERIALIZATION_UNPROVEN` | per-repo `lastErrorCode` | full materialization DID take effect, but no receipt proves this attempt — the rows landed and the proof is missing, so do NOT re-ingest |
     * | `KB_TENANT_REPO_SYNC_CONTENT_NOT_EMBEDDABLE` | per-repo `lastErrorCode` | the repo declares content and every candidate chunk was refused BEFORE the provider — re-ingesting cannot help; the actionable surface is chunking or the safe band |
     * | `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED` | outer `details.reasonCode` | `onlyRepoSlugs` requested ANY slug that is not in `tenantRepos[]` — the run refuses whole rather than processing the recognised subset |
     * | `KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED` | outer `details.reasonCode` | `tenant-repo-sync-revisions.json` write failure (next cycle settles the unacknowledged graph receipt idempotently) |
     * | `KB_TENANT_REPO_SYNC_TENANT_NOT_FOUND` | reserved | future `--tenant-id` CLI flag; no current emitter |
     * | `KB_TENANT_REPO_SYNC_CONCURRENCY_GATE_TIMEOUT` | per-repo `lastErrorCode` | concurrency-gate slot-acquisition timeout after `concurrencyGateTimeoutMs` |
     *
     * @param {Object} options
     * @param {String} [options.taskName='tenant-repo-sync']
     * @param {String} options.reason Scheduling reason (e.g. `'periodic-sweep:1800000'` or `'manual'`).
     * @param {Object} options.taskStateService Orchestrator task-state service.
     * @param {Object} [options.healthService] HealthService-compatible sink.
     * @param {Function} [options.writeLog] Orchestrator logger.
     * @param {Object} [options.tenantReposConfig] Pre-normalized tenantRepos config. If omitted, resolved across config tiers via `KnowledgeBaseIngestionService.listConfiguredTenantRepos`.
     * @param {Object} [options.gitMirror=GitMirror] Injectable mirror primitive (test seam).
     * @param {Object} [options.knowledgeBaseIngestionService] KB ingestion service singleton (test seam). Resolved from `ai/services.mjs` if omitted.
     * @param {String[]} [options.onlyRepoSlugs] If provided, only sync repos whose `repoSlug` is in the list. Used by the manual CLI run path. ANY requested slug that is not configured surfaces `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED` and syncs nothing — a partially mistyped selector refuses rather than silently processing the subset it recognised.
     * @param {Boolean} [options.fullReplay=false] Build selected-repo envelopes from a null revision base. Requires non-empty `onlyRepoSlugs`; persisted checkpoints remain unchanged until each replay completes without summary errors.
     * @param {String} [options.revisionsFilePath] Override the per-tenant-repo lastIngestedRev persistence file path (test seam). Defaults to `<orchestrator dataDir leaf>/tenant-repo-sync-revisions.json`.
     * @param {Number} [options.leaseStaleAfterMs] Override the cross-process lease TTL (test seam). Defaults to the `orchestrator.tenantRepoSync.leaseStaleAfterMs` leaf. Crashed owners recover immediately via pid-liveness; the TTL only bounds a live-but-wedged owner.
     * @param {Number} [options.leaseRenewalIntervalMs] Override the lease renewal cadence (test seam). Defaults to `max(5000, floor(leaseStaleAfterMs / 3))` — a live, renewing run never reaches its TTL deadline, so a replacement owner cannot start repo work while this one is still making progress.
     * @param {Function} [options.envelopeBuilder=buildIngestEnvelope] Injectable envelope-builder (test seam). Production callers omit; unit tests pass a fake that returns canned envelope shape.
     * @param {Function} [options.embeddingRecoveryProbe] Injectable embedding recovery canary.
     * @param {Function} [options.embeddingRecoveryClock=Date.now] Recovery gate clock seam.
     * @param {Number} [options.embeddingRecoveryProbeTimeoutMs=30000] Canary provider deadline.
     * @param {Number} [options.embeddingRecoveryFailureTtlMs=30000] Canary backoff floor.
     * @param {Number} [options.embeddingRecoveryFailureTtlMaxMs=600000] Canary backoff ceiling.
     * @returns {Promise<Object>} `{status, details}` — status ∈ {`completed`, `failed`, `skipped`, `starved`}.
     */
    async runTask({
        taskName = 'tenant-repo-sync',
        reason,
        taskStateService,
        healthService,
        writeLog,
        tenantReposConfig,
        gitMirror = GitMirror,
        knowledgeBaseIngestionService,
        onlyRepoSlugs,
        fullReplay = false,
        revisionsFilePath,
        envelopeBuilder   = buildIngestEnvelope,
        globalCadenceMs   = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio       = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        leaseStaleAfterMs = AiConfig.data.orchestrator.tenantRepoSync.leaseStaleAfterMs,
        backoffCapMs      = AiConfig.data.orchestrator.tenantRepoSync.backoffCapMs,
        starvedAfterMs    = AiConfig.data.orchestrator.tenantRepoSync.starvedAfterMs,
        leaseRenewalIntervalMs,
        seedBootstrap     = true,
        embeddingRecoveryProbe,
        embeddingRecoveryClock           = Date.now,
        embeddingRecoveryProbeTimeoutMs  = EMBEDDING_RECOVERY_PROBE_TIMEOUT_MS,
        embeddingRecoveryFailureTtlMs    = EMBEDDING_RECOVERY_FAILURE_TTL_MS,
        embeddingRecoveryFailureTtlMaxMs = EMBEDDING_RECOVERY_FAILURE_TTL_MAX_MS
    } = {}) {
        // One-time deployment sanity check on the two tuning leaves' RELATIONSHIP (never a
        // throw — a noisy alert beats a dead lane): an inverted floor makes ordinary capped
        // backoff emit heal records for transient outages. The checker stays out of the pure
        // predicates; this boundary is where the resolved values meet.
        if (!this.starvedOrderWarned && isStarvedOrderInverted({backoffCapMs, starvedAfterMs})) {
            this.starvedOrderWarned = true;
            writeLog?.('WARN', `[TenantRepoSync] tenantRepoSync.starvedAfterMs (${starvedAfterMs}) does not exceed backoffCapMs (${backoffCapMs}): a lane in ordinary capped backoff crosses the starved duration floor and emits heal records for a transient outage. Set starvedAfterMs above the cap, or 0 to disable the record.`);
        }

        const state = taskStateService.getTaskState(taskName);

        if (state?.running) {
            const details = {reason, skippedAt: new Date().toISOString(), reasonCode: 'already-running', pid: state.pid};
            writeLog?.('INFO', `[TenantRepoSync] Skipping; task already running.`);
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        // Cross-process serialization: the daemon's periodic sweep and the manual CLI are
        // separate processes sharing one revisions manifest, and the injected task-state
        // guard above is process-local only. One dedicated tokenized lease — a sibling
        // file of the manifest, so lock and data share a persistence/recovery boundary —
        // makes them mutually exclusive. Contention is a non-failure deferral that never
        // mutates any repo's checkpoint, attempt timestamp, or backoff state. Crashed
        // owners recover instantly via pid-liveness; the TTL bounds wedged-but-alive ones.
        const resolvedRevisionsPath = revisionsFilePath || this.defaultRevisionsFilePath();
        const resolvedLeasePath     = path.join(path.dirname(resolvedRevisionsPath), TENANT_REPO_SYNC_LEASE_FILE_NAME);

        let acquisition;
        try {
            acquisition = await acquireHeavyMaintenanceLease({
                owner       : `tenant-repo-sync:${reason === 'manual' ? 'manual' : 'scheduler'}`,
                reason      : 'tenant-repo-sync',
                leasePath   : resolvedLeasePath,
                staleAfterMs: leaseStaleAfterMs
            });
        } catch (e) {
            // An IO failure while creating the lease (unwritable state dir, broken volume)
            // is a lane failure, not a crash: keep the structured-result contract.
            const details = {
                reason,
                phase     : 'lease-acquire',
                error     : e.message,
                reasonCode: KB_TENANT_REPO_SYNC_SYNC_FAILED
            };
            taskStateService.markFailed(taskName, null, {status: 'failed', ...details});
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${KB_TENANT_REPO_SYNC_SYNC_FAILED} (lease-acquire: ${e.message})`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
        }

        if (!acquisition.acquired) {
            const heldLease = acquisition.lease;
            const details   = {
                reason,
                skippedAt      : new Date().toISOString(),
                reasonCode     : KB_TENANT_REPO_SYNC_LEASE_HELD,
                leaseOwner     : heldLease?.owner || 'unknown',
                leaseAcquiredAt: heldLease?.acquiredAt || null,
                leaseExpiresAt : heldLease?.expiresAt || null
            };
            writeLog?.('INFO', `[TenantRepoSync] Deferring; cross-process lease held by ${details.leaseOwner}.`);
            taskStateService.markSkipped(taskName, {status: 'skipped', ...details});
            healthService?.recordTaskOutcome?.(taskName, 'skipped', details);
            return {status: 'skipped', details};
        }

        taskStateService.markStarted(taskName, reason);

        // Work-level exclusivity is three cooperating parts:
        //
        // 1. RENEWAL — a live run extends its own deadline every
        //    `renewalIntervalMs` (default TTL/3, floor 5s), so a run that is
        //    still making progress never becomes TTL-stale and can never be
        //    reclaimed mid-work. Losing a renewal (replaced lease, missing
        //    file, IO failure) latches `leaseLost`.
        // 2. WORK FENCES — `leaseGuard` runs before each repo's git phase,
        //    before each KB ingest, and before every manifest commit. A run
        //    whose ownership is no longer provable stops STARTING protected
        //    work at the next fence instead of overlapping the successor;
        //    in-flight work is bounded to at most one fenced step.
        // 3. TTL BACKSTOP — pid-liveness + the (renewal-refreshed) deadline
        //    still bound a crashed or fully wedged owner for successors.
        let leaseLost       = false,
            renewalStopped  = false,
            renewalTimer    = null,
            renewalInFlight = Promise.resolve();

        const renewalIntervalMsResolved = leaseRenewalIntervalMs ?? Math.max(5000, Math.floor(leaseStaleAfterMs / 3));

        const scheduleRenewal = () => {
            renewalTimer = setTimeout(() => {
                // A timer already queued when the run settles cannot be canceled reliably. Refuse
                // it before it enters the lifecycle guard, and retain every started promise so the
                // finalizer can join it before releasing the lease and returning to the caller.
                if (renewalStopped) return;

                renewalInFlight = (async () => {
                    try {
                        const renewal = await renewHeavyMaintenanceLease({
                            token       : acquisition.lease.token,
                            leasePath   : resolvedLeasePath,
                            staleAfterMs: leaseStaleAfterMs
                        });

                        if (!renewal.renewed) {
                            leaseLost = true;
                            writeLog?.('WARN', `[TenantRepoSync] Lease renewal lost ownership (${renewal.status}); aborting at the next fence.`);
                            return;
                        }
                    } catch (e) {
                        leaseLost = true;
                        writeLog?.('WARN', `[TenantRepoSync] Lease renewal failed (${e.message}); aborting at the next fence.`);
                        return;
                    }

                    if (!renewalStopped) {
                        scheduleRenewal();
                    }
                })();
            }, renewalIntervalMsResolved);
            renewalTimer.unref?.();
        };
        scheduleRenewal();

        const leaseGuard = async () => {
            if (leaseLost) {
                throw new TenantRepoSyncError(
                    KB_TENANT_REPO_SYNC_LEASE_LOST,
                    'Tenant-repo-sync lease ownership was lost (renewal failure); aborting before further protected work.',
                    {phase: 'lease-fence'}
                );
            }

            const currentLease = await inspectHeavyMaintenanceLease({leasePath: resolvedLeasePath});

            if (!currentLease.active || currentLease.lease?.token !== acquisition.lease.token) {
                leaseLost = true;
                throw new TenantRepoSyncError(
                    KB_TENANT_REPO_SYNC_LEASE_LOST,
                    'Tenant-repo-sync lease ownership was lost; aborting before further protected work.',
                    {phase: 'lease-fence'}
                );
            }
        };

        try {
            const result = await this.syncTenantRepos({
                writeLog, tenantReposConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
                fullReplay, taskStateService, healthService, taskName, envelopeBuilder, leaseGuard,
                leasePath        : resolvedLeasePath,
                revisionsFilePath: resolvedRevisionsPath,
                globalCadenceMs, jitterRatio, backoffCapMs, starvedAfterMs, seedBootstrap,
                embeddingRecoveryProbe,
                embeddingRecoveryClock,
                embeddingRecoveryProbeTimeoutMs,
                embeddingRecoveryFailureTtlMs,
                embeddingRecoveryFailureTtlMaxMs
            });
            const status         = result.status;
            const lastCompletion = {
                status,
                reason,
                ...result.details
            };

            if (status === 'completed' || status === 'starved') {
                // A starved reading is a CLEAN sweep reporting a starved lane — the machinery
                // ran, so the run bookkeeping (lastSuccessAt) must still advance.
                taskStateService.markCompleted(taskName, lastCompletion);
            } else if (status === 'failed') {
                taskStateService.markFailed(taskName, null, lastCompletion);
            } else {
                taskStateService.markSkipped(taskName, lastCompletion);
            }

            healthService?.recordTaskOutcome?.(taskName, status, {reason, ...result.details});
            return result;
        } catch (e) {
            // Propagate stable error code + meta when the throw is a TenantRepoSyncError;
            // otherwise wrap as the unspecific KB_TENANT_REPO_SYNC_SYNC_FAILED so operators
            // can branch on `error.code` instead of message prose.
            const code    = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
            const meta    = (e instanceof TenantRepoSyncError) ? e.meta : undefined;
            const details = {
                reason,
                phase     : 'tenant-repo-sync',
                error     : e.message,
                reasonCode: code,
                ...(meta ? {meta} : {})
            };

            taskStateService.markFailed(taskName, null, {status: 'failed', ...details});
            writeLog?.('ERROR', `[TenantRepoSync] Failed: ${code} (${e.message})`);
            healthService?.recordTaskOutcome?.(taskName, 'failed', details);
            return {status: 'failed', details};
        } finally {
            // Token-guarded release on every settled path (success, returned-error result,
            // throw). A hard process crash skips this block by definition — the next
            // acquirer then reclaims via the pid-liveness stale check instead.
            renewalStopped = true;
            if (renewalTimer) {
                clearTimeout(renewalTimer);
            }
            await renewalInFlight;
            await releaseHeavyMaintenanceLease({token: acquisition.lease.token, leasePath: resolvedLeasePath});
        }
    }

    /**
     * Iterates configured tenantRepos and refreshes each via GitMirror → envelope → KB.
     *
     * @param {Object} options Forwarded from `runTask`.
     * @returns {Promise<Object>} `{status, details: {repoCount, completedCount, deferredCount, partialProgressCount, failedCount, results}}`.
     */
    async syncTenantRepos({
        writeLog, tenantReposConfig, gitMirror, knowledgeBaseIngestionService, onlyRepoSlugs,
        fullReplay = false, taskStateService, healthService, taskName, revisionsFilePath, envelopeBuilder = buildIngestEnvelope,
        leaseGuard         = async () => {},
        leasePath          = null,
        globalCadenceMs    = AiConfig.data.orchestrator.intervals.tenantRepoSyncMs,
        jitterRatio        = AiConfig.data.orchestrator.tenantRepoSync.jitterRatio,
        backoffCapMs       = AiConfig.data.orchestrator.tenantRepoSync.backoffCapMs,
        sliceBudgetMs      = AiConfig.data.orchestrator.tenantRepoSync.sliceBudgetMs,
        starvedAfterMs     = AiConfig.data.orchestrator.tenantRepoSync.starvedAfterMs,
        healEventLedgerDir = revisionsFilePath ? path.join(path.dirname(revisionsFilePath), 'heal-events') : null,
        seedBootstrap      = true,
        embeddingRecoveryProbe,
        embeddingRecoveryClock           = Date.now,
        embeddingRecoveryProbeTimeoutMs  = EMBEDDING_RECOVERY_PROBE_TIMEOUT_MS,
        embeddingRecoveryFailureTtlMs    = EMBEDDING_RECOVERY_FAILURE_TTL_MS,
        embeddingRecoveryFailureTtlMaxMs = EMBEDDING_RECOVERY_FAILURE_TTL_MAX_MS
    }) {
        if (fullReplay && (!Array.isArray(onlyRepoSlugs) || onlyRepoSlugs.length === 0)) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_SYNC_FAILED,
                'Full replay requires at least one explicitly selected repo slug.',
                {phase: 'full-replay-validation'}
            )
        }

        // Validated BEFORE any repo is admitted, not at the first yield check. A budget that only
        // fails once a slice is already running would refuse the sweep midway through a repo that
        // had already acquired a slot — the operator sees a partial sweep and a config error at the
        // same time and has to work out which caused which.
        assertSliceBudgetMs(sliceBudgetMs);

        const resolvedConfig = tenantReposConfig || await this.resolveTenantReposConfig({ingestionService: knowledgeBaseIngestionService});
        const allRepos       = resolvedConfig.tenantRepos || [];
        const repos          = onlyRepoSlugs
            ? allRepos.filter(r => onlyRepoSlugs.includes(r.repoSlug))
            : allRepos;

        // One-time deployment sanity check on the OTHER leaf relationship, and never a throw for the
        // same reason as its sibling at the runTask boundary. A cap that does not clear the JITTERED
        // base cadence binds at consecutiveFailures=0, so the 2^n curve never becomes a delay — a repo
        // failing consecutively is retried exactly as often as a healthy one — and `backoffCapped`
        // stops distinguishing a configured cadence from a capped one, which is the only reason it is
        // published. This check lives here rather than beside the starved-order one because the bound
        // is per-repo: a `tenantRepos[].cadenceMs` override larger than the global collapses the margin
        // for that repo alone, and the repo set does not exist until the config resolves.
        //
        // Evaluated over ALL configured repos, not the selected subset: a scoped CLI run must not
        // hide a collapsed margin on a repo it happened to skip.
        if (!this.backoffMarginWarned) {
            const collapsed = allRepos
                .map(repo => {
                    const baseCadenceMs = resolveRepoBaseCadenceMs({repo, globalCadenceMs});

                    return {
                        label       : `${repo.tenantId}/${repo.repoSlug}`,
                        baseCadenceMs,
                        minimumCapMs: resolveMinimumBackoffCapMs({baseCadenceMs, jitterRatio}),
                        collapsed   : isBackoffMarginCollapsed({backoffCapMs, baseCadenceMs, jitterRatio})
                    }
                })
                .filter(entry => entry.collapsed);

            if (collapsed.length > 0) {
                // Grouped by required minimum, and the minimum comes from the same helper the
                // predicate compares against rather than being recomputed here. A per-repo
                // `cadenceMs` override is the case this check moved to the sweep boundary to catch,
                // so naming only the global base would hand exactly that operator the wrong number
                // to work from — and the latch means they never see the message twice.
                const groups = new Map();

                for (const entry of collapsed) {
                    const key = `${entry.minimumCapMs}/${entry.baseCadenceMs}`;

                    groups.has(key) || groups.set(key, {...entry, labels: []});
                    groups.get(key).labels.push(entry.label);
                }

                // Identities are capped per group and the elision is stated: a silent truncation
                // reads as a complete list, and this list is what an operator edits config from.
                const detail = [...groups.values()].map(group => {
                    const shown      = group.labels.slice(0, IDENTITIES_PER_WARN_GROUP),
                          elided     = group.labels.length - shown.length,
                          identities = elided > 0 ? `${shown.join(', ')}, +${elided} more` : shown.join(', ');

                    return `needs >= ${group.minimumCapMs} for base ${group.baseCadenceMs} (${identities})`;
                }).join('; ');

                const highestMinimum = Math.max(...collapsed.map(entry => entry.minimumCapMs));

                this.backoffMarginWarned = true;
                writeLog?.('WARN', `[TenantRepoSync] tenantRepoSync.backoffCapMs (${backoffCapMs}) is below the minimum that binds only on failure streaks, for ${collapsed.length}/${allRepos.length} repo(s): ${detail}. At this cap those repos are capped at consecutiveFailures=0, so failure backoff never becomes a delay and backoffCapped reads true for a healthy repo. Raise backoffCapMs to at least ${highestMinimum}, or lower those repos' cadenceMs. jitterRatio=${jitterRatio}.`);
            }
        }

        // Distinguish "operator-requested-unknown-slug" from "no config at all", and refuse on ANY
        // unknown slug rather than only an all-unknown set. Keyed on "nothing matched", a partially
        // mistyped selector synced the known subset and dropped the rest silently at exit 0 — the
        // operator was told the run completed while the repo they meant went untouched. Shared with
        // the backoff-clear path so one typo cannot mean two things on one CLI.
        const unknownSelectors = resolveUnknownRepoSelectorFailure({onlyRepoSlugs, knownSlugs: allRepos.map(r => r.repoSlug)});

        if (unknownSelectors) {
            const details = {...unknownSelectors, repoCount: repos.length};

            writeLog?.('WARN', `[TenantRepoSync] Requested repoSlug(s) not configured: ${unknownSelectors.unknownSlugs.join(', ')}. Configured: ${unknownSelectors.configuredSlugs.join(', ') || '(none)'}.`);
            return {status: 'failed', details};
        }

        if (repos.length === 0) {
            const details = {reason: 'no-tenant-repos-configured', repoCount: 0};
            // DEBUG, not INFO: this fires on the 60s sweep cadence forever on any deployment with
            // no tenant repos, and an INFO line that repeats once a minute costs more than it tells
            // anyone. It was measured doing exactly that — eight identical lines in eight minutes,
            // sitting directly above the one genuine failure in the window and making it
            // indistinguishable from noise. The structured `{status, details}` return is the answer
            // channel for callers that need one; the log line is not.
            writeLog?.('DEBUG', `[TenantRepoSync] No tenantRepos configured; skipping.`);
            return {status: 'skipped', details};
        }

        await this.refreshTenantRepoAccessReadiness({
            repos: allRepos,
            gitMirror,
            writeLog,
            globalCadenceMs
        });

        const resolvedRevisionsPath          = revisionsFilePath || this.defaultRevisionsFilePath();
        const ingestionService               = knowledgeBaseIngestionService || await this.resolveIngestionService();
        const ingestSourceFilesForTenantSync = typeof ingestionService.ingestSourceFilesForTenantSync === 'function'
            ? (payload, controls) => ingestionService.ingestSourceFilesForTenantSync(payload, controls)
            : (payload, controls) => ingestionService.ingestSourceFiles(payload, controls);
        const providerTimeoutCircuit  = new AbortController();
        const providerCircuitControls = {
            signal: providerTimeoutCircuit.signal,
            ...(fullReplay ? {replayEmbeddingPoison: true} : {}),
            onProviderTimeout: () => {
                if (!providerTimeoutCircuit.signal.aborted) {
                    providerTimeoutCircuit.abort(createProviderTimeoutCircuitError());
                }
            }
        };
        const persistedRevisions = await this.readPersistedRevisions({
            filePath: resolvedRevisionsPath,
            strict  : true
        });

        if (Object.values(persistedRevisions).some(
            state => classifyTenantRepoCheckpoint(state) === TenantRepoCheckpointStatus.UNSUPPORTED
        )) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_SYNC_FAILED,
                'Tenant-repo checkpoint state was written by a newer ingestion contract.',
                {phase: 'checkpoint-contract-validation'}
            );
        }

        // Recover attempts the previous process started and never returned from.
        // Folded BEFORE the due checks so a crashed attempt dampens the very next decision
        // rather than one sweep later — the whole point is that a crash loop cannot outrun
        // its own backoff.
        const inFlightPath = this.inFlightAttemptsPath(resolvedRevisionsPath);

        /**
         * Runs `work` inside the lease's own lifecycle guard, which is the only mutex that orders
         * sidecar mutation against lease ACQUISITION — a sidecar-only lock would serialize writers
         * while a successor took the lease underneath them.
         *
         * `work` receives an `assertStillOwned` probe it MUST await immediately before mutating.
         * That is the guard's documented contract, not belt-and-braces: a holder stalled past
         * `guardStaleAfterMs` can be legitimately evicted, and a resumed evicted holder has to
         * DEFER rather than write.
         *
         * @param {Function} work Receives `assertStillOwned`; returns nothing meaningful.
         * @returns {Promise<Boolean>} Whether the transaction committed.
         */
        const withSidecarTransaction = async (work, {bestEffort = true} = {}) => {
            let guard = null;

            try {
                if (leasePath) {
                    guard = await enterLifecycleGuard({leasePath, fsModule: fs});

                    // FAIL CLOSED. `enterLifecycleGuard` returns null once its bounded retry
                    // budget is exhausted, and falling through would run the read-merge-write
                    // unguarded — precisely the interleaving the guard exists to prevent, and
                    // exactly when contention proves another actor is live. Skipping costs one
                    // unrecorded attempt; proceeding costs the invariant.
                    if (!guard) return false;
                }

                await leaseGuard();

                const assertStillOwned = async () => !guard ||
                    await verifyLifecycleGuardOwnership({ownerFilePath: guard.ownerFilePath, fsModule: fs});

                await work(assertStillOwned);
                return true
            } catch (e) {
                // `bestEffort` is per CALLER, not per helper. A sidecar write is genuinely
                // best-effort: losing it costs one unrecorded attempt, and throwing from the
                // per-repo `finally` would mask the real error the repo failed with. The RECOVERY
                // caller is not — it commits the manifest, whose writer deliberately throws
                // `KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED` as a structural failure the outer
                // task must surface. Swallowing every callback error uniformly turned that
                // documented reason code into a silent `false`, which is a failure-taxonomy
                // regression dressed as tidiness.
                if (!bestEffort) throw e;

                return false
            } finally {
                if (guard) {
                    await exitLifecycleGuard({ownerFilePath: guard.ownerFilePath, fsModule: fs}).catch(() => {});
                }
            }
        };

        // Recover attempts the previous process started and never returned from. Read AND folded
        // inside the guard: a fold that read outside it could consume residue a live successor was
        // still writing. Folded BEFORE the due checks so a crashed attempt dampens the very next
        // decision rather than one sweep later — a crash loop must not outrun its own backoff.
        await withSidecarTransaction(async assertStillOwned => {
            const residualAttempts = await this.readInFlightAttempts({filePath: inFlightPath});

            if (this.foldInFlightAttempts({attempts: residualAttempts, persistedRevisions, writeLog}) === 0) {
                return;
            }

            if (!await assertStillOwned()) return;

            // Commit FIRST, clear second. A crash between the two re-folds the same attempt on the
            // next boot, which over-counts one failure and dampens harder — the safe direction.
            // Clearing first would lose the attempt on a crash, which is the defect this recovers
            // from.
            // The fence travels INTO the writer, because the commit point is its rename and the
            // staging before that is multi-await I/O a holder can be evicted inside. Proving
            // ownership out here only bounds the mutations that follow — it cannot stop the
            // manifest itself from being overwritten by a run that lost the lease mid-write.
            const {committed} = await this.writePersistedRevisions({
                assertOwnership: assertStillOwned,
                filePath       : resolvedRevisionsPath,
                revisions      : persistedRevisions
            });

            // Deferred at the commit point: the successor owns forward progress and the residue
            // must survive for it to fold. Clearing now would delete evidence of an attempt whose
            // recovery never landed.
            if (!committed) return;

            // Re-proved because these are TWO mutations, not one. Declining to clear is the safe
            // direction: the residue is re-folded next sweep, which over-counts one failure and
            // dampens harder. Clearing it while evicted would delete a successor's live record.
            if (!await assertStillOwned()) return;

            await this.writeInFlightAttempts({filePath: inFlightPath, attempts: {}});
        }, {bestEffort: false});

        // A retained embedding-class failure is the ONLY thing that arms this canary. The gate is
        // process-local and paces provider work; it never becomes a scheduler. A healthy result must
        // first become a durable generation on the existing checkpoint manifest, under the same
        // commit-point ownership fence as every other scheduler fact. Until that commit succeeds,
        // `isRepoDue()` has no recovery evidence and the ordinary backoff remains authoritative.
        const
            configuredRepoLabels    = new Set(repos.map(repo => `${repo.tenantId}/${repo.repoSlug}`)),
            awaitingRecoveryEntries = onlyRepoSlugs
                ? []
                : Object.entries(persistedRevisions)
                    .filter(([label, state]) =>
                        configuredRepoLabels.has(label)
                        && state?.embeddingRecovery
                        && !state.embeddingRecovery.generationId
                    );

        if (awaitingRecoveryEntries.length > 0) {
            const observation = await this.probeEmbeddingRecovery({
                episodeKeys: awaitingRecoveryEntries.map(([, state]) => {
                    const recovery = state.embeddingRecovery;

                    return `${recovery.episodeId}:${recovery.lastConsumedGenerationId || 'initial'}`;
                }),
                runProbe       : embeddingRecoveryProbe,
                clock          : embeddingRecoveryClock,
                timeoutMs      : embeddingRecoveryProbeTimeoutMs,
                failureTtlMs   : embeddingRecoveryFailureTtlMs,
                failureTtlMaxMs: embeddingRecoveryFailureTtlMaxMs
            });

            if (observation?.status === 'healthy') {
                const
                    generationId = randomBytes(16).toString('hex'),
                    observedAt   = observation.gate?.checkedAt ?? embeddingRecoveryClock(),
                    previous     = new Map();

                for (const [label, state] of awaitingRecoveryEntries) {
                    previous.set(label, state.embeddingRecovery);
                    state.embeddingRecovery = {
                        ...state.embeddingRecovery,
                        generationId,
                        observedAt,
                        bypassConsumedAt: null
                    };
                }

                let   manifestCommitted    = false;
                const transactionCommitted = await withSidecarTransaction(async assertStillOwned => {
                    const result = await this.writePersistedRevisions({
                        assertOwnership: assertStillOwned,
                        filePath       : resolvedRevisionsPath,
                        revisions      : persistedRevisions
                    });

                    manifestCommitted = result.committed;
                }, {bestEffort: false});

                if (!transactionCommitted || !manifestCommitted) {
                    for (const [label, recovery] of previous) {
                        persistedRevisions[label].embeddingRecovery = recovery;
                    }
                } else {
                    writeLog?.('INFO', `[TenantRepoSync] Embedding recovery observed; committed one due-bypass generation for ${awaitingRecoveryEntries.length} scoped repo(s).`);
                }
            } else if (observation) {
                writeLog?.('INFO', `[TenantRepoSync] Embedding recovery not yet observed (${observation.errorCode || 'EMBEDDING_PROVIDER_ERROR'}; ${observation.gate?.cached ? 'probe backoff retained' : 'provider still failing'}).`);
            }
        }

        // The live in-flight map is a FRESH object, never the recovery snapshot. Reusing
        // `residualAttempts` as the live map republished entries the fold had already consumed:
        // the fold cleared the file but not the object, so the first repo to enter protected work
        // rewrote the whole file from it and re-armed a spent attempt, which the next sweep folded
        // again, without bound, on a lane that was succeeding. Recovery INPUT and in-flight STATE
        // are different things with different lifetimes, and one object cannot be both.
        const inFlightAttempts = {};

        // Identity for compare-and-commit. `await leaseGuard()` followed by a write is a
        // check-then-act: the lease can expire and a successor legitimately acquire in the window
        // between them, and the resumed predecessor's whole-file write then DELETES the
        // successor's record. Fencing the write harder only narrows that window; it cannot close
        // it, because the check and the write are separate syscalls no lock spans for free.
        //
        // So the record carries its owner and every mutation is conditional on it. The last
        // writer no longer wins by virtue of being last — it wins only on keys it owns.
        const runId = randomBytes(8).toString('hex');

        // Serialized through one chain: the sidecar is mutated from inside the concurrent per-repo
        // region, and `writeInFlightAttempts` stages through a single pid-scoped temp path that
        // concurrent writers would otherwise race on.
        let inFlightChain = Promise.resolve();

        const mutateInFlight = update => {
            inFlightChain = inFlightChain.then(async () => {
                update(inFlightAttempts);

                // Read-merge-write inside the same guard the fold uses. Without it, `leaseGuard()`
                // then write is check-then-act: earlier revisions fenced harder and only MOVED the
                // window (check→write became read→write). A lock that does not span the read and
                // the write cannot close it.
                let   sidecarCommitted     = false;
                const transactionCommitted = await withSidecarTransaction(async assertStillOwned => {
                    // Merge against live state rather than publishing this sweep's whole view.
                    // Entries owned by another run are carried forward untouched; only our own are
                    // written or removed. `runId` is defence-in-depth for the residual the guard's
                    // own contract admits.
                    const
                        live   = await this.readInFlightAttempts({filePath: inFlightPath}),
                        merged = {};

                    for (const [label, entry] of Object.entries(live)) {
                        if (entry?.runId !== runId) merged[label] = entry;
                    }

                    for (const [label, entry] of Object.entries(inFlightAttempts)) {
                        merged[label] = entry;
                    }

                    if (!await assertStillOwned()) return;

                    sidecarCommitted = await this.writeInFlightAttempts({
                        filePath: inFlightPath,
                        attempts: merged
                    });
                });

                return transactionCommitted && sidecarCommitted;
            });

            return inFlightChain
        };

        const repoStates     = [];
        let   completedCount = 0;
        let   deferredCount  = 0;
        let   failedCount    = 0;
        // Counted separately from `deferredCount`: a sweep where every repo rotated on its budget is
        // healthy and making progress, while a sweep where every repo deferred is a lane in trouble.
        // Folding them would make the two indistinguishable in the one number an operator reads.
        let partialProgressCount = 0;
        let abortedCount         = 0;

        // Per-runTask concurrency gate caps simultaneous git/ingest work.
        // Fresh instance per call so live `concurrencyLimit` / `concurrencyGateTimeoutMs`
        // config edits take effect on the next cycle. JS is single-threaded so the shared
        // mutable counters (`completedCount` / `failedCount`) and `repoStates` array are safe.
        const semaphore = createConcurrencySemaphore({
            limit    : this.concurrencyLimit,
            timeoutMs: this.concurrencyGateTimeoutMs
        });

        let notDueCount               = 0;
        let revalidationDeferredCount = 0;

        // Bootstrap-spread seeding prevents all fresh repos (`lastRunAttemptAt = 0`)
        // from becoming due on the first sweep regardless of jitter; `(now - 0)`
        // always exceeds any reasonable cadence.
        // Seeding `lastRunAttemptAt = now - baseCadenceMs` makes the effective
        // due-time `now + jitterMs`, so first-sync attempts spread across
        // `[0, jitterRatio * baseCadenceMs)` per repo. Persisted state survives
        // orchestrator restarts so HA-failover preserves the spread.
        // Skipped when `onlyRepoSlugs` is set (manual CLI bypass) or when caller
        // explicitly opts out via `seedBootstrap: false` (test seam for spec files
        // that simulate "first cycle fires all repos").
        let seededAny = false;
        if (seedBootstrap && !onlyRepoSlugs) {
            const sweepStartedMs = Date.now();
            for (const repo of repos) {
                const repoLabel = `${repo.tenantId}/${repo.repoSlug}`;
                if (!persistedRevisions[repoLabel]) {
                    const baseCadenceMs = (Number.isFinite(repo.cadenceMs) && repo.cadenceMs > 0)
                        ? repo.cadenceMs
                        : globalCadenceMs;
                    persistedRevisions[repoLabel] = {
                        lastIngestedRev                      : null,
                        lastRunAttemptAt                     : sweepStartedMs - baseCadenceMs,
                        consecutiveFailures                  : 0,
                        ingestContractVersion                : null,
                        lastAttemptedIngestContractVersion   : null,
                        lastCommittedMaterializationAttemptId: null
                    };
                    seededAny = true;
                    writeLog?.('INFO', `[TenantRepoSync] Bootstrap-seeding ${repoLabel} (sync scheduled within jitter window).`);
                }
            }
            if (seededAny) {
                await leaseGuard();
                await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});
            }
        }

        // Existing jitter spreads brand-new repo states, but legacy checkpoints
        // already have persisted timestamps and can all be due on the first upgraded
        // sweep. Admit at most one concurrency window of automatic null-base replays
        // per sweep. Oldest attempts go first; label ordering makes ties stable across
        // restarts. Manual selectors remain an explicit operator bypass.
        const revalidationAdmissionLabels = new Set();
        if (!onlyRepoSlugs) {
            const admissionObservedAt = Date.now();
            const dueLegacyRepos      = repos
                .map(repo => {
                    const
                        repoLabel  = `${repo.tenantId}/${repo.repoSlug}`,
                        priorState = persistedRevisions[repoLabel] || null,
                        dueState   = isRepoDue({
                            repo,
                            persistedRepoState: priorState,
                            now               : admissionObservedAt,
                            globalCadenceMs,
                            jitterRatio
                        });

                    return {repoLabel, priorState, dueState};
                })
                .filter(({priorState, dueState}) =>
                    dueState.due && requiresTenantRepoCheckpointRevalidation(priorState)
                )
                .sort((a, b) =>
                    (a.priorState?.lastRunAttemptAt ?? 0) - (b.priorState?.lastRunAttemptAt ?? 0)
                    || a.repoLabel.localeCompare(b.repoLabel)
                )
                .slice(0, this.concurrencyLimit);

            for (const {repoLabel} of dueLegacyRepos) {
                revalidationAdmissionLabels.add(repoLabel);
            }
        }

        const syncRepo = async (repo) => {
            const
                repoLabel            = `${repo.tenantId}/${repo.repoSlug}`,
                priorState           = persistedRevisions[repoLabel] || null,
                checkpointStatus     = classifyTenantRepoCheckpoint(priorState),
                revalidationRequired = requiresTenantRepoCheckpointRevalidation(priorState);
            let startedMs = Date.now();

            // Per-repo due check applies deterministic jitter + exponential backoff on
            // top of configured cadence. Manual CLI runs (onlyRepoSlugs filter)
            // bypass the due-check — operator-initiated sync should always fire for the
            // requested repos.
            if (!onlyRepoSlugs) {
                const dueState = isRepoDue({
                    repo,
                    persistedRepoState: priorState,
                    now               : startedMs,
                    globalCadenceMs,
                    jitterRatio,
                    backoffCapMs
                });

                if (!dueState.due) {
                    const
                        nextDueAtMs  = (priorState?.lastRunAttemptAt ?? 0) + dueState.effectiveCadenceMs,
                        failureCount = priorState?.consecutiveFailures ?? 0,
                        // A repo held back because it FAILED is not the same state as one that simply ran
                        // recently, and reporting both as `not-due` is what made a wedged lane read as an
                        // idle one. Backoff is the only reason a failing repo stops being retried, so it
                        // is also the only place the distinction can be drawn.
                        backoffSuppressed = failureCount > 0;

                    notDueCount++;
                    writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} ${backoffSuppressed ? 'suppressed by backoff' : 'not yet due'} (next ~${new Date(nextDueAtMs).toISOString()}, consecutiveFailures=${failureCount}, backoffX=${dueState.backoffMultiplier}${backoffSuppressed ? `, lastErrorCode=${priorState?.lastErrorCode ?? 'none'}` : ''}).`);
                    // `backoffCapped` was computed by `isRepoDue` and dropped here, so the one cadence
                    // number an operator reads was ambiguous: an `effectiveCadenceMs` of 7200000 is
                    // either a 2h configuration or a repo whose backoff has run so far past the cap that
                    // the cap is all that remains of it. This is the only push site that publishes a
                    // cadence, so it is the only one that needs the discriminator. The magnitude the cap
                    // hides is deliberately NOT republished: `consecutiveFailures` is already on this
                    // record and the multiplier is `2^failures`, so a consumer can derive it and falsify
                    // the arithmetic rather than inherit a number it cannot check.
                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                        lastSyncAt         : priorState?.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                        status             : backoffSuppressed ? 'backoff-suppressed' : 'not-due',
                        checkpointStatus,
                        nextDueAt          : new Date(nextDueAtMs).toISOString(),
                        effectiveCadenceMs : dueState.effectiveCadenceMs,
                        backoffCapped      : dueState.backoffCapped,
                        consecutiveFailures: failureCount,
                        // Carry the RETAINED cause forward. The failure path already persists these
                        // (see the per-repo catch below); this branch used to rebuild a record without
                        // them, so the reason a lane was wedged existed on disk and vanished from the
                        // one surface an operator can read — exactly when it mattered most. Only
                        // attached while a failure is outstanding, so a healthy repo stays quiet.
                        ...(backoffSuppressed ? {
                            lastErrorCode      : priorState?.lastErrorCode ?? null,
                            lastSourceErrorCode: priorState?.lastSourceErrorCode ?? null,
                            lastAccessCode     : priorState?.lastAccessCode ?? null,
                            lastErrorAt        : priorState?.lastErrorAt
                                ? new Date(priorState.lastErrorAt).toISOString()
                                : null,
                            recoveryState: classifyEmbeddingRecoveryState({
                                persistedRepoState: priorState,
                                probeSnapshot     : this.getEmbeddingRecoveryProbeSnapshot(),
                                observedAt        : startedMs
                            })
                        } : {})
                    });
                    return; // skip semaphore + work entirely
                }
            }

            if (
                revalidationRequired
                && !onlyRepoSlugs
                && !revalidationAdmissionLabels.has(repoLabel)
            ) {
                revalidationDeferredCount++;
                writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} legacy checkpoint replay deferred by the per-sweep admission cap.`);
                repoStates.push({
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    lastIngestedRev    : priorState.lastIngestedRev.slice(0, 8),
                    lastSyncAt         : priorState.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                    status             : 'revalidation-deferred',
                    checkpointStatus,
                    consecutiveFailures: priorState.consecutiveFailures ?? 0
                });
                return;
            }

            const recoveryGrant = hasPendingEmbeddingRecoveryBypass(priorState)
                ? {
                    episodeId   : priorState.embeddingRecovery.episodeId,
                    generationId: priorState.embeddingRecovery.generationId
                }
                : null;

            let slotAcquired     = false,
                accessConfirmed  = false,
                inFlightRecorded = false,
                workStarted      = false;
            try {
                await semaphore.acquire();
                slotAcquired = true;
                // The actual attempt begins when capacity is admitted, not when the repo joined
                // the FIFO. Otherwise a long legitimate wait is persisted as work time and can
                // make a just-completed repo immediately due again.
                startedMs = Date.now();

                // Work fence: do not START this repo's git phase without provable
                // lease ownership. A run that lost its lease (renewal failure or
                // reclamation) stops here instead of running git work concurrently
                // with its successor.
                await leaseGuard();

                // Write-ahead, after the lease fence and before the git phase. Placed here
                // rather than at the top of syncRepo so a repo that never entered protected
                // work — not due, revalidation-deferred, or lease-lost at the fence — records
                // no attempt, matching the lease-lost contract below that deliberately leaves
                // backoff state untouched for the successor to own.
                const inFlightPersisted = await mutateInFlight(attempts => {
                    attempts[repoLabel] = {
                        startedMs,
                        priorFailures       : priorState?.consecutiveFailures ?? 0,
                        priorSourceErrorCode: priorState?.lastSourceErrorCode ?? null,
                        priorAccessCode     : priorState?.lastAccessCode ?? null,
                        recoveryEpisodeId   : recoveryGrant?.episodeId ?? null,
                        recoveryGenerationId: recoveryGrant?.generationId ?? null,
                        runId
                    };
                });

                // A recovery grant is exactly-once only if its attempt has a durable write-ahead
                // witness. Ordinary attempts retain the sidecar's historical best-effort contract;
                // a recovery attempt without a receipt is deferred before provider work and leaves
                // the generation unconsumed for the next sweep.
                if (recoveryGrant && !inFlightPersisted) {
                    delete inFlightAttempts[repoLabel];
                    notDueCount++;
                    writeLog?.('WARN', `[TenantRepoSync] ${repoLabel} recovery retry deferred because its write-ahead receipt could not be committed.`);
                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                        lastSyncAt         : priorState?.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                        status             : 'recovery-receipt-deferred',
                        checkpointStatus,
                        consecutiveFailures: priorState?.consecutiveFailures ?? 0,
                        recoveryState      : 'recovery-observed/retry-pending'
                    });
                    return;
                }

                // Ordinary attempts keep the historical best-effort sidecar contract: even when
                // the first write misses, `finally` must remove this process-local entry so a later
                // concurrent repo mutation cannot publish it after the work has already returned.
                inFlightRecorded = recoveryGrant ? inFlightPersisted : true;

                if (recoveryGrant) {
                    priorState.embeddingRecovery = {
                        ...priorState.embeddingRecovery,
                        bypassConsumedAt: startedMs
                    };
                }

                workStarted = true;
                writeLog?.('INFO', `[TenantRepoSync] Refreshing ${repoLabel}${recoveryGrant ? ' (embedding recovery generation)' : ''}.`);

                await gitMirror.cloneIfMissing({
                    tenantId     : repo.tenantId,
                    repoSlug     : repo.repoSlug,
                    mirrorRoot   : repo.mirrorRoot,
                    cloneUrl     : repo.cloneUrl,
                    credentialRef: repo.credentialRef
                });
                await gitMirror.fetch({
                    tenantId     : repo.tenantId,
                    repoSlug     : repo.repoSlug,
                    mirrorRoot   : repo.mirrorRoot,
                    credentialRef: repo.credentialRef
                });
                accessConfirmed = true;
                this.recordTenantRepoAccessOutcome({repo, ready: true, globalCadenceMs});

                const envelope = await envelopeBuilder({
                    tenantId       : repo.tenantId,
                    repoSlug       : repo.repoSlug,
                    mirrorRoot     : repo.mirrorRoot,
                    lastIngestedRev: fullReplay || revalidationRequired
                        ? null
                        : (priorState?.lastIngestedRev || null),
                    newHead      : repo.branchRef || 'HEAD',
                    rootKind     : repo.rootKind || 'external-source',
                    parserId     : repo.parserId,
                    parserVersion: repo.parserVersion,
                    gitMirror,
                    // The clone and fetch above are not the last authenticated operations of this
                    // sweep. On a blobless mirror the envelope's own `show <rev>:<path>` resolves
                    // every blob through a lazy promisor fetch, which re-authenticates — so a repo
                    // whose remote refuses anonymous reads lists fine and then fails per file.
                    credentialRef: repo.credentialRef
                });

                if (typeof envelope?.headRevision !== 'string' || !envelope.headRevision.trim()) {
                    throw new Error('Tenant-repo ingestion envelope did not prove a head revision.');
                }

                // Work fence: the KB write is the second substrate mutation this
                // lane protects (the manifest commit being the first).
                await leaseGuard();

                const materializationAttempt = envelope.manifestSnapshot == null
                    ? null
                    : {
                        attemptId            : randomBytes(16).toString('hex'),
                        ingestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION
                    };
                const
                    envelopeDigest = materializationAttempt
                        ? createTenantRepoMaterializationDigest(envelope)
                        : null,
                    existingManifest = materializationAttempt
                        && typeof ingestionService.getTenantManifest === 'function'
                        ? await ingestionService.getTenantManifest({
                            tenantId: repo.tenantId,
                            repoSlug: repo.repoSlug
                        })
                        : null,
                    declaresNoContent = Array.isArray(envelope.manifestSnapshot?.pathsAfterPush)
                        && envelope.manifestSnapshot.pathsAfterPush.length === 0,
                    // A content-bearing full replay must reach VectorService so its explicit replay
                    // control can clear and re-offer same-generation poison. An authoritative empty
                    // manifest has no embedding work to suppress, so its uncommitted receipt remains
                    // the exactly-once recovery proof for a post-ingest checkpoint-write failure.
                    mustReplayEmbeddingCorpus = fullReplay && !declaresNoContent,
                    retryReceipt = !mustReplayEmbeddingCorpus && isMatchingMaterializationReceipt(
                        existingManifest?.materializationReceipt,
                        envelopeDigest
                    ) && existingManifest.materializationReceipt.attemptId
                        !== priorState?.lastCommittedMaterializationAttemptId
                        ? existingManifest.materializationReceipt
                        : null,
                    rawSummary = retryReceipt
                        ? {
                            ingested              : 0,
                            deleted               : 0,
                            errors                : [],
                            materializationReceipt: retryReceipt
                        }
                        : await ingestSourceFilesForTenantSync({
                            ...envelope,
                            ...(materializationAttempt ? {materializationAttempt} : {}),
                            viaMcp: false // operator-bulk path
                        }, {
                            ...providerCircuitControls,
                            // Per-repo, anchored at THIS repo's admission. The envelope above is
                            // built once and shared by the whole sweep; a budget shared that way
                            // would be spent by the first admitted repo and every later one born
                            // already expired — a fairness fix that starves the tail it serves.
                            shouldYield: createSliceBudgetPredicate({startedMs, sliceBudgetMs})
                        });

                // Emitted before BOTH guards on this path, which is what makes it useful:
                // `classifyIngestionOutcome` throws on a rejected error-bearing summary, and
                // `assertFullMaterializationEffect` throws on a zero-effect one. Between them they
                // cover the two live failure modes on this lane, and neither used to log anything
                // between "Refreshing" and the error.
                //
                // Placed one statement higher than first written, on review: below the summary
                // assertion, `errors=` could only ever be 0 (that guard throws when it is not, and
                // the retry-receipt branch hardcodes an empty array), so the field had a single
                // possible value AND the error-bearing failure mode — the one the other configured
                // repo actually hits — still produced total silence.
                //
                // Counts only. Paths, file names, and repo content stay out — the same
                // credential-boundary reasoning that keeps ingestion error messages unprojected.
                // `repoLabel` is `tenantId/repoSlug`: operator-configured identifiers, not content.
                writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} materialized: ` +
                    `envelopeFiles=${envelope?.files?.length ?? 0} ` +
                    `envelopeDeleted=${envelope?.deleted?.length ?? 0} ` +
                    `ingested=${rawSummary?.ingested ?? 0} ` +
                    `deleted=${rawSummary?.deleted ?? 0} ` +
                    `embeddings=${rawSummary?.embeddingsGenerated ?? 0} ` +
                    `errors=${rawSummary?.errors?.length ?? 0}`);

                const ingestOutcome = classifyIngestionOutcome(rawSummary);

                if (ingestOutcome.outcome === 'deferred') {
                    // Incomplete, not failed. The checkpoint stays where it is so nothing is
                    // claimed as ingested that is not, `consecutiveFailures` is neither reset nor
                    // incremented — the run neither succeeded nor failed — and `lastRunAttemptAt`
                    // advances so the next due-check measures from this attempt rather than
                    // re-firing immediately against a provider that is already struggling.
                    //
                    // Leaving the streak untouched is the load-bearing half. Incrementing would
                    // climb toward the cap for a condition that is not the repo's fault; resetting
                    // would erase a real failure history that a genuinely broken repo earned.
                    //
                    // **The retained cause is what makes the deferral recoverable, and it is the
                    // whole reason this branch does not invent its own cadence bypass.** A repo
                    // carrying a retained embedding cause is what arms the dependency-recovery
                    // canary; a healthy observation there commits one scoped generation, and only
                    // that generation bypasses cadence. Without persisting the cause, a first-time
                    // deferral leaves a clean prior state, nothing arms, and the repo waits out
                    // whatever cadence its existing streak already dictates — which for a repo at a
                    // capped streak is the cap. Deferral has to hand the recovery lane a reason.
                    //
                    // Bounded `KB_*` codes only, never messages or details: identical credential
                    // boundary to the failure path, which is why these are safe to persist at all.
                    // Fences of BOTH families are already excluded — `deferredCodes` carries live
                    // rows only, filtered where the row identity still exists. It cannot be done
                    // here: a content poison carries the ordinary embed code it failed with, so a
                    // fenced `KB_VECTOR_EMBED_TIMEOUT` and a live one are the same string by the
                    // time this sees them. Letting a fence through would arm the embedding-recovery
                    // canary — a health probe whose success cannot re-offer the chunk, since only a
                    // generation change can. A deferred outcome always carries at least one live
                    // code (fence-only runs classify as complete above).
                    const liveDeferredCodes = ingestOutcome.deferredCodes;
                    const deferredCauseCode = liveDeferredCodes.find(isEmbeddingRecoverySourceCode)
                        ?? liveDeferredCodes[0]
                        ?? priorState?.lastSourceErrorCode
                        ?? null;

                    // The deferred branch is the one an operator stares at on a starved provider, and
                    // until now it published a held checkpoint with no sense of scale: `count: 0` for
                    // hours reads identically whether 40k chunks are outstanding or none are. The
                    // observation is derived from this run's own totals and carries the prior movement
                    // stamp forward, so a backlog that is shrinking is distinguishable from one that is
                    // stuck at the same depth sweep after sweep.
                    const deferredOutstanding = buildCorpusOutstandingObservation({
                        summary   : rawSummary,
                        priorState,
                        observedAt: startedMs
                    });

                    // A deferred run may have died BEFORE the fence rows are reported (a live
                    // timeout throws out of `embed()` and the poison census never reaches the
                    // summary), so an absent census here is "not observed this run", never "no
                    // fences". Carrying the prior census forward keeps AC-3 visibility through the
                    // deferral; the next completed or fence-bearing run replaces it authoritatively.
                    const deferredCensus = buildUndeliverableCensus(rawSummary)
                        ?? priorState?.undeliverableChunks
                        ?? null;
                    const deferredPoisonCensus = buildContentPoisonCensus(rawSummary)
                        ?? priorState?.contentPoisonChunks
                        ?? null;

                    persistedRevisions[repoLabel] = {
                        ...priorState,
                        lastIngestedRev                   : priorState?.lastIngestedRev ?? null,
                        lastRunAttemptAt                  : startedMs,
                        consecutiveFailures               : priorState?.consecutiveFailures ?? 0,
                        lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
                        lastSourceErrorCode               : deferredCauseCode,
                        lastErrorAt                       : startedMs,
                        corpusOutstanding                 : deferredOutstanding,
                        undeliverableChunks               : deferredCensus,
                        contentPoisonChunks               : deferredPoisonCensus,
                        // Recovery eligibility, on the SAME episode a failure would advance. A
                        // consumed generation folds into `lastConsumedGenerationId/At` and a newly
                        // healthy canary generation is required before another bypass, so a
                        // still-starved provider cannot buy one retry per sweep by deferring.
                        embeddingRecovery: isEmbeddingRecoverySourceCode(deferredCauseCode)
                            ? buildEmbeddingRecoveryEpisode({
                                priorRecovery: priorState?.embeddingRecovery || null,
                                causeCode    : deferredCauseCode,
                                failedAt     : startedMs
                            })
                            : (priorState?.embeddingRecovery || null)
                    };

                    // Counts and bounded codes only — same credential boundary as the failure path.
                    writeLog?.('WARN', `[TenantRepoSync] ${repoLabel} deferred: ` +
                        `embedding incomplete, checkpoint held at ` +
                        `${priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : 'none'} ` +
                        `codes=${ingestOutcome.deferredCodes.join(',')} ` +
                        `ingested=${rawSummary?.ingested ?? 0} ` +
                        `embeddings=${rawSummary?.embeddingsGenerated ?? 0} ` +
                        `(streak held at ${priorState?.consecutiveFailures ?? 0})`);

                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ?? null,
                        lastSyncAt         : new Date().toISOString(),
                        status             : 'deferred',
                        checkpointStatus   : priorState?.checkpointStatus ?? TenantRepoCheckpointStatus.UNINITIALIZED,
                        lastSourceErrorCode: deferredCauseCode,
                        // Same recovery projection the failure path publishes. A deferred repo is
                        // recovery-eligible, so omitting this would make the one state that is
                        // actively waiting on the canary the only state whose canary/backoff/
                        // retry-pending classification is invisible to every snapshot consumer.
                        recoveryState      : classifyEmbeddingRecoveryState({
                            persistedRepoState: persistedRevisions[repoLabel],
                            probeSnapshot     : this.getEmbeddingRecoveryProbeSnapshot(),
                            observedAt        : startedMs
                        }),
                        corpusOutstanding  : deferredOutstanding,
                        undeliverableChunks: deferredCensus,
                        contentPoisonChunks: deferredPoisonCensus
                    });

                    healthService?.recordTaskOutcome?.(taskName, 'deferred', {
                        repo    : repoLabel,
                        tenantId: repo.tenantId,
                        codes   : ingestOutcome.deferredCodes
                    });

                    deferredCount++;

                    return
                }

                if (ingestOutcome.outcome === 'partial-progress') {
                    // The slice ran out of budget on a healthy run. Same STATE as a deferral —
                    // checkpoint holds, streak untouched, attempt stamp advances — arrived at for
                    // the opposite reason, and the differences are what make it not a deferral:
                    //
                    // - No `lastSourceErrorCode` and no recovery episode. Nothing failed, so there
                    //   is no cause to retain and nothing for the dependency-recovery canary to
                    //   observe. Writing one would arm a recovery lane against a repo that is
                    //   simply mid-corpus.
                    // - It returns BEFORE `assertFullMaterializationEffect`. That guard mints or
                    //   reuses a full-materialization receipt on positive effect, and a receipt is
                    //   a claim that the corpus is whole. Minting one here is the shortcut that
                    //   lets the NEXT sweep's `retryReceipt` branch skip ingestion entirely and
                    //   settle a checkpoint over a remainder that never landed — the failure this
                    //   outcome exists to prevent, and the one AC-6's negative arm pins.
                    //
                    // The streak is CLEARED, for the same reason `complete` clears it: this branch is
                    // reachable only on a clean summary. An error-bearing summary throws before the
                    // `yielded` check, so `partial-progress` is by construction a run in which nothing
                    // failed. The streak exists to back off from FAILURES, and a clean slice is
                    // positive evidence there is no longer a fault to back off from. The only thing
                    // separating this outcome from `complete` is that the corpus is not exhausted,
                    // which is not a fault signal.
                    //
                    // Holding it instead — the prior behaviour — was not neutral, because a repo whose
                    // corpus exceeds one slice budget never REACHES `complete`, and `complete` is the
                    // only outcome that cleared the streak. Such a repo could therefore never decay a
                    // streak it accrued while a real fault was live, no matter how well it ran.
                    // Observed on a live plane: `errors=0` printed beside `streak held at 42`.
                    //
                    // Decaying by one instead of clearing does not fix it, and the cap is why.
                    // `effectiveCadence` is `min(2^streak x (base + jitter), cap)` with the shipped
                    // leaves `backoffCapMs` 2 h, `intervals.tenantRepoSyncMs` 30 min and
                    // `jitterRatio` 0.20 (`ai/configBase.mjs:2168`, `:1621`, `:2169`) — so the curve
                    // is capped from streak 2 onward and every streak above it is indistinguishable.
                    // Walking 42 down to 1 is 41 clean sweeps spaced at the 2 h cap: ~82 h, about
                    // 3.4 days. At the 309 seen on the live plane it is ~25.7 days. A decrement the
                    // cap absorbs is a fixed budget standing in for a condition, which is the shape
                    // this ticket exists to remove.
                    //
                    // Do NOT read the `backoffX` in the sync log as a delay: it is the raw multiplier,
                    // printed before the cap is applied two lines later in `isRepoDue`. Both
                    // @neo-opus-vega and I quoted `4.4e12` as though it were an interval; it never was.
                    //
                    // A repo alternating clean and failing slices is still protected: the failure path
                    // increments on the very next bad slice, and it alone retains `lastSourceErrorCode`
                    // and arms the recovery canary. What stops happening is a repo being throttled for
                    // delivering.
                    //
                    // An armed embedding-recovery episode needs no carve-out here.
                    // `classifyEmbeddingRecoveryState` inspects `embeddingRecovery` BEFORE the failure
                    // count — its own comment names that ordering as load-bearing — and all three
                    // returns inside `if (recovery)` are reached without consulting `failures`, pacing
                    // off `probeSnapshot.nextAttemptAt` instead. `...priorState` carries the episode
                    // through untouched.
                    //
                    // Scoped deliberately to the ARMED arm, because the streak is not unread by that
                    // function: the fall-through past `if (recovery)` is `failures <= 0 ? null :
                    // 'ordinary-repo-backoff'`. So for a repo with NO episode this clear flips the
                    // published `recoveryState` to `null`, and the `repoStates.push` below reads the
                    // freshly-written state, so the flip reaches the operator row. Benign and correct —
                    // `null` is the documented return, the repo genuinely is no longer in ordinary
                    // backoff, and no consumer reads `null` as unknown — but it is a real effect, and
                    // an earlier revision of this comment claimed the streak was never read at all.
                    // Narrowed after @neo-opus-vega grepped the function rather than accepting it.
                    const partialOutstanding = buildCorpusOutstandingObservation({
                        summary   : rawSummary,
                        priorState,
                        observedAt: startedMs
                    });

                    persistedRevisions[repoLabel] = {
                        ...priorState,
                        lastIngestedRev                   : priorState?.lastIngestedRev ?? null,
                        lastRunAttemptAt                  : startedMs,
                        consecutiveFailures               : 0,
                        lastAttemptedIngestContractVersion: TENANT_REPO_INGEST_CONTRACT_VERSION,
                        corpusOutstanding                 : partialOutstanding
                    };

                    // Report the streak TRANSITION rather than a single number. `streak held at 42`
                    // beside `errors=0` was true and unreadable: it named the state without naming
                    // what the state was doing, so a reader could not tell a repo recovering from one
                    // stuck at the cap. `42 -> 0` says which of the two this is in one glance.
                    const priorStreak = priorState?.consecutiveFailures ?? 0;

                    writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} partial-progress: ` +
                        `slice budget reached, checkpoint held at ` +
                        `${priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : 'none'} ` +
                        `ingested=${rawSummary?.ingested ?? 0} ` +
                        `embeddings=${rawSummary?.embeddingsGenerated ?? 0} ` +
                        `(clean slice: streak ${priorStreak} -> 0` +
                        `${priorStreak > 0 ? ', backoff cleared' : ''}; repo due next cycle)`);

                    repoStates.push({
                        tenantId        : repo.tenantId,
                        repoSlug        : repo.repoSlug,
                        lastIngestedRev : priorState?.lastIngestedRev ?? null,
                        lastSyncAt      : new Date().toISOString(),
                        status          : 'partial-progress',
                        checkpointStatus: priorState?.checkpointStatus ?? TenantRepoCheckpointStatus.UNINITIALIZED,
                        // The operator-facing point of this row: a plane owner must be able to see
                        // every repo advancing rather than infer it from a total. Without the
                        // outstanding stamp, a rotating repo is indistinguishable from a stuck one.
                        corpusOutstanding: partialOutstanding
                    });

                    healthService?.recordTaskOutcome?.(taskName, 'partial-progress', {
                        repo    : repoLabel,
                        tenantId: repo.tenantId
                    });

                    partialProgressCount++;

                    return
                }

                const ingestResult = ingestOutcome.summary;

                const completedOutstanding = buildCorpusOutstandingObservation({
                    summary   : ingestResult,
                    priorState,
                    observedAt: startedMs
                });

                // The completed path carries the censuses too — this is the surface's load-bearing
                // half: a fence-only run COMPLETES (checkpoint advances, rotation proceeds), so the
                // held-checkpoint signal is gone by design and the censuses are the only thing standing
                // between the operator and "N documents silently missing". Both families are written
                // in this one checkpoint object, so completion cannot land while the signal it replaces
                // the held checkpoint with is lost.
                const completedCensus       = buildUndeliverableCensus(ingestResult);
                const completedPoisonCensus = buildContentPoisonCensus(ingestResult);

                const materializationReceipt = assertFullMaterializationEffect(
                    envelope,
                    ingestResult,
                    priorState,
                    materializationAttempt
                );

                // Persist full per-repo state on success. Reset consecutiveFailures
                // to 0 (backoff is the multiplier-component of effectiveCadence; reset on
                // successful sync). lastRunAttemptAt advances to
                // startedMs so subsequent due-checks measure from the actual attempt.
                persistedRevisions[repoLabel] = {
                    lastIngestedRev                      : envelope.headRevision || priorState?.lastIngestedRev || null,
                    lastRunAttemptAt                     : startedMs,
                    consecutiveFailures                  : 0,
                    ingestContractVersion                : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: materializationReceipt?.attemptId
                        || priorState?.lastCommittedMaterializationAttemptId
                        || null,
                    // Cleared explicitly, not merely omitted. The retained cause is now durable, so a
                    // repo that heals would otherwise keep publishing the reason it used to fail —
                    // a stale cause beside a zero failure count is worse than none, because it reads
                    // as a live fault. Written as nulls so the shape stays uniform across both paths.
                    lastErrorCode      : null,
                    lastSourceErrorCode: null,
                    lastAccessCode     : null,
                    lastErrorAt        : null,
                    // Written on the success path too, and this is the negative control rather than
                    // bookkeeping: a completed run must report zero outstanding, so a genuinely finished
                    // corpus is distinguishable from one whose delta was never computed. Omitting it here
                    // would leave `corpusOutstanding` absent on exactly the state that proves the
                    // observable can reach zero, and an absent field reads as unknown.
                    corpusOutstanding  : completedOutstanding,
                    undeliverableChunks: completedCensus,
                    contentPoisonChunks: completedPoisonCensus
                };

                const durationMs = Date.now() - startedMs;
                const shortHead  = envelope.headRevision ? envelope.headRevision.slice(0, 8) : null;
                const ingested   = ingestResult.ingested ?? 0;
                const deleted    = ingestResult.deleted  ?? 0;

                writeLog?.('INFO', `[TenantRepoSync] ${repoLabel} completed: head=${shortHead ?? 'unknown'} ingested=${ingested} deleted=${deleted} (${durationMs}ms)`);

                repoStates.push({
                    tenantId            : repo.tenantId,
                    repoSlug            : repo.repoSlug,
                    lastIngestedRev     : shortHead,
                    lastSyncAt          : new Date().toISOString(),
                    status              : 'active',
                    checkpointStatus    : TenantRepoCheckpointStatus.COMPLETE,
                    lastSyncDeletedCount: deleted,
                    corpusOutstanding   : completedOutstanding,
                    undeliverableChunks : completedCensus,
                    contentPoisonChunks : completedPoisonCensus
                });
                completedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'completed', {
                    repo            : repoLabel,
                    tenantId        : repo.tenantId,
                    repoSlug        : repo.repoSlug,
                    ingested,
                    deleted,
                    headRevision    : shortHead,
                    durationMs,
                    checkpointStatus: TenantRepoCheckpointStatus.COMPLETE
                });
            } catch (e) {
                // Lease loss is a RUN-level abort, not a repo failure: leave the
                // repo's checkpoint, attempt timestamp, and backoff state untouched
                // (the successor owns forward progress now), record an 'aborted'
                // repo state, and let the post-sweep check raise the structural
                // LEASE_LOST for the whole run.
                if (e.code === KB_TENANT_REPO_SYNC_LEASE_LOST) {
                    abortedCount++;
                    writeLog?.('WARN', `[TenantRepoSync] ${repoLabel} aborted: lease ownership lost before protected work.`);
                    repoStates.push({
                        tenantId           : repo.tenantId,
                        repoSlug           : repo.repoSlug,
                        lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                        lastSyncAt         : priorState?.lastRunAttemptAt ? new Date(priorState.lastRunAttemptAt).toISOString() : null,
                        status             : 'aborted-lease-lost',
                        checkpointStatus,
                        consecutiveFailures: priorState?.consecutiveFailures ?? 0
                    });
                    return;
                }

                const code            = isTenantRepoSyncErrorCode(e.code) ? e.code : KB_TENANT_REPO_SYNC_SYNC_FAILED;
                const sourceErrorCode = getSourceErrorCode(e, code);
                const sourceSuffix    = sourceErrorCode ? ` source=${sourceErrorCode}` : '';
                // Additional bounded codes and the total error count, so a multi-cause failure does
                // not read as single-cause. Both are omitted when they would add nothing (one code,
                // or a count that is not a useful number), keeping the single-cause line unchanged.
                const otherCodes = Array.isArray(e?.sourceErrorCodes)
                    ? e.sourceErrorCodes.filter(candidate => candidate !== sourceErrorCode)
                    : [];
                const alsoSuffix  = otherCodes.length > 0 ? ` also=${otherCodes.join(',')}` : '';
                const countSuffix = Number.isInteger(e?.sourceErrorCount) && e.sourceErrorCount > 1
                    ? ` errors=${e.sourceErrorCount}`
                    : '';
                writeLog?.('ERROR', `[TenantRepoSync] ${repoLabel} failed: ${code}${sourceSuffix}${alsoSuffix}${countSuffix} (${e.message})`);

                if (slotAcquired && !accessConfirmed) {
                    this.recordTenantRepoAccessOutcome({repo, ready: false, error: e, globalCadenceMs});
                }

                // Increment consecutiveFailures on failure; preserve last good
                // ingested revision so the next successful run starts from the correct base.
                // lastRunAttemptAt advances even on failure (backoff measures from attempt
                // start, not last-success).
                const
                    nextFailureCount       = (priorState?.consecutiveFailures ?? 0) + 1,
                    embeddingRecoveryCause = getEmbeddingRecoveryCauseCode(e, sourceErrorCode),
                    embeddingRecovery      = embeddingRecoveryCause
                        ? buildEmbeddingRecoveryEpisode({
                            priorRecovery: priorState?.embeddingRecovery || null,
                            causeCode    : embeddingRecoveryCause,
                            failedAt     : startedMs
                        })
                        : (!workStarted ? (priorState?.embeddingRecovery || null) : null);

                persistedRevisions[repoLabel] = {
                    lastIngestedRev                      : priorState?.lastIngestedRev || null,
                    lastRunAttemptAt                     : startedMs,
                    consecutiveFailures                  : nextFailureCount,
                    ingestContractVersion                : priorState?.ingestContractVersion ?? null,
                    lastAttemptedIngestContractVersion   : TENANT_REPO_INGEST_CONTRACT_VERSION,
                    lastCommittedMaterializationAttemptId: priorState?.lastCommittedMaterializationAttemptId || null,
                    // PERSIST the cause, not just the count. Before this, `lastErrorCode` existed only
                    // on the in-memory record for the sweep that failed: it was published for one
                    // cadence and then overwritten by the next sweep, which — once backoff parked the
                    // repo — reported it as merely not-due with no reason at all. So a lane could fail
                    // four times and present as `consecutiveFailures: 4, lastErrorCode: null`, which is
                    // what made a wedged deployment undiagnosable from a remote client. Counters
                    // survived because they were persisted; the reason did not because it was not.
                    //
                    // Codes only. `getSourceErrorCode` admits nothing outside `^KB_[A-Z0-9_]+$`, so no
                    // stderr, URL, credential or free-text message can reach durable state through here.
                    //
                    // Three fields because they answer three different questions, and collapsing them
                    // loses the one an operator acts on: `lastErrorCode` is the stable OUTER code a
                    // caller branches on, `lastSourceErrorCode` names the OPERATION that failed
                    // (`KB_GITMIRROR_FETCH_FAILED`), and `lastAccessCode` is the CAUSE — under-scoped
                    // credential vs rejected credential vs absent-or-denied repository vs unreachable
                    // host. Operation plus counter told an operator that acquisition failed; only the
                    // cause tells them which fix to apply, and without host access it is the only thing
                    // that can.
                    lastErrorCode      : code ?? null,
                    lastSourceErrorCode: sourceErrorCode ?? null,
                    lastAccessCode     : classifySyncFailure(e),
                    lastErrorAt        : Date.now(),
                    embeddingRecovery
                };

                const failedRepoState = {
                    tenantId           : repo.tenantId,
                    repoSlug           : repo.repoSlug,
                    lastIngestedRev    : priorState?.lastIngestedRev ? priorState.lastIngestedRev.slice(0, 8) : null,
                    lastSyncAt         : new Date().toISOString(),
                    status             : 'degraded',
                    checkpointStatus   : classifyTenantRepoCheckpoint(persistedRevisions[repoLabel]),
                    lastErrorCode      : code,
                    consecutiveFailures: nextFailureCount,
                    recoveryState      : classifyEmbeddingRecoveryState({
                        persistedRepoState: persistedRevisions[repoLabel],
                        probeSnapshot     : this.getEmbeddingRecoveryProbeSnapshot(),
                        observedAt        : startedMs
                    })
                };

                if (sourceErrorCode) {
                    failedRepoState.lastSourceErrorCode = sourceErrorCode;
                }

                repoStates.push(failedRepoState);
                failedCount++;
                healthService?.recordTaskOutcome?.(taskName, 'failed', {
                    repo    : repoLabel,
                    tenantId: repo.tenantId,
                    repoSlug: repo.repoSlug,
                    error   : e.message,
                    code,
                    ...(sourceErrorCode ? {sourceErrorCode} : {}),
                    consecutiveFailures: nextFailureCount,
                    checkpointStatus   : failedRepoState.checkpointStatus
                });
                // Continue with remaining repos — per-repo failure isolation is the
                // tenant deployment contract.
            } finally {
                if (slotAcquired) semaphore.release();

                // Every path that RETURNS clears its own entry — success, caught failure, and
                // lease-lost abort all pass through here, so this is the single clearing point
                // for all three. Per-repo rather than one sweep-terminal truncate: with
                // `concurrencyLimit >= 2`, a crash while repo B is in flight would otherwise
                // fold repo A's completed attempt into a spurious failure.
                if (inFlightRecorded) {
                    await mutateInFlight(attempts => {
                        delete attempts[repoLabel];
                    });
                }
            }
        };

        // Reserved migration work runs as a bounded first cohort. Normal repos
        // are not enqueued until those admitted replays settle, so their
        // concurrency-gate timeout clocks cannot expire behind intentionally
        // prioritized migration work.
        const
            admittedRevalidationRepos = repos.filter(repo =>
                revalidationAdmissionLabels.has(`${repo.tenantId}/${repo.repoSlug}`)
            ),
            remainingRepos = repos.filter(repo =>
                !revalidationAdmissionLabels.has(`${repo.tenantId}/${repo.repoSlug}`)
            );

        await Promise.all(admittedRevalidationRepos.map(syncRepo));
        await Promise.all(remainingRepos.map(syncRepo));

        // Any lease-lost abort makes the whole run structurally failed: partial
        // per-repo results must not be committed (the successor's run is the
        // authoritative one), and per-repo backoff state was deliberately left
        // untouched above.
        if (abortedCount > 0) {
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_LEASE_LOST,
                `Tenant-repo-sync lease ownership was lost mid-sweep; ${abortedCount} repo(s) aborted before protected work and no manifest was committed.`,
                {phase: 'lease-fence', abortedCount}
            );
        }

        await leaseGuard();
        await this.writePersistedRevisions({filePath: resolvedRevisionsPath, revisions: persistedRevisions});

        // Status logic: not-due repos don't change the success/failure tally — a cycle
        // where ALL repos were not-due is still 'completed' (the cycle ran successfully;
        // each repo's decision was honored) UNLESS every repo is backoff-suppressed with
        // zero lifetime successes, which reads `starved` (the lane machinery is
        // healthy while the KB it feeds cannot receive content; calling that `completed`
        // is what hid the incident class). 'failed' only when actual work failed and no
        // actual work succeeded.
        const attemptedCount = completedCount + failedCount;
        const detection      = detectStarvedTenantSync({
            repoStates,
            attemptedCount,
            now               : Date.now(),
            starvedAfterMs,
            previousCompletion: taskStateService?.getTaskState?.(taskName)?.lastCompletion
        });
        // A sweep whose only outcome was deferral did NOT run cleanly, and reporting it as
        // `completed` re-creates precisely the defect the comment above describes: the lane
        // machinery is healthy while the KB it feeds received nothing. `attemptedCount` cannot
        // carry this on its own — deferrals are neither completed nor failed, so an all-deferred
        // sweep lands on the `attemptedCount === 0` branch that exists for "every repo was not-due"
        // and inherits its clean verdict. The two states are opposite: not-due means nobody needed
        // work, all-deferred means everybody needed it and none of it landed.
        //
        // A mixed sweep stays `completed` deliberately — real repos did advance, and the deferred
        // ones are reported per-repo. `deferred` routes to `markSkipped` through the existing
        // consumer branch, so `lastSuccessAt` does not advance on a cycle that ingested nothing.
        const status = detection.starved
            ? 'starved'
            : (completedCount === 0 && failedCount === 0 && deferredCount > 0
                ? 'deferred'
                : (attemptedCount === 0
                    ? 'completed' // all repos were not-due; cycle ran cleanly
                    : (failedCount === 0 ? 'completed' : (completedCount > 0 ? 'completed' : 'failed'))));

        // Record-with-diagnosis: exactly one durable heal-ledger record per starved
        // episode (the detector's marker flows through the lane's completion metadata), once
        // the oldest suppression is duration-proven. A record, never an action — the sweep
        // machinery is healthy; the lane it feeds is what starves.
        if (detection.emit && healEventLedgerDir) {
            await appendHealEvent({
                type      : 'tenant-repo-sync-starved',
                collection: taskName,
                status    : 'recorded',
                detail    : {
                    reasonCode: KB_TENANT_REPO_SYNC_STARVED,
                    ...detection.evidence
                }
            }, {
                dir: healEventLedgerDir,
                now: Date.now(),
                ...validateHealLedgerRetention(
                    AiConfig.data.orchestrator.recoveryActuator.healLedger.maxEvents,
                    AiConfig.data.orchestrator.recoveryActuator.healLedger.pruneTriggerBytes
                )
            });
        }

        writeLog?.('INFO', `[TenantRepoSync] Cycle summary: ${repos.length} repos, ${completedCount} completed, ${deferredCount} deferred, ${failedCount} failed, ${notDueCount} not-due, ${revalidationDeferredCount} revalidation-deferred${detection.starved ? ` — STARVED (oldest suppression ${detection.evidence.oldestSuppressedAt})` : ''}.`);

        return {
            status,
            details: {
                repoCount: repos.length,
                completedCount,
                deferredCount,
                failedCount,
                // Reported alongside the others rather than folded into either. A repo that rotated
                // on its budget neither completed nor deferred, and collapsing it into `completed`
                // would tell a plane owner the corpus is done while a remainder is outstanding —
                // collapsing it into `deferred` would report a healthy rotating lane as one in
                // trouble. The per-repo rows carry the outstanding stamp; this is the total.
                partialProgressCount,
                notDueCount,
                revalidationDeferredCount,
                ...(detection.starved ? {starved: true, starvedEvidence: detection.evidence} : {}),
                starvedEventAt: detection.starvedEventAt,
                repos         : repoStates
            }
        };
    }

    /**
     * @summary Resolves the effective `tenantRepos` across all tenants via the tiered resolver
     * `KnowledgeBaseIngestionService.listConfiguredTenantRepos` (graph node > `kb-config.yaml`
     * bootstrap > `aiConfig.tenantRepos[]` default, per-tenant single-winner, flattened). Replaces
     * the prior direct `aiConfig.tenantRepos` read so the documented bootstrap / graph tiers are
     * actually honored on the pull path.
     *
     * Then materializes an absent per-repo `mirrorRoot` from the resolved
     * `AiConfig.orchestrator.tenantRepoMirrorRoot` leaf. That leaf owns both the cloud default
     * and its env binding; this consumer must not re-resolve either one. `tier1MirrorRoot`
     * remains an explicit test seam and full short-circuit.
     *
     * @param {Object} [options]
     * @param {String} [options.tier1MirrorRoot] Pre-resolved Tier-1 mirrorRoot default (test seam).
     * @param {Object} [options.ingestionService] Stub KB ingestion service (test seam); defaults to the live singleton.
     * @returns {Promise<{tenantRepos: Array<Object>, configDiagnostics: Object}>} Effective repos with
     *     the Knowledge Base resolver's bounded config diagnostics preserved unchanged.
     * @throws {TypeError} When the resolved Tier-1 mirror root is not a non-empty string.
     */
    async resolveTenantReposConfig({tier1MirrorRoot, ingestionService} = {}) {
        const tier1Default = tier1MirrorRoot ?? AiConfig.orchestrator.tenantRepoMirrorRoot;

        if (typeof tier1Default !== 'string' || tier1Default.trim() === '') {
            throw new TypeError('AiConfig.orchestrator.tenantRepoMirrorRoot must resolve to a non-empty string.');
        }

        const kbService  = ingestionService || await this.resolveIngestionService();
        const normalized = await kbService.listConfiguredTenantRepos();

        normalized.tenantRepos = normalized.tenantRepos.map(entry =>
            entry.mirrorRoot ? entry : {...entry, mirrorRoot: tier1Default}
        );

        return normalized;
    }

    /**
     * Resolves the live `KnowledgeBaseIngestionService` singleton.
     *
     * @returns {Promise<Object>}
     */
    async resolveIngestionService() {
        const services = await import('../../../services.mjs');
        return services.KB_IngestionService;
    }

    /**
     * Default per-tenant-repo lastIngestedRev persistence file path. Lives next to
     * the orchestrator state file (`<orchestrator dataDir leaf>/orchestrator-state.json`)
     * so the two persistence surfaces share lifecycle (same data-dir = same recovery scope).
     * Separate file (not inlined into TaskStateService's state) prevents `markCompleted/markFailed`
     * task-lifecycle writes from racing with revision-map writes. The dataDir resolves from the
     * owning config leaf inline — a use-site read, never a module-load capture.
     *
     * @returns {String}
     */
    defaultRevisionsFilePath() {
        return path.join(AiConfig.orchestrator.dataDir, PERSISTED_REVISIONS_FILE_NAME);
    }

    /**
     * Reads the per-tenant-repo persisted state map. Missing file = empty map (bootstrap).
     *
     * Current per-repo persisted state shape:
     * ```
     * {
     *   lastIngestedRev                    : '<sha>',
     *   lastRunAttemptAt                   : <ms-epoch>,
     *   consecutiveFailures                : <int>,
     *   ingestContractVersion              : <int|null>,
     *   lastAttemptedIngestContractVersion : <int|null>,
     *   lastCommittedMaterializationAttemptId: <hex|null>
     * }
     * ```
     *
     * Backward-compatible read: legacy persistence stored bare SHA strings under
     * `revisions[label]`. On read, string-shaped entries are normalized to the full
     * state shape without manufacturing an ingestion-contract proof. The scheduler
     * therefore admits one bounded null-base replay before trusting that head.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Boolean} [options.strict=false] Throw on corrupt/unreadable files instead of returning an empty map.
     * @returns {Promise<Object<String, Object>>}
     */
    async readPersistedRevisions({filePath, strict = false}) {
        if (!await fs.pathExists(filePath)) {
            return {};
        }
        try {
            const data = await fs.readJson(filePath);
            if (
                !data
                || typeof data !== 'object'
                || !data.revisions
                || typeof data.revisions !== 'object'
                || Array.isArray(data.revisions)
            ) {
                if (strict) {
                    const error = new Error(`Tenant-repo-sync revisions at ${filePath} have an invalid shape.`);
                    error.code  = 'KB_TENANT_REPO_SYNC_REVISIONS_INVALID';
                    throw error;
                }
                return {};
            }

            const normalized = {};
            for (const [label, value] of Object.entries(data.revisions)) {
                const checkpointState = normalizeTenantRepoCheckpointState(value);

                if (checkpointState) {
                    normalized[label] = checkpointState;
                } else if (strict) {
                    const error = new Error('Tenant-repo-sync revision entry has an invalid shape.');
                    error.code  = 'KB_TENANT_REPO_SYNC_REVISIONS_INVALID';
                    throw error;
                }
            }
            return normalized;
        } catch (e) {
            if (strict) {
                const error = new Error(`Failed to read tenant-repo-sync revisions at ${filePath}: ${e.message}`);
                error.code = e.code || 'KB_TENANT_REPO_SYNC_REVISIONS_READ_FAILED';
                throw error;
            }
            return {};
        }
    }

    /**
     * Resolves the in-flight attempt sidecar path for a revisions manifest.
     * @param {String} revisionsFilePath
     * @returns {String}
     */
    inFlightAttemptsPath(revisionsFilePath) {
        return `${revisionsFilePath}${IN_FLIGHT_SUFFIX}`
    }

    /**
     * Reads the in-flight attempt sidecar.
     *
     * Fail-OPEN, unlike `readPersistedRevisions`, which fail-closes the lane on a bad manifest.
     * The asymmetry is deliberate: the manifest is authoritative state whose corruption must
     * stop the lane, while this file is a best-effort crash hint whose worst outcome is one
     * unrecorded attempt. Wedging a healthy lane because a crash left a torn hint would trade a
     * rare missed dampening for a guaranteed outage.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object} [options.fsModule=fs] File-system implementation seam (fault-injection test seam).
     * @returns {Promise<Object<String, {startedMs: Number, priorFailures: Number,
     *     priorSourceErrorCode: String|null, priorAccessCode: String|null,
     *     recoveryEpisodeId: String|null, recoveryGenerationId: String|null}>>}
     */
    async readInFlightAttempts({filePath, fsModule = fs}) {
        try {
            const parsed = await fsModule.readJson(filePath);

            return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {}
        } catch (e) {
            return {}
        }
    }

    /**
     * Writes the in-flight attempt sidecar, or removes it once no attempt is outstanding.
     *
     * Staged through a temp sibling and renamed, so a concurrent reader sees either the old or
     * the new document and never a half-written one. Deliberately NOT fsynced, unlike
     * `writePersistedRevisions`: the failure class this file defends against is process death
     * (OOM, SIGKILL, container stop), and a dead process leaves the OS page cache intact, so the
     * rename is already durable enough for the successor that reads it. Paying for fsync on
     * every repo attempt would buy only power-loss coverage, which this record does not claim.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object<String, {startedMs: Number, priorFailures: Number,
     *     priorSourceErrorCode: String|null, priorAccessCode: String|null,
     *     recoveryEpisodeId: String|null, recoveryGenerationId: String|null}>} options.attempts
     * @param {Object} [options.fsModule=fs] File-system implementation seam (fault-injection test seam).
     * @returns {Promise<Boolean>} Whether the sidecar mutation committed.
     */
    async writeInFlightAttempts({filePath, attempts, fsModule = fs}) {
        if (Object.keys(attempts).length === 0) {
            await fsModule.remove(filePath).catch(() => {});
            return true
        }

        try {
            // Was `${filePath}.tmp-${pid}` — unique per process, but this sidecar is written per repo
            // inside one sweep, so two repos raced the same scratch.
            await writeFileAtomic(filePath, JSON.stringify(attempts, null, 2) + '\n', {fsModule});
            return true
        } catch (e) {
            // Best-effort by contract: a sidecar write failure must not fail a repo whose actual
            // sync is fine. The cost is exactly one unrecorded attempt — the same price the
            // write-behind behaviour paid on every crash — so failing the run here would be
            // strictly worse than the defect this record exists to fix. Scratch cleanup is the
            // primitive's `finally` now, so nothing is left here to remove.
            return false
        }
    }

    /**
     * Folds residue left by a sweep that never returned into the persisted revision state.
     *
     * A residual entry means the previous process started that repo's protected work and died
     * before any return path could record the outcome. Treating it as a failure is the
     * conservative reading and the correct one: the attempt provably consumed a cadence window
     * and provably did not succeed, so it must both advance `lastRunAttemptAt` and grow the
     * backoff term. Mutates `persistedRevisions` in place; the caller commits it.
     *
     * @param {Object} options
     * @param {Object<String, {startedMs: Number, priorFailures: Number,
     *     priorSourceErrorCode: String|null, priorAccessCode: String|null,
     *     recoveryEpisodeId: String|null, recoveryGenerationId: String|null}>} options.attempts
     * @param {Object} options.persistedRevisions Mutated in place.
     * @param {Function} [options.writeLog]
     * @returns {Number} Count of folded attempts.
     */
    foldInFlightAttempts({attempts, persistedRevisions, writeLog}) {
        let folded = 0;

        for (const [repoLabel, attempt] of Object.entries(attempts)) {
            const startedMs = Number(attempt?.startedMs);

            if (!Number.isFinite(startedMs)) continue;

            const
                priorState = persistedRevisions[repoLabel] || null,
                // The failure count the crashed attempt itself observed. Preferred over the
                // committed one because a crash loop never commits, so reading the manifest
                // would re-derive the same base every restart and the term would never grow.
                priorFailures = Number.isFinite(Number(attempt?.priorFailures))
                    ? Number(attempt.priorFailures)
                    : (priorState?.consecutiveFailures ?? 0),
                priorRecovery = priorState?.embeddingRecovery || null,
                recoveryGrantMatches = Boolean(
                    priorRecovery
                    && attempt?.recoveryEpisodeId === priorRecovery.episodeId
                    && attempt?.recoveryGenerationId === priorRecovery.generationId
                ),
                retainedSourceErrorCode = (
                    typeof attempt?.priorSourceErrorCode === 'string'
                    && BOUNDED_KB_ERROR_CODE_PATTERN.test(attempt.priorSourceErrorCode)
                )
                    ? attempt.priorSourceErrorCode
                    : (priorState?.lastSourceErrorCode ?? null),
                foldedRecovery = recoveryGrantMatches
                    ? buildEmbeddingRecoveryEpisode({
                        priorRecovery: {
                            ...priorRecovery,
                            bypassConsumedAt: startedMs
                        },
                        causeCode: priorRecovery.causeCode,
                        failedAt : startedMs
                    })
                    : priorRecovery;

            persistedRevisions[repoLabel] = {
                ...priorState,
                // Preserved explicitly: a crashed attempt establishes nothing about what was
                // ingested, so the checkpoint it inherited remains the correct base.
                lastIngestedRev    : priorState?.lastIngestedRev || null,
                lastRunAttemptAt   : startedMs,
                consecutiveFailures: priorFailures + 1,
                lastErrorCode      : KB_TENANT_REPO_SYNC_SYNC_FAILED,
                lastSourceErrorCode: retainedSourceErrorCode,
                // The manifest reader already applied the bounded-code allowlist. The sidecar is
                // only a crash witness, never a second authority for diagnostic vocabulary: a
                // torn or hand-edited sidecar must not project arbitrary text into durable state.
                lastAccessCode   : priorState?.lastAccessCode ?? null,
                lastErrorAt      : startedMs,
                embeddingRecovery: foldedRecovery
            };

            folded++;
            writeLog?.('WARN', `[TenantRepoSync] ${repoLabel} did not return from its previous attempt (started ${new Date(startedMs).toISOString()}); recording it as a failure so backoff can engage.`);
        }

        return folded
    }

    /**
     * Persists the per-tenant-repo lastIngestedRev map. Creates the parent
     * directory on first write so a fresh deployment doesn't need explicit dir
     * provisioning.
     *
     * Atomic whole-file replacement: the document is written to a temporary
     * sibling, fsynced, then renamed over the target. A process crash at any
     * point therefore leaves either the previous complete manifest or the new
     * complete manifest on disk — never a truncated JSON document (which the
     * strict reader would otherwise fail-close the whole lane on).
     *
     * Throws `TenantRepoSyncError(KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED)` on
     * write failure so the next cycle re-detects the same diff and retries
     * idempotently (per-repo failure isolation contract). The temporary sibling
     * is best-effort removed on failure.
     *
     * @param {Object} options
     * @param {String} options.filePath
     * @param {Object<String, String>} options.revisions
     * @param {Object} [options.fsModule=fs] File-system implementation seam (fault-injection test seam).
     * @returns {Promise<void>}
     */
    async writePersistedRevisions({filePath, revisions, fsModule = fs, assertOwnership = null}) {
        const tmpPath = `${filePath}.tmp-${process.pid}`;

        try {
            await fsModule.ensureDir(path.dirname(filePath));

            // writeFile carries Node's full-write contract (it retries partial
            // writes internally), unlike a single unchecked fs.write() whose
            // bytesWritten may be short. Only after the COMPLETE payload exists
            // is it fsynced and atomically renamed over the target.
            await fsModule.writeFile(tmpPath, JSON.stringify({revisions}, null, 2) + '\n');

            const fd = await fsModule.open(tmpPath, 'r+');
            try {
                await fsModule.fsync(fd);
            } finally {
                await fsModule.close(fd);
            }

            // THE COMMIT POINT IS THE RENAME, so the ownership fence belongs immediately before
            // it and nowhere else. Everything above is staging on a private temp path and is
            // discardable; the rename is the instant this document becomes the manifest.
            //
            // A caller that proved ownership before calling is not protected: the staging above is
            // multi-await I/O, and a holder can be legitimately evicted inside it. Proving after
            // the rename is worse than useless — the overwrite has already happened, and declining
            // some LATER mutation does not undo it.
            //
            // Returns `{committed: false}` rather than throwing: a lost fence is a deferral, not a
            // failure. The successor owns forward progress and this run's state is simply stale, so
            // the next sweep re-derives it. Callers that must distinguish the two read `committed`.
            if (assertOwnership && !await assertOwnership()) {
                await fsModule.remove(tmpPath).catch(() => {});
                return {committed: false, reason: 'ownership-lost'}
            }

            // DELIBERATELY NOT the shared write-temp-then-rename primitive: the ownership fence above
            // must sit between the scratch write and this rename, exactly as the comment block says.
            // The primitive collapses both into one call, leaving the fence nowhere to stand.
            await fsModule.rename(tmpPath, filePath); // atomic-write-ok: assertOwnership() must fence between write and rename

            return {committed: true}
        } catch (e) {
            await fsModule.remove(tmpPath).catch(() => {});
            throw new TenantRepoSyncError(
                KB_TENANT_REPO_SYNC_MANIFEST_UPDATE_FAILED,
                `Failed to persist tenant-repo-sync revisions at ${filePath}: ${e.message}`,
                {filePath, phase: 'manifest-update'}
            );
        }
    }

    /**
     * @summary Clears the persisted backoff streak for tenant repos, without restarting the process.
     *
     * The backoff itself is correct congestion control; what it lacked was an EXIT. Every failure in
     * a shared-dependency outage lands on the per-repo `consecutiveFailures` counter, so when the
     * cause is repaired the repos stay suppressed for up to `backoffCapMs` each — and the operator's
     * only levers were to wait out the cap or restart the orchestrator to clear a counter. That
     * makes every fix cost a fix plus a wait, and it makes the fix unverifiable in the meantime:
     * "the repair did not work" and "the lane has not been allowed to try yet" look identical.
     *
     * **Why a second process can do this at all.** The streak is not daemon memory — it lives in the
     * persisted revisions manifest, and {@link #syncTenantRepos} re-reads that manifest at the top of
     * EVERY sweep. So a one-shot container-plane run that rewrites the counter is observed by the
     * next sweep of the long-running daemon with no restart and nothing shared but the file. The
     * caller must hold the same cross-process heavy-maintenance lease the sweep takes; without it
     * this races a sweep mid-write on the one manifest they share.
     *
     * **Only the streak is cleared.** `lastIngestedRev` and the materialization proofs are left
     * exactly as found: they are the record of what was successfully ingested, and resetting them
     * would turn "let this lane retry now" into "re-ingest everything from a null base" — a far more
     * expensive request than the operator made.
     *
     * Repos with no persisted entry, or already at zero, are reported as `unchanged` rather than
     * silently succeeding: an operator who clears a backoff and is told nothing has no way to tell a
     * completed no-op from a misspelled selector, which is the ambiguity this whole path exists to
     * remove.
     *
     * @param {Object} [options]
     * @param {String[]|null} [options.onlyRepoSlugs=null] Restrict to these configured slugs; omit for every configured repo. An unknown slug is refused, never silently skipped.
     * @param {Object|null} [options.tenantReposConfig=null] Injected repo config; defaults to the deployment's. Mirrors {@link #syncTenantRepos}'s seam rather than reading the singleton directly, so a caller can scope this the same way the sweep is scoped.
     * @param {String|null} [options.revisionsFilePath=null] Manifest path override; defaults to {@link #defaultRevisionsFilePath}.
     * @param {Function|null} [options.writeLog=null] Structured log sink.
     * @returns {Promise<{status: String, details: Object}>} `completed` with a per-repo outcome list, or `failed` carrying `KB_TENANT_REPO_SYNC_REPO_NOT_CONFIGURED`.
     */
    async clearTenantRepoBackoff({onlyRepoSlugs = null, revisionsFilePath = null, writeLog = null, tenantReposConfig = null} = {}) {
        const resolvedConfig = tenantReposConfig || AiConfig.data.orchestrator.tenantRepoSync,
              allRepos       = resolvedConfig.tenantRepos || [],
              knownSlugs     = allRepos.map(repo => repo.repoSlug);

        // The same refusal the sweep gives an unknown selector, through the same shared predicate:
        // an operator who mistypes a slug gets one vocabulary and one disposition back, whichever
        // flag they typed. The two paths tested this separately once and disagreed — the sweep
        // refused only an all-unknown set — so the question now has a single name.
        const unknownSelectors = resolveUnknownRepoSelectorFailure({onlyRepoSlugs, knownSlugs});

        if (unknownSelectors) {
            writeLog?.('WARN', `[TenantRepoSync] clear-backoff: requested repoSlug(s) not configured: ${unknownSelectors.unknownSlugs.join(', ')}. Configured: ${unknownSelectors.configuredSlugs.join(', ') || '(none)'}.`);

            return {status: 'failed', details: unknownSelectors}
        }

        const targetSlugs = onlyRepoSlugs?.length > 0 ? onlyRepoSlugs : knownSlugs;

        if (targetSlugs.length === 0) {
            writeLog?.('INFO', '[TenantRepoSync] clear-backoff: no tenantRepos configured; nothing to clear.');

            return {status: 'completed', details: {reason: 'no-tenant-repos-configured', cleared: [], unchanged: []}}
        }

        const filePath = revisionsFilePath || this.defaultRevisionsFilePath(),
              // strict: a corrupt manifest must not be overwritten by a well-meaning reset — the
              // fail-open read would hand back {} and this method would then persist that emptiness
              // over every checkpoint on disk.
              revisions = await this.readPersistedRevisions({filePath, strict: true}),
              cleared   = [],
              unchanged = [],
              clearedAt = new Date().toISOString();

        for (const slug of targetSlugs) {
            const state  = revisions[slug],
                  streak = state?.consecutiveFailures ?? 0;

            if (!state || streak === 0) {
                unchanged.push({repoSlug: slug, consecutiveFailures: streak, reason: state ? 'already-clear' : 'no-persisted-state'});
                continue
            }

            // The consumption marker is PERSISTED beside the reset, not merely logged: a log line
            // lives in one container's stdout, while the deployment-state snapshot is the surface an
            // operator reads without shell access. Recording what the streak WAS matters as much as
            // when — "cleared at 12:40" tells you an intervention happened, "cleared 42 → 0 at
            // 12:40" tells you whether the suppression it removed was the one you were chasing.
            revisions[slug] = {
                ...state,
                consecutiveFailures       : 0,
                backoffClearedAt          : clearedAt,
                backoffClearedFromFailures: streak
            };
            cleared.push({repoSlug: slug, previousConsecutiveFailures: streak})
        }

        if (cleared.length > 0) {
            await this.writePersistedRevisions({filePath, revisions})
        }

        writeLog?.('INFO', `[TenantRepoSync] clear-backoff: cleared ${cleared.length} of ${targetSlugs.length} selected repo(s)${cleared.length ? ` (${cleared.map(entry => `${entry.repoSlug} ${entry.previousConsecutiveFailures}->0`).join(', ')})` : ''}; ${unchanged.length} already clear.`);

        return {status: 'completed', details: {cleared, unchanged, filePath}}
    }

}

export default Neo.setupClass(TenantRepoSyncService);
