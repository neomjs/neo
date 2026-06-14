import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'TransactionServiceTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import TransactionService from '../../../../src/ai/TransactionService.mjs';

// Neo.ai.TransactionService is the in-heap per-session undo stack. It is pure over its inputs (reverse-capture,
// the enforcement grant, and the live tree all live in the caller) — so these tests drive event sequences against
// a real instance with no live-heap or socket dependency, and assert the lifecycle (open→committed→undone +
// aborted), the single-level undo + reverse ordering, per-session isolation, the fail-closed branches, and the caps.

const
    ID  = {neuralLinkSessionId: 'nl-1', requesterAgentId: 'agent-a', requesterSessionId: 'sess-a'},
    ID2 = {neuralLinkSessionId: 'nl-1', requesterAgentId: 'agent-b', requesterSessionId: 'sess-b'},

    // a minimal valid reverse-op (WHO + WHAT + audit path); set⁻¹ is set(old values)
    op = (n = 1, seq = `seq-${n}`) => ({
        sequenceId       : seq,
        originWriter     : {agentId: 'agent-a', sessionId: 'sess-a'},
        targetSubtreePath: ['root', 'leaf'],
        forward          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: n}}},
        reverse          : {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: n - 1}}},
        label            : `set x=${n}`
    }),

    svc = cfg => Neo.create('Neo.ai.TransactionService', cfg),

    // the Slice-1 single-op capture flow: begin → record → commit
    commitOne = (s, id, txId, o) => {
        s.begin({id, txId});
        s.record({id, txId, op: o});
        return s.commit({id, txId})
    };

