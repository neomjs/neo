import {test, expect} from '@playwright/test';
import {
    WAL_RECEIPT_STAGES,
    digestAppliedStages,
    parseJsonl,
    planWalReplay,
    receiptIdSet,
    verifyReplayContinuity
} from '../../../../../../ai/scripts/diagnostics/walReplayPlan.mjs';

// The continuity claim ("no loss, no double-apply") is only meaningful if the verifier can FAIL, so
// every invariant below is paired with a control that violates it.
//
// Entry shape mirrors the real WAL triad: payload `wal-<date>.jsonl` carries {id, timestamp, …}; the
// `.embedded` and `.graph` sidecars are SEPARATE per-stage receipts and are what make a row's applied
// state knowable. They are deliberately not merged — see the stage-typing tests.

const S     = ids => new Set(ids),
      entry = (id, timestamp) => ({id, timestamp, document: `doc-${id}`}),
      // A target with the same ids receipted at every stage.
      allStages = ids => ({embedded: S(ids), graph: S(ids)});

test.describe('parseJsonl — a malformed line refuses instead of shrinking the corpus', () => {
    test('parses well-formed JSONL and ignores blank lines', () => {
        const result = parseJsonl('{"id":"a"}\n\n{"id":"b"}\n');

        expect(result.ok).toBe(true);
        expect(result.records.map(r => r.id)).toEqual(['a', 'b']);
    })

    test('⭐ refuses on a bad line, naming it — skipping would under-count the replay set', () => {
        const result = parseJsonl('{"id":"a"}\n{oops\n{"id":"b"}', 'wal-2026-07-26.jsonl');

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('wal-2026-07-26.jsonl');
        expect(result.reason).toContain('line 2');
        expect(result).not.toHaveProperty('records');
    })
});

test.describe('stage-typed receipts — collapsing embedded and graph loses work SILENTLY', () => {
    test('⭐ a row embedded but NOT graph-projected is replayed for `graph` only', () => {
        // The bug this replaces: one untyped applied-id set made this row look fully applied, so replay
        // skipped it and the graph projection was lost with no error. Losing half a row is worse than
        // losing a whole one — the row still appears present.
        const plan = planWalReplay({
            payloadEntries: [entry('a', 1)],
            appliedStages : {embedded: S(['a']), graph: S()}
        });

        expect(plan.ok).toBe(true);
        expect(plan.alreadyApplied).toEqual([]);
        expect(plan.toApply).toHaveLength(1);
        expect(plan.toApply[0].pendingStages).toEqual(['graph']);
        expect(plan.receipt.pendingByStage).toEqual({embedded: 0, graph: 1});
    })

    test('the mirror case: graph-projected but not embedded replays `embedded` only', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 1)],
            appliedStages : {embedded: S(), graph: S(['a'])}
        });

        expect(plan.toApply[0].pendingStages).toEqual(['embedded']);
    })

    test('a row missing BOTH stages replays both', () => {
        const plan = planWalReplay({payloadEntries: [entry('a', 1)], appliedStages: allStages([])});

        expect(plan.toApply[0].pendingStages).toEqual([...WAL_RECEIPT_STAGES]);
    })

    test('⭐ a single UNTYPED id Set is refused — the collapse is the defect, not a convenience', () => {
        const result = planWalReplay({payloadEntries: [entry('a', 1)], appliedStages: S(['a'])});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('{stage: Set}');
        expect(result.reason).toContain('half-applied row look complete');
    })

    test('a missing or wrong-typed stage refuses rather than defaulting to empty', () => {
        // Defaulting an absent stage to `new Set()` would silently replay everything for it — plausible
        // but wrong, because it hides a caller that forgot to read a sidecar.
        expect(planWalReplay({payloadEntries: [], appliedStages: {embedded: S()}}).reason).toContain('appliedStages.graph');
        expect(planWalReplay({payloadEntries: [], appliedStages: {embedded: S(), graph: ['a']}}).reason).toContain('appliedStages.graph');
    })
});

