import {GENESIS_BASIS}             from './githubIssueReconciliation.mjs';
import {pullRequestToObservations} from './githubPullRequestObservations.mjs';

/**
 * @summary Provider-history gaps GitHub cannot currently prove exhaustively. These stay explicit
 * on every production run rather than being mistaken for deletion-free history.
 * @member {Object[]}
 */
export const UNSUPPORTED_PULL_REQUEST_HISTORY_GAPS = Object.freeze([
    Object.freeze({
        axis  : 'comment-deletion-correlation',
        reason: 'github-comment-deleted-event-omits-deleted-comment-id'
    }),
    Object.freeze({
        axis  : 'review-deletions',
        reason: 'github-does-not-expose-exhaustive-review-deletion-tombstones'
    }),
    Object.freeze({
        axis  : 'inline-review-comment-deletions',
        reason: 'github-does-not-expose-exhaustive-inline-review-comment-deletion-tombstones'
    })
]);

/**
 * @summary Normalizes a thrown value without losing non-Error seam failures.
 * @param {*} error
 * @returns {String}
 */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error)
}

/**
 * @summary Drives one PR timeline connection to exhaustion while pinning every continuation page
 * to both the root revision and GitHub's connection-owned mutation token. `filteredCount` proves
 * the selected event-family total; missing connection evidence is never interpreted as empty.
 * @param {Object} options
 * @returns {Promise<{items: Object[], truncated: Boolean}>}
 */
async function exhaustTimeline({pullRequest, fetchTimelinePage, maxPages}) {
    const items = [],
          ids   = new Set();

    const validateConnection = connection => {
        if (!connection || !Array.isArray(connection.nodes) || !connection.pageInfo ||
            !Number.isFinite(connection.filteredCount) || typeof connection.updatedAt !== 'string') {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_PAGE_INVALID')
        }
    };

    const append = nodes => {
        if (!Array.isArray(nodes)) {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_PAGE_INVALID')
        }

        for (const node of nodes) {
            if (!node?.id) {
                throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_EVENT_MISSING_ID')
            }
            if (ids.has(node.id)) {
                throw new Error(`PULL_REQUEST_RECONCILIATION_DUPLICATE_TIMELINE_ID:${node.id}`)
            }

            ids.add(node.id);
            items.push(node)
        }
    };

    validateConnection(pullRequest.timeline);
    append(pullRequest.timeline.nodes);

    const expectedTotal      = pullRequest.timeline.filteredCount,
          connectionRevision = pullRequest.timeline.updatedAt;

    let pageInfo = pullRequest.timeline.pageInfo,
        pages    = 1;

    while (pageInfo?.hasNextPage) {
        if (pages >= maxPages) {
            return {items, truncated: true}
        }
        if (!pageInfo.endCursor) {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_CURSOR_MISSING')
        }

        const previous = pageInfo.endCursor,
              page     = await fetchTimelinePage({pullRequestId: pullRequest.id, cursor: previous});

        if (page.rootUpdatedAt !== pullRequest.updatedAt) {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_MUTATED')
        }

        const connection = {
            nodes        : page.events,
            pageInfo     : page.pageInfo,
            filteredCount: page.filteredCount,
            updatedAt    : page.connectionUpdatedAt
        };

        validateConnection(connection);

        if (connection.updatedAt !== connectionRevision || connection.filteredCount !== expectedTotal) {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_MUTATED')
        }

        append(connection.nodes);
        pageInfo = connection.pageInfo;
        pages++;

        if (pageInfo?.hasNextPage && (!pageInfo.endCursor || pageInfo.endCursor === previous)) {
            throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_CURSOR_STALLED')
        }
    }

    if (items.length !== expectedTotal) {
        throw new Error('PULL_REQUEST_RECONCILIATION_TIMELINE_COUNT_MISMATCH')
    }

    return {items, truncated: false}
}

/**
 * @summary Exhausts one `userContentEdits` connection by stable node id. GitHub may include the
 * creation revision in this connection; `includesCreatedEdit` makes that provider fact explicit so
 * it can be removed without collapsing any actual edit occurrence.
 * @param {Object} options
 * @returns {Promise<{entity: Object, truncated: Boolean}>}
 */