test.describe('Neo.ai.TransactionService — in-heap per-session undo stack', () => {
    test('begin → record → commit → undo round-trips a single-op transaction', () => {
        const s = svc();

        expect(s.begin ({id: ID, txId: 'tx-1'})).toEqual({ok: true, reason: null});
        expect(s.record({id: ID, txId: 'tx-1', op: op(1)})).toEqual({ok: true, reason: null});
        expect(s.commit({id: ID, txId: 'tx-1'})).toEqual({ok: true, reason: null});

        const u = s.undo({id: ID});

        expect(u.txId).toBe('tx-1');
        expect(u.reverseOps).toHaveLength(1);
        expect(u.reverseOps[0].reverse).toEqual({tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 0}}});
        expect(u.reverseOps[0].originWriter).toEqual({agentId: 'agent-a', sessionId: 'sess-a'}); // provenance preserved
        expect(s.undo({id: ID})).toEqual({txId: null, reverseOps: null});                        // stack now empty
    });

    test('single-level undo pops most-recent committed first', () => {
        const s = svc();

        commitOne(s, ID, 'tx-1', op(1));
        commitOne(s, ID, 'tx-2', op(2));

        expect(s.undo({id: ID}).txId).toBe('tx-2');
        expect(s.undo({id: ID}).txId).toBe('tx-1');
        expect(s.undo({id: ID}).reverseOps).toBeNull();
    });

    test('a multi-op transaction returns reverses in REVERSE capture order (last mutation undone first)', () => {
        const s = svc();

        s.begin ({id: ID, txId: 'tx-1'});
        s.record({id: ID, txId: 'tx-1', op: op(1, 'a')});
        s.record({id: ID, txId: 'tx-1', op: op(2, 'b')});
        s.commit({id: ID, txId: 'tx-1'});

        expect(s.undo({id: ID}).reverseOps.map(o => o.sequenceId)).toEqual(['b', 'a']);
    });

    test('begin aborts a prior still-open transaction — no leaked open tx, no committed record', () => {
        const s = svc();

        s.begin ({id: ID, txId: 'tx-1'});
        s.record({id: ID, txId: 'tx-1', op: op(1)});
        s.begin ({id: ID, txId: 'tx-2'});                 // tx-1 was open → aborted

        expect(s.commit({id: ID, txId: 'tx-1'}).ok).toBe(false); // tx-1 is no longer open
        expect(s.stackOf({id: ID}).committed).toHaveLength(0);   // tx-1 left nothing committed
        expect(s.stackOf({id: ID}).open.txId).toBe('tx-2');
    });

    test('per-session isolation — two writers keep separate stacks', () => {
        const s = svc();

        commitOne(s, ID,  'a-1', op(1));
        commitOne(s, ID2, 'b-1', op(1));

        expect(s.undo({id: ID }).txId).toBe('a-1');
        expect(s.undo({id: ID2}).txId).toBe('b-1');
        expect(s.undo({id: ID }).reverseOps).toBeNull(); // each writer's stack is independent
    });

    // ── fail-closed branches ──────────────────────────────────────────────────────────────────────
    test('begin fails closed on an incomplete session identity or empty txId', () => {
        const s = svc();

        for (const badId of [{}, {requesterAgentId: 'a', requesterSessionId: 's'}, {neuralLinkSessionId: 'nl-1'}]) {
            expect(s.begin({id: badId, txId: 'tx-1'}).ok).toBe(false)
        }
        expect(s.begin({id: ID, txId: ''}).ok).toBe(false);
    });

    test('record / commit fail closed with no open transaction or a txId mismatch', () => {
        const s = svc();

        expect(s.record({id: ID, txId: 'tx-1', op: op(1)})).toEqual({ok: false, reason: 'no-open-transaction'});
        expect(s.commit({id: ID, txId: 'tx-1'})).toEqual({ok: false, reason: 'no-open-transaction'});

        s.begin({id: ID, txId: 'tx-1'});
        expect(s.record({id: ID, txId: 'WRONG', op: op(1)}).reason).toBe('no-open-transaction');
        expect(s.commit({id: ID, txId: 'WRONG'}).reason).toBe('no-open-transaction');
    });

    test('record fails closed on a malformed op (missing originWriter / path / reverse)', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        const base = op(1);
        for (const bad of [
            {...base, originWriter: {agentId: 'a'}},          // missing sessionId
            {...base, targetSubtreePath: 'not-an-array'},
            {...base, reverse: undefined}
        ]) {
            expect(s.record({id: ID, txId: 'tx-1', op: bad}).reason).toBe('malformed-op')
        }
    });

    test('record fails closed on a non-serializable (cyclic) reverse — data-not-code guard', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        const cyclic = {}; cyclic.self = cyclic;
        expect(s.record({id: ID, txId: 'tx-1', op: {...op(1), reverse: cyclic}}).reason)
            .toBe('reverse-not-serializable');
    });

    test('commit drops an empty transaction (nothing captured → not undoable)', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        expect(s.commit({id: ID, txId: 'tx-1'})).toEqual({ok: false, reason: 'empty-transaction'});
        expect(s.undo({id: ID}).reverseOps).toBeNull();
    });

    // ── caps ──────────────────────────────────────────────────────────────────────────────────────
    test('maxOpsPerTransaction caps a single transaction', () => {
        const s = svc({maxOpsPerTransaction: 2});
        s.begin({id: ID, txId: 'tx-1'});

        expect(s.record({id: ID, txId: 'tx-1', op: op(1, 'a')}).ok).toBe(true);
        expect(s.record({id: ID, txId: 'tx-1', op: op(2, 'b')}).ok).toBe(true);
        expect(s.record({id: ID, txId: 'tx-1', op: op(3, 'c')})).toEqual({ok: false, reason: 'max-ops-per-transaction'});
    });

    test('maxReversePayloadBytes rejects an oversized reverse', () => {
        const s   = svc({maxReversePayloadBytes: 40});
        s.begin({id: ID, txId: 'tx-1'});

        const big = {...op(1), reverse: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 'y'.repeat(200)}}}};
        expect(s.record({id: ID, txId: 'tx-1', op: big})).toEqual({ok: false, reason: 'max-reverse-payload-bytes'});
    });

    test('maxStackDepth evicts the oldest committed transaction', () => {
        const s = svc({maxStackDepth: 2});

        commitOne(s, ID, 'tx-1', op(1));
        commitOne(s, ID, 'tx-2', op(2));
        commitOne(s, ID, 'tx-3', op(3)); // pushes past depth 2 → tx-1 evicted

        expect(s.stackOf({id: ID}).committed.map(t => t.txId)).toEqual(['tx-2', 'tx-3']);
        expect(s.undo({id: ID}).txId).toBe('tx-3');
        expect(s.undo({id: ID}).txId).toBe('tx-2');
        expect(s.undo({id: ID}).reverseOps).toBeNull(); // tx-1 was evicted — not undoable
    });

    // ── abort / sweep ───────────────────────────────────────────────────────────────────────────────
    test('abort drops the open transaction (idempotent on mismatch)', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        expect(s.abort({id: ID, txId: 'WRONG'})).toEqual({aborted: false});
        expect(s.abort({id: ID, txId: 'tx-1'})).toEqual({aborted: true});
        expect(s.stackOf({id: ID}).open).toBeNull();
        expect(s.abort({id: ID, txId: 'tx-1'})).toEqual({aborted: false}); // already gone
    });

    test('sweep retires a writer session entirely; fails closed on incomplete identity', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));
        s.begin({id: ID, txId: 'tx-2'}); // an open tx too

        expect(s.sweep({id: {}})).toEqual({swept: false});      // incomplete → sweeps nothing
        expect(s.sweep({id: ID})).toEqual({swept: true});
        expect(s.stackOf({id: ID})).toEqual({open: null, committed: []});
        expect(s.undo({id: ID}).reverseOps).toBeNull();
        expect(s.sweep({id: ID})).toEqual({swept: false});      // already swept
    });

    test('stackOf returns a deep copy — mutating it never affects the live stack', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));

        const snap = s.stackOf({id: ID});
        snap.committed[0].ops[0].reverse.args.properties.x = 999;
        snap.committed.push({txId: 'injected'});

        expect(s.undo({id: ID}).reverseOps[0].reverse.args.properties.x).toBe(0); // live stack unchanged
    });
});
