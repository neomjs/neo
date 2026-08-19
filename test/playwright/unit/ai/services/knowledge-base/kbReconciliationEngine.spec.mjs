import {test, expect} from '@playwright/test';

import {
    DEFAULT_ORPHAN_VERSION_GAP,
    diffTenantChunks,
    diffTenantManifest,
    diffTenantParserIdentity,
    formatReconciliationDetail,
    resolveOrphanVersionGap
} from '../../../../../../ai/services/knowledge-base/helpers/kbReconciliationEngine.mjs';

/**
 * Phase 4B (#11640) — `KbReconciliationEngine` coverage: the pure config-invalidation  ticket-ref-ok: implementing ticket
 * reconciliation core of the KB reconciliation daemon.
 *
 * The module is dependency-free (no Neo class system, no I/O, no clock) — so this spec
 * needs no `setup()` harness; it imports the pure functions directly and exercises them
 * against fixture rows whose shape mirrors `KnowledgeBaseIngestionService.getTenantRows`
 * (`{id, metadata}`).
 *
 * Covers the #11640 Contract Ledger Evidence column for the engine row: stale-detection,  ticket-ref-ok: implementing ticket
 * the version-gap partition, the `currentVersion: 0` no-op, and the missing-stamp skip.
 * The daemon I/O (poll loop, Chroma read, telemetry) is covered separately in
 * `KbReconciliationService.spec.mjs`.
 *
 * @see https://github.com/neomjs/neo/issues/11640
 * @see ai/services/knowledge-base/helpers/kbReconciliationEngine.mjs — the module under test.
 */

/** Builds a tenant Chroma row in the `getTenantRows` shape. `v` → `metadata.tenantConfigVersion`. */
const row = (id, v, metadata = {}) => ({
    id,
    metadata: {
        tenantConfigVersion: v,
        ingestedAt          : 1000,
        repoSlug           : 'repo-x',
        tenantId           : 'tenant-x',
        sourcePath         : 'src/' + id + '.js',
        ...metadata
    }
});

