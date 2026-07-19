/**
 * @summary The provider actor-kind axis, mapped from a GitHub GraphQL actor's `__typename`.
 *
 * This is the provider-reported identity kind only — the security/content trust tier is a
 * separate axis resolved elsewhere and never folded in here. An absent actor (a deleted
 * account, a ghost author on an old issue) and any unrecognized `__typename` both fail
 * closed to `'unknown'`; the kind is read from the provider, never guessed from a login.
 * @param {String|null} [typename] The GraphQL `__typename` of the actor node.
 * @returns {String} One of user | bot | organization | mannequin | enterprise-user | unknown.
 */
export function actorKindFromTypename(typename) {
    switch (typename) {
        case 'User':                  return 'user';
        case 'Bot':                   return 'bot';
        case 'Organization':          return 'organization';
        case 'Mannequin':             return 'mannequin';
        case 'EnterpriseUserAccount': return 'enterprise-user';
        default:                      return 'unknown'
    }
}

/**
 * @summary The GitHub issue-timeline event `__typename` → occurrence-kind whitelist.
 *
 * A whitelist, not a blocklist: an event kind absent from this map produces no observation,
 * so popularity signals and any future event type are refused by construction rather than by
 * an easily-stale deny-list. Every kind here is a lifecycle or metadata fact — never prose.
 *
 * Comments are deliberately NOT here: they are exhausted on their own connection axis and mapped
 * from the issue's `comments`, so a stray `IssueComment` reaching the timeline path is ignored
 * rather than emitted a second time under a different coordinate for the same node.
 * @member {Object<String,String>}
 */
export const TIMELINE_KIND_BY_TYPENAME = {
    ClosedEvent            : 'issue.closed',
    ReopenedEvent          : 'issue.reopened',
    RenamedTitleEvent      : 'issue.renamed',
    LabeledEvent           : 'issue.labeled',
    UnlabeledEvent         : 'issue.unlabeled',
    AssignedEvent          : 'issue.assigned',
    UnassignedEvent        : 'issue.unassigned',
    MilestonedEvent        : 'issue.milestoned',
    DemilestonedEvent      : 'issue.demilestoned',
    ReferencedEvent        : 'issue.referenced',
    CrossReferencedEvent   : 'issue.cross-referenced',
    SubIssueAddedEvent     : 'issue.sub-issue-added',
    SubIssueRemovedEvent   : 'issue.sub-issue-removed',
    ParentIssueAddedEvent  : 'issue.parent-added',
    ParentIssueRemovedEvent: 'issue.parent-removed',
    BlockedByAddedEvent    : 'issue.blocked-by-added',
    BlockingAddedEvent     : 'issue.blocking-added',
    BlockedByRemovedEvent  : 'issue.blocked-by-removed',
    BlockingRemovedEvent   : 'issue.blocking-removed'
};

/**
 * @summary Projects an actor node onto the `{actorId, actorKind, sourceAssociation}` triple the
 * observation carries — the provider actor kind and the source-relative trust signal as SEPARATE
 * fields (AC6). `sourceAssociation` is the provider's raw association-with-this-source
 * (`OWNER`/`MEMBER`/`COLLABORATOR`/`CONTRIBUTOR`/`FIRST_TIME_CONTRIBUTOR`/`NONE`); the trust TIER
 * is derived from it downstream, relative to the admitting source, never inside the producer.
 *
 * Actor kind and association are orthogonal: `bot` can be `NONE`, a `user` can be `OWNER`. Both an
 * absent actor and an absent/unavailable association stay explicit — `unknown` and `null` — rather
 * than being guessed. Lifecycle events carry no content authorship, so their association is null.
 * @param {Object|null} [actor]             `{login, __typename}` — may be null for a deleted/ghost author.
 * @param {String|null} [sourceAssociation] The provider association-with-source, or null when absent.
 * @returns {{actorId: String|null, actorKind: String, sourceAssociation: String|null}}
 */
function projectActor(actor, sourceAssociation = null) {
    return {
        actorId  : actor?.login ?? null,
        actorKind: actorKindFromTypename(actor?.__typename),
        sourceAssociation
    }
}

/**
 * @summary The actor projection for an edit revision. `lastEditedAt` proves an edit happened but
 * NOT who made it — the connection carries no editor identity, and the original author is not
 * evidence of the editor — so the editor is left explicitly unattributed with a loss marker rather
 * than fabricated. Same discipline as a deleted author or an unexplained snapshot change: an
 * unprovable actor is `null` / `unknown`, never guessed.
 * @returns {{actorId: null, actorKind: String, sourceAssociation: null, lossMarker: String}}
 */
function unattributedEdit() {
    return {actorId: null, actorKind: 'unknown', sourceAssociation: null, lossMarker: 'editor-unattributed'}
}

