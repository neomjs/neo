/**
 * @summary Pure retention-expiry classification engine for the Phase 4C KB GC daemon (#11641).
 *
 * Phase 4C (#11641) substrate. The cloud KB garbage-collection daemon
 * (`KbGarbageCollectionService`) periodically evaluates each tenant's persisted Chroma
 * chunks against an operator retention policy and (opt-in) deletes the expired ones. This
 * module is the **pure core** of that daemon — no I/O, no clock, no service references — so
 * the retention classification is trivially unit-testable in isolation.
 *
 * **The retention signal.** Every chunk is stamped at ingest with `ingestedAt` (epoch ms,
 * #11712 / `VectorService.resolveTenantStamp`). A retention policy expires chunks under
 * **OR-expiry** — a chunk is expired if it is *time-expired* OR *count-expired* (the union,
 * the broader set):
 * - **time-expired** — `now − ingestedAt > maxAgeMs` (per chunk, repo-independent).
 * - **count-expired** — beyond the `maxCount` most-recent chunks of its `{tenantId, repoSlug}`
 *   bucket, ranked `ingestedAt` desc then chunk `id` asc (a deterministic tie-breaker —
 *   batch-ingested chunks share an `ingestedAt`). Per-bucket so one repo cannot crowd another
 *   out of a tenant's count budget.
 *
 * A chunk with a missing / non-numeric `ingestedAt` (a pre-#11712 ingest) is **never**
 * expired — fail-safe: an unknown-age chunk is unrankable and unaged, so it is excluded from
 * both expiry paths (mirrors #11640's missing-`tenantConfigVersion` skip).
 *
 * The daemon owns the I/O: it enumerates tenants, reads the retention config, fetches each
 * tenant's Chroma rows, calls this engine, emits Phase 4A telemetry, and (opt-in) issues the
 * `collection.delete`. This module only *classifies*.
 *
 * @see ai/daemons/kb-gc/KbGarbageCollectionService.mjs — the daemon that consumes this engine.
 * @see ai/services/knowledge-base/VectorService.mjs — `resolveTenantStamp`, the `ingestedAt` stamp (#11712).
 * @see ai/services/knowledge-base/helpers/kbReconciliationEngine.mjs — the sibling pure-helper precedent (#11640).
 */

/**
 * @summary Normalizes an operator retention policy to a safe `{maxAgeMs, maxCount}` shape.
 *
 * Each dimension independently degrades to `null` (disabled) when absent or invalid, so a
 * malformed `aiConfig` key never corrupts the partition:
 * - `maxAgeMs` — a finite number `> 0`, else `null`.
 * - `maxCount` — a non-negative integer, else `null`. `0` is valid (retain none).
 *
 * @param {*} retention Raw `gcRetention` config value.
 * @returns {{maxAgeMs: Number|null, maxCount: Number|null}}
 */
export function resolveRetention(retention) {
    const r = retention && typeof retention === 'object' ? retention : {};

    return {
        maxAgeMs: Number.isFinite(r.maxAgeMs) && r.maxAgeMs > 0       ? r.maxAgeMs : null,
        maxCount: Number.isInteger(r.maxCount) && r.maxCount >= 0     ? r.maxCount : null
    };
}

/**
 * @summary Classifies one tenant's Chroma rows into retention-expired chunks.
 *
 * Pure — no I/O, no clock (the caller passes `now`). Returns the union of the time-expired
 * and count-expired sets (OR-expiry); see the module header for the two rules. The fail-safe
 * for a missing / non-numeric `ingestedAt` is applied to both paths.
 *
 * @param {Object} params
 * @param {Array<{id: String, metadata: Object}>} params.rows  Tenant Chroma rows (the
 *        `getTenantRows` shape — `{id, metadata}`; `metadata` carries `ingestedAt`,
 *        `tenantId`, `repoSlug`).
 * @param {*}      params.retention  The operator retention policy; normalized via {@link resolveRetention}.
 * @param {Number} params.now        Current epoch ms (caller-supplied; keeps this pure).
 * @returns {{expiredIds: Array<String>, expiredCount: Number, evaluatedCount: Number}}
 */
