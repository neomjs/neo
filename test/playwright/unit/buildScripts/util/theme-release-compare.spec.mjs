import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    PROPERTIES,
    diffSnapshots,
    discoverSurfaces,
    formatReport,
    nearSameColor,
    rankCandidates
} from '../../../../../buildScripts/util/theme-release-compare.mjs';

/**
 * @summary A snapshot whose every compared property holds `value`, with overrides.
 * @param {String} key
 * @param {Object} [overrides]
 * @param {Object[]} [vars]
 * @returns {Object}
 */
const snapshot = (key, overrides = {}, vars = []) => ({
    key,
    group : key.split('#')[0],
    values: {...Object.fromEntries(PROPERTIES.map(name => [name, 'x'])), 'border-top-style': 'solid', 'border-top-width': '1px', ...overrides},
    vars
});

/**
 * @summary Unit suite for `buildScripts/util/theme-release-compare.mjs`, the released-vs-`dev` runner's pure parts.
 */
test.describe('theme-release-compare — surfaces, differences and the report', () => {
    test('discovers theme-Neo surfaces under apps/ and examples/, skipping child apps and classic-only configs', () => {
        const tree  = fs.mkdtempSync(path.join(os.tmpdir(), 'release-compare-')),
              write = (dir, themes) => {
                  fs.mkdirSync(path.join(tree, dir), {recursive: true});
                  fs.writeFileSync(path.join(tree, dir, 'neo-config.json'), JSON.stringify({themes}))
              };

        write('examples/dialog', ['neo-theme-neo-light', 'neo-theme-neo-dark']);
        write('examples/classic', ['neo-theme-light', 'neo-theme-dark']);
        write('examples/lightOnly', ['neo-theme-neo-light']);
        write('apps/portal', ['neo-theme-neo-dark', 'neo-theme-neo-light']);
        write('apps/portal/childapps/preview', ['neo-theme-neo-light']);

        expect(discoverSurfaces(tree)).toEqual([
            {surface: 'apps/portal',        schemes: ['neo-theme-neo-light', 'neo-theme-neo-dark']},
            {surface: 'examples/dialog',    schemes: ['neo-theme-neo-light', 'neo-theme-neo-dark']},
            {surface: 'examples/lightOnly', schemes: ['neo-theme-neo-light']}
        ]);

        fs.rmSync(tree, {recursive: true, force: true})
    });

    test('reports each differing property with the dev-side custom properties that resolve to it, roles first', () => {
        const released = [snapshot('button#0 Save', {'border-top-color': 'rgba(211, 215, 210, 1)'})],
              dev      = [snapshot('button#0 Save', {'border-top-color': 'rgba(122, 131, 156, 1)'}, [
                  {name: '--neo-palette-neutral-500',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-button-border-color',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-color-border-strong',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-color-border-default', value: 'rgba(211, 215, 210, 1)'}
              ])];

        expect(diffSnapshots(released, dev)).toEqual([{
            key       : 'button#0 Save',
            group     : 'button',
            property  : 'border-top-color',
            released  : 'rgba(211, 215, 210, 1)',
            dev       : 'rgba(122, 131, 156, 1)',
            candidates: ['--neo-color-border-strong', '--neo-button-border-color', '--neo-palette-neutral-500']
        }])
    });

    test('skips a border color neither side draws, and reports elements present on one side only', () => {
        const borderless = {'border-top-style': 'none', 'border-top-width': '0px'},
              released   = [snapshot('dialog-header#0', {...borderless, 'border-top-color': 'rgba(0, 0, 0, 1)'}), snapshot('tab#0 One')],
              dev        = [snapshot('dialog-header#0', {...borderless, 'border-top-color': 'rgba(255, 255, 255, 1)'}), snapshot('tab#1 Two')];

        expect(diffSnapshots(released, dev)).toEqual([
            {key: 'tab#0 One', group: 'tab', property: '(element)', released: 'present', dev: 'missing', candidates: []},
            {key: 'tab#1 Two', group: 'tab', property: '(element)', released: 'missing', dev: 'present', candidates: []}
        ])
    });

    test('treats a palette re-tint no reader sees as equal, and a visible move as a difference', () => {
        expect(nearSameColor('rgba(14, 15, 13, 1)', 'rgba(14, 15, 19, 1)'), 'a neutral hue shift').toBe(true);
        expect(nearSameColor('rgba(211, 215, 210, 1)', 'rgba(122, 131, 156, 1)'), 'the plain-button border').toBe(false);
        expect(nearSameColor('rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.1)'), 'a translucent press layer').toBe(false);
        expect(nearSameColor('8px', '9px'), 'not a color').toBe(false);

        const released = [snapshot('button#0 Save', {color: 'rgba(14, 15, 13, 1)'})],
              dev      = [snapshot('button#0 Save', {color: 'rgba(14, 15, 19, 1)'})];

        expect(diffSnapshots(released, dev)).toEqual([])
    });

    test('ranks roles, then the component, then palette grades', () => {
        expect(rankCandidates(['--neo-green-100', '--neo-palette-neutral-50', '--neo-dialog-header-color', '--neo-color-text-default'], 'dialog-header'))
            .toEqual(['--neo-color-text-default', '--neo-dialog-header-color', '--neo-palette-neutral-50', '--neo-green-100'])
    });

    test('formats totals, load failures and one table per differing run', () => {
        const report = formatReport({
            released: 'https://neomjs.com',
            tree    : '/tmp/dev',
            runs    : [
                {surface: 'examples/dialog',  scheme: 'neo-theme-neo-dark', rows: [{key: 'button#0 Save', property: 'border-top-color', released: 'a', dev: 'b', candidates: ['--neo-color-border-strong']}]},
                {surface: 'examples/tooltip', scheme: 'neo-theme-neo-dark', rows: []},
                {surface: 'examples/video',   scheme: 'neo-theme-neo-dark', error: 'Timeout 30000ms exceeded.'}
            ]
        });

        expect(report).toContain('3 runs (surface × scheme): 1 differ, 1 failed to load, 1 equal.');
        expect(report).toContain('- **examples/video** · neo-theme-neo-dark: Timeout 30000ms exceeded.');
        expect(report).toContain('## examples/dialog · neo-dark');
        expect(report).toContain('| `button#0 Save` | border-top-color | `a` | `b` | `--neo-color-border-strong` |')
    })
});
