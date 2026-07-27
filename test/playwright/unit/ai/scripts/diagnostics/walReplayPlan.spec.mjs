import {test, expect} from '@playwright/test';
import {
    parseJsonl,
    planWalReplay,
    receiptIdSet,
    verifyReplayContinuity
} from '../../../../../../ai/scripts/diagnostics/walReplayPlan.mjs';

// Pure planner — no plane, no socket, no clock. AC3's claim ("replayed-onto-native receipts show
// monotonic continuity: no loss, no double-apply") is only meaningful if the verifier can FAIL, so
// every invariant below has a control that violates it.
//
// Entry shape mirrors the real WAL triad read off disk: payload `wal-<date>.jsonl` carries
// {id, timestamp, document, …}; the `.embedded`/`.graph` sidecars carry {id, embeddedAt|projectedAt}
// and ARE the applied-id watermark.

const entry = (id, timestamp) => ({id, timestamp, document: `doc-${id}`});

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

test.describe('planWalReplay — no loss', () => {
    test('every input lands in exactly one bucket, and the buckets sum to the input', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 3), entry('b', 1), entry('c', 2)],
            appliedIds    : new Set(['c'])
        });

        expect(plan.ok).toBe(true);
        expect(plan.toApply.map(e => e.id)).toEqual(['b', 'a']);   // timestamp order: b(1), a(3)
        expect(plan.alreadyApplied).toEqual(['c']);
        // The invariant as arithmetic, not as trust. Two buckets only — a repeated id refuses outright
        // rather than being collapsed into a third "safe" bucket.
        expect(plan.receipt.toApplyCount + plan.receipt.alreadyAppliedCount)
            .toBe(plan.receipt.sourceEntries);
    })

    test('⭐ an entry with NO id refuses the whole plan — a skip would be silent loss', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 1), {timestamp: 2, document: 'orphan'}],
            appliedIds    : new Set()
        });

        expect(plan.ok).toBe(false);
        expect(plan.reason).toContain('index 1');
        expect(plan.reason).toContain('silent loss');
        expect(plan).not.toHaveProperty('toApply');
    })

    test('ordering is deterministic across runs — an unverifiable plan is no plan', () => {
        const build = () => planWalReplay({
            payloadEntries: [entry('z', 5), entry('y', 5), entry('x', 1)],
            appliedIds    : new Set()
        }).toApply.map(e => e.id);

        // Same timestamp ⇒ id breaks the tie, so two runs agree.
        expect(build()).toEqual(['x', 'y', 'z']);
        expect(build()).toEqual(build());
    })

    test('refuses malformed inputs rather than coercing them', () => {
        expect(planWalReplay({payloadEntries: 'no', appliedIds: new Set()}).reason).toContain('must be an array');
        expect(planWalReplay({payloadEntries: [], appliedIds: ['a']}).reason).toContain('must be a Set');
    })
});

