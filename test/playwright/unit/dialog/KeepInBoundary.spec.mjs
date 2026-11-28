/**
 * @file test/playwright/unit/dialog/KeepInBoundary.spec.mjs
 * @summary Pins `Neo.dialog.Base#keepInBoundary`: a dialog stays inside a boundary container that changes size, moved
 * by the smallest distance and shrunk only where it cannot fit, and nothing writes where nothing has to.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogKeepInBoundaryTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}  from '@playwright/test';
import Neo             from '../../../../src/Neo.mjs';
import * as core       from '../../../../src/core/_export.mjs';
import Dialog          from '../../../../src/dialog/Base.mjs';
import DomEventManager from '../../../../src/manager/DomEvent.mjs';
import Rectangle       from '../../../../src/util/Rectangle.mjs';
import VdomHelper      from '../../../../src/vdom/Helper.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const WORKSPACE = 'keep-in-boundary-workspace';

/**
 * @param {Object} style
 * @returns {Object} The geometry keys the style holds
 */
const geometry = style => Object.fromEntries(['height', 'left', 'top', 'width'].filter(key => style[key]).map(key => [key, style[key]]));

/**
 * Lets the checks a notification started read their measurements and write
 * @returns {Promise<void>}
 */
const settle = () => new Promise(resolve => setTimeout(resolve, 0));

