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
            payloadEntries: [entry('a', 3), entry('b', 1), entry('c', 2), entry('b', 9)],
            appliedIds    : new Set(['c'])
        });

        expect(plan.ok).toBe(true);
        expect(plan.toApply.map(e => e.id)).toEqual(['b', 'a']);   // timestamp order: b(1), a(3)
        expect(plan.alreadyApplied).toEqual(['c']);
        expect(plan.duplicateInSource).toEqual(['b']);
        // The invariant as arithmetic, not as trust.
        expect(plan.receipt.toApplyCount + plan.receipt.alreadyAppliedCount + plan.receipt.duplicateCount)
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

    test('a duplicated id within the source is applied ONCE, not twice', () => {
        const plan = planWalReplay({payloadEntries: [entry('a', 1), entry('a', 2)], appliedIds: new Set()});

        expect(plan.toApply).toHaveLength(1);
        expect(plan.duplicateInSource).toEqual(['a']);
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

    test('⭐ UNPLANNED writes refuse — the target gained what the plan did not authorise', () => {
        const result = verifyReplayContinuity({
            appliedBefore: new Set(['seed']),
            appliedAfter : new Set(['seed', 'a', 'b', 'stowaway']),
            plan
        });

        expect(result.ok).toBe(false);
        expect(result.reason).toContain('unplanned');
    })

    test('a refused plan cannot be verified — the refusal propagates', () => {
        const bad = planWalReplay({payloadEntries: [{timestamp: 1}], appliedIds: new Set()});

        expect(verifyReplayContinuity({appliedBefore: new Set(), appliedAfter: new Set(), plan: bad}).reason)
            .toContain('not a successful plan');
    })
});
