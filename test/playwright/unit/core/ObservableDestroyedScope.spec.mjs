import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Verifies that Observable lazily unbinds listeners whose scope instances have been destroyed,
 * and suppresses delayed callback invocation when scope destruction occurs while the timeout elapses.
 *
 * An observable keeps its listeners registered by scope identity. When a listener's scope instance
 * is destroyed, its id property remains defined while isDestroyed settles to true. During fire(),
 * listeners whose scopes lack an id or have been destroyed are dropped from the active event registry
 * and skipped, including mid-dispatch sibling destruction where an earlier handler destroys a later
 * listener's scope.
 */
class Firer extends core.Base {
    static config = {
        className: 'Test.Unit.Core.DestroyedScope.Firer',
        mixins   : [core.Observable]
    }
}
const FirerClass = Neo.setupClass(Firer);

class Listener extends core.Base {
    static config = {
        className: 'Test.Unit.Core.DestroyedScope.Listener'
    }
}
const ListenerClass = Neo.setupClass(Listener);

test.describe('Observable listener scope destruction', () => {

    test('a listener whose scope instance is destroyed is no longer called by fire, and the firer drops it from its listeners', () => {
        const
            firer    = Neo.create(FirerClass),
            listener = Neo.create(ListenerClass);
        let calls = 0;

        firer.on('ping', () => calls++, listener);
        firer.fire('ping');
        expect(calls).toBe(1);

        listener.destroy();
        expect(listener.isDestroyed).toBe(true);

        firer.fire('ping');
        expect(calls).toBe(1);

        expect(firer.toJSON().listeners?.ping).toBeUndefined();

        firer.destroy();
    });

    test('a listener registered with delay is not called when its scope is destroyed before the delay ends', async () => {
        const
            firer    = Neo.create(FirerClass),
            listener = Neo.create(ListenerClass);
        let calls = 0;

        firer.on('ping', {
            delay: 30,
            fn   : () => calls++,
            scope: listener
        });

        firer.fire('ping');
        listener.destroy();
        expect(listener.isDestroyed).toBe(true);

        await firer.timeout(60);
        expect(calls).toBe(0);

        firer.destroy();
    });

    test('a listener whose scope is alive, and a listener without a scope, are called as before', () => {
        const
            firer        = Neo.create(FirerClass),
            liveListener = Neo.create(ListenerClass),
            deadListener = Neo.create(ListenerClass);
        let deadCalls    = 0,
            liveCalls    = 0,
            noScopeCalls = 0;

        firer.on('ping', () => deadCalls++, deadListener);
        firer.on('ping', () => liveCalls++, liveListener);
        firer.on('ping', () => noScopeCalls++);

        deadListener.destroy();

        firer.fire('ping');

        expect(deadCalls).toBe(0);
        expect(liveCalls).toBe(1);
        expect(noScopeCalls).toBe(1);

        liveListener.destroy();
        firer.destroy();
    });

    test("when listener A's handler destroys listener B, listener B is not called during that same fire and is removed", () => {
        const
            firer     = Neo.create(FirerClass),
            listenerA = Neo.create(ListenerClass),
            listenerB = Neo.create(ListenerClass);
        let aCalls = 0,
            bCalls = 0;

        firer.on('ping', () => {
            aCalls++;
            listenerB.destroy();
        }, listenerA);

        firer.on('ping', () => bCalls++, listenerB);

        firer.fire('ping');

        expect(aCalls).toBe(1);
        expect(bCalls).toBe(0);
        expect(listenerB.isDestroyed).toBe(true);
        expect(firer.toJSON().listeners?.ping?.length).toBe(1);

        firer.destroy();
        listenerA.destroy();
    });

});
