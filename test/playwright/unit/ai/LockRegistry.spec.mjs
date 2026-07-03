import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : 'LockRegistryTest',
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import LockRegistry   from '../../../../src/ai/LockRegistry.mjs';

/**
 * A terse lock factory for the specs.
 * @param {String} agentId
 * @param {String} sessionId
 * @param {String[]} subtreePath
 * @returns {Object}
 */
const lock = (agentId, sessionId, subtreePath) => ({agentId, sessionId, subtreePath});

test.describe('Neo.ai.LockRegistry', () => {
    test.describe('normalizeLock (fail-closed validation)', () => {
        test('accepts a well-formed lock and clones the path', () => {
            const path = ['root', 'panel'],
                  norm = LockRegistry.normalizeLock(lock('ada', 's1', path));

            expect(norm).toEqual({agentId: 'ada', sessionId: 's1', subtreePath: ['root', 'panel']});
            expect(norm.subtreePath).not.toBe(path); // defensive copy, not the caller's array
        });

        test('rejects a missing or empty agentId', () => {
            expect(LockRegistry.normalizeLock(lock('',    's1', ['a']))).toBeNull();
            expect(LockRegistry.normalizeLock(lock(null,  's1', ['a']))).toBeNull();
        });

        test('rejects a missing or empty sessionId', () => {
            expect(LockRegistry.normalizeLock(lock('ada', '',        ['a']))).toBeNull();
            expect(LockRegistry.normalizeLock(lock('ada', undefined, ['a']))).toBeNull();
        });

        test('rejects a non-array or empty subtreePath', () => {
            expect(LockRegistry.normalizeLock(lock('ada', 's1', []))).toBeNull();
            expect(LockRegistry.normalizeLock(lock('ada', 's1', 'root'))).toBeNull();
            expect(LockRegistry.normalizeLock(lock('ada', 's1', null))).toBeNull();
        });

        test('rejects a subtreePath with an empty or non-string segment', () => {
            expect(LockRegistry.normalizeLock(lock('ada', 's1', ['a', '']))).toBeNull();
            expect(LockRegistry.normalizeLock(lock('ada', 's1', ['a', 7]))).toBeNull();
        });

        test('rejects non-objects', () => {
            expect(LockRegistry.normalizeLock(null)).toBeNull();
            expect(LockRegistry.normalizeLock('lock')).toBeNull();
            expect(LockRegistry.normalizeLock(undefined)).toBeNull();
        });
    });

    test.describe('pathsOverlap (subtree overlap matrix)', () => {
        test('equal paths overlap', () => {
            expect(LockRegistry.pathsOverlap(['a', 'b'], ['a', 'b'])).toBe(true);
        });

        test('an ancestor overlaps its descendant (both directions)', () => {
            expect(LockRegistry.pathsOverlap(['a'],      ['a', 'b', 'c'])).toBe(true);
            expect(LockRegistry.pathsOverlap(['a', 'b', 'c'], ['a'])).toBe(true);
        });

        test('siblings that diverge never overlap', () => {
            expect(LockRegistry.pathsOverlap(['a', 'b'], ['a', 'c'])).toBe(false);
        });

        test('different roots never overlap', () => {
            expect(LockRegistry.pathsOverlap(['a'], ['b'])).toBe(false);
        });

        test('a root-level lock overlaps everything under that root', () => {
            expect(LockRegistry.pathsOverlap(['root'], ['root', 'x', 'y', 'z'])).toBe(true);
        });
    });

    test.describe('sameWriter', () => {
        test('same agentId and sessionId is the same writer', () => {
            expect(LockRegistry.sameWriter(lock('ada', 's1', ['a']), lock('ada', 's1', ['b']))).toBe(true);
        });

        test('a different agentId or sessionId is a different writer', () => {
            expect(LockRegistry.sameWriter(lock('ada', 's1', ['a']), lock('vega', 's1', ['a']))).toBe(false);
            expect(LockRegistry.sameWriter(lock('ada', 's1', ['a']), lock('ada',  's2', ['a']))).toBe(false);
        });
    });

    test.describe('lockKey', () => {
        test('is stable for the same lock and distinct across writer or path', () => {
            const a = LockRegistry.lockKey(lock('ada', 's1', ['root', 'p'])),
                  b = LockRegistry.lockKey(lock('ada', 's1', ['root', 'p'])),
                  c = LockRegistry.lockKey(lock('ada', 's1', ['root', 'q'])),
                  d = LockRegistry.lockKey(lock('vega', 's1', ['root', 'p']));

            expect(a).toBe(b);
            expect(a).not.toBe(c);
            expect(a).not.toBe(d);
        });

        test('does not collide when an id contains the separator characters', () => {
            const a = LockRegistry.lockKey(lock('a"b', 's', ['x'])),
                  b = LockRegistry.lockKey(lock('a',   'b"s', ['x']));

            expect(a).not.toBe(b);
        });
    });

    test.describe('findConflict', () => {
        test('a different writer on an overlapping subtree conflicts', () => {
            const table = [lock('ada', 's1', ['root', 'p'])],
                  held  = LockRegistry.findConflict(table, lock('vega', 's2', ['root', 'p', 'child']));

            expect(held).toBe(table[0]);
        });

        test('the same writer on an overlapping subtree does not conflict', () => {
            const table = [lock('ada', 's1', ['root', 'p'])];
            expect(LockRegistry.findConflict(table, lock('ada', 's1', ['root', 'p', 'child']))).toBeNull();
        });

        test('a different writer on a sibling subtree does not conflict', () => {
            const table = [lock('ada', 's1', ['root', 'p'])];
            expect(LockRegistry.findConflict(table, lock('vega', 's2', ['root', 'q']))).toBeNull();
        });

        test('an empty table never conflicts', () => {
            expect(LockRegistry.findConflict([], lock('ada', 's1', ['a']))).toBeNull();
        });
    });

    test.describe('acquire', () => {
        test('grants on an empty table and grows it', () => {
            const result = LockRegistry.acquire([], lock('ada', 's1', ['root']));

            expect(result.granted).toBe(true);
            expect(result.conflict).toBeNull();
            expect(result.errors).toEqual([]);
            expect(result.lockTable).toHaveLength(1);
        });

        test('denies a malformed lock with an error and an unchanged table', () => {
            const table  = [lock('ada', 's1', ['root'])],
                  result = LockRegistry.acquire(table, lock('', 's1', ['x']));

            expect(result.granted).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
            expect(result.lockTable).toBe(table); // unchanged reference
        });

        test('denies a cross-writer subtree overlap and reports the holder', () => {
            const table  = [LockRegistry.normalizeLock(lock('ada', 's1', ['root', 'p']))],
                  result = LockRegistry.acquire(table, lock('vega', 's2', ['root', 'p']));

            expect(result.granted).toBe(false);
            expect(result.conflict).toBe(table[0]);
            expect(result.lockTable).toHaveLength(1);
        });

        test('is re-entrant: the same writer re-acquiring an identical lock adds no duplicate', () => {
            const first  = LockRegistry.acquire([], lock('ada', 's1', ['root', 'p'])),
                  second = LockRegistry.acquire(first.lockTable, lock('ada', 's1', ['root', 'p']));

            expect(second.granted).toBe(true);
            expect(second.lockTable).toHaveLength(1);
        });

        test('lets the same writer hold a nested descendant lock', () => {
            const first  = LockRegistry.acquire([], lock('ada', 's1', ['root'])),
                  second = LockRegistry.acquire(first.lockTable, lock('ada', 's1', ['root', 'child']));

            expect(second.granted).toBe(true);
            expect(second.lockTable).toHaveLength(2);
        });

        test('never mutates the input table', () => {
            const table = [];
            LockRegistry.acquire(table, lock('ada', 's1', ['root']));
            expect(table).toHaveLength(0);
        });
    });

    test.describe('release (idempotent)', () => {
        test('removes the exact lock', () => {
            const acquired = LockRegistry.acquire([], lock('ada', 's1', ['root', 'p'])),
                  released = LockRegistry.release(acquired.lockTable, lock('ada', 's1', ['root', 'p']));

            expect(released.lockTable).toHaveLength(0);
        });

        test('is a no-op when the lock is not held', () => {
            const table    = [LockRegistry.normalizeLock(lock('ada', 's1', ['root']))],
                  released = LockRegistry.release(table, lock('ada', 's1', ['other']));

            expect(released.lockTable).toHaveLength(1);
        });

        test('never releases a different writer holding the same subtree', () => {
            const table    = [LockRegistry.normalizeLock(lock('ada', 's1', ['root']))],
                  released = LockRegistry.release(table, lock('vega', 's2', ['root']));

            expect(released.lockTable).toHaveLength(1);
        });

        test('returns the table unchanged for a malformed lock', () => {
            const table    = [LockRegistry.normalizeLock(lock('ada', 's1', ['root']))],
                  released = LockRegistry.release(table, lock('', '', []));

            expect(released.lockTable).toBe(table);
        });
    });

    test.describe('releaseAll (disconnect / restart sweep)', () => {
        const populated = () => [
            LockRegistry.normalizeLock(lock('ada',  's1', ['a'])),
            LockRegistry.normalizeLock(lock('ada',  's2', ['b'])),
            LockRegistry.normalizeLock(lock('vega', 's1', ['c']))
        ];

        test('sweeps every lock for an agentId', () => {
            const result = LockRegistry.releaseAll(populated(), {agentId: 'ada'});

            expect(result.released).toBe(2);
            expect(result.lockTable).toHaveLength(1);
            expect(result.lockTable[0].agentId).toBe('vega');
        });

        test('sweeps every lock for a sessionId', () => {
            const result = LockRegistry.releaseAll(populated(), {sessionId: 's1'});

            expect(result.released).toBe(2);
            expect(result.lockTable.every(l => l.sessionId !== 's1')).toBe(true);
        });

        test('sweeps only locks matching both fields when both are given', () => {
            const result = LockRegistry.releaseAll(populated(), {agentId: 'ada', sessionId: 's1'});

            expect(result.released).toBe(1);
            expect(result.lockTable).toHaveLength(2);
        });

        test('fails closed: a selector-less sweep clears nothing', () => {
            const table  = populated(),
                  result = LockRegistry.releaseAll(table, {});

            expect(result.released).toBe(0);
            expect(result.lockTable).toBe(table);
        });
    });

    test.describe('requiresExplicitTarget', () => {
        test('is false for zero or one live session (implicit target allowed)', () => {
            expect(LockRegistry.requiresExplicitTarget(0)).toBe(false);
            expect(LockRegistry.requiresExplicitTarget(1)).toBe(false);
        });

        test('is true once more than one session is live', () => {
            expect(LockRegistry.requiresExplicitTarget(2)).toBe(true);
            expect(LockRegistry.requiresExplicitTarget(5)).toBe(true);
        });

        test('fails safe (requires explicit) for non-finite or unexpected counts', () => {
            expect(LockRegistry.requiresExplicitTarget(NaN)).toBe(true);
            expect(LockRegistry.requiresExplicitTarget(Infinity)).toBe(true);
            // the realistic trigger: a consumer's `sessions?.length` resolving to `undefined`
            expect(LockRegistry.requiresExplicitTarget(undefined)).toBe(true);
            expect(LockRegistry.requiresExplicitTarget(-1)).toBe(true);
        });
    });
});