export function selectExpiredChunks({rows, retention, now} = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return {expiredIds: [], expiredCount: 0, evaluatedCount: 0};
    }

    const policy = resolveRetention(retention);

    // No usable retention dimension → nothing expires (the conservative empty-policy default).
    if (policy.maxAgeMs === null && policy.maxCount === null) {
        return {expiredIds: [], expiredCount: 0, evaluatedCount: rows.length};
    }

    const expired = new Set();

    // Time-expiry — per chunk, repo-independent. A missing / non-numeric `ingestedAt` is
    // unaged → never flagged (fail-safe).
    if (policy.maxAgeMs !== null && typeof now === 'number') {
        for (const row of rows) {
            const ingestedAt = row?.metadata?.ingestedAt;

            if (typeof ingestedAt === 'number' && now - ingestedAt > policy.maxAgeMs) {
                expired.add(row.id)
            }
        }
    }

    // Count-expiry — bucket by `{tenantId, repoSlug}`, retain the `maxCount` most-recent per
    // bucket. A missing / non-numeric `ingestedAt` is unrankable → excluded from the bucket
    // (never flagged — fail-safe).
    if (policy.maxCount !== null) {
        const buckets = new Map();

        for (const row of rows) {
            if (typeof row?.metadata?.ingestedAt !== 'number') {
                continue
            }

            const key = `${row.metadata.tenantId ?? ''}|${row.metadata.repoSlug ?? ''}`;

            if (!buckets.has(key)) {
                buckets.set(key, [])
            }

            buckets.get(key).push(row)
        }

        for (const bucket of buckets.values()) {
            // `ingestedAt` desc, then chunk `id` asc — a deterministic tie-breaker so
            // batch-ingested chunks (which share an `ingestedAt`) rank stably.
            bucket.sort((a, b) => {
                const byAge = b.metadata.ingestedAt - a.metadata.ingestedAt;

                if (byAge !== 0) return byAge;

                return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
            });

            for (let i = policy.maxCount; i < bucket.length; i++) {
                expired.add(bucket[i].id)
            }
        }
    }

    return {
        expiredIds    : [...expired],
        expiredCount  : expired.size,
        evaluatedCount: rows.length
    };
}

/**
 * @summary Builds the Phase 4A telemetry `detail` payload for one tenant's GC tick.
 *
 * Pure — kept here (not in the daemon) so the telemetry shape is unit-testable. The daemon
 * passes the returned object straight to `KBRecorderService.recordIngestionMetric`'s `detail`.
 *
 * @param {Object}  params
 * @param {{expiredCount: Number, evaluatedCount: Number}} params.diff  A {@link selectExpiredChunks} result.
 * @param {*}       params.retention          The operator retention policy (normalized into the payload).
 * @param {Boolean} params.gcAutoDelete       Whether the daemon's opt-in delete path is enabled.
 * @param {Number} [params.deletedCount=0]    Chunks actually deleted this tick (`0` when auto-delete is off).
 * @param {Boolean} [params.defragRecommended=false] Whether this tick crossed the defrag-recommended threshold.
 * @returns {{expiredCount: Number, evaluatedCount: Number, deletedCount: Number, retention: Object, gcAutoDelete: Boolean, defragRecommended: Boolean}}
 */
export function formatGcDetail({diff, retention, gcAutoDelete, deletedCount = 0, defragRecommended = false} = {}) {
    return {
        expiredCount     : diff?.expiredCount   ?? 0,
        evaluatedCount   : diff?.evaluatedCount ?? 0,
        deletedCount     : Number.isFinite(deletedCount) ? deletedCount : 0,
        retention        : resolveRetention(retention),
        gcAutoDelete     : gcAutoDelete === true,
        defragRecommended: defragRecommended === true
    };
}
