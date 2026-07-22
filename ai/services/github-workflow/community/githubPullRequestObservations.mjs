import {actorKindFromTypename} from './githubIssueObservations.mjs';

/**
 * @summary Pull-request timeline-event whitelist. Dedicated comment/review axes own their create
 * and edit occurrences; only lifecycle, dismissal, and explicit deletion evidence enter here.
 * Unknown and popularity-shaped events produce no observation.
 * @member {Object<String,String>}
 */
export const PULL_REQUEST_TIMELINE_KIND_BY_TYPENAME = {
    ClosedEvent         : 'pull_request.closed',
    ReopenedEvent       : 'pull_request.reopened',
    MergedEvent         : 'pull_request.merged',
    ReviewDismissedEvent: 'pull_request.review-dismissed',
    CommentDeletedEvent : 'pull_request.comment-deleted'
};

/**
 * @summary Projects provider identity kind and source-relative association as separate axes.
 * @param {Object|null} actor
 * @param {String|null} [sourceAssociation=null]
 * @returns {{actorId: String|null, actorKind: String, sourceAssociation: String|null}}
 */
function projectActor(actor, sourceAssociation=null) {
    return {
        actorId  : actor?.login ?? null,
        actorKind: actorKindFromTypename(actor?.__typename),
        sourceAssociation
    }
}

/**
 * @summary Projects an edit actor only when GitHub supplied the editor node. Missing editor
 * evidence stays explicitly unattributed; the original author is never reused as the editor.
 * @param {Object|null} editor
 * @returns {Object}
 */
function projectEditor(editor) {
    return editor
        ? projectActor(editor)
        : {
            actorId          : null,
            actorKind        : 'unknown',
            sourceAssociation: null
        }
}

/**
 * @summary Adds every provider-backed user-content revision for one entity. Revision coordinates
 * use GitHub's stable `UserContentEdit.id`; timestamps are never used as revision identity.
 * @param {Object[]} observations
 * @param {Object} entity
 * @param {String} editKind
 * @param {String} revisionOf
 * @param {String|null} [parentProviderEntityId=null]
 */
function appendEditObservations(observations, entity, editKind, revisionOf, parentProviderEntityId=null) {
    if (!Array.isArray(entity.contentEdits)) {
        if (entity.lastEditedAt) {
            throw new Error(`PULL_REQUEST_OBSERVATIONS_REQUIRE_EXHAUSTIVE_EDITS:${entity.id}`)
        }
        return
    }

    const ids = new Set();

    for (const edit of entity.contentEdits) {
        if (!edit?.id || !edit.editedAt || ids.has(edit.id)) {
            throw new Error(`PULL_REQUEST_OBSERVATIONS_EDIT_ID_INVALID:${entity.id}`)
        }

        ids.add(edit.id);

        observations.push({
            providerEntityId    : entity.id,
            ...(parentProviderEntityId ? {parentProviderEntityId} : {}),
            occurrenceKind      : editKind,
            occurrenceCoordinate: edit.id,
            occurredAt          : edit.editedAt,
            revisionOf,
            ...projectEditor(edit.editor)
        })
    }
}

/**
 * @summary Adds one create plus every exhausted revision for a comment-shaped provider entity.
 * @param {Object[]} observations
 * @param {Object} comment
 * @param {String} pullRequestId
 * @param {String} createKind
 * @param {String} editKind
 */
function appendCommentObservations(observations, comment, pullRequestId, createKind, editKind) {
    if (!comment?.id) {
        throw new Error('PULL_REQUEST_OBSERVATIONS_REQUIRE_COMMENT_ID')
    }

    const createCoordinate = `${comment.id}:created`;

    observations.push({
        providerEntityId      : comment.id,
        parentProviderEntityId: pullRequestId,
        occurrenceKind        : createKind,
        occurrenceCoordinate  : createCoordinate,
        occurredAt            : comment.createdAt,
        ...projectActor(comment.author, comment.authorAssociation ?? null)
    });

    appendEditObservations(observations, comment, editKind, createCoordinate, pullRequestId)
}

/**
 * @summary Maps one fully reconciled GitHub pull request into deterministic, metadata-only
 * community observations. Root, issue-comment, review, inline-review-comment, and timeline
 * identities remain separate; revisions use stable provider revision ids and `revisionOf` links,
 * never timestamps or overwrites. Every child carries its durable PR parent.
 *
 * Review dismissal is owned by its timeline event rather than by the review node's mutable
 * current `state`, so a later dismissal cannot change the digest of the earlier submission.
 * Comment-deletion events carry the provider event as evidence while naming the provider gap:
 * GitHub exposes the deleted author but not the deleted comment id. Inline-comment/review deletion
 * history has no corresponding exhaustive tombstone collection and is reported by runner coverage.
 * @param {Object} pullRequest
 * @returns {Object[]}
 */
