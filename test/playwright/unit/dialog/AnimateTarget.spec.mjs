/**
 * @file test/playwright/unit/dialog/AnimateTarget.spec.mjs
 * @summary Pins which window and app an animated `Neo.dialog.Base` lands in: a component target decides, and any
 * other node (a list item, a grid cell) leaves the dialog in the window and app it was created with.
 *
 * The animation reads its geometry from the DOM, so it works for any node; only the window and app lookups need a
 * component. These arms run the real `animateShow()` and `animateHide()` with the main-thread reads stubbed.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogAnimateTargetTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useVdomWorker          : false
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Component      from '../../../../src/component/Base.mjs';
import Dialog         from '../../../../src/dialog/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

const
    dialogRect = {height: 300, left: 400, top: 250, width: 400},
    targetRect = {height: 56,  left: 32,  top: 40,  width: 56};

test.describe('dialog.Base: the animation target decides the window only when it is a component', () => {
    let applyDeltas, domAccess, instances, ownMethods;

    test.beforeEach(() => {
        applyDeltas = Neo.applyDeltas;
        instances   = [];

        Neo.applyDeltas = async () => {};

        // setup() stands in for most of DomAccess, not for the two remotes a dialog syncs on every show and hide
        domAccess  = Neo.main.DomAccess;
        ownMethods = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);

        ownMethods.forEach(([name]) => {domAccess[name] = () => {}})
    });

    test.afterEach(() => {
        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]});

        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    /**
     * @summary A hidden, kept dialog whose main-thread reads answer with fixed rectangles.
     * @param {Object} config
     * @returns {Neo.dialog.Base}
     */
    const create = config => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoShow   : false,
            closeAction: 'hide',
            draggable  : false,
            hidden     : true,
            resizable  : false,
            windowId   : 1,
            ...config
        });

        dialog.getDomRect     = async ids => Array.isArray(ids) ? [dialogRect, targetRect] : targetRect;
        dialog.waitForDomRect = async () => [dialogRect, {height: 800, left: 0, top: 0, width: 1200}];
        // The confirmation is a silent write, as the real insert's
        dialog.initVnode      = () => {dialog._mounted = true; return Promise.resolve()};

        instances.push(dialog);

        return dialog
    };

    test('a node that is not a component animates the dialog in its own window and app', async () => {
        const dialog = create({animateTargetId: 'launcher-item-mail', windowId: 7});

        expect(dialog.animateTarget).toBeFalsy();

        await dialog.animateShow();

        expect(dialog.windowId).toBe(7);
        expect(dialog.appName).toBe(appName);
        expect(dialog.mounted).toBe(true);

        await dialog.animateHide();

        expect(dialog.windowId).toBe(7);
        expect(dialog.hidden).toBe(true)
    });

    test('a component target still moves the dialog into the window and app of that component', async () => {
        const target = Neo.create(Component, {appName: 'DialogAnimateTargetOther', windowId: 9}),
              dialog = create({animateTargetId: target.id});

        instances.push(target);

        await dialog.animateShow();

        expect(dialog.windowId).toBe(9);
        expect(dialog.appName).toBe('DialogAnimateTargetOther')
    });

    test('animateShow and animateHide carry neo-animating through direct deltas without mutating vdom or vnode', async () => {
        const deltas = [],
              dialog = create({animateTargetId: 'launcher-item-mail'});

        Neo.applyDeltas = async (windowId, delta) => {deltas.push(delta)};

        await dialog.animateShow();

        expect(deltas[0].cls?.add, 'move-to-target delta suppresses pointer hits on screen').toEqual(['neo-animating']);
        expect(deltas[1].cls?.add, 'expansion delta adds the transition').toEqual(['animated-hiding-showing']);
        expect(deltas[2].cls?.remove, 'landing delta clears both transient classes')
            .toEqual(['animated-hiding-showing', 'neo-animating']);
        expect(dialog.cls).not.toContain('neo-animating');
        expect(dialog.vdom.cls).not.toContain('neo-animating');

        deltas.length = 0;

        await dialog.animateHide();

        expect(deltas[0].cls?.add, 'hide flight suppresses pointer hits at start').toEqual(['neo-animating'])
    })
});
