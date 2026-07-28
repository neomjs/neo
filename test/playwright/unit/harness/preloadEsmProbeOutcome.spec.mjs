import {expect, test} from '@playwright/test';
import {
    EXPECTED_SANDBOXED_ESM_ERROR,
    classifyPreloadEsmProbe
} from '../../../../harness/preloadEsmProbeOutcome.mjs';

test.describe('sandboxed ESM preload capability outcome', () => {
    test('passes only the pinned Electron rejection mode', () => {
        expect(classifyPreloadEsmProbe({
            errors: [`Unable to load preload: ${EXPECTED_SANDBOXED_ESM_ERROR}`]
        })).toEqual({
            message: `Constraint confirmed: sandboxed ESM preload rejected with "${EXPECTED_SANDBOXED_ESM_ERROR}".`,
            ok     : true,
            status : 'constraint-confirmed'
        })
    });

    test('turns upstream support into an actionable red result', () => {
        const result = classifyPreloadEsmProbe({markerLoaded: true});

        expect(result.ok).toBe(false);
        expect(result.status).toBe('support-detected');
        expect(result.message).toContain('#16036 conversion is unblocked');
        expect(result.message).toContain('rename preload.cjs to preload.mjs');
        expect(result.message).toContain('adapterWitness.mjs import');
        expect(result.message).toContain('delete its drift guard in adapterWitness.spec.mjs');
        expect(result.message).toContain('learn/benefits/ArchitectureOverview.md');
        expect(result.message).toContain('ADR-0034')
    });

    test('fails closed on an unexpected runtime error', () => {
        const result = classifyPreloadEsmProbe({errors: ['ERR_MODULE_NOT_FOUND']});

        expect(result.ok).toBe(false);
        expect(result.status).toBe('unexpected-error');
        expect(result.message).toContain('ERR_MODULE_NOT_FOUND');
        expect(result.message).toContain(EXPECTED_SANDBOXED_ESM_ERROR)
    });

    test('fails closed when the probe is silent or times out', () => {
        expect(classifyPreloadEsmProbe()).toMatchObject({ok: false, status: 'inconclusive'});
        expect(classifyPreloadEsmProbe({timedOut: true})).toMatchObject({
            ok    : false,
            status: 'inconclusive'
        })
    });

    test('fails closed on contradictory marker and error evidence', () => {
        const result = classifyPreloadEsmProbe({
            errors      : [EXPECTED_SANDBOXED_ESM_ERROR],
            markerLoaded: true
        });

        expect(result.ok).toBe(false);
        expect(result.status).toBe('contradictory');
        expect(result.message).toContain('both a loaded marker and errors')
    })
});
