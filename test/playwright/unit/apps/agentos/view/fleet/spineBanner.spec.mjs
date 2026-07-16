import {test, expect}      from '@playwright/test';
import {deriveSpineBanner} from '../../../../../../../apps/agentos/view/fleet/spineBanner.mjs';

/**
 * The full derivation matrix for the cockpit's per-SPINE honesty line: `sample` (cold — the
 * spine is unreachable) beats `stale` (reachable but degraded) beats `live`; ONLY the fully
 * live spine hides the banner (nominal earns zero pixels). The sync wiring in the cockpit is
 * a five-line consumer of this pure seam and rides the load-routing suites.
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

    test('cold names the cause AND the one-command remedy', () => {
        const {text} = deriveSpineBanner({gridAdapterState: 'sample', streamAdapterState: 'live'});

        expect(text).toContain('Fleet server offline');
        expect(text).toContain('sample data');
        expect(text).toContain('npm run cockpit')
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
