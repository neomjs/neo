import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    PROPERTIES,
    alignGroup,
    contrastOn,
    diffSnapshots,
    discoverSurfaces,
    formatReport,
    nearSameColor,
    rankCandidates,
    sideOutcome
} from '../../../../../buildScripts/util/theme-release-compare.mjs';

/**
 * @summary A snapshot whose every compared property holds `value`, with overrides. The key reads
 * `<group>#<index> <label>`, as `readElements()` writes it.
 * @param {String} key
 * @param {Object} [overrides]
 * @param {Object} [extra] e.g. `{vars, backdrop}`
 * @returns {Object}
 */
const snapshot = (key, overrides = {}, extra = {}) => {
    const [, group, index, text = ''] = key.match(/^([\w-]+)#(\d+) ?(.*)$/);

    return {
        key,
        group,
        index : Number(index),
        label : text.replace(/\d+/g, '#'),
        values: {...Object.fromEntries(PROPERTIES.map(name => [name, 'x'])), 'border-top-style': 'solid', 'border-top-width': '1px', ...overrides},
        vars  : [],
        ...extra
    }
};

/**
 * @summary Unit suite for `buildScripts/util/theme-release-compare.mjs`: discovery, pairing and the report. The
 * in-page reads need a browser and live in `test/playwright/component/buildScripts/util/ThemeReleaseCompare.spec.mjs`.
 */
test.describe('theme-release-compare — surfaces, pairing, differences and the report', () => {
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

    test('reports each differing property with the dev-side variables of equal value, roles first', () => {
        const released = [snapshot('button#0 Save', {'border-top-color': 'rgba(211, 215, 210, 1)'})],
              dev      = [snapshot('button#0 Save', {'border-top-color': 'rgba(122, 131, 156, 1)'}, {vars: [
                  {name: '--neo-palette-neutral-500',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-button-border-color',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-color-border-strong',  value: 'rgba(122, 131, 156, 1)'},
                  {name: '--neo-color-border-default', value: 'rgba(211, 215, 210, 1)'}
              ]})];

        expect(diffSnapshots(released, dev)).toEqual([{
            key       : 'button#0 Save',
            group     : 'button',
            property  : 'border-top-color',
            released  : 'rgba(211, 215, 210, 1)',
            dev       : 'rgba(122, 131, 156, 1)',
            devIndex  : 0,
            equalValue: ['--neo-color-border-strong', '--neo-button-border-color', '--neo-palette-neutral-500']
        }])
    });

    test('skips a border color neither side draws, and reports elements present on one side only', () => {
        const borderless = {'border-top-style': 'none', 'border-top-width': '0px'},
              released   = [snapshot('dialog-header#0', {...borderless, 'border-top-color': 'rgba(0, 0, 0, 1)'}), snapshot('tab#0 One'), snapshot('tab#1 Two')],
              dev        = [snapshot('dialog-header#0', {...borderless, 'border-top-color': 'rgba(255, 255, 255, 1)'}), snapshot('tab#0 Two')];

        expect(diffSnapshots(released, dev)).toEqual([
            {key: 'tab#0 One', group: 'tab', property: '(element)', released: 'present', dev: 'missing', equalValue: []}
        ])
    });

    test('pairs the controls after an inserted one and still compares them', () => {
        const released = [snapshot('button#0 Save', {color: 'rgba(0, 0, 0, 1)'}), snapshot('button#1 Cancel')],
              dev      = [snapshot('button#0 New'), snapshot('button#1 Save', {color: 'rgba(255, 0, 0, 1)'}), snapshot('button#2 Cancel')],
              rows     = diffSnapshots(released, dev);

        expect(rows.map(row => `${row.key} ${row.property}`)).toEqual(['button#0 Save color', 'button#0 New (element)']);
        expect(rows[0]).toMatchObject({devKey: 'button#1 Save', devIndex: 1, released: 'rgba(0, 0, 0, 1)', dev: 'rgba(255, 0, 0, 1)'})
    });

    test('pairs an element whose label only differs in its numbers, and a relabelled one in its place', () => {
        const {pairs, releasedOnly, devOnly} = alignGroup(
            [snapshot('panel#0 Revenue today $47,561'), snapshot('panel#1 Orders 1,341'), snapshot('panel#2 Neo Dark')],
            [snapshot('panel#0 Revenue today $47,202'), snapshot('panel#1 Orders 1,296'), snapshot('panel#2 Neo Light')]
        );

        expect(pairs.map(([a, b]) => `${a.index}-${b.index}`)).toEqual(['0-0', '1-1', '2-2']);
        expect([releasedOnly, devOnly]).toEqual([[], []])
    });

    test('drops a palette re-tint, but keeps a near-equal color that crosses a contrast floor', () => {
        expect(nearSameColor('rgba(14, 15, 13, 1)', 'rgba(14, 15, 19, 1)'), 'a neutral hue shift').toBe(true);
        expect(nearSameColor('rgba(211, 215, 210, 1)', 'rgba(122, 131, 156, 1)'), 'the plain-button border').toBe(false);
        expect(nearSameColor('8px', '9px'), 'not a color').toBe(false);
        expect(contrastOn('rgba(148, 148, 148, 1)', 'rgba(255, 255, 255, 1)')).toBeCloseTo(3.03, 2);
        expect(contrastOn('rgba(154, 154, 154, 1)', 'rgba(255, 255, 255, 1)')).toBeCloseTo(2.81, 2);

        const white    = {backdrop: {'border-top-color': 'rgba(255, 255, 255, 1)', color: 'rgba(255, 255, 255, 1)'}},
              released = [snapshot('field#0 Name', {'border-top-color': 'rgba(148, 148, 148, 1)', color: 'rgba(14, 15, 13, 1)'}, white)],
              dev      = [snapshot('field#0 Name', {'border-top-color': 'rgba(154, 154, 154, 1)', color: 'rgba(14, 15, 19, 1)'}, white)];

        expect(diffSnapshots(released, dev)).toEqual([expect.objectContaining({property: 'border-top-color', crossing: '3:1'})])
    });

    test('compares only the first perGroup elements, using the rest as pairing slack', () => {
        const released = [snapshot('tab#0 A'), snapshot('tab#1 B'), snapshot('tab#2 C')],
              dev      = [snapshot('tab#0 New'), snapshot('tab#1 A'), snapshot('tab#2 B'), snapshot('tab#3 C')];

        expect(diffSnapshots(released, dev, 2).map(row => row.key)).toEqual(['tab#0 New'])
    });

    test('names the outcome a run can be compared under, from its two sides', () => {
        const ok = observed => ({status: 'ok', observed}), error = {status: 'error'}, light = 'neo-theme-neo-light';

        expect(sideOutcome(light, ok(light), ok(light))).toBe('compare');
        expect(sideOutcome(light, error, ok(light))).toBe('new');
        expect(sideOutcome(light, ok(light), error)).toBe('dev-failed');
        expect(sideOutcome(light, error, error)).toBe('failed');
        expect(sideOutcome(light, ok('neo-theme-neo-dark'), ok(light))).toBe('scheme-unverified')
    });

    test('ranks roles, then the component, then palette grades', () => {
        expect(rankCandidates(['--neo-green-100', '--neo-palette-neutral-50', '--neo-dialog-header-color', '--neo-color-text-default'], 'dialog-header'))
            .toEqual(['--neo-color-text-default', '--neo-dialog-header-color', '--neo-palette-neutral-50', '--neo-green-100'])
    });

    test('formats totals, the runs it could not compare, and one table per differing run', () => {
        const side   = (observed, via = 'load') => ({status: 'ok', observed, via}),
              dark   = 'neo-theme-neo-dark',
              report = formatReport({
                  released: 'https://neomjs.com',
                  tree    : '/tmp/dev',
                  runs    : [
                      {surface: 'examples/dialog', scheme: dark, outcome: 'differs', coverage: {button: [6, 6]}, sides: {released: side(dark), dev: side(dark)},
                       rows: [{key: 'button#0 Save', property: 'border-top-color', released: 'a', dev: 'b', owner: {variable: '--neo-button-border-color', declared: 'var(--neo-color-border-default)'}, equalValue: ['--neo-color-border-default']}]},
                      {surface: 'examples/tooltip', scheme: dark, outcome: 'equal', sides: {released: side(dark), dev: side(dark)}, rows: []},
                      {surface: 'examples/sheet/base', scheme: dark, outcome: 'new', sides: {released: {status: 'error', error: 'Timeout 30000ms exceeded.'}, dev: side(dark)}},
                      {surface: 'examples/menu/context', scheme: 'neo-theme-neo-light', outcome: 'scheme-unverified', sides: {released: side(dark, null), dev: side('neo-theme-neo-light', 'switcher')}}
                  ]
              });

        expect(report).toContain('4 runs (surface × scheme): 1 differ, 1 equal, 1 new on `dev`, 0 fail on `dev` only, 0 fail on both, 1 scheme unverified.');
        expect(report).toContain('- **examples/sheet/base** · neo-theme-neo-dark: new (released: error: Timeout 30000ms exceeded.; `dev`: neo-theme-neo-dark)');
        expect(report).toContain('- **examples/menu/context** · neo-theme-neo-light: scheme-unverified (released: neo-theme-neo-dark; `dev`: neo-theme-neo-light (via its theme switcher))');
        expect(report).toContain('Sampled (released/`dev`): button 6/6');
        expect(report).toContain('| `button#0 Save` | border-top-color | `a` | `b` | `--neo-button-border-color` = `var(--neo-color-border-default)` | `--neo-color-border-default` |')
    })
});
