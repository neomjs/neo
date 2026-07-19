import Base                           from '../../../src/core/Base.mjs';
import CommunityBatchAdmissionService from '../memory-core/CommunityBatchAdmissionService.mjs';
import GraphqlService                 from './GraphqlService.mjs';
import SourceRegistryService          from '../memory-core/SourceRegistryService.mjs';
import {assembleIssueBatch}           from './community/assembleIssueBatch.mjs';
import {classifyAbsences}             from './community/githubIssueAbsence.mjs';
import {reconcileIssueActivity}       from './community/githubIssueReconciliation.mjs';
import {
    FETCH_RECONCILE_COMMENTS_PAGE, FETCH_RECONCILE_ISSUES, FETCH_RECONCILE_TIMELINE_PAGE
} from './queries/issueReconciliationQueries.mjs';

/**
 * @class Neo.ai.services.github-workflow.IssueReconciliationService
 * @extends Neo.core.Base
 * @summary Orchestrates one exhaustive issue-family reconciliation into durable admission: reads the
 * source's registration and last checkpoint, walks every open and closed issue (and each issue's
 * comments and timeline) to exhaustion behind the GraphQL seams, diffs the prior inventory to
 * separate evidenced deletions from access loss, assembles a metadata-only `community-activity-batch.v1`
 * batch, and admits it.
 *
 * The service holds no completeness state of its own: the durable cursor lives in the admission
 * checkpoint and is advanced ONLY by the admission transaction (AC8). A batch that fails admission
 * leaves the checkpoint untouched, so the next run re-walks the same window rather than skipping it.
 * Every acquisition dependency is injectable, so the whole orchestration is witness-testable against
 * fakes with no live GitHub and no real database.
 */