test.describe('planWalReplay — no loss', () => {
    test('every input lands in exactly one bucket, and the buckets sum to the input', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 3), entry('b', 1), entry('c', 2)],
            appliedStages : allStages(['c'])
        });

        expect(plan.ok).toBe(true);
        expect(plan.toApply.map(e => e.id)).toEqual(['b', 'a']);   // timestamp order: b(1), a(3)
        expect(plan.alreadyApplied).toEqual(['c']);
        expect(plan.receipt.toApplyCount + plan.receipt.alreadyAppliedCount).toBe(plan.receipt.sourceEntries);
    })

    test('⭐ an entry with NO id refuses the whole plan — a skip would be silent loss', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 1), {timestamp: 2, document: 'orphan'}],
            appliedStages : allStages([])
        });

        expect(plan.ok).toBe(false);
        expect(plan.reason).toContain('index 1');
        expect(plan.reason).toContain('silent loss');
    })

    test('⭐ a duplicated source id REFUSES — dedup made the arithmetic lie', () => {
        // Two entries sharing an id with different payloads applied one and discarded the other while
        // the buckets still balanced: loss reporting as success. Identical repeats refuse too — this
        // planner does not inspect payloads, so it cannot know a collapse is safe, and guessing is what
        // produced the defect.
        const conflicting = planWalReplay({
            payloadEntries: [{id: 'same', timestamp: 1, document: 'A'}, {id: 'same', timestamp: 2, document: 'B'}],
            appliedStages : allStages([])
        });

        expect(conflicting.ok).toBe(false);
        expect(conflicting.reason).toContain('duplicate source id "same"');
        expect(conflicting.reason).toContain('indices 0 and 1');
        expect(planWalReplay({payloadEntries: [entry('a', 1), entry('a', 1)], appliedStages: allStages([])}).ok).toBe(false);
    })

    test('ordering is deterministic across runs — an unverifiable plan is no plan', () => {
        const build = () => planWalReplay({
            payloadEntries: [entry('z', 5), entry('y', 5), entry('x', 1)],
            appliedStages : allStages([])
        }).toApply.map(e => e.id);

        expect(build()).toEqual(['x', 'y', 'z']);
        expect(build()).toEqual(build());
    })
});

test.describe('planWalReplay — no double-apply', () => {
    test('⭐ IDEMPOTENCE: re-planning after a successful replay yields an EMPTY toApply', () => {
        const entries = [entry('a', 1), entry('b', 2)],
              first   = planWalReplay({payloadEntries: entries, appliedStages: allStages([])});

        expect(first.toApply).toHaveLength(2);

        const second = planWalReplay({payloadEntries: entries, appliedStages: allStages(['a', 'b'])});

        expect(second.ok).toBe(true);
        expect(second.toApply).toHaveLength(0);
        expect(second.alreadyApplied).toEqual(['a', 'b']);
    })

    test('⭐ receiptIdSet REFUSES a malformed receipt row instead of skipping it', () => {
        // This spec previously asserted the skip and therefore certified the defect. A row with no usable
        // id is UNKNOWN prior-application state, not absent state: dropping it converts "I cannot tell
        // whether this was applied" into "it was not applied", which schedules a re-apply and breaks the
        // no-double-apply claim through the one path that reports success.
        const refused = receiptIdSet([{id: 'a', embeddedAt: 1}, {noId: true}, null]);

        expect(refused.ok).toBe(false);
        expect(refused.reason).toContain('index 1');
        expect(refused.reason).toContain('UNKNOWN prior-application state');
        expect(refused.ids).toBeUndefined();
    })

    test('receiptIdSet accepts well-formed rows and rejects a duplicated receipt', () => {
        // Positive control: the refusal above must not be a blanket failure.
        expect([...receiptIdSet([{id: 'a', embeddedAt: 1}, {id: 'b'}]).ids]).toEqual(['a', 'b']);
        expect(receiptIdSet([]).ok).toBe(true);

        // A repeated receipt means the sidecar itself is inconsistent, so prior state is untrustworthy.
        expect(receiptIdSet([{id: 'a'}, {id: 'a'}]).ok).toBe(false);
        expect(receiptIdSet('not-an-array').ok).toBe(false);
    })
});

