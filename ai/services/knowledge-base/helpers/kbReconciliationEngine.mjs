/**
 * @summary Pure config-invalidation reconciliation engine for the Phase 4B KB reconciliation daemon (#11640).  ticket-ref-ok: implementing ticket
 *
 * Phase 4B (#11640) substrate. The cloud KB reconciliation daemon (`KbReconciliationService`)  ticket-ref-ok: implementing ticket
 * periodically diffs each tenant's persisted Chroma chunks against the tenant's *current*
 * `KnowledgeBaseTenantConfig` version and (opt-in) tombstones the chunks left stale by a
 * config change. This module is the **pure core** of that daemon — no I/O, no clock, no
 * service references — so the staleness classification and the version-gap partition are
 * trivially unit-testable in isolation.
 *
 * **The V1 reconciliation signal.** Every chunk is stamped at ingest with the active
 * `tenantConfigVersion` (#11637 / `VectorService.resolveTenantStamp`). When a tenant mutates  ticket-ref-ok: implementing ticket
 * its `KnowledgeBaseTenantConfig`, `getTenantConfig().version` increments — and every chunk
 * ingested under the prior config is now *config-stale*: it may carry paths or a parse
 * structure only the superseded config produced. A chunk whose `metadata.tenantConfigVersion`
 * is below the tenant's current version is therefore a **config-invalidation orphan**. The
 * `versionGap` (how many config epochs the chunk has survived unrefreshed) gates the
 * destructive auto-tombstone: a chunk re-pushed within the grace window self-heals — the
 * re-push re-stamps it at the current version — while one that is not becomes actionable.
 *
 * The daemon owns the I/O: it enumerates tenants, reads `getTenantConfig().version`, fetches
 * each tenant's Chroma rows, calls this engine, emits Phase 4A telemetry, and (opt-in) issues
 * the `collection.delete`. This module only *classifies*.
 *
 * **The V1.x manifest signal.** #11711 adds a sibling claimed-state manifest per tenant:  ticket-ref-ok: implementing ticket
 * `kb-manifest:<tenantId>`. It is deliberately separate from `KnowledgeBaseTenantConfig`
 * because that config node's `version` is the config-staleness signal above; routine push
 * manifests must not bump it. `diffTenantManifest()` classifies rows whose `metadata.sourcePath`
 * no longer appears in the persisted manifest for their `metadata.repoSlug`, but only when
 * the row's `metadata.ingestedAt` is at or before the manifest's `updatedAt` snapshot time.
 * Rows newer than the manifest are outside that manifest's authority and are skipped.
 *
 * @see ai/daemons/kb-reconciliation/KbReconciliationService.mjs — the daemon that consumes this engine.
 * @see ai/services/knowledge-base/KnowledgeBaseIngestionService.mjs — `getTenantConfig`, the version source.
 * @see ai/services/knowledge-base/VectorService.mjs — `resolveTenantStamp`, the `tenantConfigVersion` stamp.
 * @see ai/services/knowledge-base/helpers/kbAlertRuleEngine.mjs — the sibling pure-helper precedent (#11642).  ticket-ref-ok: implementing ticket
 */

/**
 * @summary Default version-gap threshold — a config-stale chunk becomes auto-tombstone-eligible
 * once it is at least this many config versions behind the tenant's current config.
 *
 * `2` gives one full config epoch of grace: a chunk one version behind (`versionGap === 1`)
 * is stale-but-within-grace — the tenant's next routine push re-stamps it current; a chunk
 * two or more versions behind has survived a full epoch unrefreshed and is treated as
 * abandoned. Operator-overridable via `aiConfig.knowledgeBase.reconciliationOrphanVersionGap`.
 * @type {Number}
 */
export const DEFAULT_ORPHAN_VERSION_GAP = 2;

/**
 * @summary Normalizes an operator-supplied orphan version-gap to a safe positive threshold.
 *
 * A non-finite or sub-1 value (a stale `config.mjs`, an operator typo) degrades to
 * {@link DEFAULT_ORPHAN_VERSION_GAP} rather than corrupting the partition. The floor is `1`:
 * `versionGap >= 1` holds for every config-stale chunk, so a threshold of `1` means "no
 * grace — every stale chunk is actionable".
 *
 * @param {*} value Raw config value.
 * @returns {Number} A finite threshold `>= 1`.
 */
export function resolveOrphanVersionGap(value) {
    return Number.isFinite(value) && value >= 1 ? value : DEFAULT_ORPHAN_VERSION_GAP;
}

