import {test, expect}      from '@playwright/test';
import {deriveSpineBanner} from '../../../../../../../apps/agentos/view/fleet/spineBanner.mjs';

/**
 * The full derivation matrix for the cockpit's per-SPINE honesty line: `sample` (cold — the
 * spine is unreachable) beats `stale` (reachable but degraded) beats `live`; ONLY the fully
 * live spine hides the banner (nominal earns zero pixels). The slot-sync consumer is witnessed
 * directly in fleetCockpit.spec.mjs against a recording banner slot — including the owner-truth
 * immobility boundary (once live, failure exits preserve live; the transition is the dedicated
 * liveness owner's contract, not this reducer's).
 */
test.describe('fleet/spineBanner — the per-spine honesty derivation', () => {

    const STATES = ['sample', 'stale', 'live'];

    test('the full 3×3 matrix: cold beats degraded beats live; only live+live hides', () => {
        for (const gridAdapterState of STATES) {
            for (const streamAdapterState of STATES) {
                const result   = deriveSpineBanner({grid: {state: gridAdapterState}, stream: {state: streamAdapterState}}),
                      anyCold  = gridAdapterState === 'sample' || streamAdapterState === 'sample',
                      anyStale = gridAdapterState === 'stale'  || streamAdapterState === 'stale',
                      expected = anyCold ? 'cold' : anyStale ? 'degraded' : 'live';

                expect(result.kind, `${gridAdapterState}×${streamAdapterState}`).toBe(expected);
                expect(result.hidden, `${gridAdapterState}×${streamAdapterState}`).toBe(expected === 'live')
            }
        }
    });

    test('cold with NO retained reason names the cause AND a remedy that EXISTS at this head', () => {
        const {text} = deriveSpineBanner({grid: {state: 'sample'}, stream: {state: 'live'}});

        expect(text).toContain('Fleet server offline');
        expect(text).toContain('sample data');
        // the shipped transport command — also the correct mid-session restart remedy once a
        // composed launcher exists, since the app server survives a fleet-transport loss
        expect(text).toContain('npm run ai:fleet-server')
    });

    test('cold WITH a retained reason names it — and never tells the operator to start a running server', () => {
        // The shipping lie this closes: `devFleetServer` wires no `activitySource`, so a LIVE server
        // answers `fleetActivity` with `not-wired` forever. The stream keeps its seed — so `sample`
        // is honest about the DATA — but the cold copy read that as a claim about the SERVER and told
        // the operator to start a process that had just answered. One token was carrying two facts:
        // "we never reached it" and "it answered: my source is unconfigured". The retained reason is
        // what separates them, so the line names what the producer actually said.
        // the cause travels WITH the surface that produced it: the roster is healthy and has nothing
        // to say about the activity feed's silence
        const {text, kind} = deriveSpineBanner({
            grid  : {state: 'live'},
            stream: {state: 'sample', reason: 'fleet activity source not wired'}
        });

        expect(kind).toBe('cold');
        expect(text).toContain('fleet activity source not wired');
        expect(text).toContain('sample data');
        expect(text).not.toContain('Fleet server offline');
        expect(text).not.toContain('npm run ai:fleet-server')
    });

    test('cold falls back to the generic copy for silence — the only state that implies an offline server', () => {
        // The guard against over-correcting: a torn/absent answer teaches the owner NOTHING, so there
        // is no reason to name and the generic remedy is the honest guess. An empty-ish reason must
        // not sneak through as a "cause" either.
        ['', '   ', null, undefined].forEach(degradedReason => {
            const {text} = deriveSpineBanner({grid: {state: 'sample', reason: degradedReason}, stream: {state: 'live'}});

            expect(text, JSON.stringify(degradedReason)).toContain('Fleet server offline')
        })
    });

    test('degraded names the honest data state', () => {
        const {text} = deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'stale'}});

        expect(text).toContain('degraded');
        expect(text).toContain('last-known')
    });

    test('a fully live spine renders NOTHING — zero nominal pixels', () => {
        const result = deriveSpineBanner({grid: {state: 'live'}, stream: {state: 'live'}});

        expect(result).toEqual({hidden: true, kind: 'live', text: ''})
    })
});
