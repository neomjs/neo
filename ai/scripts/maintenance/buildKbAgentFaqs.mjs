/**
 * @plane in-plane
 */
import '../../../src/Neo.mjs';
import * as core        from '../../../src/core/_export.mjs';
import KBRecorderService from '../../mcp/server/knowledge-base/services/KBRecorderService.mjs';

/**
 * @summary Materializes Agent FAQ clusters from Knowledge Base query telemetry.
 *
 * This operator CLI is the on-demand aggregation path for Knowledge Base query
 * telemetry. It rebuilds `kb_query_faqs` from `kb_query_log` using the
 * conservative exact-normalized clustering baseline and prints a short JSON
 * summary for automation.
 *
 * Usage:
 *   node ai/scripts/maintenance/buildKbAgentFaqs.mjs --min-count 3 --limit 100
 */
const args = process.argv.slice(2);

const readNumberArg = (name, fallback) => {
    const index = args.indexOf(name);
    if (index === -1) return fallback;

    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? value : fallback;
};

await KBRecorderService.ready();

const result = KBRecorderService.buildAgentFaqs({
    minCount      : readNumberArg('--min-count', undefined),
    limit         : readNumberArg('--limit', 100),
    sinceTimestamp: readNumberArg('--since', 0)
});

console.log(JSON.stringify({
    message: `Materialized ${result.count} Knowledge Base Agent FAQ cluster(s).`,
    count  : result.count,
    faqs   : result.faqs.map(({clusterId, canonicalQuery, count, hasStrongGuideCoverage}) => ({
        clusterId,
        canonicalQuery,
        count,
        hasStrongGuideCoverage
    }))
}, null, 2));
