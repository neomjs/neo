import crypto                  from 'crypto';
import {BATCH_SCHEMA_VERSION}  from '../../memory-core/communityBatchContract.mjs';
import {deletionToObservation} from './githubIssueAbsence.mjs';

/**
 * @summary Deterministic hash of a live-entity inventory — the sorted, de-duplicated id set folded
 * into one digest. Order-insensitive so two runs that saw the same entities in a different page
 * order produce the same inventory hash, and the admission base-inventory check stays stable.
 * @param {Iterable<String>} entityIds
 * @returns {String} `inv:<sha256-hex>`.
 */
export function inventoryHash(entityIds) {
    const sorted = [...new Set(entityIds)].sort();

    return 'inv:' + crypto.createHash('sha256').update(sorted.join('\n')).digest('hex')
}

/**
 * @summary Assembles a `community-activity-batch.v1` batch from a reconciliation run: the runner's
 * observations, the evidenced deletions, and the registration/checkpoint context — a pure envelope
 * builder with no I/O.
 *
 * Two honesty rules are enforced here, not left to the caller. First, only the EVIDENCED deletions
 * become `deleted` observations; the access-indeterminate set (entities that vanished without proof)
 * is folded into coverage as gaps and degrades `complete`, so a permission loss lowers coverage
 * rather than fabricating a deletion. Second, the base/next inventory anchors are computed from the
 * actual live id set, so the admission service can verify the base the batch was built against.
 *
 * The `nextProviderState` cursor is carried straight through from the runner and is only ever
 * durably advanced by the admission transaction — this builder never persists it, so a batch that
 * fails admission cannot advance the source cursor.
 * @param {Object}   input
 * @param {String}   input.sourceInstanceId
 * @param {String}   [input.resourceFamily='issues']
 * @param {Number}   input.registrationEpoch
 * @param {Number}   input.baseCheckpointVersion
 * @param {String|null} input.baseInventoryHash
 * @param {Object}   input.runnerResult          `{observations, coverage, nextProviderState}` from reconcileIssueActivity.
 * @param {Object}   [input.absences]            `{deleted, accessIndeterminate}` from classifyAbsences.
 * @param {String[]} input.currentInventory      Live root entity ids observed this run.
 * @param {String}   input.batchId
 * @param {String}   input.observedAt            ISO-8601 fallback moment for undated deletion evidence.
 * @param {String}   [input.adapterSchemaVersion='github-issue.v1']
 * @param {String}   [input.providerStateSchemaVersion='github-issue-state.v1']
 * @param {String}   [input.deletionOccurrenceKind='issue.deleted']
 * @returns {Object} A `community-activity-batch.v1` batch.
 */
export function assembleIssueBatch({
    sourceInstanceId, resourceFamily = 'issues', registrationEpoch,
    baseCheckpointVersion, baseInventoryHash,
    runnerResult, absences = {deleted: [], accessIndeterminate: []},
    currentInventory, batchId, observedAt,
    adapterSchemaVersion       = 'github-issue.v1',
    providerStateSchemaVersion = 'github-issue-state.v1',
    deletionOccurrenceKind     = 'issue.deleted'
}) {
    const {deleted = [], accessIndeterminate = []} = absences;

    const deletionObservations = deleted.map(
        deletion => deletionToObservation(deletion, {occurrenceKind: deletionOccurrenceKind, observedAt})
    );

    const observations = [...runnerResult.observations, ...deletionObservations];

    // Access-indeterminate absences are NEVER observations — they lower coverage as explicit gaps.
    const accessGaps = accessIndeterminate.map(providerEntityId => ({axis: 'inventory-access', providerEntityId}));
    const priorGaps  = runnerResult.coverage.gaps ?? [];
    const gaps       = [...priorGaps, ...accessGaps];

    const coverage = {
        fromBasis: runnerResult.coverage.fromBasis,
        toBasis  : runnerResult.coverage.toBasis,
        complete : runnerResult.coverage.complete && accessIndeterminate.length === 0,
        ...(gaps.length ? {gaps} : {})
    };

    return {
        schemaVersion    : BATCH_SCHEMA_VERSION,
        sourceInstanceId,
        resourceFamily,
        adapterSchemaVersion,
        providerStateSchemaVersion,
        registrationEpoch,
        baseCheckpointVersion,
        baseInventoryHash,
        batchId,
        observations,
        nextProviderState: runnerResult.nextProviderState,
        nextInventoryHash: inventoryHash(currentInventory),
        coverage
    }
}
