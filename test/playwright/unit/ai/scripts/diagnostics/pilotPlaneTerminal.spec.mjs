import {test, expect} from '@playwright/test';
import {
    ELIGIBILITY_EFFECT,
    OVERLAY_TAGGING_PRODUCER,
    PILOT_TERMINALS,
    diffSegmentIdentity,
    eligibilityEffect,
    evaluateDemotion,
    evaluatePromotion,
    validateOverlayScan
} from '../../../../../../ai/scripts/diagnostics/pilotPlaneTerminal.mjs';
import {digestAppliedStages} from '../../../../../../ai/scripts/diagnostics/walReplayPlan.mjs';

// AC5's parenthetical — "never a silent abandon" — is the whole specification. So most assertions here are
// about the ABSENCE of exits: every path names a terminal, an unprovable claim never opens eligibility, and
// no caller may hand in the verdict OR the evidence behind it.
//
// Five earlier shapes were falsified by peer probe. Each is pinned below, because the pattern recurred:
// every one of them checked the SHAPE of a claim and mistook that for checking the claim.
//   * two caller booleans passed as proof of replay        -> verification runs HERE
//   * a structurally valid typed receipt passed as proof   -> verification runs HERE
//   * a bare [] claiming an impossible scan                -> capability gate
//   * an invented planeIdSource string unlocking clean     -> capability gate
//   * segment COUNTS offered as proof of no-loss           -> set inclusion by id

const S         = ids => new Set(ids),
      allStages = ids => ({embedded: S(ids), graph: S(ids)});

test.describe('terminal set and the eligibility authority', () => {
    test('every terminal is named', () => {
        expect(PILOT_TERMINALS).toEqual(['committed', 'demoted-clean', 'failed-contained']);
    });

    test('⭐ only strict `committed` OPENS eligibility — a clean demotion leaves it unchanged', () => {
        // A boolean previously conflated "opened" with "never closed", which contradicted the governing rule
        // reserving an opening for strict `committed`. A clean demotion never mutated the durable plane, so
        // there was nothing to open.
        expect(eligibilityEffect('committed')).toBe('opened');
        expect(eligibilityEffect('demoted-clean')).toBe('unchanged');
        expect(eligibilityEffect('failed-contained')).toBe('denied');
        expect(ELIGIBILITY_EFFECT.committed).toBe('opened');
    });

    test('an unrecognised terminal is DENIED, not silently permitted', () => {
        for (const value of ['completed', 'ok', 'COMMITTED', '', null, undefined, 'demoted']) {
            expect(eligibilityEffect(value)).toBe('denied');
        }
    });
});

