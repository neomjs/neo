import '../../../src/Neo.mjs';
import * as core         from '../../../src/core/_export.mjs';
import KBRecorderService from '../../services/knowledge-base/KBRecorderService.mjs';

/**
 * @summary Materializes Agent FAQ clusters from Knowledge Base query telemetry.
 *
 * This operator CLI is the on-demand aggregation path for Knowledge Base query
 * telemetry. It rebuilds `kb_query_faqs` from `kb_query_log` using the
 * conservative exact-normalized clustering baseline and prints a short JSON
 * summary for automation.
 *
 * The build is a DELETE+INSERT rebuild of `kb_query_faqs` — a write. `--dry-run` is the
 * no-side-effect probe: it boots the service and reports readiness and row counts without
 * rebuilding anything. It is an author/operator receipt — the exit code carries the verdict
 * (0 only when the service actually opened its database), so automation reads the code, not
 * stdout. CI proves the entrypoint CLASS via `lint-npm-script-entrypoints.mjs`; it does not
 * invoke this build.
 *
 * Usage:
 *   node ai/scripts/maintenance/buildKbAgentFaqs.mjs --min-count 3 --limit 100
 *   node ai/scripts/maintenance/buildKbAgentFaqs.mjs --dry-run
 */
const args = process.argv.slice(2);

const readNumberArg = (name, fallback) => {
    const index = args.indexOf(name);
    if (index === -1) return fallback;

    const value = Number(args[index + 1]);
    return Number.isFinite(value) ? value : fallback;
};

await KBRecorderService.ready();

if (args.includes('--dry-run')) {
    const counts = KBRecorderService.db ? {
        queryLogRows: KBRecorderService.db.prepare('SELECT COUNT(*) AS c FROM kb_query_log').get().c,
        faqRows     : KBRecorderService.db.prepare('SELECT COUNT(*) AS c FROM kb_query_faqs').get().c
    } : null;

    console.log(JSON.stringify({ready: Boolean(KBRecorderService.db), counts}, null, 2));
    process.exit(KBRecorderService.db ? 0 : 1);
}

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
