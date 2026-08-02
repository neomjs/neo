import {test, expect} from '@playwright/test';

import {
    RECOVERY_KNOBS,
    isKnownKnob,
    knobLeafPaths,
    validateKnobTransaction
} from '../../../../../../../ai/services/memory-core/helpers/recoveryKnobRegistry.mjs';

const KNOB  = 'mini-summary-window';
const INNER = 'memoryService.generateMiniSummaryTimeoutMs';
const OUTER = 'memoryService.miniSummaryTimeoutMs';

test.describe('recoveryKnobRegistry — the closed set is the actuator\'s authority boundary (#16374)', () => {
    test('an unknown knob is refused, and the refusal names what IS turnable', () => {
        // The closed set is the whole reason `reconfigure` stays inside the config-and-lifecycle
        // envelope instead of becoming an arbitrary config-write primitive. A refusal that does not
        // name the alternatives pushes the caller toward guessing, which is how sets get widened
        // informally.
        const {valid, violations} = validateKnobTransaction({knob: 'anything-else', values: {}});

        expect(valid).toBe(false);
        expect(violations[0]).toContain('unknown knob');
        expect(violations[0]).toContain(KNOB);
    });

    test('a knob is applied WHOLE — a partial proposal is refused, never merged', () => {
        // The atomicity that makes a knob a knob. Merging a partial proposal with the target's current
        // values would make the result depend on what the target happens to hold, which is exactly the
        // read the actuator cannot perform across a process boundary.
        const {valid, violations} = validateKnobTransaction({knob: KNOB, values: {[INNER]: 30000}});

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes(OUTER) && v.includes('applied whole'))).toBe(true);
    });

    test('the ordering invariant refuses the inversion that blinds a branch-reading detector', () => {
        // inner >= outer makes the outer timeout fire first, moving every failure from the inner falsy
        // branch to the sweep's thrown branch. A detector reading branch identity loses its signal
        // exactly while actuation is in flight — the failure this whole abstraction exists to prevent.
        for (const [inner, outer] of [[30000, 30000], [40000, 30000]]) {
            const {valid, violations} = validateKnobTransaction({knob: KNOB, values: {[INNER]: inner, [OUTER]: outer}});

            expect(valid, `inner=${inner} outer=${outer}`).toBe(false);
            expect(violations.some(v => v.includes('inner-strictly-below-outer'))).toBe(true);
        }

        // The positive control: the same shape one millisecond apart is accepted, so the refusals above
        // are the ordering rule and not an unrelated rejection.
        expect(validateKnobTransaction({knob: KNOB, values: {[INNER]: 29999, [OUTER]: 30000}}).valid).toBe(true);
    });

    test('a widening that preserves the invariant is accepted — the actuator can actually act', () => {
        // A guard that refuses everything is not a guard, it is an outage. This is the transaction the
        // thermostat will actually issue.
        expect(validateKnobTransaction({knob: KNOB, values: {[INNER]: 40000, [OUTER]: 60000}})).toEqual({
            valid     : true,
            violations: []
        });
    });

    test('a leaf outside the knob is refused rather than silently carried along', () => {
        const {valid, violations} = validateKnobTransaction({
            knob  : KNOB,
            values: {[INNER]: 20000, [OUTER]: 30000, 'memoryService.somethingElse': 1}
        });

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes('somethingElse') && v.includes('not part of knob'))).toBe(true);
    });

    test('bounds and type are enforced per leaf, and every violation is reported at once', () => {
        // All violations rather than the first: a caller needs to know what a valid proposal looks like,
        // not just the earliest thing wrong with this one.
        const {valid, violations} = validateKnobTransaction({knob: KNOB, values: {[INNER]: 'soon', [OUTER]: 9_000_000}});

        expect(valid).toBe(false);
        expect(violations.length).toBe(2);
        expect(violations.some(v => v.includes(INNER) && v.includes('finite number'))).toBe(true);
        expect(violations.some(v => v.includes(OUTER) && v.includes('1000..600000'))).toBe(true);
    });

    test('an invariant failure cannot masquerade as a bounds failure', () => {
        // Invariants run only once every leaf is present and individually sound, so a caller is never
        // told the ordering is wrong when the real problem is a value out of range.
        const {violations} = validateKnobTransaction({knob: KNOB, values: {[INNER]: 50, [OUTER]: 40}});

        expect(violations.every(v => !v.includes('inner-strictly-below-outer'))).toBe(true);
    });

    test('the registry is frozen — the closed set cannot be widened at runtime', () => {
        // Authority that can be extended by an import is not bounded. Freezing is what makes "adding a
        // knob is a ticket" enforceable rather than a convention.
        expect(Object.isFrozen(RECOVERY_KNOBS)).toBe(true);
        expect(Object.isFrozen(RECOVERY_KNOBS[KNOB].leaves)).toBe(true);

        expect(() => { RECOVERY_KNOBS['smuggled'] = {} }).toThrow();
        expect(isKnownKnob('smuggled')).toBe(false);
    });

    test('leaf order is declared, because application order is part of the contract', () => {
        expect(knobLeafPaths(KNOB)).toEqual([INNER, OUTER]);
        expect(knobLeafPaths('unknown')).toEqual([]);
    });

    test('every declared leaf carries the env name the override must not collide with', () => {
        // The env layer outranks a file overlay by design (`ConfigProvider.load` re-asserts env after
        // merging). A knob whose leaf is env-pinned would be written and then discarded — a success
        // report over a no-op. Carrying the env name here is what lets the actuator detect that before
        // writing rather than after.
        for (const leaf of RECOVERY_KNOBS[KNOB].leaves) {
            expect(leaf.env, leaf.path).toMatch(/^NEO_[A-Z0-9_]+$/);
        }
    });
});