async function exhaustContentEdits({entity, fetchContentEditsPage, maxPages}) {
    const entityNodeId = entity?.nodeId ?? entity?.id;

    if (!entityNodeId || !entity?.id) {
        throw new Error('PULL_REQUEST_RECONCILIATION_EDIT_ENTITY_MISSING_ID')
    }

    const edits = [],
          ids   = new Set();

    const validatePage = page => {
        if (!page || page.id !== entityNodeId || page.createdAt !== entity.createdAt ||
            page.updatedAt !== entity.updatedAt || typeof page.includesCreatedEdit !== 'boolean' ||
            !page.userContentEdits || !Array.isArray(page.userContentEdits.nodes) ||
            !page.userContentEdits.pageInfo || !Number.isFinite(page.userContentEdits.totalCount)) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_PAGE_INVALID:${entity.id}`)
        }
    };

    const append = nodes => {
        for (const edit of nodes) {
            if (!edit?.id || !edit.editedAt) {
                throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_MISSING_ID:${entity.id}`)
            }
            if (ids.has(edit.id)) {
                throw new Error(`PULL_REQUEST_RECONCILIATION_DUPLICATE_EDIT_ID:${edit.id}`)
            }

            ids.add(edit.id);
            edits.push(edit)
        }
    };

    let page = {
            id                 : entityNodeId,
            createdAt          : entity.createdAt,
            updatedAt          : entity.updatedAt,
            includesCreatedEdit: entity.includesCreatedEdit,
            userContentEdits   : entity.userContentEdits
        };

    validatePage(page);

    const expectedTotal       = page.userContentEdits.totalCount,
          includesCreatedEdit = page.includesCreatedEdit;

    append(page.userContentEdits.nodes);

    let pageInfo = page.userContentEdits.pageInfo,
        pages    = 1;

    while (pageInfo.hasNextPage) {
        if (pages >= maxPages) {
            return {entity: {...entity, contentEdits: []}, truncated: true}
        }
        if (!pageInfo.endCursor) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_CURSOR_MISSING:${entity.id}`)
        }

        const previous = pageInfo.endCursor;
        page = await fetchContentEditsPage({entityNodeId, cursor: previous});
        validatePage(page);

        if (page.includesCreatedEdit !== includesCreatedEdit ||
            page.userContentEdits.totalCount !== expectedTotal) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_CONNECTION_MUTATED:${entity.id}`)
        }

        append(page.userContentEdits.nodes);
        pageInfo = page.userContentEdits.pageInfo;
        pages++;

        if (pageInfo.hasNextPage && (!pageInfo.endCursor || pageInfo.endCursor === previous)) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_CURSOR_STALLED:${entity.id}`)
        }
    }

    if (edits.length !== expectedTotal) {
        throw new Error(`PULL_REQUEST_RECONCILIATION_EDIT_COUNT_MISMATCH:${entity.id}`)
    }

    let contentEdits = edits;

    if (includesCreatedEdit) {
        const creationEdits = edits.filter(edit => edit.editedAt === entity.createdAt);

        if (creationEdits.length !== 1) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_CREATED_EDIT_AMBIGUOUS:${entity.id}`)
        }

        contentEdits = edits.filter(edit => edit !== creationEdits[0])
    }

    if (Object.hasOwn(entity, 'lastEditedAt')) {
        const latestEdit = contentEdits.reduce(
            (latest, edit) => !latest || edit.editedAt > latest ? edit.editedAt : latest,
            null
        );

        if ((entity.lastEditedAt ?? null) !== latestEdit) {
            throw new Error(`PULL_REQUEST_RECONCILIATION_LAST_EDIT_MISMATCH:${entity.id}`)
        }
    }

    return {entity: {...entity, contentEdits}, truncated: false}
}

