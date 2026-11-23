/**
 * @file test/playwright/unit/dialog/WindowControls.spec.mjs
 * @summary Pins the window controls of `Neo.dialog.Base`: maximize is a toggle whose glyph and accessible
 * name follow `maximized`, and a consumer replaces one control's vocabulary entry or leaves a control out without
 * losing the others.
 */

import {setup} from '../../setup.mjs';

const appName = 'DialogWindowControlsTest';

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
import Dialog         from '../../../../src/dialog/Base.mjs';
import Toolbar        from '../../../../src/toolbar/Base.mjs';

// Imported for its side effect: `manager/Instance.mjs` assigns `Neo.get`, which teardown needs.
import '../../../../src/manager/Instance.mjs';

test.describe('dialog.Base window controls', () => {
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
        Neo.applyDeltas = applyDeltas;

        ownMethods.forEach(([name, own, method]) => {own ? domAccess[name] = method : delete domAccess[name]});

        instances.forEach(instance => !instance.isDestroyed && instance.destroy())
    });

    /**
     * @param {Object} [config]
     * @returns {Neo.dialog.Base} A hidden, unmounted dialog
     */
    const create = config => {
        const dialog = Neo.create(Dialog, {
            appName,
            autoInitVnode: false,
            autoMount    : false,
            draggable    : false,
            hidden       : true,
            resizable    : false,
            windowId     : 1,
            ...config
        });

        instances.push(dialog);

        return dialog
    };

    /**
     * @param {Neo.component.Base} action
     * @returns {Object} What the control shows and what a screen reader names it
     */
    const presentation = action => ({iconCls: action.iconCls, name: action.vdom['aria-label']});

    const maximizeGlyph = {iconCls: 'far fa-square', name: 'maximize'},
          restoreGlyph  = {iconCls: 'far fa-clone',  name: 'restore'};

    test('a click on maximize toggles the glyph and the accessible name with the state', () => {
        const dialog = create(),
              action = dialog.headerToolbar.getAction('maximize');

        expect(presentation(action), 'normal').toEqual(maximizeGlyph);

        dialog.executeHeaderAction({action: 'maximize', component: action});

        expect(dialog.maximized, 'maximized').toBe(true);
        expect(presentation(action), 'maximized').toEqual(restoreGlyph);

        dialog.executeHeaderAction({action: 'maximize', component: action});

        expect(dialog.maximized, 'restored').toBe(false);
        expect(presentation(action), 'restored').toEqual(maximizeGlyph)
    });

    test('a programmatic maximized change syncs the control too', () => {
        const dialog = create(),
              action = dialog.headerToolbar.getAction('maximize');

        dialog.maximized = true;
        expect(presentation(action)).toEqual(restoreGlyph);

        dialog.maximized = false;
        expect(presentation(action)).toEqual(maximizeGlyph)
    });

    test('a dialog created maximized offers the restore at once', () => {
        const dialog = create({maximized: true});

        expect(presentation(dialog.headerToolbar.getAction('maximize'))).toEqual(restoreGlyph)
    });

    test('a maximized dialog whose header actions are rebuilt still offers the restore', () => {
        const dialog  = create(),
              toolbar = dialog.headerToolbar;

        dialog.maximized = true;
        toolbar.actions  = ['close', 'maximize'];

        const action = toolbar.getAction('maximize');

        expect(action.pressed, 'pressed').toBe(true);
        expect(presentation(action), 'rebuilt').toEqual(restoreGlyph);

        dialog.maximized = false;
        expect(presentation(action), 'restored').toEqual(maximizeGlyph)
    });

    test('the restore glyph is not the minimize glyph', () => {
        const dialog   = create({headerConfig: {actions: ['minimize', 'maximize', 'close']}}),
              toolbar  = dialog.headerToolbar,
              minimize = toolbar.getAction('minimize');

        dialog.maximized = true;

        expect(minimize.iconCls, 'minimize').toBe('fas fa-minus');
        expect(toolbar.getAction('maximize').iconCls, 'restore').not.toBe(minimize.iconCls)
    });

    test('the glyph configs dress the controls', () => {
        const dialog = create({
                  headerConfig: {actions: ['minimize', 'maximize']},
                  maximizeCls : 'fas fa-expand',
                  minimizeCls : 'far fa-window-minimize',
                  restoreCls  : 'fas fa-compress'
              }),
              action = dialog.headerToolbar.getAction('maximize');

        expect(dialog.headerToolbar.getAction('minimize').iconCls).toBe('far fa-window-minimize');
        expect(action.iconCls).toBe('fas fa-expand');

        dialog.maximized = true;
        expect(action.iconCls).toBe('fas fa-compress')
    });

    test('an actionMap entry replaces its own control and keeps the others', () => {
        const dialog  = create({headerConfig: {actionMap: {close: () => ({action: 'close', iconCls: 'far fa-circle-xmark'})}}}),
              toolbar = dialog.headerToolbar;

        expect(toolbar.getAction('close').iconCls, 'close').toBe('far fa-circle-xmark');
        expect(presentation(toolbar.getAction('maximize')), 'maximize').toEqual(maximizeGlyph)
    });

    test('a list of actions leaves a single control out', () => {
        const toolbar = create({headerConfig: {actions: ['close']}}).headerToolbar;

        expect(toolbar.getAction('maximize')).toBeNull();
        expect(toolbar.getAction('close')).not.toBeNull()
    });

    test('toolbar.Base: a subclass and an instance each merge their actionMap entry by entry', () => {
        class HelpToolbar extends Toolbar {
            static config = {
                className: 'Test.Unit.Dialog.WindowControls.HelpToolbar',
                actionMap: {help: () => ({action: 'help', iconCls: 'fas fa-circle-question'})}
            }
        }

        const Cls     = Neo.setupClass(HelpToolbar),
              toolbar = Neo.create(Cls, {
                  appName,
                  actionMap: {pin: () => ({action: 'pin', iconCls: 'fas fa-thumbtack'})},
                  actions  : ['help', 'pin']
              });

        instances.push(toolbar);

        expect(Object.keys(toolbar.actionMap).sort()).toEqual(['help', 'pin']);
        expect(toolbar.getAction('help')).not.toBeNull();
        expect(toolbar.getAction('pin')).not.toBeNull()
    })
});
