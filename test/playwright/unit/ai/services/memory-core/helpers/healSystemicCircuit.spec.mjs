import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../src/core/_export.mjs';
import {
    EMBEDDER_OUTAGE_SIGNATURE,
    isEmbedderOutageFailure,
    decideSystemicCircuit,
    foldSystemicCircuitState,
    SYSTEMIC_CIRCUIT_EVENTS
} from '../../../../../../../ai/services/memory-core/helpers/healSystemicCircuit.mjs';

const NOW = 1_000_000;

// A failure inside the 10-minute window (now - at < 600000).
const inWindow = NOW - 100_000; // 900000
// A failure outside the window (now - at >= 600000).
const outWindow = NOW - 700_000; // 300000

// The `recoveryActuator.systemicCircuit` config-leaf defaults, as a unit fixture — the wiring reads these from the
// reactive SSOT and passes them per call; the pure decider holds NO default of its own.
const BOUNDS = {systemicThreshold: 3, windowMs: 600_000, openDurationMs: 600_000};

const outage = (collection, at = inWindow) => ({collection, at, detail: 'TextEmbeddingService request failed: ECONNREFUSED 127.0.0.1:1234'});

// Inject the fixture bounds; a per-test `bounds` in opts overrides (must be COMPLETE — there is no normalization).
const decide = (opts = {}) => decideSystemicCircuit({bounds: BOUNDS, ...opts});

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
        const decision = decide({recentFailures: [outage('c1'), outage('c2'), outage('c3')], now: NOW});

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('tripped');
        expect(decision.distinctFailingCollections).toEqual(['c1', 'c2', 'c3']);
    });

    test('does NOT trip when failures are below the distinct-collection threshold', () => {
        const decision = decide({recentFailures: [outage('c1'), outage('c2')], now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed');
    });

    test('DISTINCT requirement: ONE collection failing many times is NOT systemic (cross-collection, not per-collection)', () => {
        const decision = decide({recentFailures: [outage('c1'), outage('c1'), outage('c1'), outage('c1')], now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed'); // the per-collection anti-thrash owns this case, not the breaker
    });

    test('SIGNATURE requirement: distinct collections failing with NON-outage details do NOT trip', () => {
        const dataErrors = ['c1', 'c2', 'c3'].map(c => ({collection: c, at: inWindow, detail: 'row 7 malformed vector'}));
        const decision   = decide({recentFailures: dataErrors, now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed'); // isolated data faults must not masquerade as a shared outage
    });

    test('WINDOW requirement: distinct outage failures OUTSIDE the window do NOT trip', () => {
        const stale    = ['c1', 'c2', 'c3'].map(c => outage(c, outWindow));
        const decision = decide({recentFailures: stale, now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed');
    });

    test('FUTURE-row guard: future-dated outage rows (negative age — a forward clock) do NOT trip', () => {
        const future   = ['c1', 'c2', 'c3'].map(c => outage(c, NOW + 100_000)); // at > now → negative age
        const decision = decide({recentFailures: future, now: NOW});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('closed'); // a forward clock must not trip the global suppressor
    });

    test('a COMPLETE custom bounds object overrides the injected fixture (threshold 2 trips at 2 distinct)', () => {
        const decision = decide({
            recentFailures: [outage('c1'), outage('c2')], // 2 distinct
            now           : NOW,
            bounds        : {systemicThreshold: 2, windowMs: 600_000, openDurationMs: 600_000}
        });

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('tripped');
    });
});

test.describe('healSystemicCircuit — decideSystemicCircuit (open-state machine)', () => {
    test('an open circuit within openDurationMs suppresses (circuit-open)', () => {
        const decision = decide({circuitOpenedAt: NOW - 100_000, now: NOW}); // 100000 < 600000

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('circuit-open');
    });

    test('an open circuit past openDurationMs goes half-open (allow ONE probe — does NOT suppress)', () => {
        const decision = decide({circuitOpenedAt: NOW - 700_000, now: NOW}); // 700000 >= 600000

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('half-open-probe');
    });

    test('an open circuit short-circuits detection — recentFailures are not even consulted', () => {
        const decision = decide({recentFailures: [], circuitOpenedAt: NOW - 1, now: NOW});

        expect(decision.open).toBe(true);
        expect(decision.status).toBe('circuit-open');
    });
});

test.describe('healSystemicCircuit — decideSystemicCircuit (indeterminate input defers, never spuriously suppresses)', () => {
    test('a non-finite clock yields indeterminate (open:false) — the per-collection gate fails closed instead', () => {
        const decision = decide({recentFailures: [outage('c1'), outage('c2'), outage('c3')]}); // no now

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('indeterminate');
    });

    test('INCOMPLETE bounds (a missing key) yield indeterminate — the decider holds no default; the SSOT leaf supplies all three', () => {
        const decision = decide({
            recentFailures: [outage('c1'), outage('c2'), outage('c3')], // would trip if bounds were complete
            now           : NOW,
            bounds        : {systemicThreshold: 3} // missing windowMs + openDurationMs
        });

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('indeterminate');
    });

    test('non-finite bound values yield indeterminate rather than disabling the gate silently', () => {
        const decision = decide({now: NOW, bounds: {systemicThreshold: NaN, windowMs: 600_000, openDurationMs: 600_000}});

        expect(decision.open).toBe(false);
        expect(decision.status).toBe('indeterminate');
    });

    test('exports the tunable outage signature for the wiring slice', () => {
        expect(Array.isArray(EMBEDDER_OUTAGE_SIGNATURE)).toBe(true);
        expect(EMBEDDER_OUTAGE_SIGNATURE).toContain('econnrefused');
    });

    test('foldSystemicCircuitState: last unmatched circuit-open → circuitOpenedAt; a later close → null', () => {
        const open = foldSystemicCircuitState([
                  {type: SYSTEMIC_CIRCUIT_EVENTS.OPEN, status: 'open',   at: 100},
                  {type: 're-embed-missing',           status: 'failed', at: 150, detail: 'econnrefused', collection: 'a'},
                  {type: SYSTEMIC_CIRCUIT_EVENTS.OPEN, status: 'open',   at: 200}  // a later open wins
              ], {now: NOW, windowMs: 600_000}),
              closed = foldSystemicCircuitState([
                  {type: SYSTEMIC_CIRCUIT_EVENTS.OPEN,  status: 'open',  at: 100},
                  {type: SYSTEMIC_CIRCUIT_EVENTS.CLOSE, status: 'close', at: 300}  // close clears the open
              ], {now: NOW, windowMs: 600_000});

        expect(open.circuitOpenedAt).toBe(200);
        expect(closed.circuitOpenedAt).toBe(null);
    });

    test('foldSystemicCircuitState: recentFailures = failed rows in-window; circuit + non-failed rows excluded', () => {
        const {recentFailures} = foldSystemicCircuitState([
            {type: 're-embed-missing',           status: 'failed', at: NOW - 100_000, detail: 'econnrefused', collection: 'a'}, // in-window failure
            {type: 're-embed-missing',           status: 'failed', at: NOW - 900_000, detail: 'timeout',      collection: 'b'}, // OUT of window
            {type: 're-embed-missing',           status: 'healed', at: NOW - 50_000,                          collection: 'c'}, // not a failure
            {type: SYSTEMIC_CIRCUIT_EVENTS.OPEN, status: 'open',   at: NOW - 10_000,                          collection: '*'}  // a circuit event, not a failure
        ], {now: NOW, windowMs: 600_000});

        expect(recentFailures).toHaveLength(1);
        expect(recentFailures[0]).toMatchObject({collection: 'a', detail: 'econnrefused'});
    });
});
