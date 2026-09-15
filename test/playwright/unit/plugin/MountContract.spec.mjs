import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'NeoPluginMountContractTest'
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Plugin         from '../../../../src/plugin/Base.mjs';
import '../../../../src/manager/Instance.mjs';

/**
 * `plugin.Base`'s constructor answers the same question twice and used to answer it differently.
 *
 * `constructed` is bounded — an `isConstructed` fast path, and `{once: true}` on the subscription —
 * because a component is constructed once. `mounted` had the fast path and NO bound, so whether a
 * plugin re-ran `onOwnerMounted` on a remount depended on which branch it took at construction:
 * a plugin built after its owner mounted never re-ran, one built before re-ran on every mount.
 *
 * Both overrides in the tree — `tab/plugin/Overflow` and `list/plugin/Animate` — are written as
 * one-time setup, registering listeners and observers. So the re-run was not a contract anyone
 * relied on; it was a coin flip on construction order, and it duplicated seven `tab.plugin.Overflow`
 * registrations per remount in a tear-out.
 *
 * These arms pin both branches to the same answer.
 */
function createOwner(cfg = {}) {
    return Neo.create(Component, {appName: 'NeoPluginMountContractTest', ...cfg})
}

/** @returns {Object} a plugin class counting its own mount callbacks */
function counterPlugin() {
    let calls = 0;

    class Counting extends Plugin {
        static config = {className: 'Neo.plugin.MountContractCounter'}
        onOwnerMounted() { calls++ }
    }

    Neo.setupClass(Counting);

    return {Counting, count: () => calls}
}

test.describe('Neo.plugin.Base — the owner-mounted contract', () => {
    test('a plugin constructed BEFORE the mount runs its mount callback once, not once per mount', () => {
        const owner             = createOwner({mounted: false}),
              {Counting, count} = counterPlugin(),
              plugin            = Neo.create(Counting, {owner});

        expect(count(), 'not mounted yet, so nothing has run').toBe(0);

        owner.mounted = true;
        expect(count(), 'the first mount runs it').toBe(1);

        owner.mounted = false;
        owner.mounted = true;

        // Before the fix this was 2: the subscription carried no `{once: true}`, so every remount
        // re-entered the callback and re-registered whatever it registers.
        expect(count(), 'a remount must NOT re-enter it').toBe(1);

        plugin.destroy();
        owner.destroy()
    });

    test('a plugin constructed AFTER the mount agrees with it — the two branches answer the same', () => {
        const owner             = createOwner({mounted: true}),
              {Counting, count} = counterPlugin(),
              plugin            = Neo.create(Counting, {owner});

        expect(count(), 'the already-mounted fast path runs it immediately').toBe(1);

        owner.mounted = false;
        owner.mounted = true;

        expect(count(), 'and it stays at one, which is what the other branch now also does').toBe(1);

        plugin.destroy();
        owner.destroy()
    });

    test('the constructed callback stays bounded, so this change did not widen the other half', () => {
        let calls = 0;

        class CountingConstructed extends Plugin {
            static config = {className: 'Neo.plugin.MountContractConstructedCounter'}
            onOwnerConstructed() { calls++ }
        }

        Neo.setupClass(CountingConstructed);

        const owner  = createOwner({mounted: false}),
              plugin = Neo.create(CountingConstructed, {owner});

        expect(calls, 'the owner was already constructed, so the fast path ran it').toBe(1);

        owner.fire('constructed', {});
        expect(calls, 'and a second constructed event cannot re-enter it').toBe(1);

        plugin.destroy();
        owner.destroy()
    })
});
