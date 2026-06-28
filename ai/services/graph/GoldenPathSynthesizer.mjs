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
import {IDENTITIES}                                            from '../../graph/identityRoots.mjs';
import {buildGraphProvider, resolveGraphModelProvider}         from './providerDispatch.mjs';
import {
    formatGoldenPathCapturedAt as formatGoldenPathTimestamp
} from './goldenPathTimestamp.mjs';
import {
    buildCurrentFocusCandidates as buildIssueFocusCurrentFocusCandidates,
    buildSilentThreadCandidates as buildIssueFocusSilentThreadCandidates,
    buildStaleAssignmentCandidates as buildIssueFocusStaleAssignmentCandidates,
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
    scoreCurrentFocusIssue as scoreIssueFocusCurrentIssue
} from './issueFocusSections.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const COMPUTED_RECOMMENDATION_EXCLUDED_LABELS = Object.freeze(new Set([
    'epic',
    'needs-design',
    'needs-re-triage',
    'not-code-ready',
    'not code ready'
]));

const COMPUTED_CONTENT_CONTRADICTION_LABELS = Object.freeze(new Set([
    'blog post',
    'documentation',
    'docs',
    'guide',
    'content'
]));

const CURRENT_FOCUS_ROUTING_CONFLICT_REASONS = Object.freeze(new Set([
    'incident',
    'prio-zero',
    'v13.1'
]));

/**
 * Social Name → `@`-stripped GitHub login, derived from the canonical identity roster. The PR-body
 * self-id leads with the Social Name (`Authored by <Social Name> (…)`); this resolves it to the login
 * the family map keys on. The legacy `@identity` form is still parsed for transitional / pre-trim bodies.
 */
const SOCIAL_NAME_TO_LOGIN = Object.freeze(Object.fromEntries(
    IDENTITIES
        .filter(identity => identity.name && identity.properties?.githubLogin)
        .map(identity => [identity.name, identity.properties.githubLogin.replace(/^@/, '')])
));

/**
 * @summary Returns the vector length emitted by an embedding provider.
 *
 * Kept as a pure helper so the Golden Path query boundary can validate the provider output
 * before ChromaDB rejects a mismatched query shape.
 *
 * @param {*} embedding Provider-produced embedding payload.
 * @returns {Number|null} The embedding vector length, or null for invalid/non-vector payloads.
 */
export function getEmbeddingVectorLength(embedding) {
    return Number.isInteger(embedding?.length) ? embedding.length : null;
}

/**
 * @summary Resolves the configured embedding model name for the active provider.
 *
 * @param {Object} config Memory Core config object.
 * @param {String} provider Active embedding provider key.
 * @returns {String|null}
 */
export function getEmbeddingModelName(config, provider) {
    switch (provider) {
        case 'openAiCompatible':
            return config.openAiCompatible?.embeddingModel || null;
        case 'ollama':
            return config.ollama?.embeddingModel || null;
        case 'gemini':
            return config.embeddingModel || null;
        default:
            return null;
    }
}

/**
 * @summary Builds the operator-facing Golden Path dimension mismatch warning.
 *
 * The message intentionally names both config and observed dimensions because this is the
 * runtime evidence operators need to align `NEO_EMBEDDING_PROVIDER`, `NEO_VECTOR_DIMENSION`,
 * and the existing Chroma collection dimension without destructive collection rebuilds.
 *
 * @param {Object} options
 * @param {String} options.provider Active embedding provider key.
 * @param {String|null} options.model Active embedding model name.
 * @param {Number} options.configuredDimension Configured vector dimension.
 * @param {Number|null} options.actualDimension Provider-produced vector length.
 * @returns {String}
 */
