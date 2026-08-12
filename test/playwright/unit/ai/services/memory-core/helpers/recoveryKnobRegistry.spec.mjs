import {test, expect} from '@playwright/test';

import {
    RECOVERY_KNOBS,
    isKnownKnob,
    knobLeafPaths,
    knobRequiredContext,
    selectAutomaticKnobTransaction,
    validateKnobTransaction
} from '../../../../../../../ai/services/memory-core/helpers/recoveryKnobRegistry.mjs';

const KNOB   = 'minisummary-generation-window';
const INNER  = 'memoryService.generateMiniSummaryTimeoutMs';
const OUTER  = 'memoryService.miniSummaryTimeoutMs';
const BUDGET = 'memoryService.miniSummaryBackfillMaxRunMs';

// Every valid transaction needs the bounding leaf resolved; 600000 is the live default.
const CTX = {[BUDGET]: 600000};

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
        const {valid, violations} = validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 30000}});

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes(OUTER) && v.includes('applied whole'))).toBe(true);
    });

    test('the ordering invariant refuses the inversion that blinds a branch-reading detector', () => {
        // inner >= outer makes the outer timeout fire first, moving every failure from the inner falsy
        // branch to the sweep's thrown branch. A detector reading branch identity loses its signal
        // exactly while actuation is in flight — the failure this whole abstraction exists to prevent.
        for (const [inner, outer] of [[30000, 30000], [40000, 30000]]) {
            const {valid, violations} = validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: inner, [OUTER]: outer}});

            expect(valid, `inner=${inner} outer=${outer}`).toBe(false);
            expect(violations.some(v => v.includes('inner-strictly-below-outer'))).toBe(true);
        }

        // The positive control: the same shape one millisecond apart is accepted, so the refusals above
        // are the ordering rule and not an unrelated rejection.
        expect(validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 29999, [OUTER]: 30000}}).valid).toBe(true);
    });

    test('a widening that preserves the invariant is accepted — the actuator can actually act', () => {
        // A guard that refuses everything is not a guard, it is an outage. This is the transaction the
        // thermostat will actually issue.
        expect(validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 40000, [OUTER]: 60000}})).toEqual({
            valid     : true,
            violations: []
        });
    });

    test('a leaf outside the knob is refused rather than silently carried along', () => {
        const {valid, violations} = validateKnobTransaction({
            context: CTX,
            knob   : KNOB,
            values : {[INNER]: 20000, [OUTER]: 30000, 'memoryService.somethingElse': 1}
        });

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes('somethingElse') && v.includes('not part of knob'))).toBe(true);
    });

    test('bounds and type are enforced per leaf, and every violation is reported at once', () => {
        // All violations rather than the first: a caller needs to know what a valid proposal looks like,
        // not just the earliest thing wrong with this one.
        const {valid, violations} = validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 'soon', [OUTER]: 9_000_000}});

        expect(valid).toBe(false);
        expect(violations.length).toBe(2);
        expect(violations.some(v => v.includes(INNER) && v.includes('finite number'))).toBe(true);
        expect(violations.some(v => v.includes(OUTER) && v.includes('1000..600000'))).toBe(true);
    });

    test('an invariant failure cannot masquerade as a bounds failure', () => {
        // Invariants run only once every leaf is present and individually sound, so a caller is never
        // told the ordering is wrong when the real problem is a value out of range.
        const {violations} = validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 50, [OUTER]: 40}});

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

    test('a widening that starves the sweep is refused — the action must not defeat its own goal', () => {
        // The failure class this bound exists for is neither a no-op nor a crash: it is SUCCESSFUL
        // actuation moving away from the objective. The sweep has a fixed wall-clock budget, so a wider
        // per-item timeout buys per-item success by spending the item count. Past a point the sweep goes
        // single-item and the backlog stops draining — while every individual step still looks like an
        // improvement, because per-item success rate rises as total output collapses.
        //
        // With a 600000 budget and a four-item floor the ceiling is 150000.
        expect(validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 100000, [OUTER]: 150000}}).valid).toBe(true);

        const {valid, violations} = validateKnobTransaction({context: CTX, knob: KNOB, values: {[INNER]: 100000, [OUTER]: 150001}});

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes('outer-leaves-room-for-a-draining-sweep'))).toBe(true);
    });

    test('the ceiling MOVES with the budget leaf — it is a relationship, not a constant', () => {
        // The whole reason the bound is derived rather than hardcoded: `miniSummaryBackfillMaxRunMs` is
        // itself a leaf that can change, and a frozen ceiling would silently become wrong the moment it
        // did. Halving the budget must halve the ceiling, with no edit here.
        const proposal = {[INNER]: 100000, [OUTER]: 150000};

        expect(validateKnobTransaction({context: {[BUDGET]: 600000}, knob: KNOB, values: proposal}).valid).toBe(true);
        expect(validateKnobTransaction({context: {[BUDGET]: 300000}, knob: KNOB, values: proposal}).valid).toBe(false);

        // And a larger budget genuinely permits more, so the relationship is two-directional rather than
        // a one-way clamp that happens to track downward.
        expect(validateKnobTransaction({
            context: {[BUDGET]: 1_200_000},
            knob   : KNOB,
            values : {[INNER]: 200000, [OUTER]: 300000}
        }).valid).toBe(true);
    });

    test('an unresolvable bound REFUSES — it never silently drops the invariant', () => {
        // Fail-closed on the bound itself. If a missing or unreadable budget skipped the invariant, the
        // widest transactions would become the easiest to authorize: the check would be absent exactly
        // when it could not be evaluated, which is the same shape as a probe that fails closed to the
        // value authorizing the action.
        for (const context of [undefined, {}, {[BUDGET]: null}, {[BUDGET]: 'plenty'}]) {
            const {valid} = validateKnobTransaction({context, knob: KNOB, values: {[INNER]: 20000, [OUTER]: 30000}});

            expect(valid, `context: ${JSON.stringify(context)}`).toBe(false);
        }
    });

    test('the knob declares which context a caller must resolve, so adding a bound needs no caller edit', () => {
        expect(knobRequiredContext(KNOB)).toEqual([BUDGET]);
        expect(knobRequiredContext('unknown')).toEqual([]);

        // Returned by value: a caller mutating the list must not be able to shrink the knob's declared
        // requirements and thereby skip a bound.
        knobRequiredContext(KNOB).length = 0;
        expect(knobRequiredContext(KNOB)).toEqual([BUDGET]);
    });

    test('every declared leaf carries the env name the override must not collide with', () => {
        // The env layer outranks a file overlay by design (`ConfigProvider.load` re-asserts env after
        // merging). A knob whose leaf is env-pinned would be written and then discarded — a success
        // report over a no-op. Carrying the env name here is what lets the actuator detect that before
        // writing rather than after.
        for (const knobName of Object.keys(RECOVERY_KNOBS)) {
            for (const leaf of RECOVERY_KNOBS[knobName].leaves) {
                expect(leaf.env, `${knobName} → ${leaf.path}`).toMatch(/^NEO_[A-Z0-9_]+$/);
            }
        }
    });
});

