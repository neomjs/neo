import fs                                                      from 'fs';
import path                                                    from 'path';
import {fileURLToPath}                                         from 'url';
import { Memory_Config as aiConfig }                           from '../../services.mjs';
import Base                                                    from '../../../src/core/Base.mjs';
import { Memory_StorageRouter as StorageRouter }               from '../../services.mjs';
import { Memory_TextEmbeddingService as TextEmbeddingService } from '../../services.mjs';
import { Memory_GraphService as GraphService }                 from '../../services.mjs';
import Json                                                    from '../../../src/util/Json.mjs';
import logger                                                  from '../../mcp/server/memory-core/logger.mjs';
import {buildGraphProvider, resolveGraphModelProvider}         from './providerDispatch.mjs';
import {
    formatGoldenPathCapturedAt as formatGoldenPathTimestamp
} from './goldenPathTimestamp.mjs';
import {
    buildEmbeddingDimensionMismatchMessage,
    getEmbeddingModelName,
    getEmbeddingVectorLength
} from './embeddingDimension.mjs';
import {
    getAgentLogins            as resolveAgentLogins,
    getCoreSwarmAgentFamilies as resolveCoreSwarmAgentFamilies,
    getIdentityGithubLogin    as resolveIdentityGithubLogin,
    hasCrossFamilyReview      as resolvePrCrossFamilyReview,
    parseSelfIdLogin          as parsePrSelfIdLogin,
    resolveAuthorFamily       as resolvePrAuthorFamily
} from './agentFamilyResolution.mjs';
import {
    buildFailureOutcome                          as buildRouteFailureOutcome,
    findComputedFocusContradiction               as findRouteFocusContradiction,
    getComputedRecommendationExclusionLabels     as getRouteExclusionLabels,
    getRoutingConflictReasons                    as getRouteConflictReasons,
    isActionableComputedRecommendation           as isActionableRouteRecommendation,
    isContentComputedRecommendation              as isContentRouteRecommendation,
    isRoutingConflictFocusCandidate              as isRouteConflictFocusCandidate,
    renderComputedGoldenPathContradictionSection as renderRouteContradictionSection,
    renderComputedGoldenPathEmptySection         as renderRouteEmptySection,
    renderComputedGoldenPathFailureSection       as renderRouteFailureSection
} from './computedGoldenPathRouting.mjs';
import {
    appendRouteAttribution,
    validateRouteAttributionRetention
} from './routeAttributionLedgerStore.mjs';
import {RETROSPECTIVE_GRAINS, renderHandoffRetrospectiveSection} from './handoffRetrospective.mjs';
import {assembleRetrospectiveStats}                              from './handoffRetrospectiveAssembler.mjs';
import {
    getActivePrCycleStatus                      as resolveActivePrCycleStatus,
    renderActivePrCycleState                    as renderActivePrCycleStateSection,
    renderRecentOpenPrSummary                   as renderRecentOpenPrSummarySection,
    renderStrategicInterpretationDegradedReason as renderStrategicDegradedReason
} from './activePrCycleSection.mjs';
import {
    getRecentSummaryDocuments      as resolveRecentSummaryDocuments,
    pruneStaleFrontierGuideEdges   as pruneFrontierGuideEdges,
    renderConsolidationGapsSection as renderConsolidationGaps
} from './frontierConsolidation.mjs';
import {
    buildConceptSlice                as buildGraphConceptSlice,
    renderConceptSliceHandoffSection as renderGraphConceptSliceHandoffSection,
    renderConceptSliceSection        as renderGraphConceptSliceSection
} from './conceptSliceBuilder.mjs';
import {
    STRUCTURAL_COLD_START_EPSILON,
    classifyFrontierEmptyCause,
    inheritParentStructuralWeight,
    rankByDeclaredIntent,
    renderDeclaredIntentFallback
} from './goldenPathPickupBridge.mjs';
import {
    buildCurrentFocusCandidates as buildIssueFocusCurrentFocusCandidates,
    buildSilentThreadCandidates as buildIssueFocusSilentThreadCandidates,
    buildStaleAssignmentCandidates as buildIssueFocusStaleAssignmentCandidates,
    buildWorkGraphStallFindings as buildIssueFocusWorkGraphStallFindings,
    collectIssueMarkdownFiles as collectIssueFocusMarkdownFiles,
    extractAssignmentEvents as extractIssueFocusAssignmentEvents,
    extractIssueCommentBlocks as extractIssueFocusCommentBlocks,
    findLastQualifyingAssignmentActivity as findIssueFocusLastQualifyingAssignmentActivity,
    findLatestIssueActivity as findIssueFocusLatestActivity,
    getIssueStructuralWeight as getIssueFocusStructuralWeight,
    getStaleAssignmentMaintainers as getIssueFocusStaleAssignmentMaintainers,
    hasOpenIssueBlocker as hasIssueFocusOpenBlocker,
    normalizeLabels as normalizeIssueFocusLabels,
    renderCurrentFocusCandidatesSection as renderIssueFocusCurrentFocusCandidatesSection,
    renderSilentThreadCandidatesSection as renderIssueFocusSilentThreadCandidatesSection,
    renderStaleAssignmentCandidatesSection as renderIssueFocusStaleAssignmentCandidatesSection,
    renderWorkGraphStallFindingsSection as renderIssueFocusWorkGraphStallFindingsSection,
    scoreCurrentFocusIssue as scoreIssueFocusCurrentIssue
} from './issueFocusSections.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// The embedding-dimension helpers were extracted to ./embeddingDimension.mjs (the SRP decomposition). They are
// imported above for the internal dimension guard, and re-exported here so the public API stays stable.
export {buildEmbeddingDimensionMismatchMessage, getEmbeddingModelName, getEmbeddingVectorLength};

/**
 * @class Neo.ai.daemons.services.GoldenPathSynthesizer
 * @extends Neo.core.Base
 * @singleton
 */
