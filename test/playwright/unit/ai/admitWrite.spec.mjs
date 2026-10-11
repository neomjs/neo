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
    PARENTS             = {leaf: 'mid', mid: 'root', root: null},
    parentOf            = id => PARENTS[id],
    CTX_A               = {agentId: 'agent-a', sessionId: 'sess-a'},
    CTX_A_OTHER_SESSION = {agentId: 'agent-a', sessionId: 'sess-b'},
    CTX_B               = {agentId: 'agent-b', sessionId: 'sess-b'};

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
                .toEqual({admitted: true, reason: null, conflict: null, acquisition: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + incomplete identity → denied, no mutate; the authority is never consulted', () => {
        const guard = stubGuard({granted: true}); // would GRANT if consulted
        for (const bad of [{agentId: '', sessionId: 'sess-a'}, {agentId: 'agent-a', sessionId: ''}, {}, {foo: 1}]) {
            expect(admitWrite({context: bad, componentId: 'leaf', parentOf, writeGuard: guard}))
                .toEqual({admitted: false, reason: 'incomplete-identity', conflict: null, acquisition: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + unresolvable target → denied, no mutate; the authority is never consulted', () => {
        const guard = stubGuard({granted: true});
        for (const badId of ['', 'document.body']) {
            expect(admitWrite({context: CTX_A, componentId: badId, parentOf, writeGuard: guard}))
                .toEqual({admitted: false, reason: 'unresolvable-target', conflict: null, acquisition: null})
        }
        expect(guard.calls).toHaveLength(0)
    });

    test('enforced + valid lock but NO writeGuard → denied (no-write-guard); never fails open on a misconfig', () => {
        for (const noGuard of [undefined, null]) {
            expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: noGuard}))
                .toEqual({admitted: false, reason: 'no-write-guard', conflict: null, acquisition: null})
        }
    });

    test('enforced + guard grants → admitted; the EXACT resolved absolute lock is what gets held', () => {
        const guard = stubGuard({granted: true, conflict: null});
        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}))
            .toEqual({admitted: true, reason: null, conflict: null, acquisition: null});
        // the descriptor handed to the authority is resolveWriteLock's absolute root→node lock, verbatim
        expect(guard.calls).toEqual([{agentId: 'agent-a', sessionId: 'sess-a', subtreePath: ['root', 'mid', 'leaf']}])
    });

    test('enforced + guard denies → denied with reason:conflict and the conflicting holder surfaced', () => {
        const holder = {agentId: 'agent-b', sessionId: 'sess-b', subtreePath: ['root']},
              guard  = stubGuard({granted: false, conflict: holder});
        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}))
            .toEqual({admitted: false, reason: 'conflict', conflict: holder, acquisition: null})
    });

    test('enforced + unavailable lease clock → denied with the precise guard reason, not a false conflict', () => {
        const guard = Neo.create(WriteGuard, {nowFn: () => NaN});

        expect(admitWrite({context: CTX_A, componentId: 'leaf', parentOf, writeGuard: guard}))
            .toEqual({admitted: false, reason: 'invalid-write-lease-clock', conflict: null, acquisition: null})
    });

    // ── integration: the REAL WriteGuard + LockRegistry conflict math (the actual enforcement, not a mock) ──
    test('REAL WriteGuard — overlapping subtree: first writer holds, second denied, same-writer re-entrant', () => {
        const guard = Neo.create('Neo.ai.WriteGuard');

        // writer A acquires (and holds) the 'mid' subtree
        const first = admitWrite({context: CTX_A, componentId: 'mid', parentOf, writeGuard: guard});
        expect(first.admitted).toBe(true);
        expect(first.acquisition).toMatchObject({created: true, reentrant: false, token: expect.any(Number)});
        expect(guard.heldLocks()).toHaveLength(1);

        // writer B writes 'leaf' — a descendant of A's held 'mid' → genuine overlap → denied, nothing held for B
        const b = admitWrite({context: CTX_B, componentId: 'leaf', parentOf, writeGuard: guard});
        expect(b.admitted).toBe(false);
        expect(b.reason).toBe('conflict');
        expect(b.conflict).toMatchObject({agentId: 'agent-a', sessionId: 'sess-a'});
        expect(guard.heldLocks()).toHaveLength(1);

        // the SAME writer A re-acquiring an overlapping subtree is re-entrant → still admitted
        const reentrant = admitWrite({context: CTX_A, componentId: 'mid', parentOf, writeGuard: guard});
        expect(reentrant.admitted).toBe(true);
        expect(reentrant.acquisition).toMatchObject({created: false, reentrant: true, token: first.acquisition.token})
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

        let   setCalls     = 0;
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

    test('an async call stays in-flight beyond TTL and expires only after its completion touch', async () => {
        let now = 0, resolveRun, markStarted;

        const
            started = new Promise(resolve => { markStarted = resolve }),
            guard   = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now}),
            service = Neo.create(InstanceService, {client: {writeGuard: guard}}),
            fake    = {
                run() {
                    markStarted();
                    return new Promise(resolve => { resolveRun = resolve })
                }
            },
            origGet = Neo.get,
            origGetComponent = Neo.getComponent;

        Neo.get          = () => fake;
        Neo.getComponent = id => id === 'leaf' ? {parentId: null} : null;

        try {
            const call = service.callMethod({id: 'leaf', method: 'run'}, CTX_A);
            await started;

            now = 1_000;
            expect(admitWrite({context: CTX_B, componentId: 'leaf', parentOf: () => null, writeGuard: guard}).admitted).toBe(false);
            expect(guard.heldLocks()[0].inFlight).toBe(1);

            resolveRun('done');
            await expect(call).resolves.toEqual({result: 'done'});
            expect(guard.heldLocks()[0]).toMatchObject({inFlight: 0, lastTouchAt: 1_000});

            now = 1_100;
            expect(admitWrite({context: CTX_B, componentId: 'leaf', parentOf: () => null, writeGuard: guard}).admitted).toBe(true)
        } finally {
            Neo.get = origGet; Neo.getComponent = origGetComponent
        }
    });

    test('a persistent call failure retains until TTL, then admits the same identity in a distinct session', async () => {
        let now = 0;

        const
            guard   = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now}),
            service = Neo.create(InstanceService, {client: {writeGuard: guard}}),
            fake    = {
                async fail() {
                    now = 10;
                    throw new Error('partial mutation unknown')
                }
            },
            origGet = Neo.get,
            origGetComponent = Neo.getComponent;

        Neo.get          = () => fake;
        Neo.getComponent = id => id === 'leaf' ? {parentId: null} : null;

        try {
            await expect(service.callMethod({id: 'leaf', method: 'fail'}, CTX_A)).rejects.toThrow('partial mutation unknown');
            expect(guard.heldLocks()[0]).toMatchObject({agentId: 'agent-a', inFlight: 0, lastTouchAt: 10});
            expect(guard.leaseReceipts().at(-1)).toMatchObject({reason: 'error-retained', mutationDisposition: 'unknown'});

            now = 109;
            expect(admitWrite({context: CTX_A_OTHER_SESSION, componentId: 'leaf', parentOf: () => null, writeGuard: guard}).admitted).toBe(false);

            now = 110;
            expect(admitWrite({context: CTX_A_OTHER_SESSION, componentId: 'leaf', parentOf: () => null, writeGuard: guard}).admitted).toBe(true)
        } finally {
            Neo.get = origGet; Neo.getComponent = origGetComponent
        }
    });

    test('pre-mutation failure releases only a newly-created acquisition, never a re-entrant hold', async () => {
        const
            guard                  = Neo.create(WriteGuard),
            service                = Neo.create(InstanceService, {client: {writeGuard: guard}}),
            fake                   = {run() { throw new Error('method must not run') }},
            origBuildRemoveReverse = service.buildRemoveReverse,
            origGet                = Neo.get,
            origGetComponent       = Neo.getComponent;

        Neo.get          = () => fake;
        Neo.getComponent = id => id === 'leaf' ? {parentId: null} : null;
        service.buildRemoveReverse = () => { throw new Error('capture failed before mutation') };

        try {
            await expect(service.callMethod({id: 'leaf', method: 'run'}, CTX_A)).rejects.toThrow('capture failed before mutation');
            expect(guard.heldLocks()).toHaveLength(0);
            expect(guard.leaseReceipts().at(-1).reason).toBe('error-release');

            guard.requestWrite({agentId: CTX_A.agentId, sessionId: CTX_A.sessionId, subtreePath: ['leaf']});

            await expect(service.callMethod({id: 'leaf', method: 'run'}, CTX_A)).rejects.toThrow('capture failed before mutation');
            expect(guard.heldLocks()).toHaveLength(1);
            expect(guard.leaseReceipts().at(-1).reason).toBe('error-retained')
        } finally {
            service.buildRemoveReverse = origBuildRemoveReverse;
            Neo.get = origGet; Neo.getComponent = origGetComponent
        }
    })
});
