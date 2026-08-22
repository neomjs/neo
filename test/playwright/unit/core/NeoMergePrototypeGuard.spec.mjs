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
 * The POLLUTION arms assert prototype IDENTITY as well as sentinel absence: a merge that silently
 * replaced the target's prototype with a fresh object would leave `Object.prototype` clean and
 * still be wrong, and a sentinel-only assertion cannot see the difference. The ordinary-merge
 * control and the inherited-branch arm answer different questions — that the guard stayed narrow,
 * and that the branch decision is local — and carry only the assertions those questions need.
 */
test.describe('Neo.merge — a parsed payload cannot reach the prototype chain', () => {
    test.afterEach(() => {
        // If an arm ever DID pollute, every later arm inherits it and fails somewhere unrelated.
        for (const key of ['neoMergeProbe', 'nested', 'viaDefaults', 'viaConstructor']) {
            delete Object.prototype[key]
        }

        // `Object.prototype.toString` is a SHARED FUNCTION OBJECT, and a property hung on it is not
        // reached by deleting keys from `Object.prototype`. A regression in the inherited-branch
        // guard writes exactly there, so without this line the failing arm would leave every later
        // spec in this worker running against a mutated global — the arm would go red once and the
        // damage would surface somewhere unrelated.
        delete Object.prototype.toString.marker
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
        //
        // The holder is PRIVATE on purpose. Driving this through the real `Object.prototype.toString`
        // proves the same property, but a regression then mutates a function every later spec in the
        // worker shares — the arm goes red once and the damage surfaces somewhere unrelated. A
        // purpose-built prototype fails loudly and contaminates nothing.
        const
            holder = {inherited: {shared: 'prototype-owned'}},
            target = Object.create(holder);

        Neo.merge(target, {inherited: {marker: 'own'}});

        expect(Object.hasOwn(target, 'inherited'), 'an own branch was created').toBe(true);
        expect(target.inherited.marker, 'and it carries the merged value').toBe('own');
        expect(target.inherited.shared,
            'the fresh node did NOT start as a copy of the inherited one').toBeUndefined();
        expect(holder.inherited, 'the prototype-owned node is byte-identical afterwards')
            .toEqual({shared: 'prototype-owned'});

        // The real shared function, kept as a second reading because the private holder models the
        // shape rather than being it. `afterEach` restores this one if a regression ever writes it.
        const global = {};

        Neo.merge(global, {toString: {marker: 'own'}});

        expect(Object.prototype.toString.marker, 'the global function is untouched').toBeUndefined()
    });

    test('every reserved key is dropped from the RETURNED target, not only from the chain', () => {
        // The set is `__proto__` / `constructor` / `prototype`, and the arms above pin only the
        // first against pollution. The other two were skipped by the same `continue` with nothing
        // asserting what the CALLER gets back — so narrowing the set later would have been
        // invisible here. This is the public output contract the JSDoc now states.
        for (const key of ['__proto__', 'constructor', 'prototype']) {
            const
                // `JSON.parse` so `__proto__` arrives as an OWN enumerable key; an object literal
                // would invoke the setter at construction and never produce the shape under test.
                source = JSON.parse(`{"${key}":{"marker":"reserved"},"kept":"yes"}`),
                merged = Neo.merge({}, source);

            expect(Object.hasOwn(merged, key), `${key} is not an own property of the result`).toBe(false);
            expect(merged.kept, `and the rest of the payload still merges past ${key}`).toBe('yes');
        }

        // Paired control: the skip is by NAME, so an ordinary key spelled similarly must survive.
        // Without this, a guard that dropped every object-valued key would pass every arm above.
        expect(Neo.merge({}, JSON.parse('{"proto":{"marker":"ok"},"constructors":{"n":1}}')))
            .toEqual({constructors: {n: 1}, proto: {marker: 'ok'}})
    });
});