const GIB          = 1024 ** 3;
const CEILING_KNOB = 'container-memory-ceiling';
const CEIL_LEAF    = 'deploy.chroma.memoryCeilingBytes';
const LIVE_LEAF    = 'runtime.chroma.liveMemoryLimitBytes';

test.describe('recoveryKnobRegistry — container-memory-ceiling is the store\'s bounded raise (#16596)', () => {
    test('the automatic policy owns the finite 2 → 8 → 16 → refusal sequence', () => {
        const incident = selectAutomaticKnobTransaction({
                  context: {[LIVE_LEAF]: 2 * GIB},
                  knob   : CEILING_KNOB
              }),
              belowFloor = selectAutomaticKnobTransaction({
                  context: {[LIVE_LEAF]: 6 * GIB},
                  knob   : CEILING_KNOB
              }),
              second   = selectAutomaticKnobTransaction({
                  context: {[LIVE_LEAF]: 8 * GIB},
                  knob   : CEILING_KNOB
              }),
              belowCap = selectAutomaticKnobTransaction({
                  context: {[LIVE_LEAF]: 12 * GIB},
                  knob   : CEILING_KNOB
              }),
              terminal = selectAutomaticKnobTransaction({
                  context: {[LIVE_LEAF]: 16 * GIB},
                  knob   : CEILING_KNOB
              });

        expect(incident).toEqual({valid: true, values: {[CEIL_LEAF]: 8 * GIB}, violations: []});
        expect(belowFloor).toEqual({valid: true, values: {[CEIL_LEAF]: 8 * GIB}, violations: []});
        expect(second).toEqual({valid: true, values: {[CEIL_LEAF]: 16 * GIB}, violations: []});
        expect(belowCap).toEqual({valid: true, values: {[CEIL_LEAF]: 16 * GIB}, violations: []});

        // No clamp at the cap. The invalid 32 GiB candidate remains inspectable, and the registry's
        // ordinary validation vocabulary says exactly why autonomy stopped.
        expect(terminal.valid).toBe(false);
        expect(terminal.values).toEqual({[CEIL_LEAF]: 32 * GIB});
        expect(terminal.violations.some(violation => violation.includes(`${8 * GIB}..${16 * GIB}`))).toBe(true);
    });

    test('a knob without an automatic policy remains operator-authored only', () => {
        expect(selectAutomaticKnobTransaction({knob: KNOB, context: CTX})).toEqual({
            valid     : false,
            values    : null,
            violations: [`knob '${KNOB}' has no automatic value-selection policy`]
        });
    });

    test('the incident transaction is accepted — a 2 GiB plane raises to the derived 8 GiB default', () => {
        // The shape the reactive controller will actually issue, taken from the live incident: a store
        // at the pre-parameterisation 2 GiB cap, mid-ingestion, raised to the compose default. A guard
        // that refuses the one transaction the incident needed is an outage with paperwork.
        expect(validateKnobTransaction({
            context: {[LIVE_LEAF]: 2 * GIB},
            knob   : CEILING_KNOB,
            values : {[CEIL_LEAF]: 8 * GIB}
        })).toEqual({valid: true, violations: []});
    });

    test('the ratchet TERMINATES at the cap: doubling past 16 GiB is refused with a violation, never clamped', () => {
        // THE anti-thrash bound. Repeated saturation walks the ceiling 8 → 16 → refused:
        // the doubling policy's next step from the cap proposes 32 GiB, and the registry answers with a
        // named violation rather than a silently clamped 16 GiB — a clamp would report success while
        // actuating a value nobody proposed, and would retry forever at the cap instead of surfacing
        // that autonomy has reached the corpus-architecture question.
        const atCap = validateKnobTransaction({
            context: {[LIVE_LEAF]: 16 * GIB},
            knob   : CEILING_KNOB,
            values : {[CEIL_LEAF]: 32 * GIB}
        });

        expect(atCap.valid).toBe(false);
        expect(atCap.violations.some(v => v.includes(CEIL_LEAF) && v.includes(`${8 * GIB}..${16 * GIB}`))).toBe(true);

        // Positive control one step earlier: 8 → 16 GiB is inside the band, so the refusal above is the
        // cap and not an unrelated rejection.
        expect(validateKnobTransaction({
            context: {[LIVE_LEAF]: 8 * GIB},
            knob   : CEILING_KNOB,
            values : {[CEIL_LEAF]: 16 * GIB}
        }).valid).toBe(true);
    });

    test('a raise below the derived floor is refused — sub-default values are operator work, not autonomy', () => {
        // 2 → 4 GiB satisfies raise-not-lower and still refuses: the band's floor IS the compose
        // default, because a knob whose whole intent is "raise" has no business landing beneath the
        // value a fresh recreate would apply anyway.
        const {valid, violations} = validateKnobTransaction({
            context: {[LIVE_LEAF]: 2 * GIB},
            knob   : CEILING_KNOB,
            values : {[CEIL_LEAF]: 4 * GIB}
        });

        expect(valid).toBe(false);
        expect(violations.some(v => v.includes(CEIL_LEAF))).toBe(true);
    });

    test('raise-not-lower binds against the LIVE limit — equal or lower proposals are refused', () => {
        // The corpus does not shrink to fit. A proposal at or below what the container currently
        // enforces is an OOM instruction, whatever the config story says the ceiling should be.
        for (const [live, proposed] of [[16 * GIB, 16 * GIB], [12 * GIB, 8 * GIB]]) {
            const {valid, violations} = validateKnobTransaction({
                context: {[LIVE_LEAF]: live},
                knob   : CEILING_KNOB,
                values : {[CEIL_LEAF]: proposed}
            });

            expect(valid, `live=${live} proposed=${proposed}`).toBe(false);
            expect(violations.some(v => v.includes('raise-not-lower'))).toBe(true);
        }
    });

    test('an unresolved or incoherent live limit REFUSES — including Docker\'s 0-means-unlimited', () => {
        // Fail-closed, same rule as the sweep budget above: an unknown bound is a refusal, never an
        // absent one. Docker inspect reports `HostConfig.Memory: 0` for an unlimited container, and
        // "raise the unlimited ceiling" is not a coherent instruction — it can only mean the caller
        // read the wrong container or the wrong field, so it must not validate.
        for (const context of [undefined, {}, {[LIVE_LEAF]: null}, {[LIVE_LEAF]: 'plenty'}, {[LIVE_LEAF]: 0}, {[LIVE_LEAF]: -1}]) {
            const {valid} = validateKnobTransaction({
                context,
                knob  : CEILING_KNOB,
                values: {[CEIL_LEAF]: 8 * GIB}
            });

            expect(valid, `context: ${JSON.stringify(context)}`).toBe(false);
        }
    });

    test('the knob is bound to chroma by declaration, and declares its runtime context requirement', () => {
        // `serviceKey` is what lets the actuator refuse aiming the store's ceiling intent at another
        // container, and `requires` is what makes the restart-coupled `reconfigure` channel fail closed
        // on this knob: that channel resolves context from config, and this bound only resolves from
        // the runtime.
        expect(RECOVERY_KNOBS[CEILING_KNOB].serviceKey).toBe('chroma');
        expect(knobRequiredContext(CEILING_KNOB)).toEqual([LIVE_LEAF]);
        expect(knobLeafPaths(CEILING_KNOB)).toEqual([CEIL_LEAF]);
    });
});