/**
 * @summary Exhausts revision connections for the root and all three response-bearing child
 * families. Processing stays deterministic in provider order; any entity cap makes the whole PR
 * inadmissible so a partial revision history cannot masquerade as a complete snapshot.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function exhaustContentEditFamilies({
    pullRequest, comments, reviews, reviewComments, fetchContentEditsPage, maxPages
}) {
    const groups = [
              ['pullRequest', [pullRequest]],
              ['comments', comments],
              ['reviews', reviews],
              ['reviewComments', reviewComments]
          ],
          result = {},
          truncatedEntityIds = [];

    for (const [name, entities] of groups) {
        result[name] = [];

        for (const entity of entities) {
            const exhausted = await exhaustContentEdits({
                entity, fetchContentEditsPage, maxPages
            });

            result[name].push(exhausted.entity);
            if (exhausted.truncated) truncatedEntityIds.push(entity.id)
        }
    }

    result.pullRequest = result.pullRequest[0];
    result.truncatedEntityIds = truncatedEntityIds;

    return result
}

/**
 * @summary Adds at most one gap per candidate/axis and makes the candidate inadmissible. The
 * provider root remains in currentInventory even when one child family cannot be proven.
 * @param {Object} candidate
 * @param {Object[]} gaps
 * @param {String} axis
 * @param {*} reason
 * @param {Object} [details]
 * @returns {void}
 */
function markCandidateGap(candidate, gaps, axis, reason, details={}) {
    candidate.failedAxes ??= new Set();

    if (!candidate.failedAxes.has(axis)) {
        gaps.push({
            axis,
            pullRequestId: candidate.pullRequest.id,
            ...details,
            reason: errorMessage(reason)
        });
        candidate.failedAxes.add(axis)
    }

    candidate.invalid = true
}

/**
 * @summary Returns the four response-bearing content groups in deterministic provider order.
 * @param {Object} source
 * @returns {Array} Ordered `[groupName, entities]` pairs.
 */
function contentEntityGroups(source) {
    return [
        ['pullRequest', [source.pullRequest]],
        ['comments', source.comments],
        ['reviews', source.reviews],
        ['reviewComments', source.reviewComments]
    ]
}

/**
 * @summary Hydrates edit-connection heads for every candidate in one repository-wide seam call.
 * The seam may split provider traffic into bounded batches, but it returns one ordered settled
 * outcome per input so a missing node invalidates only its owning PR.
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function hydrateContentEntityHeads({candidates, fetchContentEditHeads, gaps}) {
    const references = [];

    for (const candidate of candidates) {
        candidate.hydrated = {
            pullRequest   : [],
            comments      : new Array(candidate.comments.length),
            reviews       : new Array(candidate.reviews.length),
            reviewComments: new Array(candidate.reviewComments.length)
        };

        for (const [group, entities] of contentEntityGroups(candidate)) {
            if (group === 'pullRequest') {
                candidate.hydrated.pullRequest = new Array(entities.length)
            }

            entities.forEach((entity, index) => references.push({candidate, entity, group, index}))
        }
    }

    let outcomes;

    try {
        outcomes = await fetchContentEditHeads({entities: references.map(reference => reference.entity)})
    } catch (error) {
        candidates.forEach(candidate => markCandidateGap(candidate, gaps, 'content-edits', error));
        return
    }

    if (!Array.isArray(outcomes) || outcomes.length !== references.length) {
        candidates.forEach(candidate => markCandidateGap(
            candidate,
            gaps,
            'content-edits',
            'PULL_REQUEST_RECONCILIATION_CONTENT_EDIT_HEADS_INVALID'
        ));
        return
    }

    outcomes.forEach((outcome, index) => {
        const {candidate, entity, group, index: groupIndex} = references[index],
              expectedNodeId                                = entity.nodeId ?? entity.id,
              hydrated                                      = outcome?.value,
              actualNodeId                                  = hydrated?.nodeId ?? hydrated?.id;

        if (outcome?.status !== 'fulfilled' || !hydrated || actualNodeId !== expectedNodeId ||
            hydrated.id !== entity.id || hydrated.createdAt !== entity.createdAt ||
            hydrated.updatedAt !== entity.updatedAt) {
            markCandidateGap(
                candidate,
                gaps,
                'content-edits',
                outcome?.status === 'rejected'
                    ? outcome.reason
                    : `PULL_REQUEST_RECONCILIATION_CONTENT_MUTATED:${entity.id}`
            );
            return
        }

        candidate.hydrated[group][groupIndex] = hydrated
    });

    for (const candidate of candidates) {
        candidate.hydrated.pullRequest = candidate.hydrated.pullRequest[0]
    }
}

/**
 * @summary Verifies every reconciled content entity in one repository-wide seam call. Ordered
 * settled outcomes keep one changed or unavailable node scoped to its owning PR.
 * @param {Object} options
 * @returns {Promise<void>}
 */
