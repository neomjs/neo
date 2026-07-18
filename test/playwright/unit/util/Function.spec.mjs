import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'FunctionUtilTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import {
    bindAppend,
    buffer,
    createInterceptor,
    createSequence,
    debounce,
    intercept,
    resolveCallback,
    throttle,
    unSequence
}                     from '../../../../src/util/Function.mjs';

/**
 * @summary Coverage for Neo.util.Function — the argument/method wrappers by direct assertion, and the
 * timer helpers (buffer/debounce/throttle) deterministically via stubbed `setTimeout`/`Date.now` (never
 * real waits). The private `sequencedFns`/`originalMethod` Symbols are witnessed only through observable
 * behaviour (call order + original-method restoration), never reached into.
 */
test.describe('Neo.util.Function', () => {
    // ---- argument + method wrappers (pure) ----

    test('bindAppend appends the bound args AFTER the call args, applied in the given scope', () => {
        const scope = {label: 'S'};
        let   captured;

        const fn = bindAppend(function(...args) { captured = {scope: this, args} }, scope, 'x', 'y');
        fn('a', 'b');

        // prepend-binders put bound args first; bindAppend puts them last
        expect(captured.args).toEqual(['a', 'b', 'x', 'y']);
        expect(captured.scope).toBe(scope)
    });

    test('createInterceptor transforms the single argument before the original method runs', () => {
        const target = {double: v => v * 2};

        createInterceptor(target, 'double', v => v + 1); // +1 happens first
        expect(target.double(5)).toBe(12)               // (5 + 1) * 2
    });

    test('intercept runs the original ONLY when the interceptor does not return false', () => {
        const target  = {save: (...a) => `saved:${a.join(',')}`};
        let   attempt = 0;

        intercept(target, 'save', () => { attempt++; return attempt > 1 }); // first attempt blocked

        expect(target.save('x')).toBeNull();      // interceptor false → default preventedReturnValue (null)
        expect(target.save('y')).toBe('saved:y'); // interceptor truthy → original runs
    });

    test('intercept returns the explicit preventedReturnValue when blocked', () => {
        const target = {act: () => 'ran'};

        intercept(target, 'act', () => false, null, 'blocked');
        expect(target.act()).toBe('blocked')
    });

    test('createSequence runs the original then each sequenced fn, in registration order', () => {
        const order  = [],
              target = {onEvent: () => order.push('original')};

        const seqA = () => order.push('A'),
              seqB = () => order.push('B');

        createSequence(target, 'onEvent', seqA);
        createSequence(target, 'onEvent', seqB);
        target.onEvent();

        expect(order).toEqual(['original', 'A', 'B'])
    });

    test('createSequence with no prior method sequences onto Neo.emptyFn (no throw)', () => {
        const order  = [],
              target = {};

        createSequence(target, 'missing', () => order.push('only'));
        target.missing();

        expect(order).toEqual(['only'])
    });

    test('unSequence removes one fn and restores the ORIGINAL method once the last one leaves', () => {
        const order    = [],
              original = () => order.push('original'),
              target   = {onEvent: original};

        const seqA = () => order.push('A'),
              seqB = () => order.push('B');

        createSequence(target, 'onEvent', seqA);
        createSequence(target, 'onEvent', seqB);

        // remove A — B remains, original still runs
        unSequence(target, 'onEvent', seqA);
        target.onEvent();
        expect(order).toEqual(['original', 'B']);

        // remove the last — the untouched original method reference is restored
        unSequence(target, 'onEvent', seqB);
        expect(target.onEvent).toBe(original)
    });

    test('unSequence is a no-op on a method that was never sequenced', () => {
        const original = () => {},
              target   = {plain: original};

        unSequence(target, 'plain', () => {});
        expect(target.plain).toBe(original)
    });

    test('resolveCallback passes a function through unchanged and resolves a string name in scope', () => {
        const handler = () => 'handled',
              scope   = {onClick: handler};

        const passed = () => {};
        expect(resolveCallback(passed, scope)).toEqual({fn: passed, scope});

        const resolved = resolveCallback('onClick', scope);
        expect(resolved.fn).toBe(handler);
        expect(resolved.scope).toBe(scope)
    });

    test('resolveCallback walks the up. parent chain for a name absent on the immediate scope', () => {
        const parentHandler = () => 'parent',
              parent        = {doThing: parentHandler},
              child         = {parent}; // no doThing of its own

        const resolved = resolveCallback('up.doThing', child);
        expect(resolved.fn).toBe(parentHandler);
        expect(resolved.scope).toBe(parent)
    });

    // ---- timer helpers (deterministic: stubbed setTimeout / clearTimeout / Date.now) ----

    test('buffer coalesces rapid calls into ONE trailing invocation with the last args; cancel() clears it', () => {
        const originalSetTimeout   = globalThis.setTimeout,
              originalClearTimeout = globalThis.clearTimeout;

        let scheduled = null; // buffer keeps a single timeout (clears before rescheduling)

        globalThis.setTimeout   = cb => { scheduled = cb; return 1 };
        globalThis.clearTimeout = () => { scheduled = null };

        try {
            const calls   = [],
                  scope   = {id: 'inst-1'},
                  wrapper = buffer((...a) => calls.push(a), scope, 300);

            wrapper('a');
            expect(wrapper.isPending).toBe(true);

            wrapper('b'); // clears the first, reschedules with the newest args
            expect(calls).toEqual([]); // nothing fired while calls keep arriving

            scheduled(); // the trailing timer fires
            expect(calls).toEqual([['b']]); // exactly one call, with the LAST args
            expect(wrapper.isPending).toBe(false);

            // cancel() drops a pending invocation before it can fire
            wrapper('c');
            expect(wrapper.isPending).toBe(true);
            wrapper.cancel();
            expect(wrapper.isPending).toBe(false)
        } finally {
            globalThis.setTimeout   = originalSetTimeout;
            globalThis.clearTimeout = originalClearTimeout
        }
    });

    test('debounce fires on the LEADING edge, then coalesces trailing calls to the last args', () => {
        const originalSetTimeout   = globalThis.setTimeout,
              originalClearTimeout = globalThis.clearTimeout;

        let scheduled = [],
            nextId    = 1;

        // must return a NUMBER — debounce gates the leading edge on Neo.isNumber(debounceTimer)
        globalThis.setTimeout   = cb => { const id = nextId++; scheduled.push({id, cb}); return id };
        globalThis.clearTimeout = id => { scheduled = scheduled.filter(s => s.id !== id) };

        try {
            const calls = [],
                  scope = {id: 'inst-1'},
                  fn    = debounce((...a) => calls.push(a), scope, 300);

            fn('first');
            expect(calls).toEqual([['first']]); // leading edge: immediate

            fn('second'); // debounceTimer is now a number → trailing branch
            fn('third');  // clears + reschedules
            expect(calls).toEqual([['first']]); // no trailing fire yet

            scheduled[scheduled.length - 1].cb(); // the latest trailing callback fires
            expect(calls).toEqual([['first'], ['third']]) // trailing fires with the LAST args
        } finally {
            globalThis.setTimeout   = originalSetTimeout;
            globalThis.clearTimeout = originalClearTimeout
        }
    });

    test('debounce skips the invocation when the scope has been destroyed (no id)', () => {
        const originalSetTimeout = globalThis.setTimeout;

        globalThis.setTimeout = () => 1;

        try {
            const calls = [],
                  scope = {}, // destroyed instance — no id
                  fn    = debounce(() => calls.push(1), scope, 300);

            fn();
            expect(calls).toEqual([]) // the scope?.id guard prevents a call into a dead instance
        } finally {
            globalThis.setTimeout = originalSetTimeout
        }
    });

    test('throttle fires immediately, rate-limits within the window, then trailing-fires the last args', () => {
        const originalSetTimeout = globalThis.setTimeout,
              originalDateNow    = Date.now;

        let now       = 1000,
            scheduled = null;

        Date.now              = () => now;
        globalThis.setTimeout = cb => { scheduled = cb; return 1 };

        try {
            const calls = [],
                  scope = {id: 'inst-1'},
                  fn    = throttle((...a) => calls.push(a), scope, 300);

            fn('a'); // 1000 - 0 >= 300 → fires immediately
            expect(calls).toEqual([['a']]);

            now = 1100;
            fn('b'); // 1100 - 1000 = 100 < 300 → schedules a trailing call, does not fire
            expect(calls).toEqual([['a']]);

            now = 1400;
            scheduled(); // the trailing timer fires with the last args
            expect(calls).toEqual([['a'], ['b']])
        } finally {
            globalThis.setTimeout = originalSetTimeout;
            Date.now              = originalDateNow
        }
    })
});