class IssueReconciliationService extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.services.github-workflow.IssueReconciliationService'
         * @protected
         */
        className: 'Neo.ai.services.github-workflow.IssueReconciliationService',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Runs one reconciliation pass for a registered source and admits the resulting batch.
     * @param {Object}   spec
     * @param {String}   spec.sourceInstanceId
     * @param {String}   [spec.resourceFamily='issues']
     * @param {String}   spec.owner                    Repository owner for the GraphQL queries.
     * @param {String}   spec.repo                     Repository name.
     * @param {String}   spec.batchId                  Stable id for this logical batch (idempotent retries reuse it).
     * @param {String}   [spec.observedAt]             ISO-8601 run moment; defaults to now. Injected in tests.
     * @param {Object}   [spec.pageSizes]              `{issuePage, commentPage, timelinePage}` GraphQL page sizes.
     * @param {Object}   [spec.caps]                   `{maxIssuePages, maxCommentPagesPerIssue, maxTimelinePagesPerIssue}` — honest degraded coverage when hit.
     * @param {Function} [spec.acquireDeletionEvidence] async (vanishedIds) => `{id: evidence}` — the provider deletion-evidence seam; the default yields none, so every vanished root is an access gap, never a fabricated deletion.
     * @param {Object}   [spec.admissionService]       Injected admission dependency; defaults to the singleton.
     * @param {Object}   [spec.graphqlService]         Injected GraphQL dependency; defaults to the singleton.
     * @param {Object}   [spec.registryService]        Injected registry dependency; defaults to the singleton.
     * @returns {Promise<Object>} The admission receipt `{status, receipt|reason, ...}`.
     * @throws {Error} `ISSUE_RECONCILIATION_SOURCE_NOT_ACTIVE` when the source is unregistered or not ACTIVE.
     */
    async reconcile({
        sourceInstanceId, resourceFamily = 'issues', owner, repo, batchId, observedAt,
        pageSizes = {}, caps = {},
        acquireDeletionEvidence = async () => ({}),
        admissionService        = CommunityBatchAdmissionService,
        graphqlService          = GraphqlService,
        registryService         = SourceRegistryService
    }) {
        const {issuePage = 50, commentPage = 50, timelinePage = 50} = pageSizes;

        // A source must be registered and ACTIVE before its activity can be admitted.
        const registration = registryService.getRegistration(sourceInstanceId);

        if (!registration || registration.lifecycleState !== 'ACTIVE') {
            throw new Error('ISSUE_RECONCILIATION_SOURCE_NOT_ACTIVE')
        }

        // The checkpoint carries the base version + inventory for the admission CAS. It deliberately
        // does NOT seed a resume cursor: exhaustive reconciliation must RE-ENUMERATE every root each
        // pass so a comment/edit/close/reopen on an already-seen root is caught. A root-list end
        // cursor is an enumeration receipt for a historical root window, never proof of child
        // completeness for mutable roots or their comment/timeline connections.
        const checkpoint            = admissionService.getCheckpoint(sourceInstanceId, resourceFamily),
              baseCheckpointVersion = checkpoint?.checkpointVersion ?? 0,
              baseInventoryHash     = checkpoint?.inventoryHash     ?? null;

        // Prior live inventory = the issue roots this source has previously admitted.
        const priorInventory = admissionService.listObservations(sourceInstanceId)
            .filter(observation => observation.occurrenceKind === 'issue.opened')
            .map(observation => observation.providerEntityId);

        // fromBasis omitted → the runner walks from the beginning, re-establishing full root + child
        // truth on every pass (mutation-safe); caps still bound a single pass into honest coverage.
        const seams        = this.#buildSeams({graphqlService, owner, repo, issuePage, commentPage, timelinePage}),
              runnerResult = await reconcileIssueActivity(seams, {...caps});

        const currentInventory = runnerResult.observations
            .filter(observation => observation.occurrenceKind === 'issue.opened')
            .map(observation => observation.providerEntityId);

        // A root in the prior inventory but not this pass has vanished — ask the injected evidence
        // seam whether the provider can prove a deletion. Evidence → an admitted deletion; no
        // evidence → an inventory-access gap, NEVER a fabricated deletion (classifyAbsences enforces
        // the split). The default seam yields nothing, so absent a tombstone source every vanish is
        // an access gap.
        const vanished             = priorInventory.filter(id => !currentInventory.includes(id)),
              deletionEvidenceById = vanished.length ? await acquireDeletionEvidence(vanished) : {},
              absences             = classifyAbsences(priorInventory, currentInventory, deletionEvidenceById);

        const batch = assembleIssueBatch({
            sourceInstanceId, resourceFamily,
            registrationEpoch: registration.registrationEpoch,
            baseCheckpointVersion, baseInventoryHash,
            runnerResult, absences, currentInventory,
            batchId, observedAt: observedAt ?? new Date().toISOString()
        });

        // AC8 — the admission transaction is the sole durable checkpoint advance. A CONFLICT receipt
        // leaves the checkpoint untouched; nothing here advances it.
        return admissionService.admitBatch(batch)
    }

    /**
     * @summary Builds the three fetch seams reconcileIssueActivity consumes, each mapping a raw
     * GraphQL connection onto the runner's expected shape. Comments and timeline are separate seams
     * so the runner exhausts them as independent axes.
     * @param {Object} deps
     * @returns {Object} `{fetchIssuesPage, fetchCommentsPage, fetchTimelinePage}`.
     * @private
     */
    #buildSeams({graphqlService, owner, repo, issuePage, commentPage, timelinePage}) {
        return {
            fetchIssuesPage: async ({cursor}) => {
                const data = await graphqlService.query(FETCH_RECONCILE_ISSUES, {owner, repo, after: cursor, issuePage, commentPage, timelinePage}),
                      conn = data?.repository?.issues;

                return {
                    issues  : (conn?.nodes ?? []).map(node => this.#normalizeIssueNode(node)),
                    pageInfo: conn?.pageInfo
                }
            },
            fetchCommentsPage: async ({issueId, cursor}) => {
                const data = await graphqlService.query(FETCH_RECONCILE_COMMENTS_PAGE, {issueId, after: cursor, commentPage}),
                      conn = data?.node?.comments;

                return {comments: conn?.nodes ?? [], pageInfo: conn?.pageInfo}
            },
            fetchTimelinePage: async ({issueId, cursor}) => {
                const data = await graphqlService.query(FETCH_RECONCILE_TIMELINE_PAGE, {issueId, after: cursor, timelinePage}),
                      conn = data?.node?.timelineItems;

                return {events: conn?.nodes ?? [], pageInfo: conn?.pageInfo}
            }
        }
    }

    /**
     * @summary Maps a raw GraphQL issue node onto the reconciled-node shape the runner consumes:
     * comments and timeline stay `{nodes, pageInfo}` connections so the runner can continuation-fetch,
     * while the flat identity/author fields pass through for the normalizer.
     * @param {Object} node
     * @returns {Object}
     * @private
     */
    #normalizeIssueNode(node) {
        return {
            id               : node.id,
            createdAt        : node.createdAt,
            updatedAt        : node.updatedAt,
            lastEditedAt     : node.lastEditedAt,
            author           : node.author,
            authorAssociation: node.authorAssociation,
            comments         : node.comments,
            timeline         : node.timelineItems
        }
    }
}

export default Neo.setupClass(IssueReconciliationService);
