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
 * `plugin.Base` subscribes `constructed` with `{once: true}` and `mounted` without it. The asymmetry
 * is deliberate and these arms pin it, because bounding `mounted` was tried and measured wrong:
 * `component/SplitterHeavyContent` remounts on purpose and went red with `vdom.Helper` reading
 * `aria-colcount` off `undefined`. A plugin re-applying on remount is load-bearing for vdom
 * structure, so the repeat is a contract rather than an accident.
 *
 * What that leaves is an obligation on the OVERRIDE: `onOwnerMounted` runs again on every remount,
 * so it must re-register rather than duplicate. `tab/plugin/Overflow` carries that obligation with
 * `releaseOwnerSubscriptions`, and the arm below is the one that fails if the two lists drift.
 */
function createOwner(cfg = {}) {
    return Neo.create(Component, {appName: 'NeoPluginMountContractTest', ...cfg})
}

test.describe('Neo.plugin.Base — the owner-mounted contract', () => {
    test('the mount callback re-runs on every mount, because remount re-application is load-bearing', () => {
        let calls = 0;

        class Counting extends Plugin {
            static config = {className: 'Neo.plugin.MountContractCounter'}
            onOwnerMounted() { calls++ }
        }

        Neo.setupClass(Counting);

        const owner  = createOwner({mounted: false}),
              plugin = Neo.create(Counting, {owner});

        expect(calls, 'not mounted yet').toBe(0);

        owner.mounted = true;
        expect(calls, 'the first mount runs it').toBe(1);

        owner.mounted = false;
        owner.mounted = true;

        // `{once: true}` here would read as tidier and breaks remount consumers — measured, not assumed.
        expect(calls, 'and a remount runs it AGAIN, deliberately').toBe(2);

        plugin.destroy();
        owner.destroy()
    });

    test('the constructed callback stays bounded, which is the half that IS once', () => {
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
    });

    test('a DOM listener must be released too — the registration nothing warns about', () => {
        const owner = createOwner({mounted: false});

        class DomListening extends Plugin {
            static config = {className: 'Neo.plugin.MountContractDomListener'}

            onOwnerMounted() {
                const me = this;

                me.owner.removeDomListeners([{resize: me.onResize, scope: me}]);
                me.owner.addDomListeners(   [{resize: me.onResize, scope: me}])
            }

            onResize() {}
        }

        Neo.setupClass(DomListening);

        const plugin = Neo.create(DomListening, {owner});

        owner.mounted = true;
        expect(owner.domListeners.length, 'one mount registers one listener').toBe(1);

        owner.mounted = false;
        owner.mounted = true;

        // `mixin/DomEvents#addDomListeners` is a bare push with no dedupe, so without the release
        // this is 2 after two mounts — and `manager.DomEvent` is not `Observable`, so nothing warns.
        // That silence is why this registration was missed when the seven Observable ones were fixed.
        expect(owner.domListeners.length, 'and a remount re-registers rather than accumulating').toBe(1);

        plugin.destroy();
        owner.destroy()
    });

    test('CONTROL: without the release, the same shape accumulates — so the arm above can fail', () => {
        const owner = createOwner({mounted: false});

        class Accumulating extends Plugin {
            static config = {className: 'Neo.plugin.MountContractDomAccumulator'}

            onOwnerMounted() {
                const me = this;

                me.owner.addDomListeners([{resize: me.onResize, scope: me}])
            }

            onResize() {}
        }

        Neo.setupClass(Accumulating);

        const plugin = Neo.create(Accumulating, {owner});

        owner.mounted = true;
        owner.mounted = false;
        owner.mounted = true;

        // The defect, reproduced deliberately: two mounts, two identical entries, no warning.
        expect(owner.domListeners.length, 'the unreleased shape really does grow').toBe(2);

        plugin.destroy();
        owner.destroy()
    });

    test('a repeatable mount callback must re-register, not duplicate — the obligation the contract creates', () => {
        const owner = createOwner({mounted: false});

        let handled = 0;

        class Subscribing extends Plugin {
            static config = {className: 'Neo.plugin.MountContractSubscriber'}

            onOwnerMounted() {
                const me = this;

                // The shape `tab/plugin/Overflow` uses: release first, then register.
                me.owner.un('customEvent', me.onCustomEvent, me);
                me.owner.on('customEvent', me.onCustomEvent, me)
            }

            onCustomEvent() { handled++ }
        }

        Neo.setupClass(Subscribing);

        const plugin = Neo.create(Subscribing, {owner});

        owner.mounted = true;
        owner.mounted = false;
        owner.mounted = true;

        owner.fire('customEvent', {});

        // Without the release, two mounts leave two identical handlers and one event is handled twice.
        expect(handled, 'one event reaches the handler once, after two mounts').toBe(1);

        plugin.destroy();
        owner.destroy()
    })
});
