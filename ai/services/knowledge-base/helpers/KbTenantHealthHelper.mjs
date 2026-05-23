import KBRecorderService from '../KBRecorderService.mjs';

/**
 * @summary Renders the per-tenant Knowledge Base ingestion health section for the Sandman handoff.
 *
 * Phase 4A (#11639) substrate. `KBRecorderService.recordIngestionMetric` captures per-event
 * ingestion telemetry into `kb_ingestion_metrics`; `getTenantIngestionRollup` aggregates it
 * per tenant. This helper formats that rollup as a `## KB Multi-Tenant Health` Markdown section
 * that `GoldenPathSynthesizer.synthesizeGoldenPath` composes into `sandman_handoff.md`.
 *
 * It mirrors the `renderConsumerFrictionSection` pattern (`ConsumerFrictionHelper.mjs`): a
 * section-renderer the centralized handoff generator imports and appends — deliberately NOT a
 * standalone daemon. `sandman_handoff.md` is regenerated idempotently in full by
 * `GoldenPathSynthesizer`, so a standalone writer's output would be overwritten; the
 * render-helper is the substrate-correct integration shape (see #11639 intake finding).
 *
 * @see ai/services/knowledge-base/KBRecorderService.mjs — `getTenantIngestionRollup`, the rollup source.
 * @see ai/services/graph/GoldenPathSynthesizer.mjs — the handoff generator that composes this section.
 * @see ai/services/memory-core/helpers/ConsumerFrictionHelper.mjs — the render-helper precedent.
 */

/**
 * @summary Rolling-window default for the handoff health section — matches the handoff's 7-day TTL cadence.
 * @type {Number}
 */
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * @summary Formats a per-tenant ingestion rollup as the `## KB Multi-Tenant Health` Markdown section.
 *
 * Pure formatter — no I/O, no service access — so it is trivially unit-testable. Returns an
 * empty string for an empty rollup, letting the caller omit the section entirely.
 *
 * @param {Array<Object>} rollup Per-tenant rows from `KBRecorderService.getTenantIngestionRollup`.
 * @param {Object}  [options]
 * @param {String} [options.windowLabel] Optional human label for the rollup window (e.g. `'last 7 days'`).
 * @returns {String} The Markdown section, or `''` when the rollup is empty.
 */
export function formatKbTenantHealthSection(rollup, {windowLabel} = {}) {
    if (!Array.isArray(rollup) || rollup.length === 0) {
        return '';
    }

    const scope = windowLabel ? ` (${windowLabel})` : '';
    const lines = [
        '## KB Multi-Tenant Health',
        '',
        `Per-tenant Knowledge Base ingestion telemetry${scope}, rolled up from \`kb_ingestion_metrics\` (#11639).`,
        '',
        '| Tenant | Repo | Events | Ingest | Tombstone | Reconcile | Errors | Error rate | Embedded | Deleted |',
        '|---|---|--:|--:|--:|--:|--:|--:|--:|--:|'
    ];

    for (const row of rollup) {
        const errorRate = `${((row.errorRate ?? 0) * 100).toFixed(1)}%`;

        lines.push(
            `| \`${row.tenantId}\` | \`${row.repoSlug}\` | ${row.eventCount ?? 0} | ` +
            `${row.ingestEvents ?? 0} | ${row.tombstoneEvents ?? 0} | ${row.reconcileEvents ?? 0} | ` +
            `${row.errorEvents ?? 0} | ${errorRate} | ${row.chunksEmbedded ?? 0} | ${row.chunksDeleted ?? 0} |`
        );
    }

    lines.push('');

    return lines.join('\n');
}

/**
 * @summary Resolves the per-tenant ingestion rollup and renders the handoff health section.
 *
 * The thin integration layer over {@link formatKbTenantHealthSection}: ensures the
 * `KBRecorderService` SQLite connection is ready, fetches the per-tenant rollup, and delegates
 * formatting. Defensive — any failure (telemetry store unavailable, locked, or absent) resolves
 * to `''`, so a Sandman handoff regeneration is never broken by observability I/O.
 *
 * @param {Object}  [options]
 * @param {Number} [options.sinceMs] Lower-bound timestamp for the rollup window. Defaults to 7 days ago.
 * @returns {Promise<String>} The `## KB Multi-Tenant Health` section, or `''` when unavailable / empty.
 */
export async function renderKbMultiTenantHealthSection({sinceMs = Date.now() - SEVEN_DAYS_MS} = {}) {
    try {
        await KBRecorderService.ready();

        const rollup = KBRecorderService.getTenantIngestionRollup({sinceMs});

        return formatKbTenantHealthSection(rollup, {windowLabel: 'last 7 days'});
    } catch (err) {
        return '';
    }
}
