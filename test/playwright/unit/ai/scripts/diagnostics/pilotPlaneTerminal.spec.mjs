import {test, expect} from '@playwright/test';
import {
    ELIGIBILITY_EFFECT,
    PILOT_TERMINALS,
    eligibilityEffect,
    evaluateDemotion,
    evaluatePromotion
} from '../../../../../../ai/scripts/diagnostics/pilotPlaneTerminal.mjs';

// AC5's parenthetical — "never a silent abandon" — is the whole specification. So the assertions here are
// mostly about the ABSENCE of exits: every path must name a terminal, an unprovable claim must not open
// eligibility, and no caller may hand in the verdict or forge the evidence behind it.
//
// Three earlier shapes of this module were falsified by peer probe and each defect is pinned below:
//   * two caller booleans passed as proof of replay          -> receipt validation
//   * a bare [] claiming a scan the substrate cannot perform -> provenance-carrying overlayScan
//   * segment COUNTS offered as proof of no-loss             -> set inclusion by id

// A structurally complete continuity receipt, as `verifyReplayContinuity` actually produces.
const receiptOf = (plannedTotal = 2) => ({
    requiredStages: ['embedded', 'graph'],
    plannedTotal,
    appliedByStage: {embedded: plannedTotal, graph: plannedTotal},
    unrelatedTotal: 0
});

const provenContinuity = () => ({ok: true, monotonic: true, receipt: receiptOf()});

// A scan that states HOW it was performed. `planeIdSource` is the field no honest caller can populate today.
const scanOf = (taggedSegments = []) => ({
    planeIdSource      : 'segment header planeId (hypothetical producer)',
    scannedSegmentCount: 140,
    taggedSegments
});

const cleanDemotion = () => ({
    overlayScan        : scanOf(),
    preCloneSegmentIds : ['s1', 's2', 's3'],
    postPilotSegmentIds: ['s1', 's2', 's3', 's4', 's5']
});

