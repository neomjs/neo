import {actorKindFromTypename} from './githubIssueObservations.mjs';

/**
 * @summary Classifies entities that a prior inventory saw but the current reconciliation did not
 * into two disjoint sets: confirmed deletions and access-indeterminate absences.
 *
 * The distinction is a security invariant, not a convenience. An entity that vanished from view is
 * a DELETION only when the provider hands us explicit evidence it was removed (a deletion tombstone
 * / a removed marker). An entity that vanished with NO such evidence is treated as a permission or
 * access loss — the token can no longer see it — and is NEVER recorded as a deletion, because
 * "I can't see it" and "it no longer exists" are different facts and conflating them lets a
 * revoked grant masquerade as community members deleting their own history.
 *
 * Membership in `currentEntityIds` always means present, so an entity is never both present and
 * absent; only genuinely-vanished ids are classified.
 * @param {Iterable<String>} priorEntityIds       Provider entity ids the source last held as live.
 * @param {Iterable<String>} currentEntityIds     Provider entity ids observed in this reconciliation.
 * @param {Object}           [deletionEvidenceById] Map id → provider deletion evidence, when it exists.
 * @returns {{deleted: Object[], accessIndeterminate: String[]}} `deleted` carries `{providerEntityId, deletionEvidence}`; `accessIndeterminate` is a bare id list — vanished without proof, never a deletion.
 */
export function classifyAbsences(priorEntityIds, currentEntityIds, deletionEvidenceById = {}) {
    const current             = new Set(currentEntityIds),
          deleted             = [],
          accessIndeterminate = [];

    for (const providerEntityId of priorEntityIds) {
        if (current.has(providerEntityId)) {
            continue
        }

        const deletionEvidence = deletionEvidenceById[providerEntityId];

        if (deletionEvidence) {
            deleted.push({providerEntityId, deletionEvidence})
        } else {
            // Vanished with no provider proof of removal — an access/permission gap, not a deletion.
            accessIndeterminate.push(providerEntityId)
        }
    }

    return {deleted, accessIndeterminate}
}

/**
 * @summary Projects one confirmed deletion into a `community-activity-batch.v1` deletion observation,
 * carrying the mandatory provider evidence the contract requires for any `deleted` absence.
 *
 * The moment is taken from the evidence when the provider dates the removal, falling back to the
 * reconciliation's own observation time; the actor kind is read from the evidence's actor, failing
 * closed to `unknown`. This is only ever called on the `deleted` set from {@link classifyAbsences}
 * — access-indeterminate absences never reach here, so a permission loss can never be shaped into
 * a deletion observation.
 * @param {Object} deletion                    A `{providerEntityId, deletionEvidence}` entry.
 * @param {Object} context
 * @param {String} context.occurrenceKind      The deletion occurrence kind, e.g. `issue.deleted`.
 * @param {String} context.observedAt          ISO-8601 fallback moment when the evidence is undated.
 * @returns {Object} `{providerEntityId, occurrenceKind, occurrenceCoordinate, occurredAt, actorKind, absence, deletionEvidence}`.
 */
export function deletionToObservation(deletion, {occurrenceKind, observedAt}) {
    const {providerEntityId, deletionEvidence} = deletion;

    return {
        providerEntityId,
        occurrenceKind,
        occurrenceCoordinate: `${providerEntityId}:deleted`,
        occurredAt          : deletionEvidence.deletedAt ?? observedAt,
        actorKind           : actorKindFromTypename(deletionEvidence.actor?.__typename),
        actorId             : deletionEvidence.actor?.login ?? null,
        absence             : 'deleted',
        deletionEvidence
    }
}
