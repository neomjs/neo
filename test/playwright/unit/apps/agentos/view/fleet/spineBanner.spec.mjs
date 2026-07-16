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
                const result   = deriveSpineBanner({gridAdapterState, streamAdapterState}),
                      anyCold  = gridAdapterState === 'sample' || streamAdapterState === 'sample',
                      anyStale = gridAdapterState === 'stale'  || streamAdapterState === 'stale',
                      expected = anyCold ? 'cold' : anyStale ? 'degraded' : 'live';

                expect(result.kind, `${gridAdapterState}×${streamAdapterState}`).toBe(expected);
                expect(result.hidden, `${gridAdapterState}×${streamAdapterState}`).toBe(expected === 'live')
            }
        }
    });

    test('cold names the cause AND a remedy that EXISTS at this head', () => {
        const {text} = deriveSpineBanner({gridAdapterState: 'sample', streamAdapterState: 'live'});

        expect(text).toContain('Fleet server offline');
        expect(text).toContain('sample data');
        // the shipped transport command — also the correct mid-session restart remedy once a
        // composed launcher exists, since the app server survives a fleet-transport loss
        expect(text).toContain('npm run ai:fleet-server')
    });

    test('degraded names the honest data state', () => {
        const {text} = deriveSpineBanner({gridAdapterState: 'live', streamAdapterState: 'stale'});

        expect(text).toContain('degraded');
        expect(text).toContain('last-known')
    });

    test('a fully live spine renders NOTHING — zero nominal pixels', () => {
        const result = deriveSpineBanner({gridAdapterState: 'live', streamAdapterState: 'live'});

        expect(result).toEqual({hidden: true, kind: 'live', text: ''})
    })
});