test.describe('dialog.Base keepInBoundary', () => {
    let applyDeltas, domAccess, instances, ownMethods;

    test.beforeEach(() => {
        applyDeltas     = Neo.applyDeltas;
        instances       = [];
        Neo.applyDeltas = async () => {};

        // setup() stands in for most of DomAccess, not for the two remotes a dialog syncs on every show and hide
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        ownMethods.forEach(([name]) => {domAccess[name] = () => {}})
    });

    test.afterEach(() => {
        try {
            instances.forEach(instance => !instance.isDestroyed && instance.destroy())
        } finally {
            Neo.applyDeltas = applyDeltas;
            ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]})
        }
    });

    /**
     * @summary A shown dialog in `WORKSPACE`. Its measurements answer with `dialog.rects` as they are when the check
     * asks, and `dialog.measures` counts them. While `dialog.held` is an array, each measurement waits in it.
     * @param {Object} [config]
     * @param {Object} [rect] The dialog's measured box
     * @returns {Promise<Neo.dialog.Base>} The dialog, mounted, its mount check settled and uncounted
     */
    const create = async (config, rect={x: 100, y: 100, width: 400, height: 300}) => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoInitVnode      : false,
            autoMount          : false,
            boundaryContainerId: WORKSPACE,
            draggable          : false,
            keepInBoundary     : true,
            resizable          : false,
            windowId           : 1,
            ...config
        });

        instances.push(dialog);

        dialog.held     = null;
        dialog.measures = 0;
        dialog.rects    = {dialog: rect, workspace: {x: 0, y: 0, width: 1200, height: 800}};

        dialog.getDomRect = () => {
            const rects = [Rectangle.clone(dialog.rects.dialog), Rectangle.clone(dialog.rects.workspace)];

            dialog.measures++;

            return dialog.held ? new Promise(resolve => {dialog.held.push(() => resolve(rects))}) : Promise.resolve(rects)
        };

        await dialog.initVnode();
        dialog.mounted = true;

        await settle();
        dialog.measures = 0;

        return dialog
    };

    /**
     * What `Neo.manager.DomEvent` hands the dialog when the main thread reports the container's new size
     * @param {Neo.dialog.Base} dialog
     * @param {Number} width
     * @param {Number} height
     * @param {String} [id=WORKSPACE] The node the notification is for
     */
    const notify = (dialog, width, height, id=WORKSPACE) => {
        id === WORKSPACE && (dialog.rects.workspace = {x: 0, y: 0, width, height});

        DomEventManager.fire({eventName: 'resize', data: {componentIds: [dialog.id], id, rect: {x: 0, y: 0, width, height}}})
    };

    test('it observes the boundary container while keepInBoundary is on, and follows a new container', async () => {
        const dialog    = await create(),
              delegates = () => dialog.domListeners.filter(listener => listener.resize).map(listener => listener.delegate);

        expect(delegates(), 'on').toEqual([`#${WORKSPACE}`]);

        dialog.boundaryContainerId = 'another-workspace';
        expect(delegates(), 'a new container').toEqual(['#another-workspace']);

        dialog.keepInBoundary = false;
        expect(delegates(), 'off').toEqual([]);

        expect((await create({keepInBoundary: false})).domListeners.filter(listener => listener.resize), 'the default').toEqual([])
    });

    test('a size the dialog fits in writes nothing, a repeated size measures nothing, and so does another node', async () => {
        const dialog = await create();

        notify(dialog, 1000, 700);
        await settle();
        expect(dialog.measures, 'a smaller container').toBe(1);

        notify(dialog, 1000, 700);
        notify(dialog, 500, 500, 'another-node');
        await settle();
        expect(dialog.measures, 'the same size, another node').toBe(1);

        notify(dialog, 1600, 900);
        await settle();
        expect(dialog.measures, 'a grown container').toBe(2);

        expect(geometry(dialog.style), 'no geometry written').toEqual({})
    });

    test('a dialog the shrunk container cuts moves back by the overlap and keeps its size', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

        notify(dialog, 1000, 800);
        await settle();

        expect(geometry(dialog.style)).toEqual({left: '600px', top: '100px'});
        expect(dialog.style.transform).toBe('none')
    });

    test('only the dimension that cannot fit shrinks, never below a minWidth in px', async () => {
        const dialog = await create();

        notify(dialog, 300, 800);
        await settle();
        expect(geometry(dialog.style), 'the width shrinks, the height stays').toEqual({left: '0px', top: '100px', width: '300px'});

        const bounded = await create({minWidth: 350});

        notify(bounded, 300, 800);
        await settle();
        expect(geometry(bounded.style), 'a minimum larger than the container keeps the top-left corner inside')
            .toEqual({left: '0px', top: '100px', width: '350px'})
    });

    test('nothing measures while the dialog is hidden, maximized, or held in a move or resize', async () => {
        const dialog    = await create(null, {x: 700, y: 100, width: 400, height: 300}),
              resizable = {isDragging: true};

        dialog._hidden = true;
        notify(dialog, 1000, 800);
        dialog._hidden = false;

        dialog._maximized = true;
        notify(dialog, 990, 800);
        dialog._maximized = false;

        dialog.isDragging = true;
        notify(dialog, 980, 800);
        dialog.isDragging = false;

        dialog.getPlugin = name => name === 'resizable' ? resizable : null;
        notify(dialog, 970, 800);

        await settle();

        expect(dialog.measures).toBe(0);
        expect(geometry(dialog.style)).toEqual({})
    });

    test('a dialog that mounts into a smaller container moves inside it', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

        dialog.mounted         = false;
        dialog.rects.workspace = {x: 0, y: 0, width: 1000, height: 800};
        dialog.mounted         = true;

        await settle();

        expect(dialog.measures).toBe(1);
        expect(geometry(dialog.style)).toEqual({left: '600px', top: '100px'})
    });

    test('a restore from maximized checks once its animation ends', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

        dialog.maximized = true;
        notify(dialog, 1000, 800);
        await settle();
        expect(dialog.measures, 'maximized').toBe(0);

        dialog.maximized = false;
        await settle();
        expect(dialog.measures, 'during the restore animation').toBe(0);

        await dialog.timeout(300);

        expect(dialog.measures, 'after it').toBe(1);
        expect(geometry(dialog.style)).toEqual({left: '600px', top: '100px'})
    });

    test('a measurement a move overtook writes nothing, and an older check yields to a newer one', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

        dialog.held = [];
        notify(dialog, 1000, 800);

        // What a move's drop writes while the measurement is out
        dialog.style = {...dialog.style, height: '300px', left: '50px', top: '60px', width: '400px'};

        dialog.held.shift()();
        await settle();
        expect(geometry(dialog.style), 'the drop stays').toEqual({height: '300px', left: '50px', top: '60px', width: '400px'});

        dialog.style = {};

        notify(dialog, 990, 800);
        notify(dialog, 900, 800);

        const [older, newer] = dialog.held;

        newer();
        await settle();
        older();
        await settle();

        expect(geometry(dialog.style), 'the newer check').toEqual({left: '500px', top: '100px'})
    });

    test('a measurement that lands after destroy() writes nothing', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300}),
              fitTo  = Rectangle.prototype.fitTo;

        let fits = 0;

        Rectangle.prototype.fitTo = function(bounds) {fits++; return fitTo.call(this, bounds)};

        try {
            dialog.held = [];
            notify(dialog, 1000, 800);

            const [release] = dialog.held;

            dialog.destroy();
            release();
            await settle();

            expect(fits).toBe(0)
        } finally {
            Rectangle.prototype.fitTo = fitTo
        }
    });

    test('turning off, a new container, a new window and destroy() each release the main-thread observation', async () => {
        const addon      = Neo.main.addon.ResizeObserver,
              unregister = addon.unregister,
              released   = [];

        addon.unregister = observation => released.push(observation);

        try {
            const dialog = await create();

            dialog.boundaryContainerId = 'another-workspace';
            expect(released, 'a new container').toEqual([{componentId: dialog.id, id: WORKSPACE, windowId: 1}]);

            dialog.windowId = 2;
            expect(released[1], 'a new window').toEqual({componentId: dialog.id, id: 'another-workspace', windowId: 1});

            dialog.keepInBoundary = false;
            expect(released[2], 'off, in the window it moved to').toEqual({componentId: dialog.id, id: 'another-workspace', windowId: 2});

            dialog.destroy();
            expect(released.length, 'nothing armed, nothing to release').toBe(3);

            const other = await create();

            other.destroy();
            expect(released[3], 'destroy()').toEqual({componentId: other.id, id: WORKSPACE, windowId: 1})
        } finally {
            addon.unregister = unregister
        }
    });

    test('a measurement in flight writes nothing once keepInBoundary turns off or the container changes', async () => {
        const changes = {
            'off'          : dialog => {dialog.keepInBoundary = false},
            'new container': dialog => {dialog.boundaryContainerId = 'another-workspace'}
        };

        for (const [label, change] of Object.entries(changes)) {
            const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

            dialog.held = [];
            notify(dialog, 1000, 800);
            change(dialog);

            dialog.held.shift()();
            await settle();

            expect(geometry(dialog.style), label).toEqual({})
        }
    });

    test('a desktop boundary measurement cannot write after a sheet presentation round trip', async () => {
        const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300});

        dialog.held = [];
        notify(dialog, 1000, 800);

        dialog.presentation = 'sheet';
        expect(dialog.vdom.cls).toContain('neo-dialog-sheet');

        dialog.presentation = 'dialog';
        expect(dialog.vdom.cls).not.toContain('neo-dialog-sheet');

        dialog.held.shift()();
        await settle();

        expect(geometry(dialog.style)).toEqual({});
        dialog.held.shift()();
        await settle()
    });

    test('the floating return checks the boundary after Main applies the presentation', async () => {
        const dialog = await create(null, {x: 390, y: 100, width: 420, height: 300}),
              frame  = Promise.withResolvers();

        dialog.promiseUpdate = () => frame.promise;
        dialog.presentation = 'sheet';
        notify(dialog, 710, 800);

        dialog.presentation = 'dialog';
        notify(dialog, 700, 800);
        await settle();

        expect(dialog.measures).toBe(0);
        expect(geometry(dialog.style)).toEqual({});

        frame.resolve();
        await settle();

        expect(dialog.measures).toBe(1);
        expect(geometry(dialog.style)).toEqual({left: '280px', top: '100px'})
    });

    test('the same resize plugin suspends for the sheet and respects the caller setting on return', async () => {
        const dialog = await create({resizable: true, resizablePluginConfig: {directions: ['r']}});

        await expect.poll(() => Boolean(dialog.getPlugin('resizable'))).toBe(true);

        const plugin = dialog.getPlugin('resizable');

        dialog.presentation = 'sheet';
        expect(plugin.suspended).toBe(true);
        expect(dialog.resizable).toBe(true);

        dialog.presentation = 'dialog';
        expect(dialog.getPlugin('resizable')).toBe(plugin);
        expect(plugin.suspended).toBe(false);
        expect(plugin.directions).toEqual(['r']);

        dialog.presentation = 'sheet';
        dialog.resizable = false;
        dialog.presentation = 'dialog';

        expect(dialog.getPlugin('resizable')).toBe(plugin);
        expect(plugin.suspended).toBe(true)
    });

    test('modal sheet presentation traps focus even with the default desktop setting', async () => {
        const traps = [];

        Neo.main.DomAccess.trapFocus = ({trap}) => traps.push(trap);

        const dialog = await create({modal: true});

        expect(dialog.trapFocus).toBe(false);
        expect(traps.at(-1)).toBe(false);

        dialog.presentation = 'sheet';
        expect(traps.at(-1)).toBe(true);
        expect(dialog.trapFocus).toBe(false);

        dialog.presentation = 'dialog';
        expect(traps.at(-1)).toBe(false)
    });

    test('a hidden or missing container writes nothing, and a drop beside one lands where the proxy is', async () => {
        for (const workspace of [{x: 0, y: 0, width: 0, height: 0}, {}]) {
            const dialog = await create(null, {x: 700, y: 100, width: 400, height: 300}),
                  label  = JSON.stringify(workspace);

            dialog.rects.workspace = workspace;
            await dialog.constrainToBoundary();

            expect(geometry(dialog.style), label).toEqual({});

            // The fixture measures the dialog's box for the proxy
            dialog.dragZone = {dragEnd: () => {}, dragProxy: {id: 'proxy'}, un: () => {}};
            dialog.onDragEnd({});
            await settle();

            expect(geometry(dialog.style), `${label}, the drop`).toEqual({height: '300px', left: '700px', top: '100px', width: '400px'})
        }
    });
});
