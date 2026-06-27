import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    EMBEDDER_OUTAGE_SIGNATURE,
    DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS,
    isEmbedderOutageFailure,
    decideSystemicCircuit
} from '../../../../../../../ai/services/memory-core/helpers/healSystemicCircuit.mjs';

const NOW = 1_000_000;

// A failure inside the default 10-minute window (now - at < 600000).
const inWindow = NOW - 100_000; // 900000
// A failure outside the window (now - at >= 600000).
const outWindow = NOW - 700_000; // 300000

const outage = (collection, at = inWindow) => ({collection, at, detail: 'TextEmbeddingService request failed: ECONNREFUSED 127.0.0.1:1234'});

test.describe('healSystemicCircuit — isEmbedderOutageFailure', () => {
    test('matches shared-dependency outage signatures (case-insensitive)', () => {
        expect(isEmbedderOutageFailure('connect ECONNREFUSED 127.0.0.1:1234')).toBe(true);
        expect(isEmbedderOutageFailure('HTTP 503 Service Unavailable')).toBe(true);
        expect(isEmbedderOutageFailure('fetch failed')).toBe(true);
        expect(isEmbedderOutageFailure('Request Timeout after 30s')).toBe(true);
        expect(isEmbedderOutageFailure('embedder returned 404 Not Found')).toBe(true);
    });

    test('rejects data-specific (non-transport) failures — they must not correlate as systemic', () => {
        expect(isEmbedderOutageFailure('row 42 has a malformed vector dimension')).toBe(false);
        expect(isEmbedderOutageFailure('coverage drift: 3 orphaned documents')).toBe(false);
    });

    test('rejects a non-string / empty detail (no transport signal to correlate on)', () => {
        expect(isEmbedderOutageFailure(undefined)).toBe(false);
        expect(isEmbedderOutageFailure(null)).toBe(false);
        expect(isEmbedderOutageFailure({code: 'ECONNREFUSED'})).toBe(false);
        expect(isEmbedderOutageFailure('')).toBe(false);
    });
});

test.describe('healSystemicCircuit — decideSystemicCircuit (closed-state detection)', () => {
    test('trips OPEN when >= threshold DISTINCT collections fail with the outage signature in-window', () => {
        const decision = decideSystemicCircuit({
            recentFailures: [outage('c1'), outage('c2'), outage('c3')],
            now           : NOW
        });

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('tripped');
        expect(decision.distinctFailingCollections).toEqual(['c1', 'c2', 'c3']);
    });

    test('does NOT trip when failures are below the distinct-collection threshold', () => {
        const decision = decideSystemicCircuit({recentFailures: [outage('c1'), outage('c2')], now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed');
    });

    test('DISTINCT requirement: ONE collection failing many times is NOT systemic (cross-collection, not per-collection)', () => {
        const decision = decideSystemicCircuit({
            recentFailures: [outage('c1'), outage('c1'), outage('c1'), outage('c1')], // 4 failures, 1 collection
            now           : NOW
        });

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed'); // the per-collection anti-thrash owns this case, not the breaker
    });

    test('SIGNATURE requirement: distinct collections failing with NON-outage details do NOT trip', () => {
        const dataErrors = ['c1', 'c2', 'c3'].map(c => ({collection: c, at: inWindow, detail: 'row 7 malformed vector'}));
        const decision   = decideSystemicCircuit({recentFailures: dataErrors, now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed'); // isolated data faults must not masquerade as a shared outage
    });

    test('WINDOW requirement: distinct outage failures OUTSIDE the window do NOT trip', () => {
        const stale    = ['c1', 'c2', 'c3'].map(c => outage(c, outWindow));
        const decision = decideSystemicCircuit({recentFailures: stale, now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed');
    });

    test('bounds normalize: a partial {systemicThreshold} overrides while window/openDuration keep defaults', () => {
        const decision = decideSystemicCircuit({
            recentFailures: [outage('c1'), outage('c2')], // 2 distinct
            now           : NOW,
            bounds        : {systemicThreshold: 2}
        });

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('tripped');
    });
});

test.describe('healSystemicCircuit — decideSystemicCircuit (open-state machine)', () => {
    test('an open circuit within openDurationMs suppresses (circuit-open)', () => {
        const decision = decideSystemicCircuit({circuitOpenedAt: NOW - 100_000, now: NOW}); // 100000 < 600000

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('circuit-open');
    });

    test('an open circuit past openDurationMs goes half-open (allow ONE probe — does NOT suppress)', () => {
        const decision = decideSystemicCircuit({circuitOpenedAt: NOW - 700_000, now: NOW}); // 700000 >= 600000

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('half-open-probe');
    });

    test('an open circuit short-circuits detection — recentFailures are not even consulted', () => {
        // Even with zero failures present, an open-within-window circuit stays suppressing.
        const decision = decideSystemicCircuit({recentFailures: [], circuitOpenedAt: NOW - 1, now: NOW});

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('circuit-open');
    });
});

test.describe('healSystemicCircuit — decideSystemicCircuit (indeterminate input defers, never spuriously suppresses)', () => {
    test('a non-finite clock yields indeterminate (open:false) — the per-collection gate fails closed instead', () => {
        const decision = decideSystemicCircuit({recentFailures: [outage('c1'), outage('c2'), outage('c3')]}); // no now

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('indeterminate');
    });

    test('non-finite bounds yield indeterminate rather than disabling the gate silently', () => {
        const decision = decideSystemicCircuit({now: NOW, bounds: {systemicThreshold: NaN}});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('indeterminate');
    });

    test('exports the tunable signature + default bounds for the wiring slice', () => {
        expect(Array.isArray(EMBEDDER_OUTAGE_SIGNATURE)).toBe(true);
        expect(DEFAULT_SYSTEMIC_CIRCUIT_BOUNDS).toMatchObject({systemicThreshold: 3, windowMs: 600_000, openDurationMs: 600_000});
    });
});