test.describe('planWalReplay — no double-apply', () => {
    test('ids already in the target receipt set are excluded', () => {
        const plan = planWalReplay({
            payloadEntries: [entry('a', 1), entry('b', 2)],
            appliedIds    : receiptIdSet([{id: 'a', embeddedAt: 1}])
        });

        expect(plan.toApply.map(e => e.id)).toEqual(['b']);
        expect(plan.alreadyApplied).toEqual(['a']);
    })

    test('⭐ IDEMPOTENCE: re-planning after a successful replay yields an EMPTY toApply', () => {
        // The property AC3 actually needs. Asserted rather than inferred from the filter: replay is
        // safe to re-run precisely because the receipts make the second plan a no-op.
        const entries = [entry('a', 1), entry('b', 2)],
              first   = planWalReplay({payloadEntries: entries, appliedIds: new Set()});

        expect(first.toApply).toHaveLength(2);

        const afterIds = receiptIdSet(first.toApply.map(e => ({id: e.id, embeddedAt: 1}))),
              second   = planWalReplay({payloadEntries: entries, appliedIds: afterIds});

        expect(second.ok).toBe(true);
        expect(second.toApply).toHaveLength(0);
        expect(second.alreadyApplied).toEqual(['a', 'b']);
    })

    test('⭐ a duplicated source id REFUSES — dedup made the arithmetic lie', () => {
        // The falsified contract bucketed a repeat as a benign re-flush. But two entries sharing an id
        // with DIFFERENT payloads meant one document was applied and the other discarded while the
        // buckets still balanced: loss reporting as success. "The counts add up" is not "nothing was
        // lost". Refusing costs nothing observable — the live corpus has 8168 rows / 8168 unique ids.
        const conflicting = planWalReplay({
            payloadEntries: [{id: 'same', timestamp: 1, document: 'A'}, {id: 'same', timestamp: 2, document: 'B'}],
            appliedIds    : new Set()
        });

        expect(conflicting.ok).toBe(false);
        expect(conflicting.reason).toContain('duplicate source id "same"');
        expect(conflicting.reason).toContain('indices 0 and 1');
        expect(conflicting.reason).toContain('integrity event');
        expect(conflicting).not.toHaveProperty('toApply');

        // Identical repeats refuse too: this planner does not inspect payloads, so it cannot know they
        // are safe to collapse, and guessing is what produced the defect.
        expect(planWalReplay({payloadEntries: [entry('a', 1), entry('a', 1)], appliedIds: new Set()}).ok).toBe(false);
    })
});

test.describe('verifyReplayContinuity — the verifier must be able to FAIL', () => {
    const entries = [entry('a', 1), entry('b', 2)],
          plan    = planWalReplay({payloadEntries: entries, appliedIds: new Set(['seed'])});

    test('a correct replay verifies, with the delta matching the plan exactly', () => {
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['seed', 'a', 'b']),
            plan
        });

        expect(result.ok).toBe(true);
        expect(result.monotonic).toBe(true);
        expect(result.applied).toBe(2);
        expect(result.receipt).toMatchObject({appliedBefore: 1, appliedAfter: 3, delta: 2, planned: 2});
    })

    test('⭐ NON-MONOTONIC refuses — a target that lost a prior id did not succeed', () => {
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['a', 'b']),   // 'seed' vanished
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('previously-applied');
        expect(result.reason).toContain('monotonic');
    })

    test('⭐ PARTIAL replay refuses — a planned id that never landed is loss, not success', () => {
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['seed', 'a']),   // 'b' missing
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('never landed');
    })

    test('⭐ UNRELATED concurrent writes are ALLOWED and reported — the pilot owns no exclusivity', () => {
        // The falsified contract refused any receipt the plan had not authorised, which asserted
        // exclusive ownership of the native target. The pilot runs beside a shared/native-primary plane
        // where other seats keep writing, so unrelated gains during replay are expected and legitimate.
        // Continuity is scoped to the PLANNED ids; unrelated monotonic growth is reported, not judged.
        // Writer quiescence is a lease question for the promotion runbook, not a verifier's presumption.
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['seed', 'a', 'b', 'other-seat-write']),
            plan
        });

        expect(result.ok).toBe(true);
        expect(result.unrelatedGains).toEqual(['other-seat-write']);
        // `applied` counts only what the plan authorised, so a concurrent write cannot inflate it.
        expect(result.applied).toBe(2);
    })

    test('a concurrent write does NOT mask a planned id that never landed', () => {
        // The pairing that makes the relaxation safe: allowing unrelated gains must not let loss hide
        // behind them. 'b' is missing while an unrelated id appeared.
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['seed', 'a', 'other-seat-write']),
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('never landed');
    })

    test('a refused plan cannot be verified — the refusal propagates', () => {
        const bad = planWalReplay({payloadEntries: [{timestamp: 1}], appliedIds: new Set()});

        expect(verifyReplayContinuity({appliedBefore: new Set(), appliedAfter: new Set(), plan: bad}).reason)
            .toContain('not a successful plan');
    })
});