test.describe('KbReconciliationEngine — resolveOrphanVersionGap (#11640)', () => {
    test('returns a finite value at or above 1 unchanged', () => {
        expect(resolveOrphanVersionGap(1)).toBe(1);
        expect(resolveOrphanVersionGap(3)).toBe(3);
        expect(resolveOrphanVersionGap(2.5)).toBe(2.5);
    });

    test('degrades a sub-1 value to the default', () => {
        expect(resolveOrphanVersionGap(0)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap(-4)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap(0.5)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
    });

    test('degrades a non-finite / non-numeric value to the default', () => {
        expect(resolveOrphanVersionGap(undefined)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap(null)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap(NaN)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap(Infinity)).toBe(DEFAULT_ORPHAN_VERSION_GAP);
        expect(resolveOrphanVersionGap('2')).toBe(DEFAULT_ORPHAN_VERSION_GAP);
    });

    test('the default version-gap is 2 — one config epoch of grace', () => {
        expect(DEFAULT_ORPHAN_VERSION_GAP).toBe(2);
    });
});

test.describe('KbReconciliationEngine — diffTenantChunks (#11640)', () => {
    test('flags chunks below the current config version as config-stale orphans', () => {
        const rows = [row('a', 5), row('b', 4), row('c', 3), row('d', 1)];
        const diff = diffTenantChunks({rows, currentVersion: 5, orphanVersionGap: 2});

        // v5 is current → not stale; v4/v3/v1 are stale.
        expect(diff.staleCount).toBe(3);
        expect(diff.staleOrphans.map(o => o.id).sort()).toEqual(['b', 'c', 'd']);
    });

    test('computes versionGap = currentVersion - tenantConfigVersion per orphan', () => {
        const diff = diffTenantChunks({rows: [row('b', 4), row('d', 1)], currentVersion: 5, orphanVersionGap: 2});
        const gaps = Object.fromEntries(diff.staleOrphans.map(o => [o.id, o.versionGap]));

        expect(gaps).toEqual({b: 1, d: 4});
    });

    test('partitions actionable orphans by versionGap >= orphanVersionGap', () => {
        const rows = [row('a', 5), row('b', 4), row('c', 3), row('d', 1)];
        const diff = diffTenantChunks({rows, currentVersion: 5, orphanVersionGap: 2});

        // gaps: b=1 (within grace), c=2 (actionable), d=4 (actionable).
        expect(diff.actionableIds.sort()).toEqual(['c', 'd']);
        expect(diff.actionableCount).toBe(2);
    });

    test('a chunk exactly at the current version is not stale (strict less-than)', () => {
        const diff = diffTenantChunks({rows: [row('a', 7)], currentVersion: 7, orphanVersionGap: 2});

        expect(diff.staleCount).toBe(0);
        expect(diff.actionableCount).toBe(0);
    });

    test('currentVersion 0 (yaml / default config tier) yields zero orphans', () => {
        const rows = [row('a', 0), row('b', 0)];
        const diff = diffTenantChunks({rows, currentVersion: 0, orphanVersionGap: 2});

        expect(diff.staleCount).toBe(0);
        expect(diff.staleOrphans).toHaveLength(0);
    });

    test('a chunk with a missing / non-numeric tenantConfigVersion is never flagged', () => {
        const rows = [
            {id: 'no-stamp', metadata: {repoSlug: 'repo-x'}},
            {id: 'null-stamp', metadata: {tenantConfigVersion: null}},
            {id: 'string-stamp', metadata: {tenantConfigVersion: '1'}},
            row('stale', 1)
        ];
        const diff = diffTenantChunks({rows, currentVersion: 5, orphanVersionGap: 2});

        // Only the real numeric-stamped stale chunk is flagged; the unclassifiable ones are skipped.
        expect(diff.staleCount).toBe(1);
        expect(diff.staleOrphans[0].id).toBe('stale');
    });

    test('defaults orphanVersionGap when it is omitted or invalid', () => {
        const rows = [row('b', 4), row('c', 3)]; // gaps 1, 2 against currentVersion 5

        // Omitted → DEFAULT (2): only gap-2 is actionable.
        expect(diffTenantChunks({rows, currentVersion: 5}).actionableIds).toEqual(['c']);
        // Invalid (0) → DEFAULT (2): same partition.
        expect(diffTenantChunks({rows, currentVersion: 5, orphanVersionGap: 0}).actionableIds).toEqual(['c']);
    });

    test('orphanVersionGap 1 means no grace — every stale chunk is actionable', () => {
        const rows = [row('b', 4), row('c', 3)];
        const diff = diffTenantChunks({rows, currentVersion: 5, orphanVersionGap: 1});

        expect(diff.actionableCount).toBe(2);
    });

    test('returns an empty result for a non-array rows input (defensive)', () => {
        const diff = diffTenantChunks({rows: null, currentVersion: 5});

        expect(diff).toEqual({staleOrphans: [], staleCount: 0, actionableIds: [], actionableCount: 0});
    });

    test('returns an empty result for a non-numeric currentVersion (defensive)', () => {
        expect(diffTenantChunks({rows: [row('a', 1)], currentVersion: undefined}).staleCount).toBe(0);
        expect(diffTenantChunks({rows: [row('a', 1)], currentVersion: 'five'}).staleCount).toBe(0);
    });

    test('an all-current tenant yields zero orphans', () => {
        const rows = [row('a', 9), row('b', 9), row('c', 9)];

        expect(diffTenantChunks({rows, currentVersion: 9, orphanVersionGap: 2}).staleCount).toBe(0);
    });
});

test.describe('KbReconciliationEngine — diffTenantManifest (#11711)', () => {
    test('flags rows whose sourcePath is absent from the persisted repo manifest', () => {
        const diff = diffTenantManifest({
            rows: [
                row('live', 5, {sourcePath: 'src/live.js'}),
                row('orphan', 5, {sourcePath: 'src/old.js'}),
                row('other-repo', 5, {repoSlug: 'repo-y', sourcePath: 'src/old.js'})
            ],
            manifestsByRepo: {
                'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
            }
        });

        expect(diff.orphanCount).toBe(1);
        expect(diff.manifestOrphans).toEqual([{
            id               : 'orphan',
            repoSlug         : 'repo-x',
            sourcePath       : 'src/old.js',
            ingestedAt       : 1000,
            manifestUpdatedAt: 2000
        }]);
        expect(diff.actionableIds).toEqual(['orphan']);
        expect(diff.actionableCount).toBe(1);
    });

    test('skips repos without a persisted manifest and rows without sourcePath', () => {
        const diff = diffTenantManifest({
            rows: [
                row('repo-without-manifest', 5, {repoSlug: 'repo-y', sourcePath: 'src/old.js'}),
                row('missing-source', 5, {sourcePath: undefined})
            ],
            manifestsByRepo: {
                'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
            }
        });

        expect(diff).toEqual({manifestOrphans: [], orphanCount: 0, actionableIds: [], actionableCount: 0});
    });

    test('skips rows that are newer than the persisted manifest snapshot', () => {
        const diff = diffTenantManifest({
            rows: [
                row('old-orphan', 5, {sourcePath: 'src/old.js', ingestedAt: 1000}),
                row('newer-row', 5, {sourcePath: 'src/new.js', ingestedAt: 3000})
            ],
            manifestsByRepo: {
                'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
            }
        });

        expect(diff.orphanCount).toBe(1);
        expect(diff.manifestOrphans[0]).toMatchObject({
            id               : 'old-orphan',
            ingestedAt       : 1000,
            manifestUpdatedAt: 2000
        });
        expect(diff.actionableIds).toEqual(['old-orphan']);
    });

    test('skips rows without a finite ingestedAt stamp', () => {
        const diff = diffTenantManifest({
            rows: [
                row('missing-ingested', 5, {sourcePath: 'src/missing.js', ingestedAt: undefined}),
                row('string-ingested', 5, {sourcePath: 'src/string.js', ingestedAt: '1000'}),
                row('real-orphan', 5, {sourcePath: 'src/old.js', ingestedAt: 1000})
            ],
            manifestsByRepo: {
                'repo-x': {pathsAfterPush: ['src/live.js'], updatedAt: 2000}
            }
        });

        expect(diff.orphanCount).toBe(1);
        expect(diff.actionableIds).toEqual(['real-orphan']);
    });

    test('returns an empty result when manifest input is absent or malformed', () => {
        expect(diffTenantManifest({rows: [row('a', 1)]}).orphanCount).toBe(0);
        expect(diffTenantManifest({rows: [row('a', 1)], manifestsByRepo: []}).orphanCount).toBe(0);
        expect(diffTenantManifest({rows: null, manifestsByRepo: {'repo-x': {pathsAfterPush: []}}}).orphanCount).toBe(0);
        expect(diffTenantManifest({
            rows           : [row('a', 1)],
            manifestsByRepo: {'repo-x': {pathsAfterPush: [], updatedAt: undefined}}
        }).orphanCount).toBe(0);
    });
});

test.describe('KbReconciliationEngine — formatReconciliationDetail (#11640)', () => {
    test('builds the Phase 4A telemetry detail payload from a diff', () => {
        const diff   = {staleCount: 5, manifestOrphanCount: 2, totalOrphanCount: 7, actionableCount: 3, staleOrphans: [], actionableIds: []};
        const detail = formatReconciliationDetail({diff, currentVersion: 7, autoTombstone: true, tombstonedCount: 3});

        expect(detail).toEqual({
            staleCount         : 5,
            manifestOrphanCount: 2,
            parserOrphanCount  : 0,
            totalOrphanCount   : 7,
            actionableCount    : 3,
            tombstonedCount    : 3,
            currentVersion     : 7,
            autoTombstone      : true
        });
    });

    test('coerces autoTombstone to a strict boolean and defaults tombstonedCount to 0', () => {
        const diff   = {staleCount: 2, actionableCount: 0};
        const detail = formatReconciliationDetail({diff, currentVersion: 3, autoTombstone: undefined});

        expect(detail.autoTombstone).toBe(false);
        expect(detail.tombstonedCount).toBe(0);
    });

    test('is defensive against a missing diff / currentVersion', () => {
        const detail = formatReconciliationDetail({});

        expect(detail).toEqual({
            staleCount         : 0,
            manifestOrphanCount: 0,
            parserOrphanCount  : 0,
            totalOrphanCount   : 0,
            actionableCount    : 0,
            tombstonedCount    : 0,
            currentVersion     : 0,
            autoTombstone      : false
        });
    });
});


test.describe('diffTenantParserIdentity — parser-identity orphans (#17392)', () => {
    const DECLARED = {parserId: 'docker-mcp-source', parserVersion: '1.1.0'},
          SUPERSED = {parserId: 'docker-mcp-source', parserVersion: '1.0.0'},
          REPO     = 'org/repo';

    /**
     * @param {Object} overrides
     * @returns {Object}
     */
    function row({id, path, parser = SUPERSED, tenantId = 't1', repoSlug = REPO, configVersion = 7}) {
        return {
            id,
            metadata: {
                tenantId,
                repoSlug,
                sourcePath         : path,
                parserId           : parser.parserId,
                parserVersion      : parser.parserVersion,
                tenantConfigVersion: configVersion
            }
        }
    }

    test('RED-PROOF: a superseded generation surviving beside its replacement is classified — the state the defect leaves behind', () => {
        // Advancing parserVersion changes every chunk id (`hashInputs`), so the new generation ADDS
        // rows. Both live in the collection; only the old one is an orphan. If this arm passes with
        // an empty result, the classifier is not exercising the defect at all.
        const rows = [
            row({id: 'old', path: 'a.md'}),
            row({id: 'new', path: 'a.md', parser: DECLARED})
        ];

        const out = diffTenantParserIdentity({
            rows, tenantId: 't1',
            declaredByRepo    : {[REPO]: DECLARED},
            yieldedPathsByRepo: {[REPO]: ['a.md']}
        });

        expect(out.parserOrphanCount, 'the superseded row must be seen').toBe(1);
        expect(out.parserOrphans[0].id).toBe('old');
        expect(out.parserOrphans[0].tier).toBe('superseded');
        expect(out.actionableIds, 'its replacement exists, so it is reclaimable').toEqual(['old']);
    });

    test('CONTROL: an unchanged declared pair classifies nothing — without this, firing indiscriminately is equally green', () => {
        const rows = [row({id: 'a', path: 'a.md', parser: DECLARED}), row({id: 'b', path: 'b.md', parser: DECLARED})];

        const out = diffTenantParserIdentity({
            rows, tenantId: 't1',
            declaredByRepo    : {[REPO]: DECLARED},
            yieldedPathsByRepo: {[REPO]: ['a.md', 'b.md']}
        });

        expect(out.parserOrphanCount).toBe(0);
        expect(out.actionableCount).toBe(0);
    });

    test('NO-HOLE: a still-yielded path with no replacement yet is seen but NOT actionable', () => {
        // The delete-before-embed window made concrete: at partial embedding progress the
        // superseded row is the only copy of that path, so reclaiming it opens a retrieval hole.
        const out = diffTenantParserIdentity({
            rows              : [row({id: 'old', path: 'pending.md'})],
            tenantId          : 't1',
            declaredByRepo    : {[REPO]: DECLARED},
            yieldedPathsByRepo: {[REPO]: ['pending.md']}
        });

        expect(out.parserOrphanCount, 'it is classified').toBe(1);
        expect(out.parserOrphans[0].tier).toBe('superseded');
        expect(out.actionableIds, 'but not reclaimable until its replacement lands').toEqual([]);
    });

    test('UNYIELDED: a path the declared parser no longer yields is immediately actionable — no replacement is ever coming', () => {
        const out = diffTenantParserIdentity({
            rows              : [row({id: 'gone', path: 'vendor/x.md'})],
            tenantId          : 't1',
            declaredByRepo    : {[REPO]: DECLARED},
            yieldedPathsByRepo: {[REPO]: ['a.md']}
        });

        expect(out.parserOrphans[0].tier).toBe('unyielded');
        expect(out.actionableIds).toEqual(['gone']);
    });

    test('tenantConfigVersion INDEPENDENCE: fires with the config version identical across both generations', () => {
        // The signal that already exists cannot see this: `diffTenantChunks` keys on
        // tenantConfigVersion, and a parser change never moves it. Both rows carry 7.
        const rows = [row({id: 'old', path: 'a.md', configVersion: 7}), row({id: 'new', path: 'a.md', parser: DECLARED, configVersion: 7})];

        expect(diffTenantChunks({rows, currentVersion: 7}).staleCount, 'the existing signal is blind here').toBe(0);

        const out = diffTenantParserIdentity({
            rows, tenantId: 't1',
            declaredByRepo    : {[REPO]: DECLARED},
            yieldedPathsByRepo: {[REPO]: ['a.md']}
        });

        expect(out.actionableIds).toEqual(['old']);
    });

    test('TENANT CONTAINMENT: with both tenants resident in the shared collection, classifying A yields no row carrying B', () => {
        // One shared collection, metadata-scoped isolation. Asserted by per-tenantId count over
        // the returned ids, not by the classifier reporting its own scope.
        const rows = [
            row({id: 'a-old', path: 'a.md', tenantId: 't1'}),
            row({id: 'a-new', path: 'a.md', tenantId: 't1', parser: DECLARED}),
            row({id: 'b-old', path: 'a.md', tenantId: 't2'}),
            row({id: 'b-new', path: 'a.md', tenantId: 't2', parser: DECLARED})
        ];

        const out     = diffTenantParserIdentity({rows, tenantId: 't1', declaredByRepo: {[REPO]: DECLARED}, yieldedPathsByRepo: {[REPO]: ['a.md']}}),
              byId    = new Map(rows.map(r => [r.id, r.metadata.tenantId])),
              foreign = out.parserOrphans.filter(o => byId.get(o.id) !== 't1');

        expect(out.actionableIds).toEqual(['a-old']);
        expect(foreign, 'no row carrying tenant B may appear in tenant A classification').toEqual([]);
    });

    test('a row missing its parser stamp is SKIPPED, not classified — matching the garbage-collection engine precedent', () => {
        const rows = [{id: 'legacy', metadata: {tenantId: 't1', repoSlug: REPO, sourcePath: 'a.md', tenantConfigVersion: 7}}];

        const out = diffTenantParserIdentity({rows, tenantId: 't1', declaredByRepo: {[REPO]: DECLARED}, yieldedPathsByRepo: {[REPO]: ['a.md']}});

        expect(out.parserOrphanCount).toBe(0);
    });

    test('an unresolvable declared pair classifies NOTHING — never guess a generation', () => {
        const rows = [row({id: 'old', path: 'a.md'})];

        expect(diffTenantParserIdentity({rows, tenantId: 't1', declaredByRepo: {}, yieldedPathsByRepo: {[REPO]: ['a.md']}}).parserOrphanCount).toBe(0);
        expect(diffTenantParserIdentity({rows, tenantId: 't1', declaredByRepo: {[REPO]: {parserId: 'p'}}}).parserOrphanCount).toBe(0);
    });

    test('an absent yielded-path set means UNKNOWN, not empty — tier 1 does not run and the row stays replacement-gated', () => {
        // Treating a missing envelope as "yields nothing" would classify an entire repo actionable.
        const out = diffTenantParserIdentity({
            rows          : [row({id: 'old', path: 'a.md'})],
            tenantId      : 't1',
            declaredByRepo: {[REPO]: DECLARED}
        });

        expect(out.parserOrphans[0].tier, 'never unyielded on a missing envelope').toBe('superseded');
        expect(out.actionableIds, 'and not reclaimable without a replacement').toEqual([]);
    });
});

test.describe('formatReconciliationDetail — the three signals stay distinguishable (#17392)', () => {  // ticket-ref-ok: names which signal the arm pins
    test('parser-identity orphans are reported on their own key, never folded into the other two', () => {
        const detail = formatReconciliationDetail({
            diff          : {staleCount: 3, manifestOrphanCount: 5, parserOrphanCount: 7, actionableCount: 2, totalOrphanCount: 15},
            currentVersion: 7,
            autoTombstone : false
        });

        // Three signals answer three different questions. A reader who cannot tell which one fired
        // cannot tell whether a reclaim followed a config change or a parser bump.
        expect(detail.staleCount).toBe(3);
        expect(detail.manifestOrphanCount).toBe(5);
        expect(detail.parserOrphanCount).toBe(7);
    });

    test('a diff carrying no parser count reports 0 rather than undefined — the daemon predates this signal', () => {
        expect(formatReconciliationDetail({diff: {staleCount: 1}, currentVersion: 2, autoTombstone: false}).parserOrphanCount).toBe(0);
    });
});