test.describe('terminal set and the eligibility authority', () => {
    test('every terminal is named', () => {
        expect(PILOT_TERMINALS).toEqual(['committed', 'demoted-clean', 'failed-contained']);
    });

    test('⭐ only strict `committed` OPENS eligibility — a clean demotion leaves it unchanged', () => {
        // A boolean previously conflated "opened" with "never closed", which contradicted the governing
        // rule reserving an opening for strict `committed`. A clean demotion never mutated the durable
        // plane, so there was nothing to open — modelling that as `unchanged` keeps the strictness intact
        // rather than quietly widening it.
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

test.describe('evaluatePromotion — the terminal rests on a receipt, not on booleans', () => {
    test('a validated receipt commits, and the receipt is carried through', () => {
        const continuity = provenContinuity(),
              result     = evaluatePromotion({continuity});

        expect(result.terminal).toBe('committed');
        expect(result.eligibility).toBe('opened');
        expect(result.receipt).toBe(continuity.receipt);
        expect(result.reason).toContain('embedded + graph');
    });

    test('⭐ two caller booleans are NOT evidence — no receipt cannot commit', () => {
        // The falsified shape: `{ok: true, monotonic: true}` settled `committed` with `receipt: null`,
        // which both contradicted "derived from evidence" and failed the AC's requirement that the
        // terminal END IN a continuity receipt.
        const result = evaluatePromotion({continuity: {ok: true, monotonic: true}});

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
        expect(result.reason).toContain('carries no receipt');
        expect(result.reason).toContain('not evidence');
    });

    test('a structurally incomplete receipt cannot commit', () => {
        const cases = [
            [{}, 'names no required stages'],
            [{requiredStages: []}, 'names no required stages'],
            [{requiredStages: ['embedded'], plannedTotal: -1}, 'plannedTotal'],
            [{requiredStages: ['embedded'], plannedTotal: 1.5}, 'plannedTotal'],
            [{requiredStages: ['embedded'], plannedTotal: 1}, 'per-stage applied counts'],
            [{requiredStages: ['embedded', 'graph'], plannedTotal: 1, appliedByStage: {embedded: 1}}, 'stage "graph"']
        ];

        for (const [receipt, expected] of cases) {
            const result = evaluatePromotion({continuity: {ok: true, monotonic: true, receipt}});

            expect(result.terminal).toBe('failed-contained');
            expect(result.reason).toContain(expected);
        }
    });

    test('a refused continuity verdict settles contained and surfaces the verifier reason', () => {
        const result = evaluatePromotion({continuity: {ok: false, reason: 'duplicate source ids in payload'}});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('duplicate source ids');
    });

    test('ok:true without monotonic:true does NOT commit', () => {
        const result = evaluatePromotion({continuity: {ok: true, receipt: receiptOf()}});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('monotonic');
    });

    test('absent evidence settles contained rather than refusing — the refusal WOULD BE the abandon', () => {
        for (const continuity of [undefined, null, 'ok', 42]) {
            expect(evaluatePromotion({continuity}).terminal).toBe('failed-contained');
        }

        // Called with nothing at all: a promotion that died before producing any evidence. `null` matters
        // separately from `undefined` — a `= {}` default fires only for the latter, so this once THREW,
        // and a throw is an exit without a terminal.
        expect(evaluatePromotion().terminal).toBe('failed-contained');
        expect(evaluatePromotion(null).terminal).toBe('failed-contained');
    });

    test('a caller cannot supply the terminal', () => {
        const result = evaluatePromotion({
            continuity : {ok: false, reason: 'replay incomplete'},
            terminal   : 'committed',
            eligibility: 'opened'
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
    });
});

test.describe('evaluateDemotion — proves no leak and no loss, by identity', () => {
    test('concurrent growth from other seats is clean, not a failure', () => {
        // The load-bearing case. A pilot occupies one seat for 1-2 weeks while the institution keeps
        // writing, so extra durable segments are the EXPECTED shape of a healthy demotion. A fingerprint
        // equality proof would have called this contained and been switched off within one pilot.
        const result = evaluateDemotion(cleanDemotion());

        expect(result.terminal).toBe('demoted-clean');
        expect(result.eligibility).toBe('unchanged');
        expect(result.receipt.concurrentGainTotal).toBe(2);
        expect(result.receipt.overlayTaggedTotal).toBe(0);
        expect(result.receipt.planeIdSource).toContain('planeId');
    });

    test('zero concurrent growth is also clean', () => {
        const result = evaluateDemotion({...cleanDemotion(), postPilotSegmentIds: ['s1', 's2', 's3']});

        expect(result.terminal).toBe('demoted-clean');
        expect(result.receipt.concurrentGainTotal).toBe(0);
    });

    test('⭐ a bare array is REFUSED — [] claims a scan the substrate cannot perform', () => {
        // The falsified shape. `[]` is indistinguishable from "nobody looked", and worse: WAL records carry
        // a segmentKey but NO plane id, so no producer for this scan exists. Accepting `[]` converted a
        // missing capability into a clean bill of health.
        const result = evaluateDemotion({...cleanDemotion(), overlayScan: []});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('not a bare array');
        expect(result.reason).toContain('segmentKey but no plane id');
    });

    test('a scan that cannot say where the plane id came from is unproven', () => {
        for (const planeIdSource of [undefined, null, '', '   ', 42]) {
            const result = evaluateDemotion({...cleanDemotion(), overlayScan: {...scanOf(), planeIdSource}});

            expect(result.terminal).toBe('failed-contained');
            expect(result.reason).toContain('planeIdSource');
        }
    });

    test('a scan that cannot say how much it examined is not a scan', () => {
        for (const scannedSegmentCount of [undefined, -1, 1.5, '140']) {
            const result = evaluateDemotion({...cleanDemotion(), overlayScan: {...scanOf(), scannedSegmentCount}});

            expect(result.terminal).toBe('failed-contained');
            expect(result.reason).toContain('scannedSegmentCount');
        }
    });

    test('an overlay-tagged segment settles contained and says do not delete', () => {
        const result = evaluateDemotion({
            ...cleanDemotion(),
            overlayScan: scanOf(['wal-2026-07-20.jsonl', 'wal-2026-07-21.jsonl'])
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.eligibility).toBe('denied');
        expect(result.reason).toContain('wal-2026-07-20.jsonl');
        // Quarantine over deletion: the overlay is the only surviving evidence of what leaked.
        expect(result.reason).toContain('Quarantine');
        expect(result.receipt.overlayTaggedTotal).toBe(2);
    });

    test('⭐ EQUAL COUNTS do not prove no-loss — delete-old + add-new is caught by identity', () => {
        // The falsified shape used counts. Cardinality is not identity: 3 -> 3 looks stable while committed
        // history has been destroyed and replaced.
        const result = evaluateDemotion({
            ...cleanDemotion(),
            preCloneSegmentIds : ['s1', 's2', 's3'],
            postPilotSegmentIds: ['s2', 's3', 's9']   // s1 destroyed, s9 added — same count
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('no longer present');
        expect(result.reason).toContain('s1');
        expect(result.receipt.lostSegmentTotal).toBe(1);
    });

    test('a shrinking corpus is caught too — writers explain growth, never loss', () => {
        const result = evaluateDemotion({...cleanDemotion(), postPilotSegmentIds: ['s1', 's2']});

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('no longer present');
    });

    test('malformed segment id lists settle contained', () => {
        for (const ids of [
            {preCloneSegmentIds: undefined},
            {postPilotSegmentIds: undefined},
            {preCloneSegmentIds: ['s1', '']},
            {preCloneSegmentIds: ['s1', 42]},
            {preCloneSegmentIds: 3, postPilotSegmentIds: 3}
        ]) {
            const result = evaluateDemotion({...cleanDemotion(), ...ids});

            expect(result.terminal).toBe('failed-contained');
            expect(result.eligibility).toBe('denied');
        }

        expect(evaluateDemotion().terminal).toBe('failed-contained');
        expect(evaluateDemotion(null).terminal).toBe('failed-contained');
    });

    test('the leak check outranks the loss check', () => {
        // Both wrong at once: the report must lead with the leak, since that is the fact that changes what
        // the operator does next.
        const result = evaluateDemotion({
            overlayScan        : scanOf(['wal-2026-07-22.jsonl']),
            preCloneSegmentIds : ['s1', 's2'],
            postPilotSegmentIds: ['s2']
        });

        expect(result.terminal).toBe('failed-contained');
        expect(result.reason).toContain('overlay-tagged');
    });
});

test.describe('no path exits without a named terminal', () => {
    test('both evaluators always return a member of PILOT_TERMINALS', () => {
        const inputs = [
            undefined, null, {}, 'string', 42,
            {continuity: {}}, {continuity: {ok: true}}, {continuity: provenContinuity()},
            {overlayScan: []}, {overlayScan: scanOf()}, {preCloneSegmentIds: ['s1']},
            cleanDemotion()
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
            }
        }
    });
});
