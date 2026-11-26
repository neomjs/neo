import {setup} from '../../../setup.mjs';

const appName = 'WorkbenchCommandPaletteUnitTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../../src/Neo.mjs';
import * as core          from '../../../../../src/core/_export.mjs';
import InstanceManager    from '../../../../../src/manager/Instance.mjs';
import VDomUtil           from '../../../../../src/util/VDom.mjs';
import Button             from '../../../../../src/button/Base.mjs';
import CommandActionModel from '../../../../../examples/workbench/CommandActionModel.mjs';
import CommandPalette     from '../../../../../examples/workbench/CommandPalette.mjs';

test.describe('Neo.examples.workbench.CommandPalette (unit)', () => {
    let instances;

    test.beforeEach(() => {
        instances = []
    });

    test.afterEach(() => {
        instances.forEach(instance => {
            if (instance && !instance.isDestroyed) {
                instance.destroy()
            }
        })
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

    test('hydrates CommandActionModel records, skips initial unavailable items, filters, navigates, and announces status', async () => {
        const calls   = [],
              palette = Neo.create(CommandPalette, {
                  appName,
                  theme         : 'neo-theme-neo-dark',
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

        await palette.open({theme: 'neo-theme-neo-dark'});

        expect(palette.isOpen).toBe(true);
        expect(palette.store.model.className).toBe(CommandActionModel.prototype.className);
        expect(palette.store.getCount()).toBe(3);
        expect(palette.store.getAt(0).id, 'available commands sort ahead of unavailable ones').toBe('planning');
        expect(palette.store.getAt(2).id).toBe('undo');
        expect(palette.activeIndex).toBe(0);
        expect(palette.cls).toContain('neo-theme-neo-dark');

        const inputNode  = VDomUtil.find(palette.vdom, {id: palette.inputId})?.vdom,
              statusNode = VDomUtil.find(palette.vdom, {id: palette.statusId})?.vdom;

        expect(inputNode.role).toBe('combobox');
        expect(inputNode['aria-activedescendant']).toBe(palette.getOptionId('planning'));
        expect(statusNode.role).toBe('status');
        expect(statusNode['aria-live']).toBe('polite');
        expect(statusNode.text).toBe('3 commands (2 available, 1 unavailable).');

        palette.onPaletteKeyDown({key: 'ArrowDown'});
        expect(palette.activeIndex).toBe(1);

        palette.onPaletteKeyDown({key: 'ArrowDown'});
        expect(palette.activeIndex).toBe(2);
        expect(palette.statusText).toBe('Undo layout change — unavailable: Nothing to undo.');

        palette.onPaletteKeyDown({key: 'ArrowDown'});
        expect(palette.activeIndex, 'wraps from end to start').toBe(0);

        // Pressing Enter on an unavailable option must NOT invoke its handler or close the palette
        const refused = await palette.activateRecord(palette.store.get('undo'), {source: 'keyboard'});
        expect(refused.executed).toBe(false);
        expect(refused.reason).toBe('Nothing to undo');
        expect(calls).toEqual([]);
        expect(palette.isOpen).toBe(true);
        expect(palette.statusText).toBe('Undo layout change is unavailable: Nothing to undo.');

        // Filtering narrows the store and announces the match count
        palette.setQuery('schedule');
        expect(palette.store.getCount()).toBe(1);
        expect(palette.activeIndex).toBe(0);
        expect(palette.statusText).toBe('1 command matching "schedule".');

        // Zero-match query renders explicit empty state and clears activeIndex
        palette.setQuery('nonexistent-command');
        expect(palette.store.getCount()).toBe(0);
        expect(palette.activeIndex).toBe(-1);
        expect(palette.statusText).toBe('No commands matching "nonexistent-command".');
        const emptyTitle = VDomUtil.find(palette.vdom, {cls: 'neo-command-palette-empty-title'})?.vdom;
        expect(emptyTitle.text).toBe('No matching commands');

        // Switching theme updates the root theme carrier class
        palette.theme = 'neo-theme-neo-light';
        expect(palette.cls).toContain('neo-theme-neo-light');
        expect(palette.cls).not.toContain('neo-theme-neo-dark')
    });

    test('restores focus to returnFocusId on close, or falls back to fallbackFocusId when origin control unmounts', async () => {
        const focusLog = [],
              origin   = Neo.create(Button, {appName, text: 'Origin'}),
              fallback = Neo.create(Button, {appName, text: 'Fallback'}),
              palette  = Neo.create(CommandPalette, {
                  appName,
                  actions: [{
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
            returnFocusId  : origin.id
        });

        await palette.close({restoreFocus: true});
        expect(focusLog).toEqual([['origin', origin.id]]);

        focusLog.length = 0;
        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : origin.id
        });

        await palette.activateRecord(palette.store.get('unmount-origin'));
        expect(focusLog, 'falls back cleanly when action hides or destroys origin control').toEqual([
            ['fallback', fallback.id]
        ]);

        focusLog.length = 0;
        await palette.open({
            fallbackFocusId: () => fallback.id,
            returnFocusId  : fallback.id
        });

        await palette.activateRecord(palette.store.get('custom-focus'));
        expect(focusLog, 'respects managesFocus: true without clobbering handler focus').toEqual(['pane-focused'])
    })
});