export function pullRequestToObservations(pullRequest) {
    if (!pullRequest || typeof pullRequest !== 'object' || !pullRequest.id) {
        throw new Error('PULL_REQUEST_OBSERVATIONS_REQUIRE_NODE_ID')
    }

    const dismissedReviewStates = new Map();

    for (const event of pullRequest.timeline ?? []) {
        if (event?.__typename !== 'ReviewDismissedEvent') {
            continue
        }

        if (!event.review?.id || !event.previousReviewState) {
            throw new Error('PULL_REQUEST_OBSERVATIONS_REVIEW_DISMISSAL_EVIDENCE_INVALID')
        }

        const priorState = event.previousReviewState ?? null;

        if (dismissedReviewStates.has(event.review.id) && dismissedReviewStates.get(event.review.id) !== priorState) {
            throw new Error('PULL_REQUEST_OBSERVATIONS_REVIEW_DISMISSAL_STATE_CONFLICT')
        }

        dismissedReviewStates.set(event.review.id, priorState)
    }

    const observations = [{
        providerEntityId    : pullRequest.id,
        occurrenceKind      : 'pull_request.opened',
        occurrenceCoordinate: `${pullRequest.id}:opened`,
        occurredAt          : pullRequest.createdAt,
        ...projectActor(pullRequest.author, pullRequest.authorAssociation ?? null)
    }];

    appendEditObservations(
        observations,
        pullRequest,
        'pull_request.edited',
        `${pullRequest.id}:opened`
    );

    for (const comment of pullRequest.comments ?? []) {
        appendCommentObservations(
            observations,
            comment,
            pullRequest.id,
            'pull_request.comment',
            'pull_request.comment-edited'
        )
    }

    for (const review of pullRequest.reviews ?? []) {
        if (!review?.id) {
            throw new Error('PULL_REQUEST_OBSERVATIONS_REQUIRE_REVIEW_ID')
        }

        observations.push({
            providerEntityId      : review.id,
            parentProviderEntityId: pullRequest.id,
            occurrenceKind        : 'pull_request.review-created',
            occurrenceCoordinate  : `${review.id}:created`,
            occurredAt            : review.createdAt,
            ...projectActor(review.author, review.authorAssociation ?? null)
        });

        if (review.submittedAt) {
            if (review.state === 'DISMISSED' && !dismissedReviewStates.has(review.id)) {
                throw new Error('PULL_REQUEST_OBSERVATIONS_DISMISSED_REVIEW_WITHOUT_EVENT')
            }

            const providerState = dismissedReviewStates.has(review.id)
                ? dismissedReviewStates.get(review.id)
                : review.state;

            if (!providerState) {
                throw new Error('PULL_REQUEST_OBSERVATIONS_REVIEW_STATE_MISSING')
            }

            observations.push({
                providerEntityId      : review.id,
                parentProviderEntityId: pullRequest.id,
                occurrenceKind        : 'pull_request.review-submitted',
                occurrenceCoordinate  : `${review.id}:submitted:${review.submittedAt}`,
                occurredAt            : review.submittedAt,
                providerState,
                ...projectActor(review.author, review.authorAssociation ?? null)
            })
        }

        appendEditObservations(
            observations,
            review,
            'pull_request.review-edited',
            `${review.id}:created`,
            pullRequest.id
        )
    }

    for (const comment of pullRequest.reviewComments ?? []) {
        appendCommentObservations(
            observations,
            comment,
            pullRequest.id,
            'pull_request.review-comment',
            'pull_request.review-comment-edited'
        )
    }

    for (const event of pullRequest.timeline ?? []) {
        const occurrenceKind = PULL_REQUEST_TIMELINE_KIND_BY_TYPENAME[event?.__typename];

        if (!occurrenceKind) {
            continue
        }
        if (!event.id) {
            throw new Error('PULL_REQUEST_OBSERVATIONS_REQUIRE_EVENT_ID')
        }

        const providerEntityId = event.__typename === 'ReviewDismissedEvent'
            ? event.review?.id
            : pullRequest.id;

        if (!providerEntityId) {
            throw new Error('PULL_REQUEST_OBSERVATIONS_EVENT_ENTITY_MISSING')
        }

        const observation = {
            providerEntityId,
            ...(event.__typename === 'ReviewDismissedEvent'
                ? {parentProviderEntityId: pullRequest.id}
                : {}),
            occurrenceKind,
            occurrenceCoordinate: event.id,
            occurredAt          : event.createdAt,
            ...projectActor(event.actor)
        };

        if (event.__typename === 'ReviewDismissedEvent') {
            observation.providerState = 'DISMISSED'
        } else if (event.__typename === 'CommentDeletedEvent') {
            observation.deletionEvidence = {
                eventId               : event.id,
                deletedCommentAuthorId: event.deletedCommentAuthor?.login ?? null
            }
        }

        observations.push(observation)
    }

    // PR updatedAt also advances for provider facts outside the declared matrix (e.g. commits).
    // Preserve the unexplained revision honestly without inventing an actor or event type.
    if (pullRequest.updatedAt) {
        const newestExplained = observations.reduce(
            (max, observation) => observation.occurredAt > max ? observation.occurredAt : max,
            pullRequest.createdAt
        );

        if (pullRequest.updatedAt > newestExplained) {
            observations.push({
                providerEntityId    : pullRequest.id,
                occurrenceKind      : 'pull_request.observed-snapshot-change',
                occurrenceCoordinate: `${pullRequest.id}:snapshot:${pullRequest.updatedAt}`,
                occurredAt          : pullRequest.updatedAt,
                actorId             : null,
                actorKind           : 'unknown',
                sourceAssociation   : null
            })
        }
    }

    return observations
}
