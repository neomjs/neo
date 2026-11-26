import {setup} from '../../../setup.mjs';

const appName = 'WorkbenchCommandPaletteUnitTest';

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

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import '../../../../../src/manager/Instance.mjs';
import '../../../../../src/vdom/Helper.mjs';
import '../../../../../src/vdom/util/DomApiVnodeCreator.mjs';
import '../../../../../src/vdom/util/StringFromVnode.mjs';
import Button             from '../../../../../src/button/Base.mjs';
import Dialog             from '../../../../../src/dialog/Base.mjs';
import List               from '../../../../../src/list/Base.mjs';
import TextField          from '../../../../../src/form/field/Text.mjs';
import CommandActionList  from '../../../../../examples/workbench/CommandActionList.mjs';
import CommandActionModel from '../../../../../examples/workbench/CommandActionModel.mjs';
import CommandPalette     from '../../../../../examples/workbench/CommandPalette.mjs';

test.describe('Neo.examples.workbench.CommandPalette (unit)', () => {
    let domAccess, instances, navigatorCalls, navigatorMock, ownDomAccess, priorNavigator;

    test.beforeEach(() => {
        instances      = [];
        navigatorCalls = {navigateTo: [], subscribe: [], unsubscribe: []};

        domAccess    = Neo.main.DomAccess;
        ownDomAccess = ['syncModalMask', 'trapFocus'].map(name => [name, Object.hasOwn(domAccess, name), domAccess[name]]);
        ownDomAccess.forEach(([name]) => {
            domAccess[name] = () => {}
        });

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

        Neo.main.addon.Navigator = priorNavigator
    });

    test('matches standard keyboard open shortcuts and multi-token search queries', () => {
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

    test('composes Dialog, TextField, CommandActionList, and Navigator on the real mount path', async () => {
        const calls   = [],
              palette = Neo.create(CommandPalette, {
                  appName,
                  theme         : 'neo-theme-neo-dark',
                  windowId      : 1,
                  actionProvider: () => [{
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
        expect(palette.actionList instanceof CommandActionList).toBe(true);
        expect(palette.actionList instanceof List).toBe(true);

        await palette.open({theme: 'neo-theme-neo-dark', windowId: 1});

        expect(palette.isOpen).toBe(true);
        expect(palette.mounted).toBe(true);
        expect(palette.store.model.className).toBe(CommandActionModel.prototype.className);
        expect(palette.store.getCount()).toBe(3);
        expect(palette.store.getAt(0).id, 'available commands sort ahead of unavailable ones').toBe('planning');
        expect(palette.store.getAt(2).id).toBe('undo');
        expect(palette.activeIndex).toBe(0);
        expect(palette.cls).toContain('neo-theme-neo-dark');

        const inputNode = palette.queryField.getInputEl();
        expect(inputNode.role).toBe('combobox');
        expect(inputNode['aria-controls']).toBe(palette.listboxId);
        expect(palette.statusComponent.role).toBe('status');
        expect(palette.statusComponent.vdom['aria-live']).toBe('polite');
        expect(palette.statusComponent.text).toBe('3 commands (2 available, 1 unavailable).');

        // Navigator subscribed with the query input as eventSource and navigated to index 0
        expect(navigatorCalls.subscribe.length).toBe(1);
        expect(navigatorCalls.subscribe[0].eventSource).toBe(palette.inputId);
        expect(navigatorCalls.subscribe[0].wrap).toBe(true);
        expect(navigatorCalls.navigateTo.at(-1)?.target).toBe(0);

        // Navigator itemNavigate updates activeIndex and announces unavailable reasons
        palette.actionList.fire('itemNavigate', {
            activeIndex: 1,
            record     : palette.store.getAt(1)
        });
        expect(palette.activeIndex).toBe(1);

        palette.actionList.fire('itemNavigate', {
            activeIndex: 2,
            record     : palette.store.getAt(2)
        });
        expect(palette.activeIndex).toBe(2);
        expect(palette.statusText).toBe('Undo layout change — unavailable: Nothing to undo.');

        // Activating an unavailable option refuses execution and keeps the dialog open
        const refused = await palette.activateRecord(palette.store.get('undo'), {source: 'keyboard'});
        expect(refused.executed).toBe(false);
        expect(refused.reason).toBe('Nothing to undo');
        expect(calls).toEqual([]);
        expect(palette.isOpen).toBe(true);
        expect(palette.statusText).toBe('Undo layout change is unavailable: Nothing to undo.');

        // Filtering via TextField change updates the store and status announcement
        palette.queryField.value = 'schedule';
        expect(palette.store.getCount()).toBe(1);
        expect(palette.activeIndex).toBe(0);
        expect(palette.statusText).toBe('1 command matching "schedule".');

        // Zero-match query hides list items via .neo-is-empty and reveals emptyState
        palette.setQuery('nonexistent-command');
        expect(palette.store.getCount()).toBe(0);
        expect(palette.activeIndex).toBe(-1);
        expect(palette.statusText).toBe('No commands matching "nonexistent-command".');
        expect(palette.emptyState.hidden).toBe(false);
        expect(palette.emptyState.vdom.cn[0].text).toBe('No matching commands');

        // Switching theme updates the root theme carrier class
        palette.theme = 'neo-theme-neo-light';
        expect(palette.cls).toContain('neo-theme-neo-light');
        expect(palette.cls).not.toContain('neo-theme-neo-dark')
    });

    test('restores focus to returnFocusId on close, or falls back to fallbackFocusId when origin control hides', async () => {
        const focusLog = [],
              origin   = Neo.create(Button, {appName, text: 'Origin', windowId: 1}),
              fallback = Neo.create(Button, {appName, text: 'Fallback', windowId: 1}),
              palette  = Neo.create(CommandPalette, {
                  appName,
                  windowId: 1,
                  actions : [{
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

        await palette.close({restoreFocus: true});
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
        expect(focusLog, 'falls back cleanly when action hides or destroys origin control').toEqual([
            ['fallback', fallback.id]
        ]);

        focusLog.length = 0;
        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : fallback.id,
            windowId       : 1
        });

        await palette.activateRecord(palette.store.get('custom-focus'));
        expect(focusLog, 'respects managesFocus: true without clobbering handler focus').toEqual(['pane-focused'])
    })
});