test.describe('digestAppliedStages — the binding is order-independent and stage-aware', () => {
    test('enumeration order does not change the digest', () => {
        expect(digestAppliedStages({embedded: S(['a', 'b']), graph: S(['a'])}))
            .toBe(digestAppliedStages({embedded: S(['b', 'a']), graph: S(['a'])}));
    })

    test('⭐ the SAME ids at DIFFERENT stages digest differently — stage identity is part of the state', () => {
        // If the digest ignored which stage an id sat in, a plan could bind to a target whose work was
        // at a different pipeline position.
        expect(digestAppliedStages({embedded: S(['a']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(), graph: S(['a'])}));
    })

    test('⭐ VALUE ambiguity: a newline inside an id cannot fake a second id', () => {
        // The original encoding wrote `${value}\n`, and a newline is LEGAL inside a WAL id — so these two
        // distinct legal states hashed identically and the pre-state binding authenticated the wrong one.
        expect(digestAppliedStages({embedded: S(['a\nb']), graph: S(['a\nb'])}))
            .not.toBe(digestAppliedStages({embedded: S(['a', 'b']), graph: S(['a', 'b'])}));

        // A value that LOOKS like a length prefix must not defeat the length prefix either.
        expect(digestAppliedStages({embedded: S(['1:a']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(['a']), graph: S()}));
    })

    test('⭐ PARTITION ambiguity: an id equal to the next stage name cannot cross the boundary', () => {
        // Length-prefixing every element made the ELEMENT encoding injective and left the mapping from
        // stage-partitioned state to flattened sequence ambiguous:
        //   {embedded: ['graph'], graph: []} -> "embedded" "graph" | "graph"
        //   {embedded: [], graph: ['graph']} -> "embedded" | "graph" "graph"
        // Identical byte streams. Each stage now writes its id COUNT before its ids, so every stage is a
        // fixed-arity header plus exactly that many elements.
        expect(digestAppliedStages({embedded: S(['graph']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(), graph: S(['graph'])}));

        // Same shape with the OTHER stage name, and with a numeric id that could impersonate a count.
        expect(digestAppliedStages({embedded: S(['embedded']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(), graph: S(['embedded'])}));
        expect(digestAppliedStages({embedded: S(['1']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(), graph: S(['1'])}));

        // And a split that preserves the flattened element sequence but changes the partition.
        expect(digestAppliedStages({embedded: S(['a', 'b']), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(['a']), graph: S(['b'])}));
    })

    test('an empty stage is distinct from a stage holding an empty-string id', () => {
        expect(digestAppliedStages({embedded: S(), graph: S()}))
            .not.toBe(digestAppliedStages({embedded: S(['']), graph: S()}));
    })
});

test.describe('⭐ verifyReplayContinuity — the pre-state binding survives a stage-boundary substitution', () => {
    // The end-to-end form of the partition collision: a plan computed against state A verified clean
    // against state B, unchanged before→after, reporting monotonic success while the opposite stage held
    // the work. This is the attack the digest exists to stop, so it is asserted at the verifier and not
    // only at the hash.
    const stateA = {embedded: S(['graph']), graph: S()},
          stateB = {embedded: S(), graph: S(['graph'])};

    test('a plan built against state A cannot verify against state B', () => {
        const plan   = planWalReplay({payloadEntries: [entry('graph', 1)], appliedStages: stateA}),
              result = verifyReplayContinuity({appliedStagesBefore: stateB, appliedStagesAfter: stateB, plan});

        expect(plan.ok).toBe(true);
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('does not match the pre-state');
    })

    test('positive control: the same plan verifies against its OWN state once the replay lands', () => {
        // Without this the refusal above could be a blanket failure on any id named after a stage.
        const plan   = planWalReplay({payloadEntries: [entry('graph', 1)], appliedStages: stateA}),
              result = verifyReplayContinuity({
                  appliedStagesBefore: stateA,
                  appliedStagesAfter : {embedded: S(['graph']), graph: S(['graph'])},
                  plan
              });

        expect(result.ok).toBe(true);
        expect(result.monotonic).toBe(true);
        expect(result.receipt.plannedTotal).toBe(1);
    })
});

test.describe('verifyReplayContinuity — the verifier must be BOUND and able to FAIL', () => {
    const entries = [entry('a', 1), entry('b', 2)],
          plan    = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])});

    test('a correct replay verifies, with per-stage applied counts', () => {
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : allStages(['seed', 'a', 'b']),
            plan
        });

        expect(result.ok).toBe(true);
        expect(result.monotonic).toBe(true);
        expect(result.appliedByStage).toEqual({embedded: 2, graph: 2});
        expect(result.receipt.unrelatedTotal).toBe(0);
    })

    test('⭐ a MISMATCHED pre-state refuses — a plan verified against another target is meaningless', () => {
        // This passed before the binding existed: a plan computed against `{seed}` verified clean
        // against an empty target, so the plan's already-applied decisions were never checked against
        // the state they were made about.
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages([]),                    // NOT the {seed} the plan saw
            appliedStagesAfter : allStages(['a', 'b']),
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('does not match the pre-state this plan was computed from');
    })

    test('a same-SIZE but different pre-state still refuses — size is not identity', () => {
        // Why the binding is a digest rather than a count.
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['different']),
            appliedStagesAfter : allStages(['different', 'a', 'b']),
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('does not match the pre-state');
    })

    test('⭐ NON-MONOTONIC refuses, per stage — a target that lost a prior receipt did not succeed', () => {
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : {embedded: S(['a', 'b']), graph: S(['seed', 'a', 'b'])},   // embedded lost 'seed'
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('stage "embedded" lost');
        expect(result.reason).toContain('monotonic');
    })

    test('⭐ a PARTIAL stage refuses — the graph half landing short is loss, not success', () => {
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : {embedded: S(['seed', 'a', 'b']), graph: S(['seed', 'a'])},   // 'b' graph missing
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('stage "graph"');
        expect(result.reason).toContain('never landed');
    })

    test('⭐ UNRELATED concurrent writes are ALLOWED and reported — the pilot owns no exclusivity', () => {
        // The pilot runs beside a shared native-primary plane where other seats keep writing, so
        // unrelated receipts during the replay window are expected. Refusing them would assert an
        // exclusivity the tickets never grant; quiescence is a lease question for the runbook.
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : {embedded: S(['seed', 'a', 'b', 'other-seat']), graph: S(['seed', 'a', 'b'])},
            plan
        });

        expect(result.ok).toBe(true);
        expect(result.unrelatedGainsByStage.embedded).toEqual(['other-seat']);
        expect(result.unrelatedGainsByStage.graph).toEqual([]);
        // Planned counts are unaffected by concurrent writes.
        expect(result.appliedByStage).toEqual({embedded: 2, graph: 2});
    })

    test('a concurrent write does NOT mask a planned id that never landed', () => {
        // The pairing that makes the relaxation safe.
        const result = verifyReplayContinuity({
            appliedStagesBefore: allStages(['seed']),
            appliedStagesAfter : {embedded: S(['seed', 'a', 'other-seat']), graph: S(['seed', 'a', 'b'])},
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('never landed');
    })

    test('a refused plan cannot be verified, and malformed stage inputs refuse', () => {
        const bad = planWalReplay({payloadEntries: [{timestamp: 1}], appliedStages: allStages([])});

        expect(verifyReplayContinuity({appliedStagesBefore: allStages([]), appliedStagesAfter: allStages([]), plan: bad}).reason)
            .toContain('not a successful plan');
        expect(verifyReplayContinuity({appliedStagesBefore: S([]), appliedStagesAfter: allStages([]), plan}).reason)
            .toContain('appliedStagesBefore.embedded must be a Set');
    })
});

