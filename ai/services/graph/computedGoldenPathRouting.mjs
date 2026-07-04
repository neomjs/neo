import {normalizeLabels}                                         from './issueFocusSections.mjs';
import {formatGoldenPathCapturedAt as formatGoldenPathTimestamp} from './goldenPathTimestamp.mjs';

/**
 * @module ai/services/graph/computedGoldenPathRouting
 * @summary The Computed Golden Path routing-decision surface, extracted from `GoldenPathSynthesizer`
 * as part of the GoldenPathSynthesizer SRP decomposition.
 *
 * Owner contract: decide which graph nodes are actionable **routing** recommendations (vs
 * visibility-only), detect content/narrative recommendations that contradict live Current
 * Release / Incident Focus, and render the machine-consumed Computed Golden Path section in its
 * routed / empty / failure states. This is the execution-steering surface — deliberately kept
 * distinct from the visibility-only sections (Current Focus / Silent Threads / Latest Backlog),
 * which live in `issueFocusSections.mjs`. `GoldenPathSynthesizer` keeps thin delegating shims so
 * its public API stays stable.
 */

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

/**
 * Focus reasons strong enough to pause contradictory content routing. Deliberately
 * limited to release-INDEPENDENT classes: a release-version literal in this set outlives
 * its release and arms the guard forever — post-ship, every pass renders zero routes
 * while the release tail stays open. Release-window guarding, if reintroduced, must ride
 * a config/SSOT leaf with a publish-cleared lifecycle — never a hardcoded literal.
 */
const CURRENT_FOCUS_ROUTING_CONFLICT_REASONS = Object.freeze(new Set([
    'incident',
    'prio-zero'
]));

/**
 * @summary Returns labels that exclude a node from immediate computed routing.
 *
 * This exposes the same actionability contract used by
 * {@link isActionableComputedRecommendation} so diagnostic ledgers can report the exact
 * rejection bucket without duplicating the exclusion set.
 *
 * @param {Object} nodeData Parsed graph node payload.
 * @returns {String[]} Normalized labels that made the node visibility-only / not-ready.
 */
export function getComputedRecommendationExclusionLabels(nodeData) {
    const labels = normalizeLabels(nodeData?.properties?.labels || nodeData?.labels);

    return labels.filter(label => COMPUTED_RECOMMENDATION_EXCLUDED_LABELS.has(label))
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
export function isActionableComputedRecommendation(nodeData) {
    const nodeId   = String(nodeData?.id || '');
    const nodeType = String(nodeData?.type || nodeData?.properties?.type || '').toUpperCase();

    // ISSUE = work-to-do, DISCUSSION = an open convergence-to-drive; both are execution-steerable.
    if (nodeType && nodeType !== 'ISSUE' && nodeType !== 'DISCUSSION') return false;
    if (!nodeId.startsWith('issue-') && !nodeId.startsWith('discussion-')) return false;

    return getComputedRecommendationExclusionLabels(nodeData).length === 0
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
export function isRoutingConflictFocusCandidate(candidate) {
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
export function isContentComputedRecommendation(nodeData) {
    const labels = normalizeLabels(nodeData?.properties?.labels || nodeData?.labels);
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
export function findComputedFocusContradiction({
    topNodes = [],
    currentFocusCandidates = []
} = {}) {
    const focusCandidates = currentFocusCandidates.filter(candidate =>
        isRoutingConflictFocusCandidate(candidate)
    );

    if (focusCandidates.length === 0 || topNodes.length === 0) return null;

    const focusIds     = new Set(focusCandidates.map(candidate => `issue-${candidate.number}`));
    const blockedNodes = topNodes.filter(item => {
        const nodeId = String(item?.node?.id || '');

        return nodeId &&
            !focusIds.has(nodeId) &&
            isContentComputedRecommendation(item.node)
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
export function renderComputedGoldenPathContradictionSection({
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
        `Captured at: ${formatGoldenPathTimestamp(capturedAt)}`,
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
 * @summary Renders the bounded diagnostic for an empty Computed Golden Path pass.
 *
 * The handoff should distinguish "no computed recommendation survived the
 * filter chain" from "the handoff forgot to render the routing surface".
 *
 * @param {Object} stats Candidate-count diagnostics for the current pass.
 * @param {Date|String} [capturedAt=new Date()] Current pass capture timestamp.
 * @returns {String} Markdown section.
 */
export function renderComputedGoldenPathEmptySection(stats = {}, capturedAt = new Date()) {
    const count = value => Number.isFinite(Number(value)) ? Number(value) : 0;

    return [
        '',
        '## Computed Golden Path (Strategic Recommendation)',
        '',
        `Captured at: ${formatGoldenPathTimestamp(capturedAt)}`,
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
export function buildFailureOutcome(reasonCode, error, extra = {}) {
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
export function renderComputedGoldenPathFailureSection({
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
        `Captured at: ${formatGoldenPathTimestamp(capturedAt)}`,
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