class GoldenPathSynthesizer extends Base {
    static config = {
        /**
         * @member {String} className='Neo.ai.daemons.services.GoldenPathSynthesizer'
         * @protected
         */
        className: 'Neo.ai.daemons.services.GoldenPathSynthesizer',
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * @summary Delegates AgentIdentity GitHub-login normalization to `agentFamilyResolution.mjs`.
     * @param {Object} identity AgentIdentity root entry.
     * @returns {String|null}
     */
    static getIdentityGithubLogin(identity) {
        return resolveIdentityGithubLogin(identity)
    }

    /**
     * @summary Delegates the core-swarm login→family map to `agentFamilyResolution.mjs`.
     * @returns {Object<String,String>} GitHub login to model-family map.
     */
    static getCoreSwarmAgentFamilies() {
        return resolveCoreSwarmAgentFamilies()
    }

    /**
     * @summary Delegates canonical agent-login enumeration to `agentFamilyResolution.mjs`.
     * @returns {String[]} Agent logins without leading `@`.
     */
    static getAgentLogins() {
        return resolveAgentLogins()
    }

    /**
     * @summary Returns maintainer logins eligible for stale-assignment progress acknowledgements.
     *
     * Stale-assignment acknowledgements consume the same AgentIdentity registry as the
     * active-PR surface, but include human owner identities as maintainers. Assignee
     * comments still qualify independently in `findLastQualifyingAssignmentActivity`.
     *
     * @returns {String[]} Maintainer logins without leading `@`.
     */
    static getStaleAssignmentMaintainers() {
        return getIssueFocusStaleAssignmentMaintainers()
    }

    /**
     * @summary Delegates issue markdown discovery to the focused issue-focus helper module.
     * @param {String} rootDir Directory containing synced issue markdown files.
     * @returns {String[]} Absolute markdown file paths sorted lexically for deterministic output.
     */
    static collectIssueMarkdownFiles(rootDir) {
        return collectIssueFocusMarkdownFiles(rootDir)
    }

    /**
     * @summary Delegates issue comment parsing to the focused issue-focus helper module.
     * @param {String} content Markdown body without frontmatter.
     * @returns {Array<{author: String, createdAt: String, body: String}>}
     */
    static extractIssueCommentBlocks(content) {
        return extractIssueFocusCommentBlocks(content)
    }

    /**
     * @summary Delegates assignment event parsing to the focused issue-focus helper module.
     * @param {String} content Markdown body without frontmatter.
     * @param {String[]} assignees Current assignee logins.
     * @returns {Array<{author: String, createdAt: String, assignee: String}>}
     */
    static extractAssignmentEvents(content, assignees = []) {
        return extractIssueFocusAssignmentEvents(content, assignees)
    }

    /**
     * @summary Delegates stale-assignment activity detection to the focused issue-focus helper module.
     * @param {Object} issue Parsed issue record.
     * @param {String[]} issue.assignees Current assignee logins.
     * @param {String} issue.createdAt Issue creation timestamp.
     * @param {String} issue.content Markdown body without frontmatter.
     * @param {String[]} [maintainers=this.getStaleAssignmentMaintainers()] Maintainer logins.
     * @returns {{createdAt: Date, author: String, reason: String}}
     */
    static findLastQualifyingAssignmentActivity(issue, maintainers = this.getStaleAssignmentMaintainers()) {
        return findIssueFocusLastQualifyingAssignmentActivity(issue, maintainers)
    }

    /**
     * @summary Delegates stale-assignment candidate building to the focused issue-focus helper module.
     * @param {Object} options
     * @param {String} options.issuesDir Local synced issue directory.
     * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
     * @param {Number} [options.thresholdMs=aiConfig.goldenPathStaleAssignmentThresholdMs] Stale threshold.
     * @param {String[]} [options.maintainers=this.getStaleAssignmentMaintainers()] Maintainer logins.
     * @returns {Array<Object>} Stale candidates sorted by oldest qualifying activity first.
     */
    static buildStaleAssignmentCandidates(options = {}) {
        return buildIssueFocusStaleAssignmentCandidates({
            ...options,
            maintainers: options.maintainers || this.getStaleAssignmentMaintainers()
        })
    }

    /**
     * @summary Delegates stale-assignment rendering to the focused issue-focus helper module.
     * @param {Array<Object>} candidates Stale assignment candidates.
     * @param {Object} options
     * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
     * @param {Number} [options.limit=aiConfig.goldenPathStaleAssignmentRenderLimit] Maximum candidates to render.
     * @returns {String}
     */
    static renderStaleAssignmentCandidatesSection(candidates, options = {}) {
        return renderIssueFocusStaleAssignmentCandidatesSection(candidates, options)
    }

    /**
     * @summary Delegates latest issue activity detection to the focused issue-focus helper module.
     * @param {Object} issue Parsed issue record.
     * @param {String} issue.content Markdown body without frontmatter.
     * @param {String} issue.createdAt Issue creation timestamp.
     * @param {String} issue.updatedAt Issue update timestamp.
     * @returns {{createdAt: Date, author: String, reason: String}|null}
     */
    static findLatestIssueActivity(issue) {
        return findIssueFocusLatestActivity(issue)
    }

    /**
     * @summary Delegates Silent Threads structural weighting to the focused issue-focus helper module.
     * @param {String} issueId Canonical graph issue id (`issue-N`).
     * @param {Object} [graphService=GraphService] Memory GraphService singleton or test double.
     * @returns {Number}
     */
    static getIssueStructuralWeight(issueId, graphService = GraphService) {
        return getIssueFocusStructuralWeight(issueId, graphService)
    }

    /**
     * @summary Delegates blocker detection for issue-focus visibility sections.
     * @param {Object} options
     * @param {String} options.issueId Canonical graph issue id (`issue-N`).
     * @param {Object} options.issue Parsed issue frontmatter.
     * @param {Object} [options.graphService=GraphService] Memory GraphService singleton or test double.
     * @returns {Boolean}
     */
    static hasOpenIssueBlocker(options) {
        return hasIssueFocusOpenBlocker(options)
    }

    /**
     * @summary Delegates visibility-only Silent Threads candidate building to the issue-focus helper module.
     * @param {Object} options
     * @param {String} options.issuesDir Local synced issue directory.
     * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
     * @param {Set<String>} [options.goldenIds=new Set()] Current Computed Golden Path issue ids.
     * @param {Number} [options.thresholdMs=aiConfig.goldenPathSilentThreadThresholdMs] Idle threshold.
     * @param {Number} [options.minScore=aiConfig.goldenPathSilentThreadMinScore] Minimum silence score.
     * @param {Object} [options.graphService=GraphService] Memory GraphService singleton or test double.
     * @returns {Array<Object>} Silent-thread candidates sorted by silence score.
     */
    static buildSilentThreadCandidates(options = {}) {
        return buildIssueFocusSilentThreadCandidates({
            ...options,
            getStructuralWeight: options.getStructuralWeight || this.getIssueStructuralWeight.bind(this)
        })
    }

    /**
     * @summary Delegates Silent Threads rendering to the focused issue-focus helper module.
     * @param {Array<Object>} candidates Silent-thread candidates.
     * @param {Object} options
     * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
     * @param {Number} [options.limit=aiConfig.goldenPathSilentThreadRenderLimit] Maximum candidates to render.
     * @returns {String}
     */
    static renderSilentThreadCandidatesSection(candidates, options = {}) {
        return renderIssueFocusSilentThreadCandidatesSection(candidates, options)
    }

    /**
     * @summary Delegates deterministic work-graph stall finding construction to the issue-focus helper.
     * @param {Object} options See `issueFocusSections.buildWorkGraphStallFindings`.
     * @returns {Object[]} Work-graph stall finding payloads.
     */
    static buildWorkGraphStallFindings(options = {}) {
        return buildIssueFocusWorkGraphStallFindings(options)
    }

    /**
     * @summary Delegates visibility-only stall finding handoff rendering to the issue-focus helper.
     * @param {Object[]} findings Stall finding payloads.
     * @param {Object} options See `issueFocusSections.renderWorkGraphStallFindingsSection`.
     * @returns {String}
     */
    static renderWorkGraphStallFindingsSection(findings, options = {}) {
        return renderIssueFocusWorkGraphStallFindingsSection(findings, options)
    }

    /**
     * @summary Delegates Golden Path label normalization to the issue-focus helper module.
     * @param {Array<*>} labels Raw label values.
     * @returns {String[]} Lowercase label names.
     */
    static normalizeLabels(labels = []) {
        return normalizeIssueFocusLabels(labels)
    }

    /**
     * @summary Delegates computed-recommendation actionability to `computedGoldenPathRouting.mjs`.
     * @param {Object} nodeData Parsed graph node payload.
     * @returns {Boolean}
     */
    static isActionableComputedRecommendation(nodeData) {
        return isActionableRouteRecommendation(nodeData)
    }

    /**
     * @summary Delegates computed-route exclusion-label discovery to `computedGoldenPathRouting.mjs`.
     * @param {Object} nodeData Parsed computed recommendation node.
     * @returns {String[]} Normalized labels that reject immediate computed routing.
     */
    static getComputedRecommendationExclusionLabels(nodeData) {
        return getRouteExclusionLabels(nodeData)
    }

    /**
     * @summary Delegates routing-conflict focus detection to `computedGoldenPathRouting.mjs`.
     * @param {Object} candidate Current Focus candidate.
     * @returns {Boolean}
     */
    static isRoutingConflictFocusCandidate(candidate) {
        return isRouteConflictFocusCandidate(candidate)
    }

    /**
     * @summary Delegates content/narrative recommendation detection to `computedGoldenPathRouting.mjs`.
     * @param {Object} nodeData Parsed computed recommendation node.
     * @returns {Boolean}
     */
    static isContentComputedRecommendation(nodeData) {
        return isContentRouteRecommendation(nodeData)
    }

    /**
     * @summary Delegates computed-vs-focus contradiction detection to `computedGoldenPathRouting.mjs`.
     * @param {Object} options
     * @param {Array<Object>} [options.topNodes=[]] Computed Golden Path recommendations.
     * @param {Array<Object>} [options.currentFocusCandidates=[]] Current Focus candidates.
     * @returns {{focusCandidates: Array<Object>, blockedNodes: Array<Object>, blockedIds: Set<String>}|null}
     */
    static findComputedFocusContradiction(options) {
        return findRouteFocusContradiction(options)
    }

    /**
     * @summary Delegates the computed-route contradiction diagnostic to `computedGoldenPathRouting.mjs`.
     * @param {Object} options
     * @param {Object} options.contradiction Result from `findComputedFocusContradiction`.
     * @param {Object} [options.stats={}] Candidate-count diagnostics for the current pass.
     * @param {Date|String} [options.capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathContradictionSection(options) {
        return renderRouteContradictionSection(options)
    }

    /**
     * @summary Maps a routing-guard contradiction into route-attribution ledger records — one per blocked
     * computed candidate. `armingReasons` are ONLY the reasons that actually armed the guard (via the shared
     * getRoutingConflictReasons authority), so incidental co-reasons (fresh-updated / agent-os) are never
     * mis-attributed as causes; `candidateReasons` keeps the full diagnostic set separately. Pure (no I/O, no
     * config read): the caller persists the result. Reasons are unioned across the armed Current Focus
     * candidates (all blocked nodes in one contradiction share the live focus context); exclusion labels are
     * per-node via the shared actionability contract.
     * @param {{blockedNodes: Array<Object>, focusCandidates: Array<Object>}|null} focusContradiction Result from `findComputedFocusContradiction`.
     * @param {Number} nowMs Epoch ms stamped onto each record.
     * @returns {Object[]} `[{blockedNodeId, armingReasons, candidateReasons, exclusionLabels, at}]` (empty when no contradiction).
     */
    static buildRouteAttributionRecords(focusContradiction, nowMs) {
        if (!focusContradiction) return [];

        const blockedNodes     = Array.isArray(focusContradiction.blockedNodes)    ? focusContradiction.blockedNodes    : [],
              focusCandidates  = Array.isArray(focusContradiction.focusCandidates) ? focusContradiction.focusCandidates : [],
              armingReasons    = [...new Set(focusCandidates.flatMap(candidate => getRouteConflictReasons(candidate)))],
              candidateReasons = [...new Set(focusCandidates.flatMap(candidate => Array.isArray(candidate.reasons) ? candidate.reasons : []))];

        return blockedNodes
            .filter(item => item?.node?.id)
            .map(item => ({
                armingReasons,
                blockedNodeId  : item.node.id,
                candidateReasons,
                exclusionLabels: getRouteExclusionLabels(item.node),
                at             : nowMs
            }))
    }

    /**
     * @summary The route-attribution record-seam: persists which computed candidates the routing guard filtered,
     * under which arming reasons, per synthesis run. FAIL-OPEN — a ledger-write failure (bad config/dir, I/O
     * error) is swallowed-logged and never aborts synthesis (the ledger is observability, never a gate); a
     * missing/empty `dir` is a silent no-op. The ledger directory + retention are supplied by the caller (the
     * synthesis boundary reads the resolved AiConfig leaves at its use site), which keeps this method a testable
     * seam (a per-test temporary dir) with no config-SSOT read of its own; retention is validated here before it
     * reaches the pure store helper.
     * @param {{blockedNodes: Array<Object>, focusCandidates: Array<Object>}|null} focusContradiction Result from `findComputedFocusContradiction`.
     * @param {Date|Number} now The synthesis-pass clock (Date or epoch ms).
     * @param {Object} [ledger] The resolved ledger boundary (from the caller's AiConfig read).
     * @param {String} [ledger.dir] The runtime ledger directory; absent/empty → no-op.
     * @param {Number} [ledger.maxEvents] Retention cap (validated here).
     * @param {Number} [ledger.triggerBytes] Prune byte-trigger (validated here).
     * @returns {Promise<void>}
     */
    static async recordRouteAttribution(focusContradiction, now, {dir, maxEvents, triggerBytes} = {}) {
        const nowMs   = now instanceof Date ? now.getTime() : now,
              records = this.buildRouteAttributionRecords(focusContradiction, Number.isFinite(nowMs) ? nowMs : null);

        if (records.length === 0) return;

        try {
            if (typeof dir !== 'string' || dir.length === 0) return;

            const retention = validateRouteAttributionRetention(maxEvents, triggerBytes);

            for (const record of records) {
                await appendRouteAttribution(record, {dir, ...retention})
            }
        } catch (error) {
            logger.warn(`[GoldenPathSynthesizer] route-attribution ledger write failed (non-fatal): ${error?.message || error}`)
        }
    }

    /**
     * @summary Delegates stale frontier GUIDE-edge pruning to `frontierConsolidation.mjs`.
     * @param {Object} [options]
     * @param {Object} [options.graphService=GraphService] Graph service instance.
     * @param {Set<String>} [options.currentTargetIds=new Set()] Current computed target ids.
     * @returns {Number} Count of stale guide edges removed.
     */
    static pruneStaleFrontierGuideEdges(options) {
        return pruneFrontierGuideEdges(options)
    }

    /**
     * @summary Delegates the empty-pass Computed Golden Path diagnostic to `computedGoldenPathRouting.mjs`.
     * @param {Object} [stats={}] Candidate-count diagnostics for the current pass.
     * @param {Date|String} [capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathEmptySection(stats, capturedAt) {
        return renderRouteEmptySection(stats, capturedAt)
    }

    /**
     * @summary Frontier-empty declared-intent fallback (ticket-ref-ok: #14659 owning-leaf anchor): when the
     * semantic route is empty, gather actionable UNBLOCKED open `ISSUE` nodes, rank them by declared intent
     * (open-epic membership x parent activity, recency), and render the provenance-led section. Returns `''`
     * when nothing qualifies, so the caller renders the normal empty section. Read-only + additive — it
     * cannot zero or gate the base route; it only fires when the route already produced nothing.
     * @param {Object} [remState={}] Measured REM pipeline state (`{undigested, digested, recentCycles}`)
     *   from `HealthService.getRemPipelineState()`, fetched by the async caller; feeds the honest cause
     *   classification. A missing/partial object degrades to the `UNATTRIBUTED` phrase (never a guessed cause).
     * @returns {String}
     */
    static buildDeclaredIntentFallback(remState = {}) {
        const sqliteDb = GraphService.db?.storage?.db;
        if (!sqliteDb) return '';

        // Fully SQLite-sourced — cold-cache correct BY CONSTRUCTION. The in-memory node/edge stores are
        // lazy, so this fallback (which exists to rescue exactly the cold cache) reads open issues, their
        // inbound edges, and neighbor (parent-epic / blocker) states straight from the SQLite source of
        // truth — never from a possibly-unhydrated `nodes.get` / `getByIndex` (per cross-family review).
        // Bounded rescue: cap to the most-recent candidates so the per-item edge/state reads below can never
        // blow the scheduling budget when the repo has hundreds of open issues (the frontier-empty fallback
        // fires exactly when the backlog is large). The "~80 fat tickets" scenario is recent, and recency is
        // the ranking tiebreak, so a recent-N cap keeps the surfaced tree leaves correct while bounding cost.
        const FALLBACK_CANDIDATE_CAP = 250;

        let openIssues, inboundStmt, stateStmt;
        try {
            openIssues  = sqliteDb.prepare(`
                SELECT n.id, n.data FROM Nodes n
                WHERE n.id LIKE 'issue-%'
                  AND (json_extract(n.data, '$.properties.state') = 'OPEN' OR json_extract(n.data, '$.state') = 'OPEN')
                ORDER BY json_extract(n.data, '$.properties.createdAt') DESC
                LIMIT ${FALLBACK_CANDIDATE_CAP}
            `).all();
            inboundStmt = sqliteDb.prepare(`SELECT source, type FROM Edges WHERE target = ?`);
            stateStmt   = sqliteDb.prepare(`SELECT json_extract(data, '$.properties.state') AS s1, json_extract(data, '$.state') AS s2 FROM Nodes WHERE id = ?`);
        } catch (error) {
            return '';
        }

        const isOpenNode = nodeId => {
            const row = stateStmt.get(nodeId);
            return !!row && (row.s1 === 'OPEN' || row.s2 === 'OPEN');
        };

        const items = [];

        for (const {id, data} of openIssues) {
            let nodeData;
            try { nodeData = JSON.parse(data); } catch (error) { continue; }
            if (!this.isActionableComputedRecommendation(nodeData)) continue;

            const inbound    = inboundStmt.all(id),
                  blocked    = inbound.some(e => e.type === 'BLOCKS' && isOpenNode(e.source)),
                  parentEdge = inbound.find(e => e.type === 'PARENT_OF'),
                  inOpenEpic = !!(parentEdge && isOpenNode(parentEdge.source));

            // Open-epic TREE leaves only (the AC): a standalone open issue is not a tree leaf, so an
            // all-standalone empty pass still renders the normal empty section.
            if (!inOpenEpic) continue;

            items.push({
                id          : String(id).replace(/^issue-/, ''),
                inOpenEpic,
                epicActivity: getIssueFocusStructuralWeight(parentEdge.source),
                blocked,
                filedAt     : nodeData.properties?.createdAt || nodeData.properties?.filedAt || null
            });
        }

        // Attribute the MEASURED frontier-empty cause (honest-states) from the caller-supplied REM
        // pipeline state. get_rem_pipeline_state is an operator-facing DIAGNOSTIC envelope: a failed axis
        // projects a fallback 0 / [] plus an `axisErrors` marker. Those sentinels must NOT become asserted
        // GP causes — a failed axis reads as unknown (undefined) so the classifier degrades to UNATTRIBUTED
        // rather than a confident COLD_START / REM_STALLED from a fallback value.
        const axisErrors = remState.axisErrors || {};
        const cause      = classifyFrontierEmptyCause({
            digested        : axisErrors.digested     ? undefined : remState.digested,
            undigested      : axisErrors.undigested   ? undefined : remState.undigested,
            recentCycleCount: axisErrors.recentCycles ? undefined
                               : (Array.isArray(remState.recentCycles) ? remState.recentCycles.length : undefined),
            frontierAnchorEmpty: true
        });

        return renderDeclaredIntentFallback(rankByDeclaredIntent(items), aiConfig.goldenPathTopNodeRenderLimit, cause);
    }

    /**
     * @summary Delegates Golden Path failure-outcome shaping to `computedGoldenPathRouting.mjs`.
     * @param {String} reasonCode Stable machine-readable failure reason.
     * @param {*} error Error object or message payload.
     * @param {Object} [extra={}] Additional diagnostics for downstream task-state / health surfaces.
     * @returns {{status: String, reasonCode: String, error: String}} Failure outcome.
     */
    static buildFailureOutcome(reasonCode, error, extra) {
        return buildRouteFailureOutcome(reasonCode, error, extra)
    }

    /**
     * @summary Delegates the fail-loud Computed Golden Path section to `computedGoldenPathRouting.mjs`.
     * @param {Object} options
     * @param {Object} options.failure Failure outcome from `buildFailureOutcome()`.
     * @param {Object} [options.stats={}] Candidate-count diagnostics for the current pass.
     * @param {Date|String} [options.capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathFailureSection(options) {
        return renderRouteFailureSection(options)
    }

    /**
     * @summary Scores one synced issue as a current release / incident focus candidate.
     *
     * This is deliberately a local-sync signal, not graph-centrality routing. It
     * gives the handoff a deterministic "what is hot now" section even when the
     * graph has not accumulated edges for a same-day regression or release ticket.
     *
     * @param {Object} options
     * @param {Object} options.meta Issue frontmatter.
     * @param {String} [options.content=''] Markdown body without frontmatter.
     * @param {Date} [options.now=new Date()] Current clock.
     * @param {Number} [options.windowMs=CURRENT_FOCUS_WINDOW_MS] Freshness window.
     * @returns {Object|null}
     */
    static scoreCurrentFocusIssue(options) {
        return scoreIssueFocusCurrentIssue(options)
    }

    /**
     * @summary Delegates current release / incident focus candidate building to the helper module.
     * @param {Object} options
     * @param {String} options.issuesDir Local synced issue directory.
     * @param {Date} [options.now=new Date()] Current clock for deterministic tests.
     * @param {Number} [options.windowMs=CURRENT_FOCUS_WINDOW_MS] Freshness window.
     * @returns {Array<Object>} Candidates sorted by score, freshness, then issue number.
     */
    static buildCurrentFocusCandidates(options) {
        return buildIssueFocusCurrentFocusCandidates(options)
    }

    /**
     * @summary Delegates current release / incident focus rendering to the helper module.
     * @param {Array<Object>} candidates Current focus candidates.
     * @param {Object} options
     * @param {Date} [options.capturedAt=new Date()] Capture timestamp.
     * @param {Number} [options.limit=5] Maximum candidates to render.
     * @returns {String}
     */
    static renderCurrentFocusCandidatesSection(candidates, options = {}) {
        return renderIssueFocusCurrentFocusCandidatesSection(candidates, options)
    }

    /**
     * @summary Delegates PR-body `Authored by …` self-id login parsing to `agentFamilyResolution.mjs`.
     * @param {String} body
     * @returns {(String|null)}
     */
    static parseSelfIdLogin(body) {
        return parsePrSelfIdLogin(body)
    }

    /**
     * @summary Delegates PR author model-family resolution to `agentFamilyResolution.mjs`.
     * @param {Object} pr GitHub PR payload (`author`, `body`, `number`).
     * @param {Object} agentFamilies Login-to-family map (`@`-stripped logins).
     * @returns {(String|undefined)}
     */
    static resolveAuthorFamily(pr, agentFamilies) {
        return resolvePrAuthorFamily(pr, agentFamilies)
    }

    /**
     * @summary Delegates PR cross-family review-coverage detection to `agentFamilyResolution.mjs`.
     * @param {Object} pr GitHub PR payload from `gh pr list`.
     * @param {Object} [agentFamilies] Login-to-family map.
     * @returns {Boolean}
     */
    static hasCrossFamilyReview(pr, agentFamilies) {
        return resolvePrCrossFamilyReview(pr, agentFamilies)
    }

    /**
     * @summary Delegates the recent-open-PR summary to `activePrCycleSection.mjs`.
     * @param {Object[]} prs GitHub PR payloads.
     * @param {Object} [options]
     * @param {Number} [options.limit=aiConfig.goldenPathRecentOpenPrRenderLimit] Maximum PRs to render.
     * @returns {String}
     */
    static renderRecentOpenPrSummary(prs, options) {
        return renderRecentOpenPrSummarySection(prs, options)
    }

    /**
     * @summary Delegates Active PR Cycle freshness status to `activePrCycleSection.mjs`.
     * @param {Object} options
     * @param {Date|String} options.capturedAt Snapshot timestamp.
     * @param {Date|String} options.now Freshness comparison timestamp.
     * @param {Number} options.freshnessMs Freshness SLA in milliseconds.
     * @returns {String}
     */
    static getActivePrCycleStatus(options) {
        return resolveActivePrCycleStatus(options)
    }

    /**
     * @summary Delegates the Active PR Cycle State section to `activePrCycleSection.mjs`.
     * @param {Object} [options] See `activePrCycleSection.renderActivePrCycleState`.
     * @returns {String}
     */
    static renderActivePrCycleState(options) {
        return renderActivePrCycleStateSection(options)
    }

    /**
     * @summary Delegates the degraded Strategic Interpretation reason to `activePrCycleSection.mjs`.
     * @param {Object} options
     * @param {String} options.reasonCode Stable machine-readable degradation reason.
     * @param {String} [options.error=''] Sanitized provider or parser error.
     * @returns {String}
     */
    static renderStrategicInterpretationDegradedReason(options) {
        return renderStrategicDegradedReason(options)
    }

    /**
     * @summary Delegates Golden Path capture-timestamp formatting to the shared helper module.
     *
     * @param {Date|String} capturedAt Capture timestamp.
     * @returns {String}
     */
    static formatGoldenPathCapturedAt(capturedAt) {
        return formatGoldenPathTimestamp(capturedAt)
    }

    /**
     * Synthesizes the Golden Path (strategic priorities) deterministically by analyzing Graph topology
     * combined with Vector Similarity (Hybrid GraphRAG).
     *
     * @summary Anchor & Echo: Priority weighting relies strictly on the organic Hebbian decay curve.
     * We avoid hardcoded multiplier bonuses (e.g., for PRs) to prevent zeroing out the natural
     * physics simulation of the queue. Task state is queried via both `$.properties.state` and
     * `$.state` to ensure reliable `OPEN` detection across varying JSON schemas.
     */
    async fetchOpenPRs() {
        const { execSync } = await import('child_process');
        const rawPrData    = execSync('gh pr list --state open --json number,url,author,title,body,headRefOid,reviewRequests,reviews,comments,createdAt,updatedAt,isDraft', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return JSON.parse(rawPrData);
    }

    /**
     * @summary Fetches PRs merged within a window — the highest-signal "what happened" fact class
     * for the handoff retrospective. Bounded by a `merged:>ISO` search so the query stays small.
     * @param {Date} since Lower window bound.
     * @returns {Promise<Array<{number: Number, title: String, mergedAt: String}>>}
     */
    async fetchRecentMergedPRs(since) {
        const { execSync } = await import('child_process');
        const sinceDate    = since.toISOString().slice(0, 10); // gh search granularity is day-level
        const raw          = execSync(`gh pr list --state merged --search "merged:>=${sinceDate}" --json number,title,mergedAt --limit 50`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return JSON.parse(raw);
    }

    /**
     * @summary Fetches issues closed within a window — the same bounded day-granularity search
     * pattern as the merged-PR reader; one fact class of the retrospective's declared coverage.
     * @param {Date} since Lower window bound.
     * @returns {Promise<Array<{number: Number, title: String, closedAt: String}>>}
     */
    async fetchRecentClosedIssues(since) {
        const { execSync } = await import('child_process');
        const sinceDate    = since.toISOString().slice(0, 10);
        const raw          = execSync(`gh issue list --state closed --search "closed:>=${sinceDate}" --json number,title,closedAt --limit 50`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return JSON.parse(raw);
    }

    /**
     * @summary Fetches issues opened within a window — the opened-side sibling of the closed reader.
     * @param {Date} since Lower window bound.
     * @returns {Promise<Array<{number: Number, title: String, createdAt: String}>>}
     */
    async fetchRecentOpenedIssues(since) {
        const { execSync } = await import('child_process');
        const sinceDate    = since.toISOString().slice(0, 10);
        const raw          = execSync(`gh issue list --state all --search "created:>=${sinceDate}" --json number,title,createdAt --limit 50`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return JSON.parse(raw);
    }

    /**
     * @summary Reads sessions recorded within a window from the summary collection already in
     * scope — metadata-only (no document bodies), using the same multi-key timestamp resolution
     * as the recency-ordered summary reads. Returns retrospective fact shapes.
     * @param {Object} collection Summary Chroma collection (exposes async `.get`).
     * @param {Date} since Lower window bound.
     * @returns {Promise<Array<{ref: String, headline: String, at: String}>>}
     */
    async fetchRecentSessions(collection, since) {
        const meta      = await collection.get({include: ['metadatas']});
        const resolveTs = m => {
            const raw = m?.timestamp ?? m?.lastActivity ?? m?.updatedAt ?? m?.createdAt;
            return Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw) || 0);
        };
        const sinceMs = since.getTime();

        return (meta?.ids || [])
            .map((id, idx) => ({id, ts: resolveTs(meta.metadatas?.[idx]), agent: meta.metadatas?.[idx]?.agent}))
            .filter(entry => entry.ts >= sinceMs)
            .sort((a, b) => b.ts - a.ts)
            .map(entry => ({
                ref     : `session ${String(entry.id).slice(0, 8)}`,
                headline: entry.agent ? `session (${entry.agent})` : 'session recorded',
                at      : new Date(entry.ts).toISOString()
            }));
    }

    /**
     * @summary Fetches Discussions graduated within a window — the last retrospective fact class.
     * Graduations are Discussion closures carrying a graduation marker in their comments, and
     * `gh search` does not cover Discussions, so this uses a bounded recency-ordered closed-Discussion
     * GraphQL query and detects the marker vocabulary. Best-effort, like every sibling reader.
     * @param {Date} since Lower window bound.
     * @returns {Promise<Array<{ref: String, headline: String, at: String}>>}
     */
    async fetchRecentGraduations(since) {
        const { execSync }       = await import('child_process');
        const query              = 'query($owner:String!,$name:String!){repository(owner:$owner,name:$name){discussions(first:50,states:CLOSED,orderBy:{field:UPDATED_AT,direction:DESC}){nodes{number title closedAt comments(last:25){nodes{body}}}}}}';
        const raw                = execSync(`gh api graphql -f owner=neomjs -f name=neo -f query='${query}'`, {encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore']});
        const nodes              = JSON.parse(raw)?.data?.repository?.discussions?.nodes || [];
        const sinceMs            = since.getTime();
        const GRADUATION_MARKERS = ['[GRADUATED_TO_TICKET]', '[RESOLVED_TO_AC]'];

        return nodes
            .filter(node => node?.closedAt && Date.parse(node.closedAt) >= sinceMs)
            .filter(node => (node.comments?.nodes || []).some(c => GRADUATION_MARKERS.some(m => (c?.body || '').includes(m))))
            .map(node => ({ref: `discussion #${node.number}`, headline: node.title, at: node.closedAt}));
    }

    /**
     * @summary Assembles + renders the handoff retrospective section (the history leg) from window
     * facts. Static + pure over its inputs: the assembler folds, the render emits — this shim is
     * the synthesizer's stable seam to both, mirroring the computed-GP render shims.
     * @param {Object} options
     * @param {Object} options.facts `{mergedPrs, openedPrs, closedIssues, openedIssues, graduations, sessions}`
     * @param {Object} [options.grain=RETROSPECTIVE_GRAINS.THREE_DAY] Retrospective grain
     * @param {Date|String} [options.now=new Date()] Window anchor
     * @param {String|String[]} [options.filterSets=[]] Declared filter set(s) the facts were gathered under
     * @returns {String} Markdown section
     */
    static renderHandoffRetrospectiveSection({facts, grain = RETROSPECTIVE_GRAINS.THREE_DAY, now = new Date(), filterSets = []} = {}) {
        const stats = assembleRetrospectiveStats({facts, grain, now, filterSets});

        return renderHandoffRetrospectiveSection({grain, stats, capturedAt: now})
    }

    /**
     * @summary Delegates recency-ordered summary reads to `frontierConsolidation.mjs`.
     * @param {Object} collection Summary Chroma collection (exposes async `.get`).
     * @param {Number} n Number of most-recent summaries to return.
     * @returns {Promise<{documents: String[]}>}
     */
    static getRecentSummaryDocuments(collection, n) {
        return resolveRecentSummaryDocuments(collection, n)
    }

    /**
     * @summary Delegates the Consolidation Gaps section to `frontierConsolidation.mjs`.
     * @param {Object} summaryColl Summary Chroma collection (exposes async `.get`).
     * @param {Object} [options]
     * @param {Number} [options.limit=5] Max undigested sessions to sample.
     * @returns {Promise<String>}
     */
    static renderConsolidationGapsSection(summaryColl, options) {
        return renderConsolidationGaps(summaryColl, options)
    }

    /**
     * @summary Delegates Sandman-v2 concept-slice construction to `conceptSliceBuilder.mjs`.
     * @param {Object} options See `conceptSliceBuilder.buildConceptSlice`.
     * @returns {Object}
     */
    static buildConceptSlice(options = {}) {
        return buildGraphConceptSlice(options)
    }

    /**
     * @summary Delegates concept-slice markdown rendering to `conceptSliceBuilder.mjs`.
     * @param {Object} slice Concept-slice render tree.
     * @returns {String}
     */
    static renderConceptSliceSection(slice = {}) {
        return renderGraphConceptSliceSection(slice)
    }

    /**
     * @summary Builds and renders the concept slice while preserving handoff generation on failure.
     * @param {Object} options See `conceptSliceBuilder.renderConceptSliceHandoffSection`.
     * @returns {String}
     */
    static renderConceptSliceHandoffSection(options = {}) {
        return renderGraphConceptSliceHandoffSection(options)
    }

    async synthesizeGoldenPath({
        repoEnrichmentEnabled = true,
        issuesDir = path.resolve(__dirname, '../../../resources/content/issues'),
        now = new Date()
    } = {}) {
        logger.info('[GoldenPathSynthesizer] Initializing Hybrid GraphRAG Strategic Traversal...');

        let graphColl   = null;
        let summaryColl = null;
        try {
            graphColl = await StorageRouter.getGraphCollection();
            summaryColl = await StorageRouter.getSummaryCollection();
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] StorageRouter unavailable. Skipping Golden Path extraction.');
            return this.constructor.buildFailureOutcome('storage-router-unavailable', e);
        }

        if (!graphColl || !summaryColl) {
            logger.warn('[GoldenPathSynthesizer] Collections missing. Skipping Golden Path extraction.');
            return this.constructor.buildFailureOutcome('collections-missing', 'graph or summary collection missing');
        }

        // Generate the Frontier Baseline Vector from the N MOST-RECENT session summaries.
        // (Was `summaryColl.get({limit:2})` — storage-order, not recency — which anchored the frontier
        // to arbitrary/old summaries so recent work never ranked into the candidate pool.)
        let frontierEmbedding = null;
        try {
            const recent = await this.constructor.getRecentSummaryDocuments(summaryColl, 2);

            let frontierText = "Neo.mjs Active Strategic Context: ";
            if (recent && recent.documents && recent.documents.length > 0) {
                frontierText += recent.documents.join("\n\n");
            } else {
                frontierText += "Initialization and Stabilization.";
            }

            logger.debug('[GoldenPathSynthesizer] Computing Frontier Baseline Vector...');
            frontierEmbedding = await TextEmbeddingService.embedText(frontierText, aiConfig.embeddingProvider);
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Failed to generate Frontier Baseline Vector. Aborting Hybrid route.', e);
            return this.constructor.buildFailureOutcome('frontier-embedding-failed', e);
        }

        const actualDimension     = getEmbeddingVectorLength(frontierEmbedding);
        const configuredDimension = Number(aiConfig.vectorDimension);

        if (!Number.isInteger(actualDimension) ||
            !Number.isInteger(configuredDimension) ||
            configuredDimension <= 0 ||
            actualDimension !== configuredDimension) {
            const provider = aiConfig.embeddingProvider;
            const model    = getEmbeddingModelName(aiConfig, provider);

            const message = buildEmbeddingDimensionMismatchMessage({
                provider,
                model,
                configuredDimension,
                actualDimension
            });

            logger.warn(message);
            return this.constructor.buildFailureOutcome('embedding-dimension-mismatch', message);
        }

        const scoredNodes  = [];
        const scoringStats = {
            semanticCandidates     : 0,
            sqliteOpenMatches      : 0,
            blockedCandidates      : 0,
            nonActionableCandidates: 0,
            scoredCandidates       : 0,
            selectedTopNodes       : 0,
            prunedGuideEdges       : 0
        };
        let routeFailure = null;

        // Pillar 1: Semantic Distance from ChromaDB
        let semanticIds       = [];
        let semanticDistances = [];
        try {
            const semanticResults = await graphColl.query({
                queryEmbeddings: [frontierEmbedding],
                nResults       : 20,
                // Scope the candidate pool to actionable ISSUE + DISCUSSION vectors. Without this, the
                // top-20 is taken across ALL embedded node types (the CONCEPT + ADR/GUIDES meta dominate),
                // so the downstream state='OPEN' intersection yields nothing and the Computed Golden Path
                // renders empty even when fresh open issues/discussions exist. Both are execution-steerable
                // (work-to-do / converge-to-drive) and both embed with state='OPEN' metadata (IssueIngestor).
                where          : {type: {'$in': ['ISSUE', 'DISCUSSION']}}
            });
            if (semanticResults && semanticResults.ids && semanticResults.ids.length > 0) {
                semanticIds = semanticResults.ids[0];
                semanticDistances = semanticResults.distances ? semanticResults.distances[0] : new Array(semanticIds.length).fill(0.1);
            }
        } catch (e) {
            logger.warn('[GoldenPathSynthesizer] Failed to query semantic vectors from ChromaDB.', e);
            routeFailure = this.constructor.buildFailureOutcome('semantic-query-failed', e);
        }

        if (semanticIds.length === 0) {
            logger.info('[GoldenPathSynthesizer] No semantic nodes found. Golden path empty.');
        }
        scoringStats.semanticCandidates = semanticIds.length;

        // Pillar 2: Structural Weight from SQLite Graph
        const SEMANTIC_WEIGHT   = 2.0;
        const STRUCTURAL_WEIGHT = 1.0;

        if (semanticIds.length > 0 && !routeFailure) {
            try {
                const placeholders = semanticIds.map(() => '?').join(',');
                const stmt         = GraphService.db.storage.db.prepare(`
                    SELECT
                        n.id,
                        n.data,
                        COALESCE((
                            SELECT SUM(json_extract(e.data, '$.properties.weight'))
                            FROM Edges e
                            WHERE e.target = n.id AND e.type != 'BLOCKS'
                        ), 0.0) as struct_score
                    FROM Nodes n
                    WHERE (json_extract(n.data, '$.properties.state') = 'OPEN' OR json_extract(n.data, '$.state') = 'OPEN')
                      AND n.id IN (${placeholders})
                `);

                const results = stmt.all(...semanticIds);
                scoringStats.sqliteOpenMatches = results.length;

                for (const row of results) {
                    const issueId = row.id;

                    // Guarantee graph topology is completely loaded into RAM BEFORE executing cold-cache resistant queries natively!
                    GraphService.db.getAdjacentNodes(issueId, 'both');
                    const rawStructScore = parseFloat(row.struct_score) || 0;

                    // #14659 fail-open parent-inheritance (ticket-ref-ok: owning-leaf anchor): a cold-start (~0)
                    // leaf inherits alpha * its parent-epic structural weight, so tree-filed leaves are visible to
                    // the normal formula, not just the fallback. Non-cold-start scores pass through untouched, so
                    // the base route is preserved. Reuses the verified getIssueStructuralWeight query for the parent.
                    let struct_score = rawStructScore;
                    if (rawStructScore <= STRUCTURAL_COLD_START_EPSILON) {
                        const parentEdge = GraphService.db.edges.getByIndex('target', issueId).find(e => e.type === 'PARENT_OF');
                        if (parentEdge) {
                            struct_score = inheritParentStructuralWeight({
                                structuralWeight      : rawStructScore,
                                parentStructuralWeight: getIssueFocusStructuralWeight(parentEdge.source)
                            });
                        }
                    }

                    let nodeData = null;
                    try { nodeData = JSON.parse(row.data); } catch (e) { }

                    // Re-verify blocker topology natively using GraphService API
                    const blockers       = GraphService.db.edges.getByIndex('target', issueId).filter(e => e.type === 'BLOCKS');
                    const openBlockerIds = [];
                    let   isBlocked      = false;

                    for (const bEdge of blockers) {
                        const blockerNode = GraphService.db.nodes.get(bEdge.source);
                        if (blockerNode && (blockerNode.properties?.state === 'OPEN' || blockerNode.state === 'OPEN')) {
                            isBlocked = true;
                            openBlockerIds.push(bEdge.source);
                            break;
                        }
                    }

                    if (isBlocked) {
                        scoringStats.blockedCandidates++;
                        continue; // Architecturally blocked issues cannot be Golden
                    }

                    const idx               = semanticIds.indexOf(issueId);
                    const semantic_distance = parseFloat(semanticDistances[idx]) || 0.1;

                    // Lower distance = Higher significance. (Add 0.1 to avoid div by 0 and curb massive asymptotes)
                    const semanticScore = 1.0 / (semantic_distance + 0.1);

                    const priority = (semanticScore * SEMANTIC_WEIGHT) + (struct_score * STRUCTURAL_WEIGHT);

                    if (!this.constructor.isActionableComputedRecommendation(nodeData || {id: issueId})) {
                        scoringStats.nonActionableCandidates++;
                        logger.debug(`[GoldenPathSynthesizer] Skipping non-actionable computed recommendation: ${issueId}`);
                        continue;
                    }

                    scoredNodes.push({
                        node      : nodeData || { id: issueId },
                        score     : priority,
                        semantic  : semanticScore,
                        structural: struct_score
                    });
                }
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Error executing hybrid mapping across local Graph Store.', e);
                routeFailure = this.constructor.buildFailureOutcome('graph-store-mapping-failed', e);
            }
        }

        // Sort descending by calculated priority
        scoredNodes.sort((a, b) => b.score - a.score);

        // Remove mathematically rejected targets (Negative ROI), then slice
        const topNodes = routeFailure ? [] : scoredNodes.filter(n => n.score > -5000).slice(0, aiConfig.goldenPathTopNodeRenderLimit);

        let currentFocusCandidates = [];
        if (repoEnrichmentEnabled) {
            try {
                currentFocusCandidates = this.constructor.buildCurrentFocusCandidates({
                    issuesDir,
                    now
                });
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Current Release / Incident Focus', e);
            }
        }

        const focusContradiction = this.constructor.findComputedFocusContradiction({
            currentFocusCandidates,
            topNodes
        });
        const routedTopNodes = focusContradiction
            ? topNodes.filter(item => !focusContradiction.blockedIds.has(item.node.id))
            : topNodes;
        const goldenIds = new Set(routedTopNodes.map(item => item.node.id));
        scoringStats.scoredCandidates = scoredNodes.length;
        scoringStats.selectedTopNodes = routedTopNodes.length;
        scoringStats.prunedGuideEdges = this.constructor.pruneStaleFrontierGuideEdges({
            currentTargetIds: goldenIds
        });

        // Record which computed candidates the routing guard filtered — covers BOTH the partial-block branch
        // (some survived) and the no-survivor branch — into the route-attribution ledger. Fail-open inside the
        // method; never gates synthesis. This is the live record-seam the one-shot measurement dataset snapshotted.
        if (focusContradiction) {
            await this.constructor.recordRouteAttribution(focusContradiction, now, {
                dir         : aiConfig.goldenPathRouteAttributionLedgerDir,
                maxEvents   : aiConfig.goldenPathRouteAttributionLedgerMaxEvents,
                triggerBytes: aiConfig.goldenPathRouteAttributionLedgerPruneTriggerBytes
            })
        }

        const handoffTimestamp = now instanceof Date ? now : new Date(now);
        let   markdownAppend   = '';

        if (routeFailure) {
            markdownAppend = this.constructor.renderComputedGoldenPathFailureSection({
                capturedAt: handoffTimestamp,
                failure   : routeFailure,
                stats     : scoringStats
            });
            logger.warn(`[GoldenPathSynthesizer] Golden Path route failed loud: ${routeFailure.reasonCode} — rendered degraded handoff section.`);
        } else if (routedTopNodes.length > 0) {
            logger.info(`[GoldenPathSynthesizer] Top Issue 1 (${routedTopNodes[0].node.id}): Priority ${routedTopNodes[0].score.toFixed(2)} [Sem: ${routedTopNodes[0].semantic.toFixed(2)} / Struc: ${routedTopNodes[0].structural.toFixed(2)}]`);

            // Explicitly anchor this to the frontier context so the Agent NEVER loses sight of it
            markdownAppend = `\n## Computed Golden Path (Strategic Recommendation)\n\n`;
            markdownAppend += `Captured at: ${this.constructor.formatGoldenPathCapturedAt(handoffTimestamp)}\n\n`;
            markdownAppend += `Based on the latest Tri-Vector Synthesis and Topological Priorities, the following tasks are mathematically recommended as the next immediate focus:\n\n`;

            routedTopNodes.forEach((item, index) => {
                if (item.node && item.node.id) {
                    GraphService.linkNodes('frontier', item.node.id, 'GUIDES', item.score);
                    const title = item.node.properties?.title || item.node.properties?.name || item.node.name || 'Unknown Title';
                    markdownAppend += `${index + 1}. **${item.node.id}**: Score ${item.score.toFixed(2)} (Semantic: ${item.semantic.toFixed(2)}, Structural: ${item.structural.toFixed(2)})\n   - *${title}*\n`;
                }
            });

            if (focusContradiction) {
                const blockedRefs = focusContradiction.blockedNodes.map(item => item.node.id).join(', ');
                markdownAppend += `\n> **Routing Guard:** Filtered content/narrative computed candidate(s) ${blockedRefs} because live Current Release / Incident Focus would make them contradictory immediate routes.\n\n`;
            }

            let strategicBrief                    = '',
                strategicInterpretationReasonCode = 'strategic-brief-missing',
                strategicInterpretationError      = '';

            try {
                const graphProvider = resolveGraphModelProvider(aiConfig);
                logger.info(`[GoldenPathSynthesizer] Instantiating ${graphProvider} provider to interpret Mathematical Golden Path...`);
                const provider = buildGraphProvider({
                    modelProvider         : graphProvider,
                    ollamaConfig          : aiConfig.ollama,
                    openAiCompatibleConfig: aiConfig.openAiCompatible
                });

                // Get adjacent frontier topology for context
                const frontierTopology = GraphService.getContextFrontier({ depth: 1 });

                const interpretPrompt = `
You are the Neo.mjs Strategic Steering Engine.
The mathematical engine has evaluated the codebase and determined the following top priority features based on semantic and structural weight:

${markdownAppend}

Active Topological Context Frontier:
${JSON.stringify(frontierTopology, null, 2)}

Synthesize a concise, 2-to-3 sentence Strategic Brief for the development agent explaining exactly *why* these tasks are the current structural priority given the active frontier, and how the agent should pivot.

Mandatory Schema:
{ "strategic_brief": "String (2-3 sentences)" }
DO NOT output markdown, \`\`\`json blocks, or any other explanations. Provide purely the JSON object.
`;

                const result = await provider.generate(interpretPrompt);

                const payload = Json.extract(result.content);
                if (payload && payload.strategic_brief) {
                    strategicBrief = payload.strategic_brief;
                    logger.info('[GoldenPathSynthesizer] Successfully appended semantic strategic brief to Golden Path.');
                } else {
                    strategicInterpretationReasonCode = 'strategic-brief-invalid-json';
                    strategicInterpretationError      = 'Provider output did not contain strategic_brief.';
                }
            } catch (e) {
                strategicInterpretationReasonCode = 'strategic-brief-provider-failed';
                strategicInterpretationError      = e instanceof Error ? e.message : String(e || strategicInterpretationReasonCode);
                logger.warn('[GoldenPathSynthesizer] Failed to generate semantic interpretation for Golden Path. Rendering degraded reason.', e);
            }

            if (!strategicBrief) {
                strategicBrief = this.constructor.renderStrategicInterpretationDegradedReason({
                    error     : strategicInterpretationError,
                    reasonCode: strategicInterpretationReasonCode
                });
            }

            markdownAppend += `\n> **Strategic Interpretation:**\n> ${strategicBrief}\n\n`;
        } else if (focusContradiction) {
            markdownAppend = this.constructor.renderComputedGoldenPathContradictionSection({
                capturedAt   : handoffTimestamp,
                contradiction: focusContradiction,
                renderLimit  : aiConfig.goldenPathTopNodeRenderLimit,
                stats        : scoringStats
            });
            logger.info('[GoldenPathSynthesizer] Computed route contradicted Current Focus; rendered diagnostic instead of routing content work.');
        } else {
            // Fetch measured REM pipeline state so the fallback attributes the real cause (REM_STALLED vs
            // FRONTIER_UNANCHORED); the async fetch lives here to keep the SQLite fallback builder sync.
            let remState = {};
            try {
                const {default: HealthService} = await import('../../services/memory-core/HealthService.mjs');
                remState = await HealthService.getRemPipelineState();
            } catch (error) {
                logger.warn(`[GoldenPathSynthesizer] REM pipeline state unavailable for fallback cause: ${error.message}`);
            }
            const declaredIntentFallback = this.constructor.buildDeclaredIntentFallback(remState);
            if (declaredIntentFallback) {
                markdownAppend = declaredIntentFallback;
                logger.info('[GoldenPathSynthesizer] Frontier empty — rendered declared-intent fallback (unblocked open-epic tree leaves).');
            } else {
                markdownAppend = this.constructor.renderComputedGoldenPathEmptySection(scoringStats, handoffTimestamp);
                logger.info('[GoldenPathSynthesizer] No actionable unblocked issues found. Golden path empty.');
            }
        }

        // Centralize full generation of sandman_handoff.md here, enforcing completely idempotent behavior.
        // TTL pruning and centralized overwrite happen in the same render pass.
        let handoffContent = `# Autonomous Handoff (Dream Pipeline & Golden Path)\n\n`;
        handoffContent += `The Native Edge Graph has audited the codebase structurally. The following architectural coverage gaps currently exist natively within the SQLite matrix.\n\n`;
        // The Concept Slice is Native-Edge-Graph analytics, not strategic handoff — capture it here and
        // write it to a sibling companion file below; it is never appended to the handoff itself.
        const conceptSliceSection = this.constructor.renderConceptSliceHandoffSection({
            capturedAt  : handoffTimestamp,
            graphService: GraphService,
            logger
        });

        const TTL_MS           = 7 * 24 * 60 * 60 * 1000; // 7 days TTL (Time-to-Live)
        const gapNow           = Date.now();
        let   gapElementsCount = 0;
        let   prunedGaps       = 0;

        let testGaps       = [];
        let guideGaps      = [];
        let exampleGaps    = [];
        let orphanConcepts = [];
        let reverifyDue    = [];
        let kbDemandGaps   = [];

        GraphService.db.nodes.items.forEach(node => {
            if (node.properties?.capabilityGap) {
                const age = gapNow - (node.properties.lastGapCheck || gapNow);
                if (age > TTL_MS) {
                    // Stale, prune it!
                    delete node.properties.capabilityGap;
                    GraphService.upsertNode(node);
                    prunedGaps++;
                } else {
                    try {
                        // Parse JSON encoded array if possible, otherwise fallback to traditional string
                        let gaps = [];
                        if (node.properties.capabilityGap.startsWith('[')) {
                            gaps = JSON.parse(node.properties.capabilityGap);
                        } else {
                            gaps = node.properties.capabilityGap.split(/\\n|\n/);
                        }
                        gaps = [...new Set(gaps)];
                        gaps.forEach(gapMessage => {
                            let msg = gapMessage.trim();
                            if (msg.length > 0) {
                                gapElementsCount++;
                                if (msg.includes('[TEST_GAP]')) {
                                    testGaps.push({ id: node.id, msg: msg.replace('[TEST_GAP]', '').trim() });
                                } else if (msg.includes('[GUIDE_GAP]')) {
                                    guideGaps.push({ id: node.id, msg: msg.replace('[GUIDE_GAP]', '').trim() });
                                } else if (msg.includes('[EXAMPLE_GAP]')) {
                                    exampleGaps.push({ id: node.id, msg: msg.replace('[EXAMPLE_GAP]', '').trim() });
                                } else if (msg.includes('[ORPHAN_CONCEPT]')) {
                                    orphanConcepts.push({ id: node.id, msg: msg.replace('[ORPHAN_CONCEPT]', '').trim() });
                                } else if (msg.includes('[CONCEPT_REVERIFY_DUE]')) {
                                    reverifyDue.push({ id: node.id, msg: msg.replace('[CONCEPT_REVERIFY_DUE]', '').trim() });
                                } else if (msg.includes('[KB_DEMAND_GAP]')) {
                                    kbDemandGaps.push({ id: node.id, msg: msg.replace('[KB_DEMAND_GAP]', '').trim() });
                                } else {
                                    // Fallback for unlabeled
                                    testGaps.push({ id: node.id, msg });
                                }
                            }
                        });
                    } catch (e) {
                         const sanitizedMessage = node.properties.capabilityGap.replace(/\\n/g, ' ').replace(/\\n/g, ' ');
                         testGaps.push({ id: node.id, msg: sanitizedMessage });
                         gapElementsCount++;
                    }
                }
            }
        });

        if (gapElementsCount === 0) {
            handoffContent += `*No architectural gaps detected at this time. Codebase is aligned with structural jsdocx graph expectations.*\n`;
        } else {
            const limit = 5;
            if (testGaps.length > 0) {
                handoffContent += `### 🧪 Critical Test Constraints (\`${Math.min(testGaps.length, limit)}\` of \`${testGaps.length}\` items)\n`;
                testGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (guideGaps.length > 0) {
                handoffContent += `### 🗺️ Guide Disconnects (\`${Math.min(guideGaps.length, limit)}\` of \`${guideGaps.length}\` items)\n`;
                guideGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (exampleGaps.length > 0) {
                handoffContent += `### 💡 Example Disconnects (\`${Math.min(exampleGaps.length, limit)}\` of \`${exampleGaps.length}\` items)\n`;
                exampleGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (orphanConcepts.length > 0) {
                handoffContent += `### ⚠️ Orphaned Concepts (\`${Math.min(orphanConcepts.length, limit)}\` of \`${orphanConcepts.length}\` items)\n`;
                orphanConcepts.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (reverifyDue.length > 0) {
                handoffContent += `### Concept Reverification Queue (\`${Math.min(reverifyDue.length, limit)}\` of \`${reverifyDue.length}\` items)\n`;
                reverifyDue.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
            if (kbDemandGaps.length > 0) {
                handoffContent += `### Agent FAQ Demand Gaps (\`${Math.min(kbDemandGaps.length, limit)}\` of \`${kbDemandGaps.length}\` items)\n`;
                kbDemandGaps.slice(0, limit).forEach(g => handoffContent += `- **\`${g.id}\`**: ${g.msg}\n`);
                handoffContent += `\n`;
            }
        }

        if (prunedGaps > 0) {
            logger.info(`[GoldenPathSynthesizer] TTL Pruning eradicated ${prunedGaps} stale Gaps from the Native Graph.`);
        }

        // --- Brain-Pillar Consumer-Friction Channel V1 (visibility-only) ---
        // Surface ConsumerFriction records emitted by upstream brain consumers (e.g.,
        // SemanticGraphExtractor, SessionService.summarizeSession) when substrate payloads
        // were the wrong shape for them (context-overflow, parse-failure, size-precheck-skip,
        // etc.). Visibility-only: no orchestrator routing changes; the section is
        // human/swarm-reading substrate so operators / peers can see consumer-side friction
        // and decide whether to adjust upstream emission (e.g. smaller summarization windows,
        // larger-context consumer choice).
        try {
            const {renderConsumerFrictionSection} = await import('../../services/memory-core/helpers/consumerFrictionHelper.mjs');
            const frictionSection                 = renderConsumerFrictionSection();

            if (frictionSection) {
                handoffContent += frictionSection + '\n';
            }
        } catch (err) {
            // Defensive: ConsumerFrictionHelper failure must not break handoff rendering.
            // Log + continue with the rest of the handoff content.
            logger.warn(`[GoldenPathSynthesizer] ConsumerFriction section render failed: ${err.message}`);
        }

        // --- Consolidation Gaps (consolidation-liveness: undigested sessions made visible) ---
        try {
            const gapsSection = await this.constructor.renderConsolidationGapsSection(summaryColl);
            if (gapsSection) {
                handoffContent += gapsSection;
            }
        } catch (e) {
            logger.warn(`[GoldenPathSynthesizer] Consolidation Gaps section render failed: ${e.message}`);
        }

        // --- Current Release / Incident Focus ---
        let currentFocusAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                currentFocusAppend = this.constructor.renderCurrentFocusCandidatesSection(currentFocusCandidates, {capturedAt: now instanceof Date ? now : new Date(now)});
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Current Release / Incident Focus', e);
            }
        }

        // --- Stale Assignment Candidates ---
        let staleAssignmentAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const Synthesizer     = this.constructor;
                const staleCandidates = Synthesizer.buildStaleAssignmentCandidates({
                    issuesDir,
                    now
                });

                staleAssignmentAppend = Synthesizer.renderStaleAssignmentCandidatesSection(staleCandidates, {capturedAt: now instanceof Date ? now : new Date(now)});
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Stale Assignment Candidates', e);
            }
        }

        // --- Silent Threads ---
        let silentThreadsAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const Synthesizer            = this.constructor;
                const silentThreadCandidates = Synthesizer.buildSilentThreadCandidates({
                    issuesDir,
                    now,
                    goldenIds
                });

                silentThreadsAppend = Synthesizer.renderSilentThreadCandidatesSection(silentThreadCandidates, {capturedAt: now instanceof Date ? now : new Date(now)});
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Silent Threads', e);
            }
        }

        // --- Active PR Cycle State ---
        let openPrs       = [];
        let prStateAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const Synthesizer = this.constructor,
                      prs         = await this.fetchOpenPRs(),
                      capturedAt  = now instanceof Date ? now : new Date(now);

                if (!Array.isArray(prs)) {
                    throw new Error('fetchOpenPRs did not return an array');
                }

                openPrs       = prs;
                prStateAppend = Synthesizer.renderActivePrCycleState({prs, capturedAt, now: capturedAt});
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Active PR Cycle State', e);
                prStateAppend = this.constructor.renderActivePrCycleState({
                    capturedAt: now instanceof Date ? now : new Date(now),
                    error     : e,
                    now       : now instanceof Date ? now : new Date(now)
                });
            }
        }

        // --- Handoff Retrospective (the history leg: "what happened since I last looked") ---
        // Best-effort, like every enrichment block: a failure renders nothing, never crashes the
        // handoff. Grain fixed to 3-day here — the batch file is not per-reader; staleness-adaptive
        // grain selection is the interactive boot flow's concern (selectRetrospectiveGrain).
        let retrospectiveAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const capturedAt  = now instanceof Date ? now : new Date(now),
                      windowMs    = RETROSPECTIVE_GRAINS.THREE_DAY.windowHours * 3600 * 1000,
                      windowStart = new Date(capturedAt.getTime() - windowMs),
                      mergedPrs   = (await this.fetchRecentMergedPRs(windowStart))
                          .map(pr => ({ref: `PR #${pr.number}`, headline: pr.title, at: pr.mergedAt})),
                      // opened-PRs-in-window come free from the already-fetched open-PR list
                      openedPrs   = (Array.isArray(openPrs) ? openPrs : [])
                          .map(pr => ({ref: `PR #${pr.number}`, headline: pr.title, at: pr.createdAt}));

                // per-class best-effort: a failing reader drops ITS classes and narrows the
                // declared label, so coverage is never overstated
                let closedIssues = [], openedIssues = [], issueClassesLive = false,
                    sessions     = [], sessionClassLive = false,
                    graduations  = [], graduationsClassLive = false;

                try {
                    closedIssues = (await this.fetchRecentClosedIssues(windowStart))
                        .map(issue => ({ref: `#${issue.number}`, headline: issue.title, at: issue.closedAt}));
                    openedIssues = (await this.fetchRecentOpenedIssues(windowStart))
                        .map(issue => ({ref: `#${issue.number}`, headline: issue.title, at: issue.createdAt}));
                    issueClassesLive = true;
                } catch (issueError) {
                    logger.warn('[GoldenPathSynthesizer] Retrospective issue readers failed — dropping the issue classes', issueError);
                }

                try {
                    // instance seam like every sibling reader — the singleton export IS the
                    // patchable surface; a static here silently bypasses test doubles
                    sessions         = await this.fetchRecentSessions(summaryColl, windowStart);
                    sessionClassLive = true;
                } catch (sessionError) {
                    logger.warn('[GoldenPathSynthesizer] Retrospective session reader failed — dropping the session class', sessionError);
                }

                try {
                    graduations          = await this.fetchRecentGraduations(windowStart);
                    graduationsClassLive = true;
                } catch (graduationError) {
                    logger.warn('[GoldenPathSynthesizer] Retrospective graduations reader failed — dropping the graduations class', graduationError);
                }

                const coveredClasses = [
                    'merged+opened PRs',
                    ...(issueClassesLive     ? ['closed+opened issues'] : []),
                    ...(sessionClassLive     ? ['sessions']             : []),
                    ...(graduationsClassLive ? ['graduations']          : [])
                ];

                retrospectiveAppend = this.constructor.renderHandoffRetrospectiveSection({
                    facts: {mergedPrs, openedPrs, closedIssues, openedIssues, graduations, sessions},
                    grain: RETROSPECTIVE_GRAINS.THREE_DAY,
                    now  : capturedAt,
                    // the label names exactly what these counts cover, per class, so the render
                    // never overstates the window's coverage
                    filterSets: `${coveredClasses.join(' · ')}, all authors`
                })
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Handoff Retrospective', e);
            }
        }

