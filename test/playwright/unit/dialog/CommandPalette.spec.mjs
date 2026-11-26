import {setup} from '../../setup.mjs';

const appName = 'DialogCommandPaletteUnitTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    },
    appConfig: {
        name             : appName,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import '../../../../src/manager/Instance.mjs';
import '../../../../src/vdom/Helper.mjs';
import '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import '../../../../src/vdom/util/StringFromVnode.mjs';
import Button             from '../../../../src/button/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import Dialog             from '../../../../src/dialog/Base.mjs';
import List               from '../../../../src/list/Base.mjs';
import TextField          from '../../../../src/form/field/Text.mjs';
import CommandActionModel from '../../../../src/dialog/model/CommandAction.mjs';
import CommandPalette     from '../../../../src/dialog/CommandPalette.mjs';
import CommandPaletteList from '../../../../src/dialog/CommandPaletteList.mjs';

test.describe('Neo.dialog.CommandPalette (unit)', () => {
    let domAccess, domEventsCalls, instances, navigatorCalls, navigatorMock, ownDomAccess, priorDomEvents, priorNavigator;

    test.beforeEach(() => {
        instances      = [];
        navigatorCalls = {navigateTo: [], subscribe: [], unsubscribe: []};
        domEventsCalls = {register: [], unregister: []};

        domAccess    = Neo.main.DomAccess;
        ownDomAccess = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);
        ownDomAccess.forEach(([name]) => {
            domAccess[name] = () => {}
        });

        priorDomEvents     = Neo.main.DomEvents;
        Neo.main.DomEvents = {
            registerPreventDefaultKeys  : payload => domEventsCalls.register.push(payload),
            unregisterPreventDefaultKeys: payload => domEventsCalls.unregister.push(payload)
        };

        priorNavigator = Neo.main.addon.Navigator;
        navigatorMock  = {
            navigateTo : payload => navigatorCalls.navigateTo.push(payload),
            subscribe  : payload => navigatorCalls.subscribe.push(payload),
            unsubscribe: payload => navigatorCalls.unsubscribe.push(payload)
        };
        Neo.main.addon.Navigator = navigatorMock
    });

    test.afterEach(() => {
        instances.forEach(instance => {
            if (instance && !instance.isDestroyed) {
                instance.destroy()
            }
        });

        ownDomAccess.forEach(([name, own, method]) => {
            own ? domAccess[name] = method : delete domAccess[name]
        });

        Neo.main.DomEvents       = priorDomEvents;
        Neo.main.addon.Navigator = priorNavigator
    });

    test('registers ntype command-palette and matches open shortcuts and multi-token queries', () => {
        expect(Neo.ntypeMap['command-palette']).toBe('Neo.dialog.CommandPalette');
        expect(Neo.ntypeMap['command-palette-list']).toBe('Neo.dialog.CommandPaletteList');

        expect(CommandPalette.isOpenShortcut({ctrlKey: true, key: 'k'})).toBe(true);
        expect(CommandPalette.isOpenShortcut({metaKey: true, key: 'K'})).toBe(true);
        expect(CommandPalette.isOpenShortcut({key: 'F1'})).toBe(true);
        expect(CommandPalette.isOpenShortcut({ctrlKey: true, shiftKey: true, key: 'K'})).toBe(false);
        expect(CommandPalette.isOpenShortcut({altKey: true, ctrlKey: true, key: 'k'})).toBe(false);
        expect(CommandPalette.isOpenShortcut({key: 'k'})).toBe(false);

        const record = {
            description      : 'Open the shared Team board and Release plan.',
            group            : 'Arrangements',
            keywords         : ['gantt', 'scheduler'],
            label            : 'Switch to Planning arrangement',
            unavailableReason: 'Planning arrangement is active'
        };

        expect(CommandPalette.matchesQuery(record, '')).toBe(true);
        expect(CommandPalette.matchesQuery(record, 'planning gantt')).toBe(true);
        expect(CommandPalette.matchesQuery(record, 'arrangements release')).toBe(true);
        expect(CommandPalette.matchesQuery(record, 'planning unknown')).toBe(false)
    });

    test('supports minimal two-command adoption, owner mount-scoped shortcuts, and reactive owner theme sync', async () => {
        const invoked = [],
              owner   = Neo.create(Container, {
                  appName,
                  autoInitVnode: false,
                  autoMount    : false,
                  theme        : 'neo-theme-neo-dark',
                  windowId     : 1
              }),
              palette = Neo.ntype({
                  ntype   : 'command-palette',
                  owner,
                  commands: [
                      {label: 'Save document', handler: () => invoked.push('save')},
                      {label: 'Switch theme',  handler: () => invoked.push('theme')}
                  ]
              });

        instances.push(palette, owner);

        expect(palette instanceof CommandPalette).toBe(true);
        expect(palette.appName).toBe(appName);
        expect(palette.windowId).toBe(1);
        expect(palette.theme).toBe('neo-theme-neo-dark');
        expect(domEventsCalls.register.length, 'unmounted owner registers no global shortcut yet').toBe(0);

        owner.mounted = true;
        expect(domEventsCalls.register).toEqual([{id: 'document.body', keys: ['F1'], windowId: 1}]);

        // Owner reactive theme update propagates to the palette automatically
        owner.theme = 'neo-theme-neo-light';
        expect(palette.theme).toBe('neo-theme-neo-light');

        palette.show(false);
        await expect.poll(() => palette.mounted).toBe(true);

        expect(palette.store.getCount()).toBe(2);
        expect(palette.store.getAt(0).id).toBe('Save document');

        palette.setQuery('save');
        expect(palette.store.getCount()).toBe(1);

        await palette.activateRecord(palette.store.getAt(0));
        expect(invoked).toEqual(['save']);
        expect(palette.hidden).toBe(true);
        expect(palette.mounted).toBe(false);

        owner.mounted = false;
        expect(domEventsCalls.unregister).toEqual([{id: 'document.body', keys: ['F1'], windowId: 1}])
    });

    test('uses normal Dialog show, hide, and close lifecycle without duplicate close events', async () => {
        const events  = [],
              palette = Neo.create(CommandPalette, {
                  appName,
                  commands: [{id: 'save', label: 'Save document', handler: () => {}}],
                  theme   : 'neo-theme-neo-dark',
                  windowId: 1
              });

        instances.push(palette);

        palette.on('show',  () => events.push('show'));
        palette.on('hide',  () => events.push('hide'));
        palette.on('close', () => events.push('close'));

        palette.show(false);
        await expect.poll(() => palette.mounted).toBe(true);
        expect(events).toEqual(['show']);

        // Default closeAction: 'hide' hides on Escape without firing 'close' or destroying
        palette.onKeyDownEscape();
        await expect.poll(() => palette.mounted).toBe(false);
        expect(palette.hidden).toBe(true);
        expect(palette.isDestroyed).toBeFalsy();
        expect(events).toEqual(['show', 'hide']);

        // Re-show and run close(false) with closeAction: 'close': fires 'close' once and destroys
        palette.closeAction = 'close';
        palette.show(false);
        await expect.poll(() => palette.mounted).toBe(true);

        palette.onKeyDownEscape();
        expect(palette.isDestroyed).toBe(true);
        expect(events.filter(name => name === 'close')).toEqual(['close'])
    });

    test('composes Dialog, TextField, CommandPaletteList, and Navigator for filtering and unavailable refusal', async () => {
        const calls   = [],
              palette = Neo.create(CommandPalette, {
                  appName,
                  theme          : 'neo-theme-neo-dark',
                  windowId       : 1,
                  commandProvider: () => [{
                      id               : 'undo',
                      available        : false,
                      group            : 'History',
                      handler          : () => calls.push('undo'),
                      label            : 'Undo layout change',
                      unavailableReason: 'Nothing to undo'
                  }, {
                      id         : 'planning',
                      available  : true,
                      description: 'Switch to the planning desk.',
                      group      : 'Arrangements',
                      handler    : () => calls.push('planning'),
                      keywords   : ['board', 'schedule'],
                      label      : 'Switch to Planning arrangement',
                      shortcut   : 'Alt+2'
                  }, {
                      id       : 'theme',
                      available: true,
                      group    : 'Appearance',
                      handler  : () => calls.push('theme'),
                      label    : 'Switch to Light mode'
                  }]
              });

        instances.push(palette);

        expect(palette instanceof Dialog).toBe(true);
        expect(palette.queryField instanceof TextField).toBe(true);
        expect(palette.actionList instanceof CommandPaletteList).toBe(true);
        expect(palette.actionList instanceof List).toBe(true);

        await palette.open({theme: 'neo-theme-neo-dark', windowId: 1});

        expect(palette.isOpen).toBe(true);
        expect(palette.mounted).toBe(true);
        expect(palette.store.model.className).toBe(CommandActionModel.prototype.className);
        expect(palette.store.getCount()).toBe(3);
        expect(palette.store.getAt(0).id, 'available commands sort ahead of unavailable ones').toBe('planning');
        expect(palette.store.getAt(2).id).toBe('undo');
        expect(palette.activeIndex).toBe(0);

        const inputNode = palette.queryField.getInputEl();
        expect(inputNode.role).toBe('combobox');
        expect(inputNode['aria-controls']).toBe(palette.listboxId);
        expect(palette.statusComponent.role).toBe('status');
        expect(palette.statusComponent.vdom['aria-live']).toBe('polite');
        expect(palette.statusComponent.text).toBe('3 commands (2 available, 1 unavailable).');

        expect(navigatorCalls.subscribe.length).toBe(1);
        expect(navigatorCalls.subscribe[0].eventSource).toBe(palette.inputId);
        expect(navigatorCalls.subscribe[0].wrap).toBe(true);
        expect(navigatorCalls.navigateTo.at(-1)?.target).toBe(0);

        palette.actionList.fire('itemNavigate', {
            activeIndex: 2,
            record     : palette.store.getAt(2)
        });
        expect(palette.activeIndex).toBe(2);
        expect(palette.statusText).toBe('Undo layout change — unavailable: Nothing to undo.');

        const refused = await palette.activateRecord(palette.store.get('undo'), {source: 'keyboard'});
        expect(refused.executed).toBe(false);
        expect(refused.reason).toBe('Nothing to undo');
        expect(calls).toEqual([]);
        expect(palette.isOpen).toBe(true);
        expect(palette.statusText).toBe('Undo layout change is unavailable: Nothing to undo.');

        palette.queryField.value = 'schedule';
        expect(palette.store.getCount()).toBe(1);
        expect(palette.activeIndex).toBe(0);
        expect(palette.statusText).toBe('1 command matching "schedule".');

        palette.setQuery('nonexistent-command');
        expect(palette.store.getCount()).toBe(0);
        expect(palette.activeIndex).toBe(-1);
        expect(palette.statusText).toBe('No commands matching "nonexistent-command".');
        expect(palette.emptyState.hidden).toBe(false);
        expect(palette.emptyState.vdom.cn[0].text).toBe('No matching commands')
    });

    test('restores focus to returnFocusId on hide, falls back when origin hides, and respects managesFocus', async () => {
        const focusLog = [],
              origin   = Neo.create(Button, {appName, text: 'Origin', windowId: 1}),
              fallback = Neo.create(Button, {appName, text: 'Fallback', windowId: 1}),
              palette  = Neo.create(CommandPalette, {
                  appName,
                  windowId: 1,
                  commands: [{
                      id     : 'unmount-origin',
                      label  : 'Replace view',
                      handler: () => {
                          origin.hidden = true
                      }
                  }, {
                      id          : 'custom-focus',
                      label       : 'Focus pane directly',
                      managesFocus: true,
                      handler     : () => {
                          focusLog.push('pane-focused')
                      }
                  }]
              });

        origin.focus   = id => focusLog.push(['origin', id]);
        fallback.focus = id => focusLog.push(['fallback', id]);

        instances.push(origin, fallback, palette);

        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : origin.id,
            windowId       : 1
        });

        await palette.hide(false);
        expect(palette.mounted).toBe(false);
        expect(navigatorCalls.unsubscribe.length).toBe(1);
        expect(focusLog).toEqual([['origin', origin.id]]);

        focusLog.length = 0;
        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : origin.id,
            windowId       : 1
        });

        await palette.activateRecord(palette.store.get('unmount-origin'));
        expect(focusLog).toEqual([['fallback', fallback.id]]);

        focusLog.length = 0;
        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : fallback.id,
            windowId       : 1
        });

        await palette.activateRecord(palette.store.get('custom-focus'));
        expect(focusLog).toEqual(['pane-focused'])
    })
});