async function verifyCandidateContentEntities({candidates, verifyContentEntities, gaps}) {
    const references = [];

    for (const candidate of candidates) {
        for (const [, entities] of contentEntityGroups(candidate.reconciled)) {
            entities.forEach(entity => references.push({candidate, entity}))
        }
    }

    const expected = references.map(({entity}) => ({
        id       : entity.nodeId ?? entity.id,
        updatedAt: entity.updatedAt
    }));

    let outcomes;

    try {
        outcomes = await verifyContentEntities({entities: expected})
    } catch (error) {
        candidates.forEach(candidate => markCandidateGap(candidate, gaps, 'pull-request-snapshot', error));
        return
    }

    if (!Array.isArray(outcomes) || outcomes.length !== expected.length) {
        candidates.forEach(candidate => markCandidateGap(
            candidate,
            gaps,
            'pull-request-snapshot',
            'PULL_REQUEST_RECONCILIATION_CONTENT_VERIFICATION_INVALID'
        ));
        return
    }

    outcomes.forEach((outcome, index) => {
        const {candidate} = references[index],
              revision    = expected[index],
              verified    = outcome?.value;

        if (outcome?.status !== 'fulfilled' || verified?.id !== revision.id ||
            verified?.updatedAt !== revision.updatedAt) {
            markCandidateGap(
                candidate,
                gaps,
                'pull-request-snapshot',
                outcome?.status === 'rejected'
                    ? outcome.reason
                    : `PULL_REQUEST_RECONCILIATION_CONTENT_MUTATED:${revision.id}`
            )
        }
    })
}

/**
 * @summary Enumerates the evidence-bearing root pass with stable ids, progress checks, and a
 * provider total. A caller cap creates a named gap rather than a false exhaustion claim.
 * @param {Function} fetchPullRequestsPage
 * @param {Number} maxPages
 * @param {Object[]} gaps
 * @returns {Promise<Object>}
 */
async function enumerateRoots(fetchPullRequestsPage, maxPages, gaps) {
    const pullRequests = [],
          ids          = new Set();

    let cursor        = null,
        expectedTotal = null,
        pageCount     = 0,
        truncated     = false;

    for (;;) {
        if (pageCount >= maxPages) {
            truncated = true;
            gaps.push({axis: 'pull-requests', afterCursor: cursor, reason: 'page-cap'});
            break
        }

        const page = await fetchPullRequestsPage({cursor});

        if (!Array.isArray(page.pullRequests) || !page.pageInfo || !Number.isFinite(page.totalCount)) {
            throw new Error('PULL_REQUEST_RECONCILIATION_ROOT_PAGE_INVALID')
        }

        pageCount++;

        if (expectedTotal === null) {
            expectedTotal = page.totalCount
        } else if (expectedTotal !== page.totalCount) {
            gaps.push({axis: 'pull-request-census', reason: 'total-count-mutated'});
            expectedTotal = page.totalCount
        }

        for (const pullRequest of page.pullRequests) {
            if (!pullRequest?.id) {
                throw new Error('PULL_REQUEST_RECONCILIATION_ROOT_MISSING_ID')
            }
            if (ids.has(pullRequest.id)) {
                throw new Error(`PULL_REQUEST_RECONCILIATION_DUPLICATE_ROOT_ID:${pullRequest.id}`)
            }

            ids.add(pullRequest.id);
            pullRequests.push(pullRequest)
        }

        const previous = cursor;
        cursor = page.pageInfo.endCursor ?? cursor;

        if (!page.pageInfo.hasNextPage) {
            break
        }
        if (!cursor || cursor === previous) {
            throw new Error('PULL_REQUEST_RECONCILIATION_ROOT_CURSOR_STALLED')
        }
    }

    if (!truncated && expectedTotal !== pullRequests.length) {
        gaps.push({
            axis    : 'pull-request-census',
            reason  : 'root-count-mismatch',
            expected: expectedTotal,
            fetched : pullRequests.length
        })
    }

    return {pullRequests, cursor, truncated}
}

