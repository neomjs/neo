import {test, expect}      from '@playwright/test';
import {resolveWriteLock} from '../../../../src/ai/resolveWriteLock.mjs';

// Pure decision core — imported directly (no live heap, no WriteGuard, no socket), so the four enforcement
// outcomes are provable in isolation. Mirrors deriveSubtreePath.spec / parseAgentEnvelope.spec.
//
// A linear component tree  root → mid → leaf  (parentOf returns the parent id, falsy at the root).
const
    PARENTS  = {leaf: 'mid', mid: 'root', root: null},
    parentOf = id => PARENTS[id],
    CTX      = {agentId: 'neo-opus-ada', sessionId: 'sess-abc'};

test.describe('resolveWriteLock (NL write-enforcement decision core)', () => {
    test('absent context (null / undefined / non-object) → not enforced, write unguarded (legacy)', () => {
        for (const absent of [null, undefined, 'x', 42, true]) {
            expect(resolveWriteLock(absent, 'leaf', parentOf)).toEqual({enforced: false, lock: null})
        }
    });

    test('valid identity + resolvable target → enforced with the exact WriteGuard lock descriptor', () => {
        const r = resolveWriteLock(CTX, 'leaf', parentOf);
        expect(r).toEqual({
            enforced: true,
            lock    : {agentId: 'neo-opus-ada', sessionId: 'sess-abc', subtreePath: ['root', 'mid', 'leaf']}
        });
        // the path IS the deriveSubtreePath output (absolute root→node), and the lock carries no extra keys
        expect(Object.keys(r.lock).sort()).toEqual(['agentId', 'sessionId', 'subtreePath'])
    });

    test('a root-level target resolves to its single-element path', () => {
        const r = resolveWriteLock(CTX, 'root', parentOf);
        expect(r.enforced).toBe(true);
        expect(r.lock.subtreePath).toEqual(['root'])
    });

    test('incomplete identity — a missing / empty / non-string agentId fails closed (deny, no lock)', () => {
        for (const bad of [undefined, '', null, 42, {}]) {
            const r = resolveWriteLock({agentId: bad, sessionId: 'sess-abc'}, 'leaf', parentOf);
            expect(r).toEqual({enforced: true, lock: null, reason: 'incomplete-identity'})
        }
    });

    test('incomplete identity — a missing / empty / non-string sessionId fails closed (deny, no lock)', () => {
        for (const bad of [undefined, '', null, 42, {}]) {
            const r = resolveWriteLock({agentId: 'neo-opus-ada', sessionId: bad}, 'leaf', parentOf);
            expect(r).toEqual({enforced: true, lock: null, reason: 'incomplete-identity'})
        }
    });

    test('a present-but-malformed object context (missing both fields / array) denies — NOT treated as legacy', () => {
        for (const malformed of [{}, {foo: 'bar'}, []]) {
            const r = resolveWriteLock(malformed, 'leaf', parentOf);
            expect(r).toEqual({enforced: true, lock: null, reason: 'incomplete-identity'})
        }
    });

    test('valid identity + unresolvable target (malformed / cyclic id) fails closed (deny, no lock)', () => {
        // empty-string + the document.body sentinel + a cyclic chain all make deriveSubtreePath return null
        for (const badId of ['', 'document.body']) {
            expect(resolveWriteLock(CTX, badId, parentOf))
                .toEqual({enforced: true, lock: null, reason: 'unresolvable-target'})
        }
        const cyclic = {a: 'b', b: 'a'};
        expect(resolveWriteLock(CTX, 'a', id => cyclic[id]))
            .toEqual({enforced: true, lock: null, reason: 'unresolvable-target'})
    });

    test('an unidentified write never touches the component tree (deny short-circuits before deriveSubtreePath)', () => {
        // parentOf throws — if the tree were consulted for an incomplete-identity request, this would throw.
        const exploding = () => { throw new Error('tree must not be walked for an unidentified write') };
        expect(resolveWriteLock({agentId: '', sessionId: 'sess-abc'}, 'leaf', exploding))
            .toEqual({enforced: true, lock: null, reason: 'incomplete-identity'})
    });
});