test.describe('evaluatePromotion — the PLAN is derived here, so neither verdict nor plan can be supplied', () => {
    const entries = [{id: 'a', timestamp: 1}, {id: 'b', timestamp: 2}];

    test('a real corpus whose planned work landed commits, and carries the verifier receipt', () => {
        // POSITIVE CONTROL for the whole promotion path. Without it every refusal below could be a blanket
        // failure and the module would look correct while being useless.
        const result = evaluatePromotion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a', 'b'])
        });

        expect(result.terminal).toBe('committed');
        expect(result.eligibility).toBe('opened');
        expect(result.receipt.plannedTotal).toBe(2);
        expect(result.receipt.appliedByStage).toEqual({embedded: 2, graph: 2});
    });

    test('⭐ a caller-forged SELF-CONSISTENT empty plan cannot commit — there is no plan input', () => {
        // The falsified shape. A forged plan with `toApply: []`, matching empty `plannedIdsByStage`, and a
        // `targetStateDigest` computed from the REAL pre-state reconciled cleanly, landed nothing, lost
        // nothing, and settled `committed`. Reconciliation proved self-consistency, never provenance.
        const before = allStages(['seed']),
              forged = {
                  ok            : true,
                  toApply       : [],
                  alreadyApplied: [],
                  receipt       : {
                      sourceEntries      : 0,
                      toApplyCount       : 0,
                      alreadyAppliedCount: 0,
                      requiredStages     : ['embedded', 'graph'],
                      targetStateDigest  : digestAppliedStages(before),
                      plannedIdsByStage  : {embedded: [], graph: []},
                      pendingByStage     : {embedded: 0, graph: 0}
                  }
              },
              result = evaluatePromotion({appliedStagesBefore: before, appliedStagesAfter: before, plan: forged});

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
        expect(result.reason).toContain('cannot accept a pre-built plan');
        expect(result.reason).toContain('never that it was derived from the corpus');
    });

    test('⭐ an EMPTY corpus refuses — nothing to replay is not a promotion that moved nothing', () => {
        const before = allStages(['seed']),
              result = evaluatePromotion({payloadEntries: [], appliedStagesBefore: before, appliedStagesAfter: before});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('nothing to promote');
        expect(result.reason).toContain('zero-effect certification');
    });

    test('a corpus the planner refuses cannot commit, and the planner reason surfaces', () => {
        const result = evaluatePromotion({
            payloadEntries     : [{id: 'a'}, {id: 'a'}],
            appliedStagesBefore: allStages([]),
            appliedStagesAfter : allStages(['a'])
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('duplicate source id');
    });

    test('a planned id that never landed cannot commit', () => {
        const result = evaluatePromotion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a'])   // 'b' never landed
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('never landed');
    });

    test('a target that LOST a prior receipt cannot commit', () => {
        const result = evaluatePromotion({
            payloadEntries     : entries,
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['a', 'b'])       // 'seed' regressed
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('lost');
    });

    test('a fabricated continuity VERDICT cannot commit either — that input is gone too', () => {
        const typed = evaluatePromotion({
            continuity: {
                ok     : true, monotonic: true,
                receipt: {requiredStages: ['embedded', 'graph'], plannedTotal: 2, appliedByStage: {embedded: 2, graph: 2}}
            }
        });

        expect(typed.terminal).toBe('failed-contained');
        expect(typed.reason).toContain('payloadEntries must be the source corpus');
    });

    test('absent evidence settles contained rather than refusing — the refusal WOULD BE the abandon', () => {
        for (const spec of [undefined, null, {}, {payloadEntries: 'x'}, 42]) {
            const result = evaluatePromotion(spec);

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibility).toBe('denied');
        }
    });

    test('a caller cannot supply the terminal', () => {
        const result = evaluatePromotion({payloadEntries: [], terminal: 'committed', eligibility: 'opened'});

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
    });
});

test.describe('⭐ evaluateDemotion — clean is MECHANICALLY unreachable while the producer is absent', () => {
    test('the substrate has no plane-id producer, and that is recorded as a constant', () => {
        // A constant, not a parameter. Asking the caller to NAME a source only checked that a string was
        // present, so an invented name unlocked a clean terminal: requiring a field is not proving a fact.
        expect(OVERLAY_TAGGING_PRODUCER).toBeNull();
    });

    test('⭐ NO argument combination yields demoted-clean — including a plausible invented scan', () => {
        // Euclid's exact falsifier: a non-empty planeIdSource with zero scanned and zero tagged segments.
        const candidates = [
            {overlayScan: {planeIdSource: 'segment header planeId', scannedSegmentCount: 0, taggedSegments: []},
             preCloneSegmentIds: [], postPilotSegmentIds: []},
            {overlayScan: {planeIdSource: 'wal-store', scannedSegmentCount: 140, taggedSegments: []},
             preCloneSegmentIds: ['s1'], postPilotSegmentIds: ['s1', 's2']},
            {overlayScan: {planeIdSource: null, scannedSegmentCount: 1, taggedSegments: []},
             preCloneSegmentIds: ['s1'], postPilotSegmentIds: ['s1']},
            {overlayScan: []}, {overlayScan: {}}, {}, null, undefined
        ];

        for (const spec of candidates) {
            const result = evaluateDemotion(spec);

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibility).toBe('denied');
        }
    });

    test('the refusal blames the SUBSTRATE, not the caller, and says quarantine', () => {
        // The message a real operator will read mid-demotion. It must not send them hunting for a bad argument.
        const result = evaluateDemotion({
            overlayScan       : {planeIdSource: 'segment header planeId', scannedSegmentCount: 140, taggedSegments: []},
            preCloneSegmentIds: ['s1'], postPilotSegmentIds: ['s1']
        });

        expect(result.reason).toContain('UNPROVABLE, not merely');
        expect(result.reason).toContain('no argument can change that');
        expect(result.reason).toContain('missing producer');
        expect(result.reason).toContain('Quarantine');
    });
});