/**
 * @summary Runs the cheap root-only verification pass and returns root plus timeline-connection
 * revision tokens in provider order. Timeline membership can mutate without changing root.updatedAt,
 * so both axes participate in the final snapshot decision.
 * @param {Function} fetchCensusPage
 * @returns {Promise<Object[]>}
 */
async function enumerateVerificationCensus(fetchCensusPage) {
    const revisions = [],
          ids       = new Set();

    let cursor        = null,
        expectedTotal = null;

    for (;;) {
        const page = await fetchCensusPage({cursor});

        if (!Array.isArray(page.pullRequests) || !page.pageInfo || !Number.isFinite(page.totalCount)) {
            throw new Error('PULL_REQUEST_RECONCILIATION_VERIFICATION_PAGE_INVALID')
        }

        expectedTotal ??= page.totalCount;

        if (page.totalCount !== expectedTotal) {
            throw new Error('PULL_REQUEST_RECONCILIATION_VERIFICATION_TOTAL_MUTATED')
        }

        for (const pullRequest of page.pullRequests) {
            if (!pullRequest?.id || typeof pullRequest.updatedAt !== 'string' ||
                !pullRequest.timeline || !Number.isFinite(pullRequest.timeline.filteredCount) ||
                typeof pullRequest.timeline.updatedAt !== 'string' || ids.has(pullRequest.id)) {
                throw new Error('PULL_REQUEST_RECONCILIATION_VERIFICATION_ID_INVALID')
            }

            ids.add(pullRequest.id);
            revisions.push({
                id       : pullRequest.id,
                updatedAt: pullRequest.updatedAt,
                timeline : {
                    filteredCount: pullRequest.timeline.filteredCount,
                    updatedAt    : pullRequest.timeline.updatedAt
                }
            })
        }

        const previous = cursor;
        cursor = page.pageInfo.endCursor ?? cursor;

        if (!page.pageInfo.hasNextPage) {
            break
        }
        if (!cursor || cursor === previous) {
            throw new Error('PULL_REQUEST_RECONCILIATION_VERIFICATION_CURSOR_STALLED')
        }
    }

    if (revisions.length !== expectedTotal) {
        throw new Error('PULL_REQUEST_RECONCILIATION_VERIFICATION_COUNT_MISMATCH')
    }

    return revisions
}

/**
 * @summary Exhaustively reconciles PR roots plus four independent child axes: issue comments,
 * reviews, inline review comments, their independent revision connections, and provider timeline
 * events. GraphQL comment/review exhaustion and REST two-pass verification are injected from the
 * existing PullRequestHistoryService gold standard; the runner adds all-state root re-enumeration,
 * revision-token verification, root-census verification, metadata-only normalization, and honest
 * unsupported-history gaps.
 * @param {Object} seams
 * @param {Function} seams.fetchPullRequestsPage
 * @param {Function} seams.exhaustConversation
 * @param {Function} seams.fetchTimelinePage
 * @param {Function} seams.fetchReviewCommentSnapshot
 * @param {Function} seams.fetchContentEditHeads
 * @param {Function} seams.fetchContentEditsPage
 * @param {Function} seams.verifyContentEntities
 * @param {Function} seams.fetchCensusPage
 * @param {Object} [options]
 * @param {Number} [options.maxRootPages=Infinity]
 * @param {Number} [options.maxTimelinePagesPerPullRequest=Infinity]
 * @param {Number} [options.maxEditPagesPerEntity=Infinity]
 * @returns {Promise<{observations: Object[], coverage: Object, nextProviderState: Object, currentInventory: String[]}>}
 */