/**
 * @summary Classifies one tenant's Chroma rows into config-stale orphans.
 *
 * Pure — no I/O, no clock. A row is a **config-stale orphan** when its
 * `metadata.tenantConfigVersion` is a number strictly below `currentVersion` (the tenant's
 * current `getTenantConfig().version`). Each orphan's `versionGap = currentVersion -
 * tenantConfigVersion`; an orphan is **actionable** (auto-tombstone-eligible) when its
 * `versionGap` is at or above the resolved `orphanVersionGap`.
 *
 * Edge cases, both fail-safe (a chunk that cannot be classified is never actioned):
 * - `currentVersion <= 0` — the tenant resolves to the `kb-config.yaml` / default config
 *   tier (no graph node, version `0`). No chunk can be stale; the result is empty.
 * - A row whose `tenantConfigVersion` is missing / non-numeric — a chunk ingested before the
 *   #11637 stamp existed. It is **not** flagged: its config epoch is unknowable.  ticket-ref-ok: implementing ticket
 *
 * @param {Object} params
 * @param {Array<{id: String, metadata: Object}>} params.rows  Tenant Chroma rows (the
 *        `KnowledgeBaseIngestionService.getTenantRows` shape — `{id, metadata}`).
 * @param {Number} params.currentVersion  The tenant's current `getTenantConfig().version`.
 * @param {Number} [params.orphanVersionGap]  Actionable threshold; normalized via
 *        {@link resolveOrphanVersionGap}.
 * @returns {{staleOrphans: Array<{id: String, tenantConfigVersion: Number, versionGap: Number}>, staleCount: Number, actionableIds: Array<String>, actionableCount: Number}}
 */
export function diffTenantChunks({rows, currentVersion, orphanVersionGap} = {}) {
    const staleOrphans  = [];
    const actionableIds = [];

    if (!Array.isArray(rows) || typeof currentVersion !== 'number' || currentVersion <= 0) {
        return {staleOrphans, staleCount: 0, actionableIds, actionableCount: 0};
    }

    const gapThreshold = resolveOrphanVersionGap(orphanVersionGap);

    for (const row of rows) {
        const stampedVersion = row?.metadata?.tenantConfigVersion;

        // Fail-safe: a missing / non-numeric stamp (pre-#11637 ingest) is unclassifiable — skip it.  ticket-ref-ok: implementing ticket
        if (typeof stampedVersion !== 'number' || !(stampedVersion < currentVersion)) {
            continue;
        }

        const versionGap = currentVersion - stampedVersion;

        staleOrphans.push({id: row.id, tenantConfigVersion: stampedVersion, versionGap});

        if (versionGap >= gapThreshold) {
            actionableIds.push(row.id);
        }
    }

    return {
        staleOrphans,
        staleCount     : staleOrphans.length,
        actionableIds,
        actionableCount: actionableIds.length
    };
}

/**
 * @summary Classifies one tenant's Chroma rows into claimed-manifest orphans (#11711).  ticket-ref-ok: implementing ticket
 *
 * Pure — no I/O, no clock. A row is a **manifest orphan** when all of the following are true:
 * the row has a `metadata.repoSlug`, the tenant has a persisted manifest for that repo, the
 * row has a finite numeric `metadata.ingestedAt`, the persisted manifest has a finite numeric
 * `updatedAt`, the row was ingested at or before that manifest snapshot, the row has a string
 * `metadata.sourcePath`, and that path is absent from the persisted `pathsAfterPush` set.
 * Every manifest orphan inside the manifest's authority window is immediately actionable:
 * unlike config staleness, there is no version-gap grace once the tenant's claimed current
 * path set no longer includes the row.
 *
 * Edge cases are fail-safe: malformed manifest maps, repos with no persisted manifest, and
 * rows missing `repoSlug` / `sourcePath` / `ingestedAt` are skipped so the daemon never
 * tombstones without a claimed baseline and freshness boundary.
 *
 * @param {Object} params
 * @param {Array<{id: String, metadata: Object}>} params.rows Tenant Chroma rows.
 * @param {Object<String, {pathsAfterPush: Array<String>, updatedAt: Number}>} params.manifestsByRepo Persisted repo manifests.
 * @returns {{manifestOrphans: Array<{id: String, repoSlug: String, sourcePath: String, ingestedAt: Number, manifestUpdatedAt: Number}>, orphanCount: Number, actionableIds: Array<String>, actionableCount: Number}}
 */
