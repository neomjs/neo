import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * `Neo.merge` is part of the public default export, so its own boundary is the security boundary —
 * no census of repository callers can bound who calls it.
 *
 * The payload below is the exact one that reached `Object.prototype` before the guard landed:
 * `JSON.parse` produces `__proto__` as an OWN enumerable key, `for…in` yields it, and the recursive
 * write then steers onto the prototype chain. It is not hypothetical inside this repository either —
 * `ai/mcp/client/config.mjs` passes a `JSON.parse`d file chosen by an `mcp-cli --config` flag
 * straight in, and `src/worker/Base.mjs` merges worker-message payloads into `Neo.config`.
 *
 * Every arm asserts prototype IDENTITY as well as sentinel absence: a merge that silently replaced
 * the target's prototype with a fresh object would leave `Object.prototype` clean and still be
 * wrong, and a sentinel-only assertion cannot see the difference.
 */
test.describe('Neo.merge — a parsed payload cannot reach the prototype chain', () => {
    test.afterEach(() => {
        // If an arm ever DID pollute, every later arm inherits it and fails somewhere unrelated.
        for (const key of ['neoMergeProbe', 'nested', 'viaDefaults', 'viaConstructor']) {
            delete Object.prototype[key]
        }
    });

    test('a JSON-parsed __proto__ does not reach Object.prototype', () => {
        const target = {};

        Neo.merge(target, JSON.parse('{"__proto__":{"neoMergeProbe":"reached"}}'));

        expect(Object.hasOwn(Object.prototype, 'neoMergeProbe'), 'the global is untouched').toBe(false);
        expect(({}).neoMergeProbe, 'and no object in the process gained the property').toBeUndefined();
        expect(Object.getPrototypeOf(target), "the target's own prototype is intact").toBe(Object.prototype)
    });

    test('a NESTED parsed __proto__ does not reach it either', () => {
        // The recursion is the interesting path: the outer key is innocuous, so a guard applied only
        // at the top level would pass this while the inner write still lands on the chain.
        const target = {};

        Neo.merge(target, JSON.parse('{"a":{"__proto__":{"nested":"reached"}}}'));

        expect(Object.hasOwn(Object.prototype, 'nested')).toBe(false);
        expect(Object.getPrototypeOf(target.a ?? {}), 'the nested branch keeps its prototype')
            .toBe(Object.prototype)
    });

    test('the DEFAULTS path is guarded too — and its damage is a REPLACED prototype', () => {
        // `Neo.merge(target, source, defaults)` runs the defaults through a second merge, so
        // guarding only the source would leave an identical hole one argument over.
        //
        // The assertion is prototype IDENTITY, not `Object.prototype` pollution — measured, because
        // the first version of this arm checked the global and passed with the guard removed. On
        // this path the `__proto__` write lands on a fresh intermediate object, replacing ITS
        // prototype: the result then serialises as `{"safe":1}` while `out.viaDefaults` reads
        // `"hit"`. Nothing global is touched and the object is still wrong.
        const out = Neo.merge({}, {safe: 1}, JSON.parse('{"__proto__":{"viaDefaults":"reached"}}'));

        expect(Object.getPrototypeOf(out), 'the merged result keeps its prototype').toBe(Object.prototype);
        expect(out.viaDefaults, 'and inherits nothing from the payload').toBeUndefined();
        expect(Object.hasOwn(Object.prototype, 'viaDefaults'), 'the global is untouched too').toBe(false);
        expect(out.safe, 'the real defaults still merge').toBe(1)
    });

    test('`constructor` cannot be used as a two-hop route', () => {
        // Measured: with BOTH guards removed this route does not silently pollute — it throws
        // `TypeError: Cannot assign to read only property 'prototype'`. So the arm's value is that
        // the traversal neither crashes nor writes, and the guard that covers it is `Object.hasOwn`
        // rather than the denylist. Stating which guard owns which vector, because the two were
        // easy to conflate and the mutation is what separated them.
        Neo.merge({}, JSON.parse('{"constructor":{"prototype":{"viaConstructor":"reached"}}}'));

        expect(Object.hasOwn(Object.prototype, 'viaConstructor')).toBe(false);
        expect(({}).viaConstructor).toBeUndefined()
    });

    test('ordinary deep merge, arrays and defaults are unchanged', () => {
        // Non-vacuity. Without this an implementation that refused everything would pass every arm
        // above — the guard has to be narrow, not merely safe.
        const target = Neo.merge({a: {x: 1}, list: [1, 2]}, {a: {y: 2}, list: [3], extra: 'e'});

        expect(target.a).toEqual({x: 1, y: 2});
        expect(target.list).toEqual([3]);
        expect(target.extra).toBe('e');

        expect(Neo.merge({}, {b: 2}, {a: 1}), 'defaults fill, source wins').toEqual({a: 1, b: 2});
        expect(Neo.merge(null, {a: 1}), 'a missing target returns the source').toEqual({a: 1})
    });

    test('an inherited target property is not treated as an existing branch', () => {
        // The recursion previously read `target[key] || {}`, which consults the prototype chain: a
        // source key named after an inherited property would recurse into shared state instead of
        // creating a fresh node. `Object.hasOwn` is what makes the branch decision local.
        const target = {};

        Neo.merge(target, {toString: {marker: 'own'}});

        expect(Object.hasOwn(target, 'toString'), 'an own branch was created').toBe(true);
        expect(target.toString.marker).toBe('own');
        expect(Object.prototype.toString.marker, 'the global function is untouched').toBeUndefined()
    });
});