        // --- Work-Graph Stall Inference ---
        let stallFindingsAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const Synthesizer = this.constructor,
                      capturedAt  = now instanceof Date ? now : new Date(now),
                      findings    = Synthesizer.buildWorkGraphStallFindings({
                          issuesDir,
                          now: capturedAt,
                          prs: openPrs
                      });

                stallFindingsAppend = Synthesizer.renderWorkGraphStallFindingsSection(findings, {capturedAt});
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Work-Graph Stall Inference', e);
            }
        }

        // --- Executive Priority Backlog ---
        let backlogAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const rawIssuesDir   = path.resolve(__dirname, '../../../resources/content/issues');
                const filesRaw       = fs.readdirSync(rawIssuesDir);
                const mdFiles        = filesRaw.filter(f => f.endsWith('.md'));
                const openIssuesData = [];
                for (const file of mdFiles) {
                    const issueId = file.replace(/\\.md$/, '');
                    if (goldenIds.has(issueId)) continue; // Skip if already in Golden Path

                    // Query SQLite GraphService natively instead of reading the filesystem content again
                    const dbNode = GraphService.db.nodes.get(issueId);
                    if (dbNode && (dbNode.state === 'OPEN' || dbNode.properties?.state === 'OPEN')) {
                        if (!dbNode.properties?.labels?.includes('needs-re-triage')) {
                            const numericId = parseInt(issueId.replace('issue-', ''), 10) || 0;
                            openIssuesData.push({ id: issueId, numericId, node: dbNode });
                        }
                    }
                }

                openIssuesData.sort((a, b) => b.numericId - a.numericId);
                const latest5 = openIssuesData.slice(0, 5);

                if (latest5.length > 0) {
                    backlogAppend += `\n## 📋 Latest Priority Backlog\n\nThe following open tickets represent the most recently created structural objectives.\n\n`;
                    latest5.forEach((item, idx) => {
                       const title     = item.node.properties?.title || item.node.properties?.name || item.node.name || 'Unknown Title';
                       const labels    = item.node.properties?.labels || [];
                       const labelTags = labels.length > 0 ? ' [\\`' + labels.join('\\`, \\`') + '\\`]' : '';
                       backlogAppend += `${idx + 1}. **${item.id}**${labelTags}\n   - *${title}*\n`;
                    });
                }
            } catch (e) {
                logger.warn('[GoldenPathSynthesizer] Failed to generate Latest Priority Backlog', e);
            }
        }

        handoffContent += `${currentFocusAppend}${staleAssignmentAppend}${silentThreadsAppend}${prStateAppend}${stallFindingsAppend}${backlogAppend}${retrospectiveAppend}${markdownAppend}`;

        const handoffFile = aiConfig.handoffFilePath;
        fs.mkdirSync(path.dirname(handoffFile), {recursive: true});
        fs.writeFileSync(handoffFile, handoffContent.trim() + '\n', 'utf-8');
        logger.info(`[GoldenPathSynthesizer] sandman_handoff.md freshly generated via Centralized Pipeline. Golden Path integrated.`);

        // Graph-analytics companion — kept OUT of the strategic handoff, in a sibling file derived from
        // the resolved handoff path so the debug tables never bloat sandman_handoff.md.
        // Idempotent like the handoff itself: ALWAYS overwrite, so a prior run's analytics can never
        // survive as fresh output. On the renderer's empty-string degradation path, write an explicit
        // current-run degraded marker rather than leaving the stale companion behind.
        const conceptSliceFile = path.join(path.dirname(handoffFile), 'sandman_concept_slice.md');
        const conceptSliceBody = conceptSliceSection.trim() ||
            '_No Concept Slice generated this run (renderer degraded or no graph data)._';
        fs.writeFileSync(conceptSliceFile, `# Concept Slice — Native Edge Graph analytics (companion to sandman_handoff.md)\n${conceptSliceBody}\n`, 'utf-8');

        logger.info(`[GoldenPathSynthesizer] Mathematical Golden Path established. Anchored ${topNodes.length} strategic nodes to frontier.`);

        return routeFailure ? {
            ...routeFailure,
            wroteHandoff    : true,
            selectedTopNodes: scoringStats.selectedTopNodes,
            prunedGuideEdges: scoringStats.prunedGuideEdges
        } : {
            status          : 'completed',
            wroteHandoff    : true,
            selectedTopNodes: scoringStats.selectedTopNodes,
            prunedGuideEdges: scoringStats.prunedGuideEdges
        };
    }
}

export default Neo.setupClass(GoldenPathSynthesizer);
