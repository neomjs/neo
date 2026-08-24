import aiConfig               from '../../mcp/server/memory-core/config.mjs';
import logger                 from '../../mcp/server/memory-core/logger.mjs';
import {hasCrossFamilyReview} from './agentFamilyResolution.mjs';

/**
 * @module ai/services/graph/activePrCycleSection
 * @summary Active PR Cycle handoff rendering, extracted from `GoldenPathSynthesizer` as part of the
 * SRP decomposition.
 *
 * Owner contract: render the visibility-only "Active PR Cycle State" handoff section — the recent
 * open-PR summary (with cross-family-review status), the freshness SLA status, and the degraded
 * Strategic-Interpretation reason. Cross-family-review resolution lives in `agentFamilyResolution.mjs`.
 * `GoldenPathSynthesizer` keeps thin delegating shims so its public API stays stable.
 */

/**
 * @summary Renders a capped recent-open-PR list inside the existing Active PR Cycle section.
 *
 * @param {Object[]} prs GitHub PR payloads.
 * @param {Object} options
 * @param {Number} [options.limit=aiConfig.goldenPathRecentOpenPrRenderLimit] Maximum PRs to render.
 * @returns {String}
 */
export function renderRecentOpenPrSummary(prs, {limit = aiConfig.goldenPathRecentOpenPrRenderLimit} = {}) {
    const recent = [...prs]
        .filter(pr => pr.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit);

    if (recent.length === 0) return '';

    let section = `### Recent Open PRs (\`${recent.length}\` of \`${prs.length}\` items)\n`;

    for (const pr of recent) {
        const author = pr.author?.login || 'unknown';
        section += `- **PR #${pr.number}**: ${pr.title} — author @${author} — opened ${pr.createdAt} — cross-family reviewed: ${hasCrossFamilyReview(pr, undefined, {warn: logger.warn}) ? 'yes' : 'no'}\n`;
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
export function getActivePrCycleStatus({capturedAt, now, freshnessMs}) {
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
export function renderActivePrCycleState({
    prs         = [],
    capturedAt  = new Date(),
    now         = capturedAt,
    error       = null,
    freshnessMs = aiConfig.goldenPathActivePrStateFreshnessMs,
    limit       = aiConfig.goldenPathRecentOpenPrRenderLimit
} = {}) {
    const capturedDate = capturedAt instanceof Date ? capturedAt : new Date(capturedAt),
          freshUntil   = new Date(capturedDate.getTime() + freshnessMs),
          status       = error ? 'degraded' : getActivePrCycleStatus({capturedAt: capturedDate, now, freshnessMs});

    let section = `\n## Active PR Cycle State\n\n`;
    section += `*Captured at: ${capturedDate.toISOString()} (Source: GitHub Live; Status at generation: ${status}; Fresh until: ${freshUntil.toISOString()})*\n\n`;

    if (error) {
        section += `### Recent Open PRs (degraded)\n`;
        section += `Live PR fetch failed; stale PR data was intentionally not reused.\n`;
        section += `- Error: ${String(error.message || error).replace(/\s+/g, ' ').slice(0, 240)}\n\n`;
        return section
    }

    const summary = renderRecentOpenPrSummary(prs, {limit});

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
export function renderStrategicInterpretationDegradedReason({
    reasonCode,
    error = ''
}) {
    const safeReason = reasonCode || 'strategic-interpretation-degraded',
          safeError  = String(error || safeReason).replace(/\s+/g, ' ').slice(0, 240);

    return `Strategic Interpretation degraded: the model-generated brief was not available (${safeReason}). The Computed Golden Path list above remains the mathematical route, but no synthetic rationale is generated for this pass. Error: ${safeError}`
}