export function diffTenantManifest({rows, manifestsByRepo} = {}) {
    const manifestOrphans = [];
    const actionableIds   = [];

    if (!Array.isArray(rows) || !manifestsByRepo || typeof manifestsByRepo !== 'object' || Array.isArray(manifestsByRepo)) {
        return {manifestOrphans, orphanCount: 0, actionableIds, actionableCount: 0};
    }

    const manifests = new Map();

    for (const [repoSlug, manifest] of Object.entries(manifestsByRepo)) {
        const paths     = manifest?.pathsAfterPush,
              updatedAt = manifest?.updatedAt;

        if (typeof repoSlug !== 'string' || !repoSlug || !Array.isArray(paths) || !Number.isFinite(updatedAt)) {
            continue;
        }

        manifests.set(repoSlug, {
            pathSet: new Set(paths.filter(path => typeof path === 'string' && path.length > 0)),
            updatedAt
        });
    }

    if (manifests.size === 0) {
        return {manifestOrphans, orphanCount: 0, actionableIds, actionableCount: 0};
    }

    for (const row of rows) {
        const repoSlug   = row?.metadata?.repoSlug,
              sourcePath = row?.metadata?.sourcePath,
              ingestedAt = row?.metadata?.ingestedAt,
              manifest   = manifests.get(repoSlug);

        if (!manifest || typeof sourcePath !== 'string' || !sourcePath || !Number.isFinite(ingestedAt) ||
            ingestedAt > manifest.updatedAt || manifest.pathSet.has(sourcePath)) {
            continue;
        }

        manifestOrphans.push({id: row.id, repoSlug, sourcePath, ingestedAt, manifestUpdatedAt: manifest.updatedAt});
        actionableIds.push(row.id);
    }

    return {
        manifestOrphans,
        orphanCount    : manifestOrphans.length,
        actionableIds,
        actionableCount: actionableIds.length
    };
}

/**
 * @summary Classifies one tenant's Chroma rows into parser-identity orphans.
 *
 * Pure — no I/O, no clock, matching its two siblings. This is the **third** reconciliation signal,
 * and it exists because the first two are structurally blind to it: `diffTenantChunks` keys on
 * `metadata.tenantConfigVersion`, which a parser change never moves, and `diffTenantManifest` keys
 * on a `sourcePath` being absent from the claimed set, which says nothing about a path still present
 * under a superseded generation.
 *
 * **Why identity rather than an event.** `parserId` / `parserVersion` are `hashInputs`
 * (`IngestionService`), so advancing a parser version changes every chunk id: the new generation
 * ADDS rows and never overwrites its predecessor. A design firing *when* the version changes cannot
 * clear an already-orphaned set without another bump, and a bump re-materializes the whole corpus —
 * on a deployment partway through its initial embedding that costs far more than the orphans. So a
 * row is classified by comparing its stamped pair against the repo's **currently declared** pair,
 * which makes an existing orphan set self-healing on the next ordinary tick with no bump at all.
 *
 * **Two tiers, safety-ordered, and neither deletes ahead of its replacement.**
 *
 * 1. `unyielded` — the row's `sourcePath` is absent from the paths the declared parser currently
 *    yields, so no replacement is ever coming and reclaiming it opens no retrieval hole. This is the
 *    tier that clears a vendor-exclusion change. It runs only where the caller supplied a yielded-path
 *    set for the repo: an absent set is *unknown*, never *empty*, and treating it as empty would
 *    classify a whole repo actionable on a missing envelope.
 * 2. `superseded` — the path is still yielded, so a replacement is expected; the row becomes
 *    actionable only once a row carrying the declared pair exists for that same path. `#16577`  ticket-ref-ok: implementing ticket
 *    measured a materialization reporting success while leaving no durable proof, which is what makes
 *    the delete-before-embed window concrete rather than theoretical.
 *
 * Replacement presence is derived from `rows` themselves rather than taken as a parameter — the
 * evidence that a replacement landed is a row carrying the declared pair, and reading it from the
 * same snapshot the classification runs on removes a second authority that could disagree with it.
 *
 * **Tenant scoping is this function's own responsibility**, unlike its siblings. The mandated model is a
 * metadata-scoped, collection-shared one, so a classifier reading collection rows must filter by
 * `tenantId` itself; a caller-scoped contract would make containment untestable against the mixed
 * row set that actually exists in the collection.
 *
 * @param {Object}   params
 * @param {Object[]} params.rows                Chroma rows for the shared collection; each `{id, metadata}`.
 * @param {String}   params.tenantId            Only rows whose `metadata.tenantId` matches are considered.
 * @param {Object}   params.declaredByRepo      `{[repoSlug]: {parserId, parserVersion}}` — the currently declared pair per repo.
 * @param {Object}  [params.yieldedPathsByRepo] `{[repoSlug]: string[]|Set}` — paths the declared parser yields. A repo absent here skips tier 1.
 * @returns {{parserOrphans: Object[], parserOrphanCount: Number, actionableIds: String[], actionableCount: Number}}
 */