/**
 * @summary Maps one reconciled GitHub issue node into an order-independent set of metadata-only
 * observations for a `community-activity-batch.v1` batch — one per lifecycle fact, never prose.
 *
 * The emitted observation is intentionally free of title/body/label text: it carries the
 * provider entity id, the occurrence kind, a stable revision-distinct coordinate, the moment,
 * and the provider-reported actor identity/kind. Attention eligibility is NOT decided here —
 * the connector reports `occurrenceKind` + `actorKind`, and the server-side classifier alone
 * decides, so this normalizer stays one of several interchangeable producers of the same shape.
 *
 * Identity is stable across runs: the root, each comment, and each timeline event key off the
 * provider's own node id, so re-reconciling the same issue reproduces byte-identical coordinates.
 * A revision (edit, re-close, re-open) is a distinct coordinate on the same entity, never a
 * silent overwrite of the create.
 * @param {Object}        issue                  A reconciled issue node.
 * @param {String}        issue.id               The provider node id (stable identity).
 * @param {String}        issue.createdAt        ISO-8601 open moment.
 * @param {String}        [issue.updatedAt]      ISO-8601 last-touched moment; an unexplained advance emits a snapshot-change marker.
 * @param {String}        [issue.lastEditedAt]   ISO-8601 last-edit moment, when the body was edited.
 * @param {Object|null}   [issue.author]         `{login, __typename}`; null for a deleted account.
 * @param {String}        [issue.authorAssociation] Provider association-with-source of the author.
 * @param {Object[]}      [issue.comments]       `[{id, createdAt, lastEditedAt, author, authorAssociation}]`.
 * @param {Object[]}      [issue.timeline]       `[{id, __typename, createdAt, actor}]` normalized events.
 * @returns {Object[]} Observations, each `{providerEntityId, occurrenceKind, occurrenceCoordinate, occurredAt, actorId, actorKind, sourceAssociation}`.
 */
export function issueToObservations(issue) {
    if (!issue || typeof issue !== 'object' || !issue.id) {
        throw new Error('ISSUE_OBSERVATIONS_REQUIRE_NODE_ID')
    }

    const observations = [];

    // The issue root open — the anchor occurrence.
    observations.push({
        providerEntityId    : issue.id,
        occurrenceKind      : 'issue.opened',
        occurrenceCoordinate: `${issue.id}:opened`,
        occurredAt          : issue.createdAt,
        ...projectActor(issue.author, issue.authorAssociation ?? null)
    });

    // A body edit is a distinct revision on the same entity, coordinate-separated from the open.
    if (issue.lastEditedAt) {
        observations.push({
            providerEntityId    : issue.id,
            occurrenceKind      : 'issue.edited',
            occurrenceCoordinate: `${issue.id}:edited:${issue.lastEditedAt}`,
            occurredAt          : issue.lastEditedAt,
            ...unattributedEdit()
        })
    }

    for (const comment of issue.comments ?? []) {
        if (!comment?.id) {
            throw new Error('ISSUE_OBSERVATIONS_REQUIRE_COMMENT_ID')
        }

        observations.push({
            providerEntityId    : comment.id,
            occurrenceKind      : 'issue.comment',
            occurrenceCoordinate: `${comment.id}:created`,
            occurredAt          : comment.createdAt,
            ...projectActor(comment.author, comment.authorAssociation ?? null)
        });

        if (comment.lastEditedAt) {
            observations.push({
                providerEntityId    : comment.id,
                occurrenceKind      : 'issue.comment-edited',
                occurrenceCoordinate: `${comment.id}:edited:${comment.lastEditedAt}`,
                occurredAt          : comment.lastEditedAt,
                ...unattributedEdit()
            })
        }
    }

    for (const event of issue.timeline ?? []) {
        const occurrenceKind = TIMELINE_KIND_BY_TYPENAME[event?.__typename];

        // Whitelist gate: an unmapped event kind (incl. any popularity signal) yields nothing.
        if (!occurrenceKind) {
            continue
        }

        if (!event.id) {
            throw new Error('ISSUE_OBSERVATIONS_REQUIRE_EVENT_ID')
        }

        observations.push({
            providerEntityId    : event.id,
            occurrenceKind,
            occurrenceCoordinate: `${event.id}:${occurrenceKind}`,
            occurredAt          : event.createdAt,
            ...projectActor(event.actor)
        })
    }

    // An `updatedAt` strictly newer than every granular occurrence we could see is a change we
    // cannot attribute — a comment/edit behind an access gap, or a provider event we do not fetch.
    // Record it honestly as a snapshot-only change with a null actor and a loss marker, never a
    // fabricated event with a guessed actor.
    if (issue.updatedAt) {
        const newestExplained = observations.reduce((max, o) => o.occurredAt > max ? o.occurredAt : max, issue.createdAt);

        if (issue.updatedAt > newestExplained) {
            observations.push({
                providerEntityId    : issue.id,
                occurrenceKind      : 'issue.observed-snapshot-change',
                occurrenceCoordinate: `${issue.id}:snapshot:${issue.updatedAt}`,
                occurredAt          : issue.updatedAt,
                actorId             : null,
                actorKind           : 'unknown',
                sourceAssociation   : null,
                lossMarker          : 'snapshot-without-granular-event'
            })
        }
    }

    return observations
}
