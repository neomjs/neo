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
// aborted / timedOut), the single-level undo + reverse ordering, per-session isolation, the fail-closed branches
// (every required reverse-record field + both-descriptor serializability), and the caps.

const
    ID  = {agentId: 'agent-a', sessionId: 'sess-a'},
    ID2 = {agentId: 'agent-b', sessionId: 'sess-b'},

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
    test('begin fails closed on an invalid/incomplete writer identity or empty txId', () => {
        const s = svc();

        // missing fields + non-string ids — the stricter typeof guard mirrors LockRegistry.normalizeLock
        for (const badId of [{}, {agentId: 'a'}, {sessionId: 's'}, {agentId: 123, sessionId: 's'}, {agentId: 'a', sessionId: {}}]) {
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

    test('record fails closed on a malformed op (ANY required field missing or mistyped)', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        const base = op(1);
        for (const bad of [
            {...base, sequenceId: undefined},                 // missing sequenceId
            {...base, sequenceId: ''},                        // empty sequenceId
            {...base, originWriter: undefined},               // missing originWriter (no throw on the access)
            {...base, originWriter: {agentId: 'a'}},          // missing sessionId
            {...base, targetSubtreePath: 'not-an-array'},
            {...base, targetSubtreePath: []},                 // empty path
            {...base, targetSubtreePath: ['root', '']},       // empty path segment
            {...base, forward: undefined},                    // missing forward
            {...base, reverse: undefined},                    // missing reverse
            {...base, label: undefined},                      // missing label
            {...base, label: ''}                              // empty label
        ]) {
            expect(s.record({id: ID, txId: 'tx-1', op: bad}).reason).toBe('malformed-op')
        }
    });

    test('record fails closed on a non-serializable (cyclic) forward OR reverse — data-not-code guard', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        const cyclic = {}; cyclic.self = cyclic;
        // both descriptors are stored, so both must be JSON-guarded — neither may throw inside cloneOp downstream
        expect(s.record({id: ID, txId: 'tx-1', op: {...op(1),      reverse: cyclic}}).reason).toBe('op-not-serializable');
        expect(s.record({id: ID, txId: 'tx-1', op: {...op(2, 'b'), forward: cyclic}}).reason).toBe('op-not-serializable');
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

    test('maxOpPayloadBytes rejects an oversized forward OR reverse', () => {
        const s = svc({maxOpPayloadBytes: 40});
        s.begin({id: ID, txId: 'tx-1'});

        const bigReverse = {...op(1),      reverse: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 'y'.repeat(200)}}}};
        const bigForward = {...op(2, 'b'), forward: {tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 'y'.repeat(200)}}}};
        expect(s.record({id: ID, txId: 'tx-1', op: bigReverse})).toEqual({ok: false, reason: 'max-op-payload-bytes'});
        expect(s.record({id: ID, txId: 'tx-1', op: bigForward})).toEqual({ok: false, reason: 'max-op-payload-bytes'});
    });

    test('maxLabelChars rejects an over-long label (at the bound is accepted)', () => {
        const s = svc({maxLabelChars: 8});
        s.begin({id: ID, txId: 'tx-1'});

        expect(s.record({id: ID, txId: 'tx-1', op: {...op(1), label: 'x'.repeat(9)}}))
            .toEqual({ok: false, reason: 'max-label-length'});
        expect(s.record({id: ID, txId: 'tx-1', op: {...op(2, 'b'), label: 'x'.repeat(8)}}).ok).toBe(true);
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

    test('timeout drops the open transaction as its own terminal (idempotent on mismatch)', () => {
        const s = svc();
        s.begin({id: ID, txId: 'tx-1'});

        expect(s.timeout({id: ID, txId: 'WRONG'})).toEqual({timedOut: false}); // mismatch → no-op
        expect(s.timeout({id: ID, txId: 'tx-1'})).toEqual({timedOut: true});
        expect(s.stackOf({id: ID}).open).toBeNull();
        expect(s.timeout({id: ID, txId: 'tx-1'})).toEqual({timedOut: false}); // already gone
        expect(s.undo({id: ID}).reverseOps).toBeNull();                       // a timed-out tx is never undoable
    });

    test('sweep retires a writer session entirely; fails closed on incomplete identity', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));
        s.begin({id: ID, txId: 'tx-2'}); // an open tx too

        expect(s.sweep({id: {}})).toEqual({swept: false});      // incomplete → sweeps nothing
        expect(s.sweep({id: ID})).toEqual({swept: true});
        expect(s.stackOf({id: ID})).toEqual({open: null, committed: [], redo: []});
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

    // --- redo (Slice-2): the symmetric counterpart — undo retains the popped tx on a redo branch that redo re-applies,
    // and a new commit clears it (divergence). Pure in-heap, no live tree; the caller re-dispatches the forward-ops.
    test('redo re-applies the most-recently undone transaction (undone → committed)', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));

        expect(s.undo({id: ID}).txId).toBe('tx-1');
        expect(s.stackOf({id: ID}).committed).toHaveLength(0); // popped off the undo stack
        expect(s.stackOf({id: ID}).redo).toHaveLength(1);      // retained on the redo branch

        const r = s.redo({id: ID});

        expect(r.txId).toBe('tx-1');
        expect(r.forwardOps).toHaveLength(1);
        expect(r.forwardOps[0].forward).toEqual({tool: 'set_instance_properties', args: {id: 'leaf', properties: {x: 1}}});
        expect(s.stackOf({id: ID}).committed.map(t => t.txId)).toEqual(['tx-1']); // restored — undoable again
        expect(s.stackOf({id: ID}).redo).toHaveLength(0);
    });

    test('redo with nothing undone is a fail-closed no-op', () => {
        const s = svc();
        expect(s.redo({id: ID})).toEqual({txId: null, forwardOps: null}); // never undone

        commitOne(s, ID, 'tx-1', op(1));
        expect(s.redo({id: ID})).toEqual({txId: null, forwardOps: null}); // committed but not undone
    });

    test('a new committed transaction clears the redo branch (divergence invalidation)', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));
        s.undo({id: ID});
        expect(s.stackOf({id: ID}).redo).toHaveLength(1);

        commitOne(s, ID, 'tx-2', op(2)); // a fresh mutation diverges history
        expect(s.stackOf({id: ID}).redo).toHaveLength(0);
        expect(s.redo({id: ID})).toEqual({txId: null, forwardOps: null});
    });

    test('the undo → redo → undo cycle re-uses the retained transaction', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));

        expect(s.undo({id: ID}).txId).toBe('tx-1'); // committed → undone (redo branch)
        expect(s.redo({id: ID}).txId).toBe('tx-1'); // undone → committed (undoable again)
        expect(s.undo({id: ID}).txId).toBe('tx-1'); // and undoable once more
        expect(s.stackOf({id: ID}).committed).toHaveLength(0);
        expect(s.stackOf({id: ID}).redo).toHaveLength(1);
    });

    test('sweep clears the redo branch with the rest of the session', () => {
        const s = svc();
        commitOne(s, ID, 'tx-1', op(1));
        s.undo({id: ID});
        expect(s.stackOf({id: ID}).redo).toHaveLength(1);

        s.sweep({id: ID});
        expect(s.stackOf({id: ID})).toEqual({open: null, committed: [], redo: []});
    });

    test('redo returns forward-ops in capture order (first mutation re-applied first)', () => {
        const s = svc();
        s.begin ({id: ID, txId: 'tx-1'});
        s.record({id: ID, txId: 'tx-1', op: op(1, 'a')});
        s.record({id: ID, txId: 'tx-1', op: op(2, 'b')});
        s.commit({id: ID, txId: 'tx-1'});

        s.undo({id: ID});
        // undo returns reverses last-first (['b','a']); redo returns forwards first-first
        expect(s.redo({id: ID}).forwardOps.map(o => o.sequenceId)).toEqual(['a', 'b']);
    });
});
