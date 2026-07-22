import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'WriteGuardTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WriteGuard     from '../../../../src/ai/WriteGuard.mjs';

/**
 * A terse lock factory.
 * @param {String} agentId
 * @param {String} sessionId
 * @param {String[]} subtreePath
 * @returns {Object}
 */
const lock = (agentId, sessionId, subtreePath) => ({agentId, sessionId, subtreePath});

test.describe('Neo.ai.WriteGuard', () => {
    let guard;

    test.beforeEach(() => {
        guard = Neo.create('Neo.ai.WriteGuard');
    });

    test('grants and holds a write lock', () => {
        const result = guard.requestWrite(lock('ada', 's1', ['root', 'panel']));

        expect(result.granted).toBe(true);
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('denies a different writer overlapping a held lock, holding nothing for them', () => {
        guard.requestWrite(lock('ada', 's1', ['root', 'panel']));
        const result = guard.requestWrite(lock('vega', 's2', ['root', 'panel', 'child']));

        expect(result.granted).toBe(false);
        expect(result.conflict.agentId).toBe('ada');
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('the held lock blocks the second writer until released, then grants', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root', 'panel'])).acquisition;
        expect(guard.requestWrite(lock('vega', 's2', ['root', 'panel'])).granted).toBe(false);

        guard.releaseWrite(acquisition);
        expect(guard.requestWrite(lock('vega', 's2', ['root', 'panel'])).granted).toBe(true);
    });

    test('is re-entrant for the same writer (no duplicate held lock)', () => {
        guard.requestWrite(lock('ada', 's1', ['root']));
        const result = guard.requestWrite(lock('ada', 's1', ['root']));

        expect(result.granted).toBe(true);
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('lets the same writer hold two sibling subtrees', () => {
        guard.requestWrite(lock('ada', 's1', ['root', 'a']));
        guard.requestWrite(lock('ada', 's1', ['root', 'b']));

        expect(guard.heldLocks()).toHaveLength(2);
    });

    test('releaseWrite is a no-op for a lock that is not held', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition,
              result      = guard.releaseWrite({...acquisition, subtreePath: ['other']});

        expect(result.released).toBe(false);
        expect(result.reason).toBe('stale-token');
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('releaseWrite never releases a different writer holding the same subtree', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition,
              result      = guard.releaseWrite({...acquisition, agentId: 'vega', sessionId: 's2'});

        expect(result.released).toBe(false);
        expect(result.reason).toBe('stale-token');
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('releaseAgent sweeps every lock for a disconnected writer', () => {
        guard.requestWrite(lock('ada',  's1', ['a']));
        guard.requestWrite(lock('ada',  's1', ['b']));
        guard.requestWrite(lock('vega', 's2', ['c']));

        const result = guard.releaseAgent({agentId: 'ada', sessionId: 's1'});

        expect(result.released).toBe(2);
        expect(guard.heldLocks()).toHaveLength(1);
        expect(guard.heldLocks()[0].agentId).toBe('vega');
    });

    test('disconnect release is immediate even while the matching generation is in flight', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(acquisition);

        expect(guard.releaseAgent({agentId: 'ada', sessionId: 's1'})).toEqual({released: 1});
        expect(guard.heldLocks()).toHaveLength(0);
        expect(guard.leaseReceipts().at(-1).reason).toBe('disconnect-release')
    });

    test('after a disconnect-sweep the freed subtree is grantable to another writer', () => {
        guard.requestWrite(lock('ada', 's1', ['root', 'panel']));
        guard.releaseAgent({sessionId: 's1'});

        expect(guard.requestWrite(lock('vega', 's2', ['root', 'panel'])).granted).toBe(true);
    });

    test('denies a malformed lock (fail-closed) and holds nothing', () => {
        const result = guard.requestWrite(lock('', 's1', ['root']));

        expect(result.granted).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(guard.heldLocks()).toHaveLength(0);
    });

    test('heldLocks is a deep snapshot — neither the array, the lock objects, nor their paths leak', () => {
        guard.requestWrite(lock('ada', 's1', ['root', 'panel']));

        const snap = guard.heldLocks();
        snap.push('tampered');               // array-level
        snap[0].agentId = 'mallory';         // object-level
        snap[0].subtreePath.push('injected'); // nested-array-level

        const live = guard.heldLocks();
        expect(live).toHaveLength(1);
        expect(live[0].agentId).toBe('ada');
        expect(live[0].subtreePath).toEqual(['root', 'panel']);
    });

    test('a returned conflict is a copy — mutating it cannot free the live held lock', () => {
        guard.requestWrite(lock('ada', 's1', ['root', 'panel']));
        const denied = guard.requestWrite(lock('vega', 's2', ['root', 'panel']));

        denied.conflict.subtreePath.push('injected'); // tamper with the reported holder

        // the live lock still blocks vega on the original subtree
        expect(guard.requestWrite(lock('vega', 's2', ['root', 'panel'])).granted).toBe(false);
        expect(guard.heldLocks()[0].subtreePath).toEqual(['root', 'panel']);
    });

    test('reports created vs re-entrant acquisition and refreshes the same fenced token', () => {
        let now = 1_000;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const first = guard.requestWrite(lock('ada', 's1', ['root']));

        expect(first.created).toBe(true);
        expect(first.reentrant).toBe(false);
        expect(first.acquisition).toMatchObject({created: true, reentrant: false, acquiredAt: 1_000, lastTouchAt: 1_000, inFlight: 0});

        now = 1_050;

        const second = guard.requestWrite(lock('ada', 's1', ['root']));

        expect(second.created).toBe(false);
        expect(second.reentrant).toBe(true);
        expect(second.token).toBe(first.token);
        expect(second.acquisition).toMatchObject({created: false, reentrant: true, acquiredAt: 1_000, lastTouchAt: 1_050});
        expect(guard.heldLocks()).toHaveLength(1)
    });

    test('lazily reclaims an idle lease at the TTL boundary and returns an expiry receipt', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const first = guard.requestWrite(lock('ada', 's1', ['root']));

        now = 100;

        const takeover = guard.requestWrite(lock('vega', 's2', ['root']));

        expect(takeover.granted).toBe(true);
        expect(takeover.created).toBe(true);
        expect(takeover.token).not.toBe(first.token);
        expect(takeover.reclaimed).toHaveLength(1);
        expect(takeover.reclaimed[0]).toMatchObject({reason: 'expired', token: first.token, observedAt: 100});
        expect(guard.heldLocks()[0]).toMatchObject({agentId: 'vega', sessionId: 's2'});
        expect(guard.leaseReceipts()[0].reason).toBe('expired')
    });

    test('never sweeps an in-flight async operation, then expires from its end touch', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const first = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        expect(guard.beginWrite(first).began).toBe(true);

        now = 1_000;
        expect(guard.requestWrite(lock('vega', 's2', ['root'])).granted).toBe(false);
        expect(guard.endWrite(first)).toEqual({ended: true, released: false, retained: true});

        now = 1_099;
        expect(guard.requestWrite(lock('vega', 's2', ['root'])).granted).toBe(false);

        now = 1_100;
        expect(guard.requestWrite(lock('vega', 's2', ['root'])).granted).toBe(true)
    });

    test('a stale token cannot touch or release a successor generation', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const stale = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        now = 100;

        const successor = guard.requestWrite(lock('vega', 's2', ['root'])).acquisition;

        expect(guard.touchWrite(stale)).toEqual({touched: false});
        expect(guard.releaseWrite(stale)).toEqual({released: false, reason: 'stale-token'});
        expect(guard.heldLocks()).toHaveLength(1);
        expect(guard.heldLocks()[0].token).toBe(successor.token)
    });

    test('fenced explicit release refuses in-flight work and succeeds after end', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(acquisition);
        expect(guard.releaseWrite(acquisition)).toEqual({released: false, reason: 'in-flight'});
        guard.endWrite(acquisition);
        expect(guard.releaseWrite(acquisition)).toEqual({released: true, reason: null});
        expect(guard.heldLocks()).toHaveLength(0)
    });

    test('a newly-created pre-mutation failure releases and emits an error-release receipt', () => {
        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(acquisition);
        const outcome = guard.endWrite(acquisition, {
            failed             : true,
            mutationDisposition: 'pre-mutation',
            error              : new Error('validation failed')
        });

        expect(outcome).toEqual({ended: true, released: true, retained: false});
        expect(guard.heldLocks()).toHaveLength(0);
        expect(guard.leaseReceipts().at(-1)).toMatchObject({reason: 'error-release', mutationDisposition: 'pre-mutation', error: 'validation failed'})
    });

    test('a re-entrant failure never releases the pre-existing hold', () => {
        guard.requestWrite(lock('ada', 's1', ['root']));
        const reentrant = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(reentrant);
        const outcome = guard.endWrite(reentrant, {failed: true, mutationDisposition: 'pre-mutation'});

        expect(reentrant.created).toBe(false);
        expect(outcome).toEqual({ended: true, released: false, retained: true});
        expect(guard.heldLocks()).toHaveLength(1);
        expect(guard.leaseReceipts().at(-1).reason).toBe('error-retained')
    });

    test('a creator failure cannot release a generation another re-entrant operation already shared', () => {
        const creator = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(creator);

        const reentrant = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(reentrant);
        guard.endWrite(reentrant);

        expect(guard.endWrite(creator, {failed: true, mutationDisposition: 'pre-mutation'}))
            .toEqual({ended: true, released: false, retained: true});
        expect(guard.heldLocks()).toHaveLength(1);
        expect(guard.leaseReceipts().at(-1).reason).toBe('error-retained')
    });

    test('an unknown partial-mutation failure retains the hold and becomes TTL-reclaimable', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.beginWrite(acquisition);
        now = 10;
        expect(guard.endWrite(acquisition, {failed: true, mutationDisposition: 'unknown'}))
            .toEqual({ended: true, released: false, retained: true});

        now = 109;
        expect(guard.requestWrite(lock('vega', 's2', ['root'])).granted).toBe(false);

        now = 110;
        const takeover = guard.requestWrite(lock('vega', 's2', ['root']));
        expect(takeover.granted).toBe(true);
        expect(takeover.reclaimed[0].reason).toBe('expired')
    });

    test('lease and receipt snapshots cannot mutate live metadata', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition,
              snapshot    = guard.heldLocks();

        snapshot[0].token = 999;
        snapshot[0].subtreePath.push('tamper');
        expect(guard.heldLocks()[0]).toMatchObject({token: acquisition.token, subtreePath: ['root']});

        now = 100;
        guard.heldLocks();

        const receipts = guard.leaseReceipts();
        receipts[0].subtreePath.push('tamper');
        expect(guard.leaseReceipts()[0].subtreePath).toEqual(['root'])
    });

    test('invalid clock or TTL denies without mutating an existing valid hold', () => {
        let now = 0;
        guard = Neo.create(WriteGuard, {leaseTtlMs: 100, nowFn: () => now});

        const acquisition = guard.requestWrite(lock('ada', 's1', ['root'])).acquisition;

        guard.nowFn = () => NaN;
        expect(guard.requestWrite(lock('vega', 's2', ['other'])))
            .toMatchObject({granted: false, errors: ['invalid-write-lease-clock']});
        expect(guard.heldLocks()[0].token).toBe(acquisition.token);

        guard.nowFn = () => now;
        guard.leaseTtlMs = 0;
        expect(guard.requestWrite(lock('vega', 's2', ['other'])))
            .toMatchObject({granted: false, errors: ['invalid-write-lease-ttl']});
        expect(guard.heldLocks()[0].token).toBe(acquisition.token)
    });

    test('bounds the lifecycle receipt ledger without changing release decisions', () => {
        guard = Neo.create(WriteGuard, {receiptLimit: 2});

        ['a', 'b', 'c'].forEach(path => {
            const acquisition = guard.requestWrite(lock('ada', 's1', [path])).acquisition;
            expect(guard.releaseWrite(acquisition)).toEqual({released: true, reason: null})
        });

        expect(guard.leaseReceipts()).toHaveLength(2);
        expect(guard.leaseReceipts().map(receipt => receipt.subtreePath[0])).toEqual(['b', 'c'])
    });
});
