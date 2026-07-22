import Base                           from '../../../src/core/Base.mjs';
import CommunityBatchAdmissionService from '../memory-core/CommunityBatchAdmissionService.mjs';
import GraphqlService                 from './GraphqlService.mjs';
import SourceRegistryService          from '../memory-core/SourceRegistryService.mjs';
import {assembleIssueBatch}           from './community/assembleIssueBatch.mjs';
import {classifyAbsences}             from './community/githubIssueAbsence.mjs';
import {reconcilePullRequestActivity} from './community/githubPullRequestReconciliation.mjs';
import {
    exhaustGraphqlConversation,
    exhaustRepositoryReviewComments
} from './PullRequestHistoryService.mjs';
import {
    FETCH_RECONCILE_PULL_REQUEST_CENSUS,
    FETCH_RECONCILE_PULL_REQUEST_CHILDREN,
    FETCH_RECONCILE_PULL_REQUEST_CONTENT_REVISIONS,
    FETCH_RECONCILE_PULL_REQUEST_TIMELINE,
    FETCH_RECONCILE_PULL_REQUESTS,
    FETCH_RECONCILE_USER_CONTENT_EDIT_HEADS,
    FETCH_RECONCILE_USER_CONTENT_EDITS
} from './queries/pullRequestReconciliationQueries.mjs';

const GRAPHQL_NODE_BATCH_SIZE = 100;

const CONTENT_EDIT_TYPENAMES = new Set([
    'PullRequest', 'IssueComment', 'PullRequestReview', 'PullRequestReviewComment'
]);

/**
 * @class Neo.ai.services.github-workflow.PullRequestReconciliationService
 * @extends Neo.core.Base
 * @summary Orchestrates durable, exhaustive PR/review occurrence reconciliation. Every pass
 * re-enumerates OPEN/CLOSED/MERGED roots, reuses PullRequestHistoryService's independently
 * progress-checked comment/review pagination and two-pass inline-comment verification, exhausts
 * provider timeline events, verifies the root census, assembles one metadata-only neutral batch,
 * and advances its checkpoint only through durable admission.
 *
 * Deletion evidence remains fail-closed: a vanished root becomes `pull_request.deleted` only when
 * the injected provider seam supplies a tombstone; otherwise it is an inventory-access gap. GitHub
 * review and inline-review-comment deletion histories that have no exhaustive tombstone surface are
 * named by runner coverage rather than fabricated.
 */
class PullRequestReconciliationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.PullRequestReconciliationService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.PullRequestReconciliationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Runs one PR-family reconciliation and submits its neutral batch for admission.
     * @param {Object} spec
     * @param {String} spec.sourceInstanceId
     * @param {String} [spec.resourceFamily='pulls']
     * @param {String} spec.owner
     * @param {String} spec.repo
     * @param {String} spec.batchId
     * @param {String} [spec.observedAt]
     * @param {Object} [spec.pageSizes] `{rootPage, childPage, timelinePage, editPage}`.
     * @param {Object} [spec.caps] `{maxRootPages, maxTimelinePagesPerPullRequest, maxEditPagesPerEntity}`.
     * @param {Function} [spec.acquireDeletionEvidence] async vanished root ids → provider evidence map.
     * @param {Object} [spec.admissionService]
     * @param {Object} [spec.graphqlService]
     * @param {Object} [spec.registryService]
     * @returns {Promise<Object>} Admission receipt.
     */
    async reconcile({
        sourceInstanceId, resourceFamily = 'pulls', owner, repo, batchId, observedAt,
        pageSizes = {}, caps = {},
        acquireDeletionEvidence = async () => ({}),
        admissionService        = CommunityBatchAdmissionService,
        graphqlService          = GraphqlService,
        registryService         = SourceRegistryService
    }) {
        const {rootPage = 50, childPage = 100, timelinePage = 100, editPage = 100} = pageSizes;

        const registration = registryService.getRegistration(sourceInstanceId);

        if (!registration || registration.lifecycleState !== 'ACTIVE') {
            throw new Error('PULL_REQUEST_RECONCILIATION_SOURCE_NOT_ACTIVE')
        }

        // The durable checkpoint is the admission CAS basis, never a resume cursor. Mutable roots
        // and their child families must be re-enumerated from genesis on every pass.
        const checkpoint            = admissionService.getCheckpoint(sourceInstanceId, resourceFamily),
              baseCheckpointVersion = checkpoint?.checkpointVersion ?? 0,
              baseInventoryHash     = checkpoint?.inventoryHash     ?? null,
              priorInventory        = admissionService.listObservations(sourceInstanceId)
                  .filter(observation => observation.occurrenceKind === 'pull_request.opened')
                  .map(observation => observation.providerEntityId),
              seams                 = this.#buildSeams({
                  graphqlService, owner, repo, rootPage, childPage, timelinePage, editPage
              }),
              runnerResult          = await reconcilePullRequestActivity(seams, caps),
              currentInventory      = runnerResult.currentInventory,
              vanished              = priorInventory.filter(id => !currentInventory.includes(id)),
              deletionEvidenceById  = vanished.length ? await acquireDeletionEvidence(vanished) : {},
              absences              = classifyAbsences(
                  priorInventory,
                  currentInventory,
                  deletionEvidenceById
              );

        const batch = assembleIssueBatch({
            sourceInstanceId,
            resourceFamily,
            registrationEpoch         : registration.registrationEpoch,
            baseCheckpointVersion,
            baseInventoryHash,
            runnerResult,
            absences,
            currentInventory,
            batchId,
            observedAt                : observedAt ?? new Date().toISOString(),
            adapterSchemaVersion      : 'github-pull-request.v1',
            providerStateSchemaVersion: 'github-pull-request-state.v1',
            deletionOccurrenceKind    : 'pull_request.deleted'
        });

        // Admission owns receipt persistence and the only durable checkpoint transition.
        return admissionService.admitBatch(batch)
    }

    /**
     * @summary Builds the live acquisition seams consumed by reconcilePullRequestActivity.
     * @param {Object} deps
     * @returns {Object}
     * @private
     */
    #buildSeams({graphqlService, owner, repo, rootPage, childPage, timelinePage, editPage}) {
        const query = (queryString, variables) => graphqlService.query(queryString, variables),
              rest  = (method, path) => graphqlService.rest(method, path);

        return {
            fetchPullRequestsPage: async ({cursor}) => {
                const data = await query(FETCH_RECONCILE_PULL_REQUESTS, {
                          owner, repo, after: cursor, rootPage, childPage, timelinePage
                      }),
                      connection = data?.repository?.pullRequests;

                return {
                    pullRequests: (connection?.nodes ?? []).map(node => ({
                        ...node,
                        timeline: node.timelineItems
                    })),
                    pageInfo  : connection?.pageInfo,
                    totalCount: connection?.totalCount
                }
            },

            exhaustConversation: ({pullRequest}) => exhaustGraphqlConversation({
                pullRequest,
                query,
                owner,
                repo,
                childrenQuery: FETCH_RECONCILE_PULL_REQUEST_CHILDREN
            }),

            fetchTimelinePage: async ({pullRequestId, cursor}) => {
                const data = await query(FETCH_RECONCILE_PULL_REQUEST_TIMELINE, {
                          pullRequestId, after: cursor, timelinePage
                      }),
                      pullRequest = data?.node,
                      connection  = pullRequest?.timelineItems;

                return {
                    events             : connection?.nodes,
                    pageInfo           : connection?.pageInfo,
                    filteredCount      : connection?.filteredCount,
                    connectionUpdatedAt: connection?.updatedAt,
                    rootUpdatedAt      : pullRequest?.updatedAt
                }
            },

            fetchReviewCommentSnapshot: () => exhaustRepositoryReviewComments({
                rest,
                owner,
                repo,
                includeActorMetadata: true
            }),

            fetchContentEditHeads: ({entities}) => this.#hydrateContentEditHeads({
                entities, query, editPage
            }),

            fetchContentEditsPage: async ({entityNodeId, cursor}) => {
                const data = await query(FETCH_RECONCILE_USER_CONTENT_EDITS, {
                    entityId: entityNodeId,
                    after   : cursor,
                    editPage
                });

                return data?.node
            },

            verifyContentEntities: ({entities}) => this.#verifyContentEntities({entities, query}),

            fetchCensusPage: async ({cursor}) => {
                const data = await query(FETCH_RECONCILE_PULL_REQUEST_CENSUS, {
                          owner, repo, after: cursor, rootPage
                      }),
                      connection = data?.repository?.pullRequests;

                return {
                    pullRequests: (connection?.nodes ?? []).map(node => ({
                        ...node,
                        timeline: node.timelineItems
                    })),
                    pageInfo  : connection?.pageInfo,
                    totalCount: connection?.totalCount
                }
            }
        }
    }

    /**
     * @summary Batches GraphQL revision-head hydration for every content entity. Stable node ids
     * bridge REST-enumerated inline comments while keeping the high-multiplicity edit connection out
     * of root/comment/review census queries.
     * @param {Object} options
     * @returns {Promise<Object[]>} One ordered settled outcome per input entity.
     * @private
     */
    async #hydrateContentEditHeads({entities, query, editPage}) {
        const outcomes = new Array(entities.length);

        for (let offset = 0; offset < entities.length; offset += GRAPHQL_NODE_BATCH_SIZE) {
            const batch = entities.slice(offset, offset + GRAPHQL_NODE_BATCH_SIZE)
                .map((entity, index) => ({entity, index: offset + index})),
                  valid = [];

            batch.forEach(entry => {
                const nodeId = entry.entity?.nodeId ?? entry.entity?.id;

                if (typeof nodeId !== 'string' || !nodeId) {
                    outcomes[entry.index] = {
                        status: 'rejected', reason: 'PULL_REQUEST_RECONCILIATION_CONTENT_NODE_ID_MISSING'
                    }
                } else {
                    valid.push({...entry, nodeId})
                }
            });

            if (valid.length === 0) {
                continue
            }

            let nodes;

            try {
                const data = await query(FETCH_RECONCILE_USER_CONTENT_EDIT_HEADS, {
                    ids: valid.map(entry => entry.nodeId), editPage
                });

                nodes = data?.nodes
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);

                valid.forEach(entry => {
                    outcomes[entry.index] = {status: 'rejected', reason}
                });
                continue
            }

            if (!Array.isArray(nodes) || nodes.length !== valid.length) {
                valid.forEach(entry => {
                    outcomes[entry.index] = {
                        status: 'rejected', reason: 'PULL_REQUEST_RECONCILIATION_CONTENT_EDIT_HEADS_INVALID'
                    }
                });
                continue
            }

            const nodesById  = new Map(),
                  duplicates = new Set();

            for (const node of nodes) {
                if (!node?.id) {
                    continue
                }
                if (nodesById.has(node.id)) {
                    duplicates.add(node.id)
                }

                nodesById.set(node.id, node)
            }

            valid.forEach(entry => {
                const {entity, index, nodeId} = entry,
                      node                    = nodesById.get(nodeId);

                if (!node || duplicates.has(nodeId) || !CONTENT_EDIT_TYPENAMES.has(node.__typename) ||
                    node.createdAt !== entity.createdAt || node.updatedAt !== entity.updatedAt) {
                    outcomes[index] = {
                        status: 'rejected', reason: `PULL_REQUEST_RECONCILIATION_CONTENT_MUTATED:${entity.id}`
                    };
                    return
                }

                outcomes[index] = {
                    status: 'fulfilled',
                    value : {
                        ...entity,
                        includesCreatedEdit: node.includesCreatedEdit,
                        userContentEdits   : node.userContentEdits
                    }
                }
            })
        }

        return outcomes
    }

    /**
     * @summary Re-reads mutable content entity revision tokens in bounded GraphQL node batches.
     * @param {Object} options
     * @returns {Promise<Object[]>} One ordered settled outcome per expected revision.
     * @private
     */
    async #verifyContentEntities({entities, query}) {
        const outcomes = new Array(entities.length);

        for (let offset = 0; offset < entities.length; offset += GRAPHQL_NODE_BATCH_SIZE) {
            const batch = entities.slice(offset, offset + GRAPHQL_NODE_BATCH_SIZE)
                .map((entity, index) => ({entity, index: offset + index})),
                  valid = [];

            batch.forEach(entry => {
                if (typeof entry.entity?.id !== 'string' || !entry.entity.id) {
                    outcomes[entry.index] = {
                        status: 'rejected', reason: 'PULL_REQUEST_RECONCILIATION_CONTENT_VERIFICATION_ID_INVALID'
                    }
                } else {
                    valid.push(entry)
                }
            });

            if (valid.length === 0) {
                continue
            }

            let nodes;

            try {
                const data = await query(FETCH_RECONCILE_PULL_REQUEST_CONTENT_REVISIONS, {
                    ids: valid.map(entry => entry.entity.id)
                });

                nodes = data?.nodes
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);

                valid.forEach(entry => {
                    outcomes[entry.index] = {status: 'rejected', reason}
                });
                continue
            }

            if (!Array.isArray(nodes) || nodes.length !== valid.length) {
                valid.forEach(entry => {
                    outcomes[entry.index] = {
                        status: 'rejected', reason: 'PULL_REQUEST_RECONCILIATION_CONTENT_VERIFICATION_INVALID'
                    }
                });
                continue
            }

            const nodesById  = new Map(),
                  duplicates = new Set();

            for (const node of nodes) {
                if (!node?.id) {
                    continue
                }
                if (nodesById.has(node.id)) {
                    duplicates.add(node.id)
                }

                nodesById.set(node.id, node)
            }

            valid.forEach(({entity, index}) => {
                const node = nodesById.get(entity.id);

                if (!node || duplicates.has(entity.id) || !CONTENT_EDIT_TYPENAMES.has(node.__typename) ||
                    node.updatedAt !== entity.updatedAt) {
                    outcomes[index] = {
                        status: 'rejected', reason: `PULL_REQUEST_RECONCILIATION_CONTENT_MUTATED:${entity.id}`
                    }
                } else {
                    outcomes[index] = {status: 'fulfilled', value: node}
                }
            })
        }

        return outcomes
    }
}

export default Neo.setupClass(PullRequestReconciliationService);
