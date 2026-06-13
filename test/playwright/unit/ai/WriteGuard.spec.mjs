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
        guard.requestWrite(lock('ada', 's1', ['root', 'panel']));
        expect(guard.requestWrite(lock('vega', 's2', ['root', 'panel'])).granted).toBe(false);

        guard.releaseWrite(lock('ada', 's1', ['root', 'panel']));
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
        guard.requestWrite(lock('ada', 's1', ['root']));
        const result = guard.releaseWrite(lock('ada', 's1', ['other']));

        expect(result.released).toBe(false);
        expect(guard.heldLocks()).toHaveLength(1);
    });

    test('releaseWrite never releases a different writer holding the same subtree', () => {
        guard.requestWrite(lock('ada', 's1', ['root']));
        const result = guard.releaseWrite(lock('vega', 's2', ['root']));

        expect(result.released).toBe(false);
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
});