export function buildEmbeddingDimensionMismatchMessage({provider, model, configuredDimension, actualDimension}) {
    return `[GoldenPathSynthesizer] Embedding dimension mismatch before Chroma query: ` +
        `provider=${provider || '<unset>'}, model=${model || '<unknown>'}, ` +
        `configuredVectorDimension=${configuredDimension}, actualEmbeddingDimension=${actualDimension}. ` +
        `Skipping semantic route. Align NEO_EMBEDDING_PROVIDER / NEO_VECTOR_DIMENSION with ` +
        `the Chroma collection dimension, or rebuild the collection intentionally after backup.`;
}

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
     * @summary Normalizes an `identityRoots.mjs` GitHub login for local GitHub payload matching.
     *
     * AgentIdentity roots store canonical handles with a leading `@`, while GitHub API
     * payloads expose bare login strings. Keeping the conversion in one helper prevents
     * repo-enrichment projections from reintroducing hardcoded handle lists.
     *
     * @param {Object} identity AgentIdentity root entry.
     * @returns {String|null} Bare GitHub login, or `null` when unavailable.
     */
    static getIdentityGithubLogin(identity) {
        const login = identity.properties?.githubLogin;

        return typeof login === 'string' && login ? login.replace(/^@/, '') : null
    }

    /**
     * @summary Derives the core swarm login-to-family map from the AgentIdentity registry.
     *
     * `identityRoots.mjs` is the canonical handle indirection seam for named Neo maintainers.
     * Golden Path renders must consume that registry instead of duplicating agent handles in
     * daemon code.
     *
     * @returns {Object<String,String>} GitHub login to model-family map.
     */
    static getCoreSwarmAgentFamilies() {
        return Object.fromEntries(
            IDENTITIES
                .filter(identity =>
                    identity.type === 'AgentIdentity' &&
                    identity.properties?.accountType === 'agent' &&
                    identity.properties?.githubLogin &&
                    identity.properties?.modelFamily
                )
                .map(identity => [
                    this.getIdentityGithubLogin(identity),
                    identity.properties.modelFamily
                ])
        )
    }

    /**
     * @summary Returns canonical Neo agent GitHub logins from `identityRoots.mjs`.
     *
     * @returns {String[]} Agent logins without leading `@`.
     */
    static getAgentLogins() {
        return Object.keys(this.getCoreSwarmAgentFamilies())
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
     * @summary Delegates Golden Path label normalization to the issue-focus helper module.
     * @param {Array<*>} labels Raw label values.
     * @returns {String[]} Lowercase label names.
     */
    static normalizeLabels(labels = []) {
        return normalizeIssueFocusLabels(labels)
    }

    /**
     * @summary Determines whether a graph node can be an immediate computed recommendation.
     *
     * The Computed Golden Path is an execution steering surface. ISSUE (work-to-do) and
     * DISCUSSION (an open convergence-to-drive) are both steerable next-focus; other node
     * types (CONCEPT / ADR / CLASS / ...) and tickets explicitly marked not-ready are
     * visibility, not immediate focus, and stay excluded — presenting those as "next
     * immediate focus" causes release-blind governance drift.
     *
     * @param {Object} nodeData Parsed graph node payload.
     * @returns {Boolean}
     */
    static isActionableComputedRecommendation(nodeData) {
        const nodeId   = String(nodeData?.id || '');
        const nodeType = String(nodeData?.type || nodeData?.properties?.type || '').toUpperCase();

        // ISSUE = work-to-do, DISCUSSION = an open convergence-to-drive; both are execution-steerable.
        if (nodeType && nodeType !== 'ISSUE' && nodeType !== 'DISCUSSION') return false;
        if (!nodeId.startsWith('issue-') && !nodeId.startsWith('discussion-')) return false;

        const labels = this.normalizeLabels(nodeData?.properties?.labels || nodeData?.labels);

        return !labels.some(label => COMPUTED_RECOMMENDATION_EXCLUDED_LABELS.has(label))
    }

    /**
     * @summary Determines whether a Current Focus candidate is strong enough to guard computed routing.
     *
     * Current Focus remains visibility-only. This guard does not boost focus nodes into
     * routing; it only prevents contradictory content recommendations from being rendered
     * as the machine-consumed immediate route while unresolved incident/release focus exists.
     *
     * @param {Object} candidate Current Focus candidate.
     * @returns {Boolean}
     */
    static isRoutingConflictFocusCandidate(candidate) {
        return Array.isArray(candidate?.reasons) &&
            candidate.reasons.some(reason => CURRENT_FOCUS_ROUTING_CONFLICT_REASONS.has(reason))
    }

    /**
     * @summary Detects computed recommendations that are narrative/content work.
     *
     * Blog and docs tickets are valid Golden Path work when incident/release focus permits
     * it. They become contradictory only when a live Current Focus incident/release signal
     * exists and the computed section would otherwise route agents away from it.
     *
     * @param {Object} nodeData Parsed computed recommendation node.
     * @returns {Boolean}
     */
    static isContentComputedRecommendation(nodeData) {
        const labels = this.normalizeLabels(nodeData?.properties?.labels || nodeData?.labels);
        if (labels.some(label => COMPUTED_CONTENT_CONTRADICTION_LABELS.has(label))) return true;

        const title = String(nodeData?.properties?.title || nodeData?.properties?.name || nodeData?.title || nodeData?.name || '');

        return /\b(?:blog|docs?|documentation|guide|narrative)\b/i.test(title)
    }

    /**
     * @summary Finds content recommendations that contradict live Current Focus incident work.
     *
     * @param {Object} options
     * @param {Array<Object>} [options.topNodes=[]] Computed Golden Path recommendations.
     * @param {Array<Object>} [options.currentFocusCandidates=[]] Current Focus candidates.
     * @returns {{focusCandidates: Array<Object>, blockedNodes: Array<Object>, blockedIds: Set<String>}|null}
     */
    static findComputedFocusContradiction({
        topNodes = [],
        currentFocusCandidates = []
    } = {}) {
        const focusCandidates = currentFocusCandidates.filter(candidate =>
            this.isRoutingConflictFocusCandidate(candidate)
        );

        if (focusCandidates.length === 0 || topNodes.length === 0) return null;

        const focusIds     = new Set(focusCandidates.map(candidate => `issue-${candidate.number}`));
        const blockedNodes = topNodes.filter(item => {
            const nodeId = String(item?.node?.id || '');

            return nodeId &&
                !focusIds.has(nodeId) &&
                this.isContentComputedRecommendation(item.node)
        });

        if (blockedNodes.length === 0) return null;

        return {
            blockedIds: new Set(blockedNodes.map(item => item.node.id)),
            blockedNodes,
            focusCandidates
        }
    }

    /**
     * @summary Renders the computed-route contradiction diagnostic.
     *
     * The section intentionally contains no numbered `**issue-N**:` entries, so
     * `AgentOrchestrator.parseGoldenPath()` will not treat filtered content work
     * as an immediate route.
     *
     * @param {Object} options
     * @param {Object} options.contradiction Result from `findComputedFocusContradiction`.
     * @param {Object} [options.stats={}] Candidate-count diagnostics for the current pass.
     * @param {Date|String} [options.capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathContradictionSection({
        contradiction,
        stats      = {},
        capturedAt = new Date()
    } = {}) {
        const count     = value => Number.isFinite(Number(value)) ? Number(value) : 0;
        const focusRefs = (contradiction?.focusCandidates || [])
            .slice(0, 3)
            .map(candidate => `#${candidate.number}`)
            .join(', ') || 'none';
        const blockedRefs = (contradiction?.blockedNodes || [])
            .map(item => item.node.id)
            .join(', ') || 'none';

        return [
            '',
            '## Computed Golden Path (Strategic Recommendation)',
            '',
            `Captured at: ${this.formatGoldenPathCapturedAt(capturedAt)}`,
            '',
            'Computed routing paused because the surviving content/narrative recommendation contradicts live Current Release / Incident Focus.',
            '',
            `- Active incident/release focus candidates: ${focusRefs}`,
            `- Contradictory computed candidates filtered: ${blockedRefs}`,
            `- Semantic candidates: ${count(stats.semanticCandidates)}`,
            `- SQLite OPEN matches: ${count(stats.sqliteOpenMatches)}`,
            `- Scored actionable candidates: ${count(stats.scoredCandidates)}`,
            `- Selected routed nodes: ${count(stats.selectedTopNodes)}`,
            `- Stale frontier GUIDES pruned: ${count(stats.prunedGuideEdges)}`,
            '',
            'No numbered immediate recommendation is rendered for this pass; use the Current Release / Incident Focus section for visibility and rerun after the incident/release focus clears or the computed route aligns.',
            ''
        ].join('\n')
    }

    /**
     * @summary Removes stale Computed Golden Path guide edges from the frontier.
     *
     * `frontier -> GUIDES` edges are a machine-consumed steering surface. Each
     * synthesis pass must remove recommendations that are no longer present in
     * the current computed result; otherwise a zero-node render can leave old
     * guidance active in the graph after the handoff stops rendering it.
     *
     * @param {Object} [options]
     * @param {Object} [options.graphService=GraphService] Graph service instance.
     * @param {Set<String>} [options.currentTargetIds=new Set()] Current computed target ids.
     * @returns {Number} Count of stale guide edges removed.
     */
    static pruneStaleFrontierGuideEdges({
        graphService = GraphService,
        currentTargetIds = new Set()
    } = {}) {
        graphService?.db?.getAdjacentNodes?.('frontier', 'out');

        const staleEdges = (graphService?.db?.edges?.getByIndex?.('source', 'frontier') || [])
            .filter(edge => edge.type === 'GUIDES' && !currentTargetIds.has(edge.target));

        if (staleEdges.length > 0) {
            graphService.db.edges.remove(staleEdges.map(edge => edge.id));
            // Drop the exact index references returned above in case the Store map points at refreshed edge objects.
            graphService.db.edges.updateIndexMaps?.(null, staleEdges);
        }

        return staleEdges.length
    }

    /**
     * @summary Renders the bounded diagnostic for an empty Computed Golden Path pass.
     *
     * The handoff should distinguish "no computed recommendation survived the
     * filter chain" from "the handoff forgot to render the routing surface".
     *
     * @param {Object} stats Candidate-count diagnostics for the current pass.
     * @param {Date|String} [capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathEmptySection(stats = {}, capturedAt = new Date()) {
        const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;

        return [
            '',
            '## Computed Golden Path (Strategic Recommendation)',
            '',
            `Captured at: ${this.formatGoldenPathCapturedAt(capturedAt)}`,
            '',
            'No actionable computed recommendations survived the current Tri-Vector filter pass.',
            '',
            `- Semantic candidates: ${count(stats.semanticCandidates)}`,
            `- SQLite OPEN matches: ${count(stats.sqliteOpenMatches)}`,
            `- Blocked candidates filtered: ${count(stats.blockedCandidates)}`,
            `- Non-actionable candidates filtered: ${count(stats.nonActionableCandidates)}`,
            `- Scored actionable candidates: ${count(stats.scoredCandidates)}`,
            `- Selected top nodes: ${count(stats.selectedTopNodes)}`,
            `- Stale frontier GUIDES pruned: ${count(stats.prunedGuideEdges)}`,
            '',
            'This is an empty-state diagnostic for the computed routing surface. Use the Current Release / Incident Focus section for visibility-only hot work while the computed candidate chain is empty.',
            ''
        ].join('\n')
    }

    /**
     * @summary Normalizes a Golden Path failure into the task outcome shape consumed by the scheduler.
     *
     * The Golden Path task is freshness-critical steering substrate: a caught ChromaDB / graph-store
     * failure must not resolve as a successful run and refresh `lastSuccessAt`.
     *
     * @param {String} reasonCode Stable machine-readable failure reason.
     * @param {*} error Error object or message payload.
     * @param {Object} [extra={}] Additional diagnostics for downstream task-state / health surfaces.
     * @returns {{status: String, reasonCode: String, error: String}} Failure outcome.
     */
    static buildFailureOutcome(reasonCode, error, extra = {}) {
        return {
            status: 'failed',
            reasonCode,
            error : error instanceof Error ? error.message : String(error || reasonCode),
            ...extra
        }
    }

    /**
     * @summary Renders a fail-loud Computed Golden Path section when the route cannot be trusted.
     *
     * No numbered recommendation entries are emitted, so downstream parsers cannot consume stale or
     * partially-computed routing as an immediate lane.
     *
     * @param {Object} options
     * @param {Object} options.failure Failure outcome from `buildFailureOutcome()`.
     * @param {Object} [options.stats={}] Candidate-count diagnostics for the current pass.
     * @param {Date|String} [options.capturedAt=new Date()] Current pass capture timestamp.
     * @returns {String} Markdown section.
     */
    static renderComputedGoldenPathFailureSection({
        failure,
        stats      = {},
        capturedAt = new Date()
    } = {}) {
        const count      = value => Number.isFinite(Number(value)) ? Number(value) : 0;
        const reasonCode = failure?.reasonCode || 'golden-path-failed';
        const error      = failure?.error || 'unknown failure';

        return [
            '',
            '## Computed Golden Path (Strategic Recommendation)',
            '',
            `Captured at: ${this.formatGoldenPathCapturedAt(capturedAt)}`,
            '',
            'Golden Path degraded: the semantic route could not be computed safely.',
            '',
            `- Reason: \`${reasonCode}\``,
            `- Error: \`${error}\``,
            `- Semantic candidates: ${count(stats.semanticCandidates)}`,
            `- SQLite OPEN matches: ${count(stats.sqliteOpenMatches)}`,
            `- Scored actionable candidates: ${count(stats.scoredCandidates)}`,
            `- Selected routed nodes: ${count(stats.selectedTopNodes)}`,
            `- Stale frontier GUIDES pruned: ${count(stats.prunedGuideEdges)}`,
            '',
            'No numbered immediate recommendation is rendered for this pass; do not claim a computed lane from stale handoff data until the next successful Golden Path run.',
            ''
        ].join('\n')
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
     * @summary Extracts the canonical author login (`@`-stripped) from a PR body's `Authored by …`
     * self-id line, resolving both the Social-Name-led form and the legacy `@identity` form.
     *
     * The body self-id is the drift-free author source: the GitHub PR opener can mis-resolve (an MCP
     * `@me` identity-resolution drift stamps a different agent's login on the opener), but the body
     * declares its own canonical author. The current convention leads with the **Social Name**
     * (`Authored by <Social Name> (<Model>, <Wrapper>).`), resolved to a login via the identity roster;
     * the legacy `Authored by … @identity` form is still parsed for transitional / pre-trim bodies.
     * Returns null when no self-id is present (external bodies) or the Social Name is unregistered, so the
     * caller falls back to the advisory login. The pattern is **line-anchored** (`^…/m`) to the self-id
     * line, so a `Co-Authored by` trailer or prose that merely contains `Authored by` mid-line does not match.
     * @param {String} body
     * @returns {(String|null)} The `@`-stripped author login, or null.
     */
    static parseSelfIdLogin(body) {
        if (typeof body !== 'string') return null;

        // Legacy form first: `Authored by … @identity` (transitional / pre-trim bodies).
        const legacyMatch = body.match(/^Authored by[^\n]*?@([A-Za-z0-9-]+)/m);
        if (legacyMatch) return legacyMatch[1];

        // Current form: `Authored by <Social Name> (…)` — resolve the Social Name to a login via the roster.
        const socialMatch = body.match(/^Authored by (.+?) \(/m);
        return socialMatch ? (SOCIAL_NAME_TO_LOGIN[socialMatch[1].trim()] ?? null) : null
    }

    /**
     * @summary Resolves a PR author's model family from the canonical body self-id (Social-Name-led, or
     * legacy `@identity`), falling back to the drift-prone GitHub login as an advisory source.
     *
     * The body's self-declared `@identity` wins; the GitHub author login is advisory-only (used when the
     * body carries no self-id), and a body-vs-login family disagreement is logged as drift rather than
     * silently trusted. Model-name substring inference is deliberately NOT used — the self-id is the
     * canonical source, the login is the legacy bridge until every agent PR body carries `@identity`.
     * @param {Object} pr GitHub PR payload (`author`, `body`, `number`).
     * @param {Object} agentFamilies Login-to-family map (`@`-stripped logins).
     * @returns {(String|undefined)} The model family, or undefined when neither source resolves.
     */
    static resolveAuthorFamily(pr, agentFamilies) {
        const selfIdLogin  = this.parseSelfIdLogin(pr?.body),
              selfIdFamily = selfIdLogin ? agentFamilies[selfIdLogin] : undefined,
              loginFamily  = agentFamilies[pr?.author?.login];

        if (selfIdFamily) {
            if (loginFamily && loginFamily !== selfIdFamily) {
                logger.warn(`[GoldenPathSynthesizer] PR #${pr.number}: author identity drift — body self-id @${selfIdLogin} (${selfIdFamily}) != GitHub login @${pr.author?.login} (${loginFamily}); using the canonical self-id.`);
            }

            return selfIdFamily
        }

        return loginFamily
    }

    /**
     * @summary Determines whether a PR has cross-family review coverage.
     *
     * @param {Object} pr GitHub PR payload from `gh pr list`.
     * @param {Object} [agentFamilies=this.getCoreSwarmAgentFamilies()] Login-to-family map.
     * @returns {Boolean}
     */
    static hasCrossFamilyReview(pr, agentFamilies = this.getCoreSwarmAgentFamilies()) {
        const authorFamily = this.resolveAuthorFamily(pr, agentFamilies);
        const reviews      = Array.isArray(pr.reviews) ? pr.reviews : [];

        return reviews.some(review => {
            const reviewerLogin  = review.author?.login || review.author?.name || review.author?.login;
            const reviewerFamily = agentFamilies[reviewerLogin];

            if (!reviewerFamily) return false;
            if (!authorFamily) return true;

            return reviewerFamily !== authorFamily
        })
    }

    /**
     * @summary Renders a capped recent-open-PR list inside the existing Active PR Cycle section.
     *
     * @param {Object[]} prs GitHub PR payloads.
     * @param {Object} options
     * @param {Number} [options.limit=aiConfig.goldenPathRecentOpenPrRenderLimit] Maximum PRs to render.
     * @returns {String}
     */
    static renderRecentOpenPrSummary(prs, {limit = aiConfig.goldenPathRecentOpenPrRenderLimit} = {}) {
        const recent = [...prs]
            .filter(pr => pr.createdAt)
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, limit);

        if (recent.length === 0) return '';

        let section = `### Recent Open PRs (\`${recent.length}\` of \`${prs.length}\` items)\n`;

        for (const pr of recent) {
            const author = pr.author?.login || 'unknown';
            section += `- **PR #${pr.number}**: ${pr.title} — author @${author} — opened ${pr.createdAt} — cross-family reviewed: ${this.hasCrossFamilyReview(pr) ? 'yes' : 'no'}\n`;
        }

        section += `\n`;

        return section
    }

    /**
     * @summary Resolves whether an Active PR Cycle snapshot is still within its freshness SLA.
     *
     * @param {Object} options
     * @param {Date|String} options.capturedAt Snapshot timestamp.
     * @param {Date|String} options.now Freshness comparison timestamp.
     * @param {Number} options.freshnessMs Freshness SLA in milliseconds.
     * @returns {String}
     */
    static getActivePrCycleStatus({capturedAt, now, freshnessMs}) {
        const capturedMs = capturedAt instanceof Date ? capturedAt.getTime() : new Date(capturedAt).getTime(),
              nowMs      = now        instanceof Date ? now.getTime()        : new Date(now).getTime();

        if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs)) return 'unknown';

        return nowMs - capturedMs > freshnessMs ? 'stale' : 'current'
    }

    /**
     * @summary Renders the complete Active PR Cycle State section.
     *
     * @param {Object} options
     * @param {Object[]} [options.prs=[]] GitHub PR payloads.
     * @param {Date|String} [options.capturedAt=new Date()] Snapshot timestamp.
     * @param {Date|String} [options.now=options.capturedAt] Freshness comparison timestamp.
     * @param {Error} [options.error=null] Fetch failure that makes the section degraded.
     * @param {Number} [options.freshnessMs=aiConfig.goldenPathActivePrStateFreshnessMs] Freshness SLA.
     * @param {Number} [options.limit=aiConfig.goldenPathRecentOpenPrRenderLimit] Maximum PR rows.
     * @returns {String}
     */
    static renderActivePrCycleState({
        prs         = [],
        capturedAt  = new Date(),
        now         = capturedAt,
        error       = null,
        freshnessMs = aiConfig.goldenPathActivePrStateFreshnessMs,
        limit       = aiConfig.goldenPathRecentOpenPrRenderLimit
    } = {}) {
        const capturedDate = capturedAt instanceof Date ? capturedAt : new Date(capturedAt),
              freshUntil   = new Date(capturedDate.getTime() + freshnessMs),
              status       = error ? 'degraded' : this.getActivePrCycleStatus({capturedAt: capturedDate, now, freshnessMs});

        let section = `\n## Active PR Cycle State\n\n`;
        section += `*Captured at: ${capturedDate.toISOString()} (Source: GitHub Live; Status at generation: ${status}; Fresh until: ${freshUntil.toISOString()})*\n\n`;

        if (error) {
            section += `### Recent Open PRs (degraded)\n`;
            section += `Live PR fetch failed; stale PR data was intentionally not reused.\n`;
            section += `- Error: ${String(error.message || error).replace(/\s+/g, ' ').slice(0, 240)}\n\n`;
            return section
        }

        const summary = this.renderRecentOpenPrSummary(prs, {limit});

        if (summary) return section + summary;

        section += `### Recent Open PRs (\`0\` of \`0\` items)\n`;
        section += `No open PRs reported by GitHub at capture time.\n\n`;

        return section
    }

    /**
     * @summary Renders a degraded Strategic Interpretation reason without inventing route rationale.
     *
     * @param {Object} options
     * @param {String} options.reasonCode Stable machine-readable degradation reason.
     * @param {String} [options.error=''] Sanitized provider or parser error.
     * @returns {String}
     */
    static renderStrategicInterpretationDegradedReason({
        reasonCode,
        error = ''
    }) {
        const safeReason = reasonCode || 'strategic-interpretation-degraded',
              safeError  = String(error || safeReason).replace(/\s+/g, ' ').slice(0, 240);

        return `Strategic Interpretation degraded: the model-generated brief was not available (${safeReason}). The Computed Golden Path list above remains the mathematical route, but no synthetic rationale is generated for this pass. Error: ${safeError}`
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
        const rawPrData    = execSync('gh pr list --state open --json number,url,author,title,body,headRefOid,reviewRequests,reviews,comments,createdAt', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        return JSON.parse(rawPrData);
    }

    /**
     * @summary Reads the N most-recent session summaries by timestamp metadata (newest-first).
     *
     * ChromaDB `.get` has no `ORDER BY`, so `.get({limit})` returns storage-order — which anchored the
     * Frontier Baseline Vector to arbitrary (often oldest) summaries, starving the Computed Golden Path
     * of current work. This reads summary metadatas, sorts by the summary timestamp, and reads back only
     * the most-recent N documents. The frontier must reflect CURRENT work because the semantic pillar is
     * the designed pathway for surfacing new (correctly low-structural-weight) issues.
     *
     * @param {Object} collection Summary Chroma collection (exposes async `.get`).
     * @param {Number} n Number of most-recent summaries to return.
     * @returns {Promise<{documents: String[]}>} The N most-recent summary documents, newest-first.
     */
    static async getRecentSummaryDocuments(collection, n) {
        const meta      = await collection.get({include: ['metadatas']});
        const resolveTs = m => {
            const raw = m?.timestamp ?? m?.lastActivity ?? m?.updatedAt ?? m?.createdAt;
            return Number.isFinite(Number(raw)) ? Number(raw) : (Date.parse(raw) || 0);
        };

        const recentIds = (meta?.ids || [])
            .map((id, idx) => ({id, ts: resolveTs(meta.metadatas?.[idx])}))
            .sort((a, b) => b.ts - a.ts)
            .slice(0, Math.max(0, n))
            .map(entry => entry.id);

        if (recentIds.length === 0) {
            return {documents: []};
        }

        const recent = await collection.get({ids: recentIds, include: ['documents']});
        // Chroma `.get({ids})` does not preserve request order — re-key to the recency ranking.
        const byId = new Map((recent?.ids || []).map((id, idx) => [id, recent.documents?.[idx]]));

        return {documents: recentIds.map(id => byId.get(id)).filter(doc => doc !== undefined && doc !== null)};
    }

    /**
     * @summary Renders the Consolidation Gaps section — undigested sessions made visible.
     *
     * Consolidation-liveness: the dream must **visibly record** sessions it has NOT digested,
     * never silently. A fresh handoff over an undigested backlog reads healthy
     * ("health-green-but-map-lying") unless the gap is surfaced — a lost walk must be *visibly*
     * lost. Queries the summary collection for `graphDigested !== true` and renders the count +
     * a bounded sample. Visibility-only: no routing change.
     *
     * **Failure must not read as healthy.** A thrown query OR a malformed (non-array) response
     * renders an explicit `Status UNKNOWN` state — never blank and never a `0 undigested`
     * all-clear (which would be the exact false-green this section exists to prevent). A valid
     * empty response IS a real all-clear, but reports the checked-count so "0 checked" is
     * distinguishable from "0 undigested of N".
     *
     * @param {Object} summaryColl Summary Chroma collection (exposes async `.get`).
     * @param {Object} [options]
     * @param {Number} [options.limit=5] Max undigested sessions to sample.
     * @returns {Promise<String>} The rendered section (always non-empty — gap, all-clear, or unknown).
     */
    static async renderConsolidationGapsSection(summaryColl, {limit = 5} = {}) {
        const header = `\n## Consolidation Gaps\n\n*Consolidation-liveness: sessions the dream has NOT yet laid as trails. A lost walk is visibly lost, never silently absent — a fresh handoff must not read healthy over an undigested backlog.*\n\n`;

        let raw;
        try {
            raw = await summaryColl.get({include: ['metadatas']});
        } catch (e) {
            // A failed query must NOT read as healthy — surface an explicit unknown state.
            return `${header}❓ **Status UNKNOWN** — the summary collection query failed (\`${e.message}\`); consolidation health could not be determined. This is NOT an all-clear.\n`;
        }

        // A malformed response (no metadata array) is unknown, NOT zero-undigested.
        if (!raw || !Array.isArray(raw.metadatas)) {
            return `${header}❓ **Status UNKNOWN** — the summary collection returned a malformed response (no metadata array); consolidation health could not be determined. This is NOT an all-clear.\n`;
        }

        const metas      = raw.metadatas,
              ids        = Array.isArray(raw.ids) ? raw.ids : [],
              undigested = [];

        for (let i = 0; i < metas.length; i++) {
            const meta = metas[i];
            // graphDigested is set true only after BOTH deterministic ingestion AND the
            // semantic extractor complete (DreamService); anything else is an un-laid trail.
            if (meta && meta.graphDigested !== true && meta.graphDigested !== 'true') {
                undigested.push({id: ids[i], title: meta.title || meta.sessionId || ids[i]});
            }
        }

        if (undigested.length === 0) {
            return `${header}✅ 0 sessions undigested — consolidation is current (${metas.length} session(s) checked).\n`;
        }

        let section = `${header}⚠️ **${undigested.length} session(s) undigested** (\`graphDigested !== true\`)`;
        section += undigested.length > limit ? `, showing ${limit}:\n` : `:\n`;

        for (const item of undigested.slice(0, limit)) {
            section += `- \`${item.id}\` — ${item.title}\n`;
        }

        return section
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

                    // Re-verify blocker topology natively using GraphService API
                    const blockers  = GraphService.db.edges.getByIndex('target', issueId).filter(e => e.type === 'BLOCKS');
                    let   isBlocked = false;

                    for (const bEdge of blockers) {
                        const blockerNode = GraphService.db.nodes.get(bEdge.source);
                        if (blockerNode && (blockerNode.properties?.state === 'OPEN' || blockerNode.state === 'OPEN')) {
                            isBlocked = true;
                            break;
                        }
                    }

                    if (isBlocked) {
                        scoringStats.blockedCandidates++;
                        continue; // Architecturally blocked issues cannot be Golden
                    }

                    const idx               = semanticIds.indexOf(issueId);
                    const semantic_distance = parseFloat(semanticDistances[idx]) || 0.1;
                    const struct_score      = parseFloat(row.struct_score) || 0;

                    // Lower distance = Higher significance. (Add 0.1 to avoid div by 0 and curb massive asymptotes)
                    const semanticScore = 1.0 / (semantic_distance + 0.1);

                    let nodeData = null;
                    try { nodeData = JSON.parse(row.data); } catch (e) { }

                    let priority = (semanticScore * SEMANTIC_WEIGHT) + (struct_score * STRUCTURAL_WEIGHT);

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
                stats        : scoringStats
            });
            logger.info('[GoldenPathSynthesizer] Computed route contradicted Current Focus; rendered diagnostic instead of routing content work.');
        } else {
            markdownAppend = this.constructor.renderComputedGoldenPathEmptySection(scoringStats, handoffTimestamp);
            logger.info('[GoldenPathSynthesizer] No actionable unblocked issues found. Golden path empty.');
        }

        // Centralize full generation of sandman_handoff.md here, enforcing completely idempotent behavior.
        // TTL pruning and centralized overwrite happen in the same render pass.
        let handoffContent = `# Autonomous Handoff (Dream Pipeline & Golden Path)\n\n`;
        handoffContent += `The Native Edge Graph has audited the codebase structurally. The following architectural coverage gaps currently exist natively within the SQLite matrix.\n\n`;

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
        let prStateAppend = '';
        if (repoEnrichmentEnabled) {
            try {
                const Synthesizer = this.constructor,
                      prs         = await this.fetchOpenPRs(),
                      capturedAt  = now instanceof Date ? now : new Date(now);

                if (!Array.isArray(prs)) {
                    throw new Error('fetchOpenPRs did not return an array');
                }

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

        handoffContent += `${currentFocusAppend}${staleAssignmentAppend}${silentThreadsAppend}${prStateAppend}${backlogAppend}${markdownAppend}`;

        const handoffFile = aiConfig.handoffFilePath;
        fs.mkdirSync(path.dirname(handoffFile), {recursive: true});
        fs.writeFileSync(handoffFile, handoffContent.trim() + '\n', 'utf-8');
        logger.info(`[GoldenPathSynthesizer] sandman_handoff.md freshly generated via Centralized Pipeline. Golden Path integrated.`);

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
