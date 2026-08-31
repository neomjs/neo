import {setup} from '../../setup.mjs';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : 'GridResizeObserverTeardownTest',
        vnodeInitialising: false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../src/manager/Instance.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Toolbar            from '../../../../src/grid/header/Toolbar.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';

/**
 * @summary A grid that goes away must release the native ResizeObserver it caused.
 *
 * `Neo.main.addon.ResizeObserver` refcounts observation holders by `componentId` and calls
 * `instance.unobserve(node)` only once a target's holder list is EMPTY — one DOM node may be
 * observed by several components, so a teardown that did not say who was leaving would blind the
 * others. `unregister` therefore removes exactly `data.componentId`.
 *
 * A caller that omits it asks to remove the anonymous holder. `filter(cid => cid !== undefined)`
 * strips only `undefined`, the real holder that `manager.DomEvent` contributed survives, the list
 * never empties, and the native observer keeps a detached node alive with the hidden-document poll
 * still armed for it. Nothing else picks this up: `DomEvent.unregister` is a `// todo` stub and no
 * unmount path calls the addon, so these calls are the whole teardown surface.
 *
 * That failure is INVISIBLE at the call site — the call is made, it returns, and no behaviour
 * changes — which is why these sites read as dead code and were nearly deleted outright. The arms
 * below assert the identity is named, because naming it is the entire difference between a
 * teardown and a no-op. `list.Buffered` already carries the same contract.
 *
 * **Census of every addon consumer**, so the next reader can tell coverage from omission:
 *
 * | site | covered by |
 * |---|---|
 * | `src/grid/Container.mjs` register/unregister/destroy | these arms |
 * | `src/component/wrapper/MonacoEditor.mjs:386` destroy | source only — the editor cannot be instantiated in unit mode, so its identical one-line payload rides this contract without a behavioural arm |
 * | `src/manager/DomEvent.mjs:131` | already correct; it is the holder these arms depend on existing |
 * | `src/list/Buffered.mjs:167` | already correct — unchanged |
 *
 * `component/Canvas.mjs` and `container/Viewport.mjs` name the addon only in config JSDoc and reach
 * it through `DomEvent`, so they have no payload of their own.
 */
test.describe('grid.Container — releasing the native resize target', () => {
    let calls, grid, store;

    // The addon lives on the main thread; in unit mode `Neo.main.addon.ResizeObserver` is a harness
    // stub. Recording it captures exactly what the component emits across the worker boundary,
    // which is the surface under contract here — the addon's own refcount behaviour is pinned in
    // `test/playwright/unit/main/addon/ResizeObserver.spec.mjs`.
    const recorder = {
        register  : data => calls.push({...data, method: 'register'}),
        unregister: data => calls.push({...data, method: 'unregister'})
    };

    let originalAddon, originalGetAddon;

    test.beforeEach(async () => {
        calls = [];

        Neo.main            ??= {};
        Neo.main.addon      ??= {};
        originalAddon         = Neo.main.addon.ResizeObserver;
        Neo.main.addon.ResizeObserver = recorder;

        // `grid.Container#addResizeObserver` resolves the addon through the worker instead of the
        // namespace, so both doors need the same recorder behind them.
        originalGetAddon           = Neo.currentWorker.getAddon;
        Neo.currentWorker.getAddon = async () => recorder;

        store = Neo.create(Store, {
            keyProperty: 'id',
            data       : [{id: 1, col1: 'a'}],
            model      : {fields: [{name: 'id', type: 'Integer'}, {name: 'col1', type: 'String'}]}
        });

        grid = Neo.create(GridContainer, {
            appName  : 'GridResizeObserverTeardownTest',
            height   : 400,
            width    : 600,
            store,
            rowHeight: 40,
            columns  : [{dataField: 'col1', text: 'Col 1', width: 100}]
        });

        await grid.initVnode();
        grid.mounted = true
    });

    test.afterEach(() => {
        Neo.main.addon.ResizeObserver = originalAddon;
        Neo.currentWorker.getAddon    = originalGetAddon;

        // Worker processes are reused across spec files, so an instance left registered here is an
        // instance the next file inherits. The destroy arm has already torn its own grid down.
        !grid.isDestroyed && grid.destroy();
        !store.isDestroyed && store.destroy()
    });

    test('destroy names the grid on its unregister, so the holder list can empty', () => {
        calls = [];

        grid.destroy();

        const unregisters = calls.filter(entry => entry.method === 'unregister');

        expect(unregisters.length).toBeGreaterThan(0);

        // The DOM target and the App-Worker holder are two different identities that happen to
        // share a value here. Asserting BOTH is deliberate: a payload naming only `id` reads as
        // complete and removes nothing.
        unregisters.forEach(entry => {
            expect(entry.id).toBe(grid.id);
            expect(entry.componentId).toBe(grid.id)
        })
    });

    test('unmount names the grid too — an unmounted grid stops being a holder', async () => {
        calls = [];

        await grid.addResizeObserver(false);

        const [unregister] = calls.filter(entry => entry.method === 'unregister');

        expect(unregister).toBeTruthy();
        expect(unregister.componentId).toBe(grid.id)
    });

    test('the register arm names it as well, so the holder it adds is the one destroy removes', async () => {
        calls = [];

        // The mounted arm continues into `passSizeToBody()`, which measures through
        // `Neo.main.DomAccess` and, with no main thread, retries itself indefinitely. Left running it
        // outlives this file: the next spec in the same worker process resumes it, and the addon
        // suite deletes `Neo.main.DomAccess` on purpose, so the recursion dies there instead — a
        // failure reported against a file that did nothing wrong. Size hand-off is a separate
        // contract; this arm is about the register payload, so it is stubbed rather than left loose.
        grid.passSizeToBody = async () => {};

        await grid.addResizeObserver(true);

        const [register] = calls.filter(entry => entry.method === 'register');

        expect(register).toBeTruthy();

        // An anonymous holder is never removable: no caller can pass the `undefined` back in a way
        // that distinguishes it, so it pins the target observed for the life of the document.
        expect(register.componentId).toBe(grid.id)
    })
});
