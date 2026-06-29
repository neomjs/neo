import {setup} from '../../setup.mjs';

const appName = 'TooltipSingletonThemeTest';

setup({
    neoConfig: {
        allowVdomUpdatesInTests: true,
        useDomApiRenderer      : true
    },
    appConfig: {
        name: appName
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import Tooltip        from '../../../../src/tooltip/Base.mjs';

function createTooltipHarness(initial = {}) {
    return {
        resetCfg: {},
        text    : null,
        theme   : null,
        ...initial,
        set(config) {
            Object.assign(this, config)
        },
        setSilent(config) {
            Object.assign(this, config)
        }
    }
}

test.describe('Neo.tooltip.Base singleton theme resolution', () => {
    test('inherits the hovered component theme when reconfiguring the shared tooltip', () => {
        const tooltip = createTooltipHarness({text: 'previous', theme: 'neo-theme-light'}),
              config  = Tooltip.applySingletonTargetConfig(tooltip, {
                  target: {
                      _tooltip: {text: 'Nested'},
                      getTheme: () => 'neo-theme-dark'
                  },
                  data: {}
              });

        expect(config).toEqual({text: 'Nested', theme: 'neo-theme-dark'});
        expect(tooltip.text).toBe('Nested');
        expect(tooltip.theme).toBe('neo-theme-dark');
        expect(tooltip.resetCfg).toEqual({text: 'previous', theme: 'neo-theme-light'});
    });

    test('uses the delegated DOM path theme for data-neo-tooltip targets without component ownership', () => {
        const tooltip = createTooltipHarness(),
              config  = Tooltip.applySingletonTargetConfig(tooltip, {
                  data: {
                      target: {data: {neoTooltip: 'Delegated'}},
                      path  : [
                          {cls: ['leaf'], data: {}},
                          {cls: ['neo-theme-neo-light'], data: {}}
                      ]
                  }
              });

        expect(config).toEqual({text: 'Delegated', theme: 'neo-theme-neo-light'});
        expect(tooltip.text).toBe('Delegated');
        expect(tooltip.theme).toBe('neo-theme-neo-light');
    });

    test('keeps an explicit tooltip theme ahead of inherited target themes', () => {
        const tooltip = createTooltipHarness(),
              config  = Tooltip.applySingletonTargetConfig(tooltip, {
                  target: {
                      _tooltip: {text: 'Explicit', theme: 'neo-theme-neo-light'},
                      getTheme: () => 'neo-theme-dark'
                  },
                  data: {}
              });

        expect(config).toEqual({text: 'Explicit', theme: 'neo-theme-neo-light'});
        expect(tooltip.theme).toBe('neo-theme-neo-light');
    });
});