// POSITIVE CONTROLS for the logic behind the capability gate. Without these the gate would hide whether the
// demotion reasoning works at all, and opening the path later would be an untested one-line change.
test.describe('validateOverlayScan — the logic behind the gate, tested directly', () => {
    test('a bare array is not a scan', () => {
        expect(validateOverlayScan([])).toContain('not a bare array');
        expect(validateOverlayScan(['x'])).toContain('not a bare array');
    });

    test('an absent scan is unproven, not clean', () => {
        for (const value of [undefined, null, 'scan', 42]) {
            expect(validateOverlayScan(value)).toContain('unproven, not clean');
        }
    });

    test('⭐ an INVENTED planeIdSource is rejected against the substrate\'s producer', () => {
        // Not merely "is a string" — it must BE the producer the substrate provides. While that is null,
        // every named source is invented by construction.
        const invented = validateOverlayScan({planeIdSource: 'segment header planeId', scannedSegmentCount: 1, taggedSegments: []});

        expect(invented).toContain('is not the substrate\'s plane-id producer');
        expect(invented).toContain('naming a field is not producing the fact');
    });

    test('a missing planeIdSource is named as such', () => {
        expect(validateOverlayScan({scannedSegmentCount: 1, taggedSegments: []})).toContain('must name where');
        expect(validateOverlayScan({planeIdSource: '  ', scannedSegmentCount: 1, taggedSegments: []})).toContain('must name where');
    });
});

test.describe('diffSegmentIdentity — identity, not cardinality', () => {
    test('⭐ EQUAL COUNTS do not prove no-loss: delete-old + add-new is caught', () => {
        // 3 -> 3 looks stable while committed history was destroyed and replaced.
        const result = diffSegmentIdentity(['s1', 's2', 's3'], ['s2', 's3', 's9']);

        expect(result.lost).toEqual(['s1']);
        expect(result.gained).toEqual(['s9']);
    });

    test('concurrent growth from other seats is gain, not loss', () => {
        // The load-bearing case: a pilot occupies one seat for 1-2 weeks while the institution keeps writing,
        // so extra durable segments are the EXPECTED shape of a healthy demotion. A fingerprint equality
        // proof would have called this a failure and been switched off within one pilot.
        const result = diffSegmentIdentity(['s1', 's2'], ['s1', 's2', 's3', 's4']);

        expect(result.lost).toEqual([]);
        expect(result.gained).toEqual(['s3', 's4']);
    });

    test('an unchanged corpus has neither', () => {
        expect(diffSegmentIdentity(['s1'], ['s1'])).toEqual({lost: [], gained: []});
        expect(diffSegmentIdentity([], [])).toEqual({lost: [], gained: []});
    });

    test('malformed id lists refuse rather than coerce', () => {
        for (const [pre, post] of [[undefined, ['s1']], [['s1'], undefined], [['s1', ''], ['s1']], [['s1', 42], ['s1']], [3, 3]]) {
            expect(diffSegmentIdentity(pre, post).reason).toContain('identity is required');
        }
    });
});

test.describe('no path exits without a named terminal', () => {
    test('both evaluators always return a member of PILOT_TERMINALS', () => {
        const inputs = [
            undefined, null, {}, 'string', 42, [],
            {plan: {}}, {continuity: {ok: true, monotonic: true}},
            {payloadEntries: [{id: 'a', timestamp: 1}], appliedStagesBefore: allStages([]), appliedStagesAfter: allStages(['a'])},
            {overlayScan: []}, {overlayScan: {planeIdSource: 'x', scannedSegmentCount: 0, taggedSegments: []}},
            {preCloneSegmentIds: ['s1'], postPilotSegmentIds: ['s1']}
        ];

        for (const input of inputs) {
            for (const evaluate of [evaluatePromotion, evaluateDemotion]) {
                const result = evaluate(input);

                expect(PILOT_TERMINALS).toContain(result.terminal);
                expect(typeof result.reason).toBe('string');
                expect(result.reason.length).toBeGreaterThan(0);
                expect(result.eligibility).toBe(eligibilityEffect(result.terminal));
                // Only a commit may carry an opened eligibility, whatever the input.
                if (result.eligibility === 'opened') expect(result.terminal).toBe('committed');
                // And demotion can NEVER reach a non-contained terminal at this head.
                if (evaluate === evaluateDemotion) expect(result.terminal).toBe('failed-contained');
            }
        }
    });
});
