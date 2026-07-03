import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import Base           from '../../../../src/core/Base.mjs';
import Observable     from '../../../../src/core/Observable.mjs'; // registers Neo.core.Observable so `static observable = true` resolves the mixin

/**
 * @summary Diff-based `core.Observable#afterSetListeners` — runtime listeners-config changes apply only the delta.
 *
 * Runtime changes to the `listeners` config apply only the per-event delta (add / remove / update)
 * instead of the prior brute-force un()-all-old + on()-all-new rebuild. An event whose handler
 * reference AND the shared opts (delay/once/order/scope) are unchanged keeps its live registration;
 * imperatively-added on() listeners are never touched by a config change. These tests are the
 * regression net (none existed for Observable before this change).
 */
test.describe('core.Observable diff-based afterSetListeners (#7091)', () => {
    let counter = 0;

    const makeInstance = cfg => {
        class TestObservable extends Base {
            static observable = true;
            static config     = {className: `Neo.test.ObservableDiff${counter++}`};
        }
        TestObservable = Neo.setupClass(TestObservable);
        return Neo.create(TestObservable, cfg);
    };

    test('add + unchanged: a new event is wired while the unchanged event keeps firing', () => {
        let aCount = 0, bCount = 0;
        const onA  = () => { aCount++ };
        const inst = makeInstance({listeners: {eventA: onA}});

        inst.fire('eventA');
        expect(aCount).toBe(1);

        inst.listeners = {eventA: onA, eventB: () => { bCount++ }};
        inst.fire('eventA');
        inst.fire('eventB');
        expect(aCount).toBe(2); // eventA still wired — not churned by the config change
        expect(bCount).toBe(1); // eventB newly added

        inst.destroy();
    });

    test('update + remove: a changed handler replaces the old, a dropped event stops firing', () => {
        let aCount = 0, bCount = 0;
        const onA   = () => { aCount++ };
        const onA2  = () => { aCount += 10 };
        const inst  = makeInstance({listeners: {eventA: onA, eventB: () => { bCount++ }}});

        inst.listeners = {eventA: onA2}; // update eventA's handler, drop eventB
        inst.fire('eventA');
        inst.fire('eventB');
        expect(aCount).toBe(10); // only the new handler fires (old onA removed)
        expect(bCount).toBe(0);  // eventB removed

        inst.destroy();
    });

    test('unchanged events are NOT torn down via un() when another event is added', () => {
        const onA  = () => {};
        const inst = makeInstance({listeners: {eventA: onA}});

        const unCalls = [];
        const origUn  = inst.un.bind(inst);
        inst.un = (...args) => { unCalls.push(args); return origUn(...args) };

        inst.listeners = {eventA: onA, eventB: () => {}}; // eventA reference unchanged → must skip
        expect(unCalls.length).toBe(0);

        inst.destroy();
    });

    test('imperatively-added on() listeners survive a listeners-config change', () => {
        let impCount = 0;
        const inst   = makeInstance({listeners: {eventA: () => {}}});
        inst.on('imperative', () => { impCount++ });

        inst.listeners = {eventA: () => {}, eventB: () => {}}; // full config churn
        inst.fire('imperative');
        expect(impCount).toBe(1); // imperative listener untouched

        inst.destroy();
    });

    test('a shared-opt (scope) change forces a re-bind even when the handler reference is unchanged', () => {
        const handler = () => {},
              scopeA  = {tag: 'A'},
              scopeB  = {tag: 'B'};
        const inst    = makeInstance({listeners: {eventA: handler, scope: scopeA}});

        // Spy AFTER create so only the config-change delta is counted.
        const calls  = {un: 0, on: 0};
        const origUn = inst.un.bind(inst);
        const origOn = inst.on.bind(inst);
        inst.un = (...args) => { calls.un++; return origUn(...args) };
        inst.on = (...args) => { calls.on++; return origOn(...args) };

        // Same handler reference, but the shared scope changed → the event must NOT be skipped: a
        // shared-opt change alters every event's effective registration, forcing un()+on().
        inst.listeners = {eventA: handler, scope: scopeB};
        expect(calls.un).toBeGreaterThan(0);
        expect(calls.on).toBeGreaterThan(0);

        inst.destroy();
    });

    test('object-valued listener specs are removed when the listeners config drops the event', () => {
        let count = 0;

        const
            onA  = () => { count++ },
            inst = makeInstance({listeners: {eventA: {fn: onA}}});

        inst.fire('eventA');
        expect(count).toBe(1);

        inst.listeners = {};
        inst.fire('eventA');
        expect(count).toBe(1);

        inst.destroy();
    });

    test('object-valued un() specs match their own scope', () => {
        let count = 0;

        const
            onA        = () => { count++ },
            rightScope = {id: 'right-scope'},
            wrongScope = {id: 'wrong-scope'},
            inst       = makeInstance({});

        inst.on({eventA: {fn: onA, scope: rightScope}});
        inst.un({eventA: {fn: onA, scope: wrongScope}});

        inst.fire('eventA');
        expect(count).toBe(1);

        inst.un({eventA: {fn: onA, scope: rightScope}});
        inst.fire('eventA');
        expect(count).toBe(1);

        inst.destroy();
    });

    test('string-valued listener specs still remove by handler name', () => {
        let count = 0;

        const inst = makeInstance({});
        inst.onA = () => { count++ };

        inst.listeners = {eventA: 'onA'};
        inst.fire('eventA');
        expect(count).toBe(1);

        inst.listeners = {};
        inst.fire('eventA');
        expect(count).toBe(1);

        inst.destroy();
    });
});
