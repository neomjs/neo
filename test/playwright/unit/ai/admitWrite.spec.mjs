import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'AdmitWriteTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import InstanceService from '../../../../src/ai/client/InstanceService.mjs';
import WriteGuard      from '../../../../src/ai/WriteGuard.mjs';
import {admitWrite}    from '../../../../src/ai/admitWrite.mjs';

// admitWrite is the pure seam joining resolveWriteLock (the decision) to a WriteGuard (the held-lock authority).
// The decision branches are isolated with a STUB guard — so we can assert *whether* the authority is consulted and
// *with exactly which lock*. The grant / deny + held-lock semantics use a REAL Neo.ai.WriteGuard, so the cross-writer
// denial is the genuine LockRegistry conflict math end-to-end, not a mock of the very thing under test.
//
// Linear component tree  root → mid → leaf  (parentOf returns the parent id; falsy at the root).
const
    PARENTS  = {leaf: 'mid', mid: 'root', root: null},
    parentOf = id => PARENTS[id],
    CTX_A    = {agentId: 'agent-a', sessionId: 'sess-a'},
    CTX_B    = {agentId: 'agent-b', sessionId: 'sess-b'};

// A guard stub that records every lock it is asked to hold and returns a scripted verdict.
const stubGuard = verdict => {
    const calls = [];
    return {calls, requestWrite(lock) {calls.push(lock); return verdict}}
};

test.describe('admitWrite (NL write-enforcement orchestration)', () => {
    test('legacy / non-agent frame (absent context) → admitted; the authority is never consulted', () => {
        const guard = stubGuard({granted: false}); // would DENY if consulted — proves the unguarded path skips it
        for (const absent of [null, undefined, 'x', 42, true]) {
            expect(admitWrite({context: absent, componentId: 'leaf', parentOf, writeGuard: guard}))
                .toEqual({admitted: true, reason: null, conflict: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + incomplete identity → denied, no mutate; the authority is never consulted', () => {
        const guard = stubGuard({granted: true}); // would GRANT if consulted
        for (const bad of [{agentId: '', sessionId: 'sess-a'}, {agentId: 'agent-a', sessionId: ''}, {}, {foo: 1}]) {
            expect(admitWrite({context: bad, componentId: 'leaf', parentOf, writeGuard: guard}))
                .toEqual({admitted: false, reason: 'incomplete-identity', conflict: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + unresolvable target → denied, no mutate; the authority is never consulted', () => {
        const guard = stubGuard({granted: true});
        for (const badId of ['', 'document.body']) {
            expect(admitWrite({context: CTX_A, componentId: badId, parentOf, writeGuard: guard}))
                .toEqual({admitted: false, reason: 'unresolvable-target', conflict: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + valid lock but NO writeGuard → denied (no-write-guard); never fails open on a misconfig', () => {
        for (const noGuard of [undefined, null]) {
            expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: noGuard}))
                .toEqual({admitted: false, reason: 'no-write-guard', conflict: null})
        }
    });

    test('enforced + guard grants → admitted; the EXACT resolved absolute lock is what gets held', () => {
        const guard = stubGuard({granted: true, conflict: null});
        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}))
            .toEqual({admitted: true, reason: null, conflict: null});
        // the descriptor handed to the authority is resolveWriteLock's absolute root→node lock, verbatim
        expect(guard.calls).toEqual([{agentId: 'agent-a', sessionId: 'sess-a', subtreePath: ['root', 'mid', 'leaf']}])
    });

    test('enforced + guard denies → denied with reason:conflict and the conflicting holder surfaced', () => {
        const holder = {agentId: 'agent-b', sessionId: 'sess-b', subtreePath: ['root']},
              guard  = stubGuard({granted: false, conflict: holder});
        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}))
            .toEqual({admitted: false, reason: 'conflict', conflict: holder})
    });

    // ── integration: the REAL WriteGuard + LockRegistry conflict math (the actual enforcement, not a mock) ──
    test('REAL WriteGuard — overlapping subtree: first writer holds, second denied, same-writer re-entrant', () => {
        const guard = Neo.create('Neo.ai.WriteGuard');

        // writer A acquires (and holds) the 'mid' subtree
        expect(admitWrite({context: CTX_A, componentId: 'mid', parentOf, writeGuard: guard}).admitted).toBe(true);
        expect(guard.heldLocks()).toHaveLength(1);

        // writer B writes 'leaf' — a descendant of A's held 'mid' → genuine overlap → denied, nothing held for B
        const b = admitWrite({context: CTX_B, componentId: 'leaf', parentOf, writeGuard: guard});
        expect(b.admitted).toBe(false);
        expect(b.reason).toBe('conflict');
        expect(b.conflict).toMatchObject({agentId: 'agent-a', sessionId: 'sess-a'});
        expect(guard.heldLocks()).toHaveLength(1);

        // the SAME writer A re-acquiring an overlapping subtree is re-entrant → still admitted
        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}).admitted).toBe(true)
    });

    test('REAL WriteGuard — disjoint subtrees: two writers both admitted (no false-positive conflict)', () => {
        const
            guard   = Neo.create('Neo.ai.WriteGuard'),
            // two disjoint linear trees:  root → mid → leaf   and   other → branch
            parents = {leaf: 'mid', mid: 'root', root: null, branch: 'other', other: null},
            pOf     = id => parents[id];

        expect(admitWrite({context: CTX_A, componentId: 'leaf',   parentOf: pOf, writeGuard: guard}).admitted).toBe(true);
        expect(admitWrite({context: CTX_B, componentId: 'branch', parentOf: pOf, writeGuard: guard}).admitted).toBe(true);
        expect(guard.heldLocks()).toHaveLength(2)
    });
});

// The service-boundary wiring: a denied write must THROW and NOT mutate the target. Uses a real WriteGuard + a real
// InstanceService; Neo.get / Neo.getComponent are the only live-heap couplings, stubbed for the call window and
// restored — the live two-agent run over a mounted tree is the umbrella whitebox-e2e follow-up.
test.describe('InstanceService write enforcement (wiring)', () => {
    test('setInstanceProperties denies a cross-writer write — throws and never calls instance.set', () => {
        const
            guard   = Neo.create('Neo.ai.WriteGuard'),
            service = Neo.create('Neo.ai.client.InstanceService', {client: {writeGuard: guard}}),
            tree    = {leaf: {parentId: 'mid'}, mid: {parentId: 'root'}, root: {parentId: null}};

        let setCalls = 0;
        const fakeInstance = {set() {setCalls++}};

        const origGet = Neo.get, origGetComponent = Neo.getComponent;
        Neo.get          = () => fakeInstance;       // every target id resolves to the observable fake
        Neo.getComponent = id => tree[id];           // parentOf walks the synthetic tree

        try {
            // writer A writes 'mid' → admitted + mutates + holds the subtree
            service.setInstanceProperties({id: 'mid', properties: {x: 1}}, CTX_A);
            expect(setCalls).toBe(1);

            // writer B writes 'leaf' (descendant of A's held 'mid') → denied: throws, and instance.set is NOT called
            expect(() => service.setInstanceProperties({id: 'leaf', properties: {x: 2}}, CTX_B))
                .toThrow(/Write denied/);
            expect(setCalls).toBe(1); // unchanged — the denied write did not mutate

            // a bare / legacy frame (no context) is unguarded — still mutates (backward-compatible)
            service.setInstanceProperties({id: 'leaf', properties: {x: 3}});
            expect(setCalls).toBe(2)
        } finally {
            Neo.get = origGet; Neo.getComponent = origGetComponent
        }
    })
});
