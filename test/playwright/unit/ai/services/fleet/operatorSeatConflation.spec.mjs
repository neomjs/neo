import {expect, test}                                                  from '@playwright/test';
import {describeOperatorSeatConflation, operatorSeatConflationWarning} from '../../../../../../ai/services/fleet/operatorSeatConflation.mjs';

/**
 * @summary The pure seat-conflation decision: one canonicalized comparison shared by the fleet
 * entry's boot warn and the suite. The pins: form-insensitivity (`@`-prefixed and bare ids match
 * either way), the null-not-clean contract (missing viewer OR empty registry answers `null`,
 * never `{conflated: false}`), and the warning sentence carrying the seat it names.
 */
test.describe('operatorSeatConflation — the seat-conflation decision leaf', () => {
    const REGISTERED = ['@neo-fable-clio', '@neo-opus-vega', 'neo-opus-ada'];

    test('a viewer matching a registered agent identity is conflated — in every id form pairing', () => {
        expect(describeOperatorSeatConflation({viewerIdentity: '@neo-fable-clio', registeredIds: REGISTERED}))
            .toEqual({conflated: true, seatIdentity: '@neo-fable-clio'});
        expect(describeOperatorSeatConflation({viewerIdentity: 'neo-fable-clio', registeredIds: REGISTERED}))
            .toEqual({conflated: true, seatIdentity: '@neo-fable-clio'});
        // the bare-registered form matches an @-form viewer too
        expect(describeOperatorSeatConflation({viewerIdentity: '@neo-opus-ada', registeredIds: REGISTERED}))
            .toEqual({conflated: true, seatIdentity: '@neo-opus-ada'})
    });

    test('a viewer outside the registry is a clean posture, not silence', () => {
        expect(describeOperatorSeatConflation({viewerIdentity: '@tobiu', registeredIds: REGISTERED}))
            .toEqual({conflated: false, seatIdentity: '@tobiu'})
    });

    test('missing viewer or empty registry answers null — absence of truth is not a clean bill', () => {
        expect(describeOperatorSeatConflation({viewerIdentity: null, registeredIds: REGISTERED})).toBeNull();
        expect(describeOperatorSeatConflation({viewerIdentity: '   ', registeredIds: REGISTERED})).toBeNull();
        expect(describeOperatorSeatConflation({viewerIdentity: '@tobiu', registeredIds: []})).toBeNull();
        expect(describeOperatorSeatConflation({viewerIdentity: '@tobiu'})).toBeNull();
        expect(describeOperatorSeatConflation()).toBeNull()
    });

    test('identity matching is exact after canonicalization — no substring or case forgiveness', () => {
        expect(describeOperatorSeatConflation({viewerIdentity: '@neo-fable', registeredIds: REGISTERED}).conflated).toBe(false);
        expect(describeOperatorSeatConflation({viewerIdentity: '@NEO-FABLE-CLIO', registeredIds: REGISTERED}).conflated).toBe(false)
    });

    test('the warning sentence names the seat and the remediation classes', () => {
        const warning = operatorSeatConflationWarning('@neo-fable-clio');

        expect(warning).toContain('@neo-fable-clio');
        expect(warning).toContain('OPERATOR-SEAT CONFLATION');
        expect(warning).toContain('NEO_FLEET_PLANE_BEARER');
        expect(warning).toContain('gh auth')
    })
});