export function diffTenantParserIdentity({rows, tenantId, declaredByRepo, yieldedPathsByRepo} = {}) {
    const parserOrphans = [],
          actionableIds = [];

    const empty = {parserOrphans, parserOrphanCount: 0, actionableIds, actionableCount: 0};

    if (!Array.isArray(rows) || typeof tenantId !== 'string' || !tenantId || !declaredByRepo) {
        return empty;
    }

    // Which paths already carry a row at the DECLARED pair. Built in one pass over the same snapshot
    // the classification reads, so tier 2 can never gate on a replacement this view cannot see.
    const replacedPaths = new Set();

    for (const row of rows) {
        const meta = row?.metadata;

        if (!meta || meta.tenantId !== tenantId) continue;

        const declared = declaredByRepo[meta.repoSlug];

        if (declared && meta.parserId === declared.parserId && meta.parserVersion === declared.parserVersion) {
            typeof meta.sourcePath === 'string' && replacedPaths.add(`${meta.repoSlug}\u0000${meta.sourcePath}`);
        }
    }

    for (const row of rows) {
        const meta = row?.metadata;

        if (!meta || meta.tenantId !== tenantId) continue;

        const declared = declaredByRepo[meta.repoSlug];

        // Never guess a generation: a repo with no declared pair is unresolvable, not stale.
        if (!declared || typeof declared.parserId !== 'string' || typeof declared.parserVersion !== 'string') {
            continue;
        }

        // Missing stamp is unclassifiable — the same fail-safe `kbGarbageCollectionEngine` applies.
        if (typeof meta.parserId !== 'string' || typeof meta.parserVersion !== 'string' || typeof meta.sourcePath !== 'string') {
            continue;
        }

        if (meta.parserId === declared.parserId && meta.parserVersion === declared.parserVersion) {
            continue;
        }

        const yielded = yieldedPathsByRepo?.[meta.repoSlug],
              hasSet  = yielded instanceof Set || Array.isArray(yielded);

        let tier;

        if (hasSet) {
            const isYielded = yielded instanceof Set ? yielded.has(meta.sourcePath) : yielded.includes(meta.sourcePath);

            tier = isYielded ? 'superseded' : 'unyielded';
        } else {
            // Envelope unavailable for this repo: tier 1 does not run, so the row can only be the
            // replacement-gated tier. Unknown is not empty.
            tier = 'superseded';
        }

        parserOrphans.push({
            id           : row.id,
            repoSlug     : meta.repoSlug,
            sourcePath   : meta.sourcePath,
            parserId     : meta.parserId,
            parserVersion: meta.parserVersion,
            tier
        });

        if (tier === 'unyielded' || replacedPaths.has(`${meta.repoSlug}\u0000${meta.sourcePath}`)) {
            actionableIds.push(row.id);
        }
    }

    return {
        parserOrphans,
        parserOrphanCount: parserOrphans.length,
        actionableIds,
        actionableCount  : actionableIds.length
    };
}

/**
 * @summary Builds the Phase 4A telemetry `detail` payload for one tenant's reconciliation tick.
 *
 * Pure — kept here (not in the daemon) so the telemetry shape is unit-testable. The daemon
 * passes the returned object straight to `KBRecorderService.recordIngestionMetric`'s `detail`.
 *
 * @param {Object}  params
 * @param {{staleCount: Number, manifestOrphanCount: Number, parserOrphanCount: Number, actionableCount: Number, totalOrphanCount: Number}} params.diff  Combined reconciliation diff.
 * @param {Number}  params.currentVersion   The tenant's current config version.
 * @param {Boolean} params.autoTombstone    Whether the daemon's auto-tombstone path is enabled.
 * @param {Number} [params.tombstonedCount=0] Chunks actually deleted this tick (`0` when auto-tombstone is off).
 * @returns {{staleCount: Number, manifestOrphanCount: Number, parserOrphanCount: Number, totalOrphanCount: Number, actionableCount: Number, tombstonedCount: Number, currentVersion: Number, autoTombstone: Boolean}}
 */
export function formatReconciliationDetail({diff, currentVersion, autoTombstone, tombstonedCount = 0} = {}) {
    // `parserOrphanCount` is reported separately and never folded into the others. Three signals
    // answer three different questions — config epoch, claimed path set, parser generation — and a
    // reader who cannot tell which one fired cannot tell whether a reclaim followed a config change
    // or a parser bump.
    return {
        staleCount         : diff?.staleCount          ?? 0,
        manifestOrphanCount: diff?.manifestOrphanCount ?? 0,
        parserOrphanCount  : diff?.parserOrphanCount   ?? 0,
        totalOrphanCount   : diff?.totalOrphanCount    ?? diff?.staleCount ?? 0,
        actionableCount    : diff?.actionableCount     ?? 0,
        tombstonedCount    : Number.isFinite(tombstonedCount) ? tombstonedCount : 0,
        currentVersion     : typeof currentVersion === 'number' ? currentVersion : 0,
        autoTombstone      : autoTombstone === true
    };
}