export async function reconcilePullRequestActivity(seams, options={}) {
    const {
        fetchPullRequestsPage, exhaustConversation, fetchTimelinePage,
        fetchReviewCommentSnapshot, fetchContentEditHeads, fetchContentEditsPage,
        verifyContentEntities, fetchCensusPage
    } = seams || {};

    if ([
        fetchPullRequestsPage, exhaustConversation, fetchTimelinePage,
        fetchReviewCommentSnapshot, fetchContentEditHeads, fetchContentEditsPage,
        verifyContentEntities, fetchCensusPage
    ].some(fn => typeof fn !== 'function')) {
        throw new Error('PULL_REQUEST_RECONCILIATION_REQUIRES_FETCH_SEAMS')
    }

    const {
        maxRootPages                   = Infinity,
        maxTimelinePagesPerPullRequest = Infinity,
        maxEditPagesPerEntity          = Infinity
    } = options;

    // Provider-capability gaps are adapter-owned. Callers may cap work honestly, but cannot erase a
    // permanent unsupported family and manufacture `coverage.complete:true`.
    const gaps = UNSUPPORTED_PULL_REQUEST_HISTORY_GAPS.map(gap => ({...gap}));

    const rootResult   = await enumerateRoots(fetchPullRequestsPage, maxRootPages, gaps),
          candidates   = [],
          observations = [];

    let reviewCommentSnapshot,
        reviewCommentSnapshotError;

    try {
        reviewCommentSnapshot = await fetchReviewCommentSnapshot();

        if (!(reviewCommentSnapshot?.reviewCommentsByPullRequestNumber instanceof Map) ||
            !(reviewCommentSnapshot?.failuresByPullRequestNumber instanceof Map)) {
            throw new Error('PULL_REQUEST_RECONCILIATION_REVIEW_COMMENT_SNAPSHOT_INVALID')
        }
    } catch (error) {
        reviewCommentSnapshotError = error;
        gaps.push({axis: 'inline-review-comments', reason: errorMessage(error)})
    }

    for (const pullRequest of rootResult.pullRequests) {
        if (reviewCommentSnapshotError) {
            continue
        }

        const reviewCommentFailure = reviewCommentSnapshot.failuresByPullRequestNumber.get(pullRequest.number);

        if (reviewCommentFailure) {
            gaps.push({
                axis         : 'inline-review-comments',
                pullRequestId: pullRequest.id,
                reason       : errorMessage(reviewCommentFailure)
            });
            continue
        }

        const reviewComments = reviewCommentSnapshot.reviewCommentsByPullRequestNumber
            .get(pullRequest.number) ?? [];

        if (!Array.isArray(reviewComments)) {
            gaps.push({
                axis         : 'inline-review-comments',
                pullRequestId: pullRequest.id,
                reason       : 'PULL_REQUEST_RECONCILIATION_REVIEW_COMMENT_GROUP_INVALID'
            });
            continue
        }

        const [conversationResult, timelineResult] = await Promise.allSettled([
            exhaustConversation({pullRequest}),
            exhaustTimeline({
                pullRequest,
                fetchTimelinePage,
                maxPages: maxTimelinePagesPerPullRequest
            })
        ]);

        const failedAxes = [
            ['comments-reviews', conversationResult],
            ['timeline', timelineResult]
        ].filter(([, result]) => result.status === 'rejected');

        if (failedAxes.length) {
            failedAxes.forEach(([axis, result]) => gaps.push({
                axis,
                pullRequestId: pullRequest.id,
                reason       : errorMessage(result.reason)
            }));
            continue
        }

        if (timelineResult.value.truncated) {
            gaps.push({axis: 'timeline', pullRequestId: pullRequest.id, reason: 'page-cap'});
            // A partial timeline can omit a dismissal that supplies a review's immutable original
            // disposition. Admit no facts from that mixed PR snapshot; the live root still remains
            // in currentInventory so incompleteness cannot masquerade as deletion.
            continue
        }

        if (!Array.isArray(conversationResult.value?.comments) ||
            !Array.isArray(conversationResult.value?.reviews)) {
            gaps.push({
                axis         : 'comments-reviews',
                pullRequestId: pullRequest.id,
                reason       : 'PULL_REQUEST_RECONCILIATION_CONVERSATION_INVALID'
            });
            continue
        }

        candidates.push({
            pullRequest,
            comments: conversationResult.value.comments,
            reviews : conversationResult.value.reviews,
            reviewComments,
            timeline: timelineResult.value.items,
            invalid : false
        })
    }

    if (candidates.length) {
        await hydrateContentEntityHeads({candidates, fetchContentEditHeads, gaps})
    }

    for (const candidate of candidates) {
        if (candidate.invalid) {
            continue
        }

        try {
            candidate.reconciled = await exhaustContentEditFamilies({
                ...candidate.hydrated,
                fetchContentEditsPage,
                maxPages: maxEditPagesPerEntity
            })
        } catch (error) {
            markCandidateGap(candidate, gaps, 'content-edits', error);
            continue
        }

        if (candidate.reconciled.truncatedEntityIds.length) {
            const providerEntityId = candidate.reconciled.truncatedEntityIds[0];

            markCandidateGap(candidate, gaps, 'content-edits', 'page-cap', {providerEntityId})
        }
    }

    const verificationCandidates = candidates.filter(candidate => !candidate.invalid && candidate.reconciled);

    if (verificationCandidates.length) {
        await verifyCandidateContentEntities({
            candidates: verificationCandidates,
            verifyContentEntities,
            gaps
        })
    }

    if (!rootResult.truncated) {
        try {
            const verified    = await enumerateVerificationCensus(fetchCensusPage),
                  initialIds  = rootResult.pullRequests.map(pullRequest => pullRequest.id),
                  verifiedIds = verified.map(pullRequest => pullRequest.id);

            if (JSON.stringify(initialIds) !== JSON.stringify(verifiedIds)) {
                gaps.push({axis: 'pull-request-census-verification', reason: 'root-membership-mutated'});
                candidates.forEach(candidate => { candidate.invalid = true })
            } else {
                const candidatesById = new Map(candidates.map(candidate => [candidate.pullRequest.id, candidate]));

                rootResult.pullRequests.forEach((pullRequest, index) => {
                    const candidate = candidatesById.get(pullRequest.id),
                          revision  = verified[index];

                    if (!candidate || candidate.invalid) {
                        return
                    }

                    if (revision.updatedAt !== pullRequest.updatedAt) {
                        markCandidateGap(
                            candidate,
                            gaps,
                            'pull-request-census-verification',
                            `PULL_REQUEST_RECONCILIATION_ROOT_MUTATED:${pullRequest.id}`
                        )
                    } else if (revision.timeline.filteredCount !== pullRequest.timeline.filteredCount ||
                        revision.timeline.updatedAt !== pullRequest.timeline.updatedAt) {
                        markCandidateGap(
                            candidate,
                            gaps,
                            'pull-request-census-verification',
                            `PULL_REQUEST_RECONCILIATION_TIMELINE_MUTATED:${pullRequest.id}`
                        )
                    }
                })
            }
        } catch (error) {
            gaps.push({axis: 'pull-request-census-verification', reason: errorMessage(error)});
            candidates.forEach(candidate => { candidate.invalid = true })
        }
    }

    for (const candidate of candidates) {
        if (candidate.invalid || !candidate.reconciled) {
            continue
        }

        try {
            observations.push(...pullRequestToObservations({
                ...candidate.reconciled.pullRequest,
                comments      : candidate.reconciled.comments,
                reviews       : candidate.reconciled.reviews,
                reviewComments: candidate.reconciled.reviewComments,
                timeline      : candidate.timeline
            }))
        } catch (error) {
            markCandidateGap(candidate, gaps, 'normalization', error)
        }
    }

    const coverage = {
        fromBasis: GENESIS_BASIS,
        toBasis  : rootResult.cursor ?? GENESIS_BASIS,
        complete : gaps.length === 0,
        ...(gaps.length ? {gaps} : {})
    };

    return {
        observations,
        coverage,
        nextProviderState: {
            pullRequestsCursor: rootResult.cursor,
            rootCount         : rootResult.pullRequests.length
        },
        currentInventory: rootResult.pullRequests.map(pullRequest => pullRequest.id)
    }
}
