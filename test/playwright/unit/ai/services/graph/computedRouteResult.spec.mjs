import {setup} from '../../../../setup.mjs';

const appName = 'ComputedRouteResultContractTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';

/**
 * Contract tests for the typed `computed-route.v1` result. Covers the "typed route + consumer
 * migration" evidence: schema for every status, route/advisory separation, current-focus
 * substitution, one-version route identity, and the consumer-side fail-open guard.
 */
test.describe('computedRouteResult — computed-route.v1 contract', () => {
    let buildComputedRouteResult, validateComputedRouteResult, computeSourceManifestHash,
        COMPUTED_ROUTE_SCHEMA_VERSION, COMPUTED_ROUTE_STATUSES;

    // A minimally-valid `computed-ranked` result; individual tests override one facet.
    const baseParams = (overrides = {}) => ({
        status            : 'fresh',
        capturedAt        : '2026-07-16T06:00:00.000Z',
        sourceWatermark   : 'wm-1',
        expiresAt         : '2026-07-16T06:10:00.000Z',
        routeVersion      : 'rv-1',
        sourceManifestHash: 'sha-abc',
        provenance        : {producer: 'GoldenPathSynthesizer', runId: 'run-1', algorithmVersion: 'v2'},
        freshness         : {status: 'fresh', checkedAt: '2026-07-16T06:00:00.000Z'},
        route             : {kind: 'computed-ranked', items: [{id: 'issue-1', title: 'Top lane', score: 9.1, rank: 1}]},
        ...overrides
    });

    test.beforeAll(async () => {
        const mod = await import('../../../../../../ai/services/graph/computedRouteResult.mjs');
        buildComputedRouteResult      = mod.buildComputedRouteResult;
        validateComputedRouteResult   = mod.validateComputedRouteResult;
        COMPUTED_ROUTE_SCHEMA_VERSION = mod.COMPUTED_ROUTE_SCHEMA_VERSION;
        COMPUTED_ROUTE_STATUSES       = mod.COMPUTED_ROUTE_STATUSES;
        computeSourceManifestHash     = mod.computeSourceManifestHash;
    });

    test('stamps schemaVersion + notAuthority and freezes the result', () => {
        const result = buildComputedRouteResult(baseParams());

        expect(result.schemaVersion).toBe('computed-route.v1');
        expect(result.schemaVersion).toBe(COMPUTED_ROUTE_SCHEMA_VERSION);
        expect(result.notAuthority).toBe(true);
        expect(Object.isFrozen(result)).toBe(true);
        expect(Object.isFrozen(result.route)).toBe(true);
        expect(Object.isFrozen(result.route.items)).toBe(true);
        expect(Object.isFrozen(result.route.items[0])).toBe(true);
    });

    test('builds a valid result for EVERY status — status stays independent of item count', () => {
        // fresh / empty / missing / stale / degraded — each with an item-count that would be
        // "wrong" if status were derived from route.items, proving no normalization happens.
        for (const status of [...COMPUTED_ROUTE_STATUSES]) {
            const params = status === 'fresh'
                ? baseParams({status})
                : baseParams({status, route: {kind: 'none', items: []}});
            const result = buildComputedRouteResult(params);
            expect(result.status).toBe(status);
        }
    });

    test('a missing/degraded status is NEVER normalized to empty', () => {
        const missing = buildComputedRouteResult(baseParams({status: 'missing', route: {kind: 'none', items: []}}));
        expect(missing.status).toBe('missing');

        const degraded = buildComputedRouteResult(baseParams({status: 'degraded', route: {kind: 'none', items: []}}));
        expect(degraded.status).toBe('degraded');
    });

    test('advisoryFallback context can NOT make an empty route routed — the slots stay separate', () => {
        const result = buildComputedRouteResult(baseParams({
            status          : 'empty',
            route           : {kind: 'none', items: []},
            advisoryFallback: {
                kind  : 'declared-intent',
                status: 'available',
                items : [{id: 'issue-9', title: 'Declared intent lane'}]
            }
        }));

        // The advisory slot is populated, but the executable slot stays empty.
        expect(result.route.items).toHaveLength(0);
        expect(result.advisoryFallback.items).toHaveLength(1);
        expect(result.advisoryFallback.kind).toBe('declared-intent');
        expect(result.status).toBe('empty');
    });

    test('current-focus-substitution is explicit, never inferred from prose or counts', () => {
        const substituted = buildComputedRouteResult(baseParams({
            route: {kind: 'current-focus-substitution', items: [{id: 'issue-5', title: 'Current release focus'}]}
        }));
        expect(substituted.route.kind).toBe('current-focus-substitution');

        // A ranked route with identical items stays computed-ranked — the factory does NOT
        // reclassify it as a substitution.
        const ranked = buildComputedRouteResult(baseParams());
        expect(ranked.route.kind).toBe('computed-ranked');
    });

    test('route identity {routeVersion, sourceManifestHash, sourceWatermark} is required', () => {
        for (const field of ['routeVersion', 'sourceManifestHash', 'sourceWatermark']) {
            expect(() => buildComputedRouteResult(baseParams({[field]: undefined}))).toThrow(new RegExp(field));
        }
    });

    test('fails LOUD on an invalid status / route.kind / freshness.status / advisory.status enum', () => {
        expect(() => buildComputedRouteResult(baseParams({status: 'bogus'}))).toThrow(/status must be one of/);
        expect(() => buildComputedRouteResult(baseParams({route: {kind: 'nope', items: []}}))).toThrow(/route\.kind must be one of/);
        expect(() => buildComputedRouteResult(baseParams({freshness: {status: 'nope'}}))).toThrow(/freshness\.status must be one of/);
        expect(() => buildComputedRouteResult(baseParams({
            advisoryFallback: {kind: 'declared-intent', status: 'nope', items: []}
        }))).toThrow(/advisoryFallback\.status must be one of/);
    });

    test('enforces the structural route.kind / item-count relationship', () => {
        // `none` must be empty.
        expect(() => buildComputedRouteResult(baseParams({
            route: {kind: 'none', items: [{id: 'issue-1', title: 'x'}]}
        }))).toThrow(/"none" must carry zero/);

        // an executable kind must be non-empty.
        expect(() => buildComputedRouteResult(baseParams({
            route: {kind: 'computed-ranked', items: []}
        }))).toThrow(/must carry at least one/);
    });

    test('rejects an advisoryFallback with the wrong kind', () => {
        expect(() => buildComputedRouteResult(baseParams({
            advisoryFallback: {kind: 'computed-ranked', status: 'available', items: []}
        }))).toThrow(/advisoryFallback\.kind must be "declared-intent"/);
    });

    test('validateComputedRouteResult accepts a well-formed result and NEVER throws on bad input', () => {
        const good = buildComputedRouteResult(baseParams());
        expect(validateComputedRouteResult(good)).toEqual({valid: true, errors: []});

        // Consumer-side fail-open: a torn read / legacy shape / null degrades, not crashes.
        expect(validateComputedRouteResult(null).valid).toBe(false);
        expect(validateComputedRouteResult({schemaVersion: 'legacy', status: 'fresh'}).valid).toBe(false);

        const badKind = validateComputedRouteResult({
            schemaVersion: 'computed-route.v1',
            status       : 'fresh',
            notAuthority : true,
            route        : {kind: 'none', items: [{id: 'x', title: 'y'}]},
            routeVersion : 'rv', sourceManifestHash: 'h', sourceWatermark: 'w'
        });
        expect(badKind.valid).toBe(false);
        expect(badKind.errors.some(e => /none.*zero/.test(e))).toBe(true);
    });

    test('computeSourceManifestHash is deterministic, order-independent, and dedup-stable', () => {
        // deterministic
        expect(computeSourceManifestHash(['issue-1', 'issue-2'])).toBe(computeSourceManifestHash(['issue-1', 'issue-2']));
        // order-independent — identifies the source SET, not the ranking order
        expect(computeSourceManifestHash(['issue-1', 'issue-2'])).toBe(computeSourceManifestHash(['issue-2', 'issue-1']));
        // duplicate submissions collapse to the same digest
        expect(computeSourceManifestHash(['issue-1', 'issue-1', 'issue-2'])).toBe(computeSourceManifestHash(['issue-1', 'issue-2']));
        // a changed set changes the digest
        expect(computeSourceManifestHash(['issue-1', 'issue-2'])).not.toBe(computeSourceManifestHash(['issue-1', 'issue-3']));
        // the empty set is stable and hex-shaped; non-empty is hex-shaped too
        expect(computeSourceManifestHash([])).toBe(computeSourceManifestHash([]));
        expect(computeSourceManifestHash([])).toMatch(/^[0-9a-f]{8}$/);
        expect(computeSourceManifestHash(['issue-1'])).toMatch(/^[0-9a-f]{8}$/);
    });

    test('probe: a valid {query, ranAt} is stamped; absent defaults to null; malformed fails loud', () => {
        const withProbe = buildComputedRouteResult(baseParams({
            status: 'empty',
            route : {kind: 'none', items: []},
            probe : {query: 'actionable open issues', ranAt: '2026-07-16T06:00:00.000Z'}
        }));
        expect(withProbe.probe).toEqual({query: 'actionable open issues', ranAt: '2026-07-16T06:00:00.000Z'});

        // absent → honest null (falsifier unwired)
        expect(buildComputedRouteResult(baseParams()).probe).toBe(null);

        // malformed → fail loud (a probe present must carry both fields)
        expect(() => buildComputedRouteResult(baseParams({probe: {query: 'x'}}))).toThrow(/probe\.ranAt/);
    });
});