// The missing negative control. The suite above mutates TARGET state but never the plan projection, which
// let the central continuity claim pass vacuously: a queue-consuming executor that drained its work list
// turned "no replay happened" into a clean receipt. A continuity receipt must bind THREE authorities —
// target pre-state, planned work, and resulting post-state — and only the first and third were checked.
test.describe('⭐ verifyReplayContinuity — the plan projection is authenticated against its receipt', () => {
    const entries = [entry('a', 1), entry('b', 2)],
          before  = allStages(['seed']);

    test('a returned plan is frozen, so draining the work list throws rather than succeeding', () => {
        const plan = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])});

        expect(Object.isFrozen(plan)).toBe(true);
        expect(Object.isFrozen(plan.toApply)).toBe(true);
        expect(Object.isFrozen(plan.receipt)).toBe(true);
        expect(() => { plan.toApply.length = 0; }).toThrow(TypeError);
        expect(plan.toApply).toHaveLength(2);
    })

    test('⭐ a drained work list CANNOT verify zero replay as success', () => {
        const plan = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])}),
              // A hand-built plan never passed through the freeze, which is exactly how a real executor's
              // copy would arrive. The reconciliation — not the freeze — is what has to catch this.
              drained = {ok: true, toApply: [], alreadyApplied: [], receipt: plan.receipt},
              result  = verifyReplayContinuity({appliedStagesBefore: before, appliedStagesAfter: before, plan: drained});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('receipt recorded 2');
        expect(result.reason).toContain('mutated after planning');
    })

    test('a partially drained list is caught too, not just a fully emptied one', () => {
        const plan    = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])}),
              partial = {ok: true, toApply: [plan.toApply[0]], alreadyApplied: [], receipt: plan.receipt},
              result  = verifyReplayContinuity({
                  appliedStagesBefore: before, appliedStagesAfter: allStages(['seed', 'a']), plan: partial
              });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('receipt recorded 2');
    })

    test('a substituted work list of the SAME LENGTH is caught by id comparison', () => {
        // Count agreement is necessary but not sufficient: swapping which ids were planned keeps the
        // arithmetic balanced while changing what the receipt attests to.
        const plan    = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])}),
              swapped = {
                  ok     : true,
                  toApply: [{...entry('x', 1), pendingStages: ['embedded', 'graph']},
                                   {...entry('y', 2), pendingStages: ['embedded', 'graph']}],
                  alreadyApplied: [],
                  receipt       : plan.receipt
              },
              result = verifyReplayContinuity({
                  appliedStagesBefore: before, appliedStagesAfter: allStages(['seed', 'x', 'y']), plan: swapped
              });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('altered after it was receipted');
    })

    test('a plan whose receipt carries no planned ids refuses', () => {
        const plan                         = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])}),
              {plannedIdsByStage, ...rest} = plan.receipt,
              stripped                     = {ok: true, toApply: plan.toApply, alreadyApplied: [], receipt: rest},
              result                       = verifyReplayContinuity({appliedStagesBefore: before, appliedStagesAfter: before, plan: stripped});

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('plannedIdsByStage is missing');
    })

    test('positive control: an untampered plan still verifies, and reports the receipted total', () => {
        // Without this the four refusals above could all be a blanket failure.
        const plan   = planWalReplay({payloadEntries: entries, appliedStages: allStages(['seed'])}),
              result = verifyReplayContinuity({
                  appliedStagesBefore: before, appliedStagesAfter: allStages(['seed', 'a', 'b']), plan
              });

        expect(result.ok).toBe(true);
        expect(result.monotonic).toBe(true);
        expect(result.receipt.plannedTotal).toBe(2);
        expect(result.appliedByStage).toEqual({embedded: 2, graph: 2});
    })
});
