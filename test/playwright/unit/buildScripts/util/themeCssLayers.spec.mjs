import {test, expect} from '@playwright/test';
import autoprefixer   from 'autoprefixer';
import postcss        from 'postcss';

import {
    LAYER_ORDER,
    cascadeLayer,
    cascadeLayerPlugin
} from '../../../../../buildScripts/util/themeCssLayers.mjs';

const ORDER = LAYER_ORDER.join(', ');

/**
 * @summary Pins the cascade layer a built theme sheet gets from its folder: the folder mapping, the one
 * layer block around the syntax tree, the top-level `@charset` and `@import`, the source positions a
 * development map is written from, and the rejection of a sheet that writes `@layer`.
 */
test.describe('buildScripts/util/themeCssLayers (#22297)', () => {
    const run = (css, layer, options={}) => postcss([autoprefixer, cascadeLayerPlugin({layer})]).process(css, {
        from: '/fixture/resources/css/src/Sheet.css',
        to  : '/fixture/dist/development/css/src/Sheet.css',
        ...options
    });

    const outline = css => postcss.parse(css).nodes.map(node => node.type === 'atrule' ? `@${node.name} ${node.params}` : node.selector);

    test('a sheet\'s folder decides its layer', () => {
        expect(cascadeLayer('theme-neo-dark', 'Global.css')).toBe('neo.roles');
        expect(cascadeLayer('theme-base', '/button/Base.css')).toBe('neo.base');
        expect(cascadeLayer('theme-neo-dark', '/button/Base.css')).toBe('neo.theme');
        expect(cascadeLayer('theme-neo-dark', '/apps/portal/Viewport.css')).toBe('neo.apps');
        expect(cascadeLayer('theme-light', 'examples/grid/Viewport.css')).toBe('neo.apps');
        expect(cascadeLayer('src', 'Global.css')).toBe('neo.rules');
        expect(cascadeLayer('src', '/button/Base.css')).toBe('neo.rules');
        expect(cascadeLayer('src', 'apps/portal/Viewport.css')).toBe('neo.apps');
        expect(cascadeLayer('src', '/examples/grid/Viewport.css')).toBe('neo.apps')
    });

    test('the order keeps the four engine layers between the vendor and app layers', () => {
        expect(LAYER_ORDER).toEqual(['neo.vendor', 'neo.roles', 'neo.base', 'neo.theme', 'neo.rules', 'neo.apps'])
    });

    test('a built sheet starts with the order statement and holds its rules in one layer block', async () => {
        const {css} = await run('.a {\n    color: red;\n}\n\n.b {\n    .c {\n        color: blue;\n    }\n}\n', 'neo.rules'),
              block = postcss.parse(css).nodes[1];

        expect(outline(css)).toEqual([`@layer ${ORDER}`, '@layer neo.rules']);
        expect(block.nodes.map(node => node.selector)).toEqual(['.a', '.b']);
        expect(block.nodes[1].nodes[0].selector).toBe('.c')
    });

    test('@charset stays first and @import stays at the top level, where the browser fetches it', async () => {
        const {css} = await run('@charset "utf-8";\n@import url("./Other.css");\n.a {\n    color: red;\n}\n', 'neo.theme');

        expect(outline(css)).toEqual(['@charset "utf-8"', `@layer ${ORDER}`, '@import url("./Other.css")', '@layer neo.theme'])
    });

    test('the wrapped rules keep their source lines, and the map\'s only source is the sheet', async () => {
        const result = await run('/* header */\n\n.a {\n    color: red;\n}\n\n.b {\n    color: blue;\n}\n', 'neo.rules', {
                  map: {inline: false}
              }),
              block  = result.root.nodes[1];

        expect(block.nodes.filter(node => node.type === 'rule').map(node => node.source.start.line)).toEqual([3, 7]);
        expect(JSON.parse(result.map.toString()).sources).toEqual(['../../../../resources/css/src/Sheet.css'])
    });

    test('flat theme bindings keep their selector weight and split by owner; qualified, nested and mixed rules stay intact', async () => {
        const boundaries = ['.neo-theme-acme-dark', '.neo-theme-acme-light', '.neo-theme-custom'],
              source     = [
                  ':where(.neo-theme-acme-dark, .neo-theme-acme-light) { --widget: var(--role); }',
                  '.neo-theme-custom { --widget: 3px; }',
                  '.neo-theme-custom .local { --widget: 4px; }',
                  '.neo-theme-custom { &.state { --widget: 5px; } }',
                  '.neo-theme-custom { --widget: 6px; color: red; }',
                  ':root .neo-theme-custom { --widget: 7px; }',
                  ':where(:root .neo-theme-custom) { --widget: 8px; }',
                  ':root .outer .neo-theme-custom { --widget: 9px; }'
              ].join('\n'),
              result = await postcss([cascadeLayerPlugin({layer: 'neo.theme', boundaries})])
                  .process(source, {from: 'Widget.css', map: {inline: false}}),
              [dark, light, custom, qualified, nested, mixed, legacy, legacyWhere, descendant] = result.root.nodes[1].nodes;

        for (const [i, scope] of [dark, light, custom].entries()) {
            expect(scope.params).toBe(`(${boundaries[i]}) to (:is(${boundaries.join(', ')}))`);
            expect(scope.first.source.start.line).toBe(i === 2 ? 2 : 1)
        }
        expect(dark.first.selector).toBe(':where(:scope.neo-theme-acme-dark, .neo-theme-scope)');
        expect(light.first.selector).toBe(':where(:scope.neo-theme-acme-light, .neo-theme-scope)');
        expect(custom.first.selector).toBe(':where(:scope).neo-theme-custom, .neo-theme-scope');
        expect(qualified.selector).toBe('.neo-theme-custom .local');
        expect(nested.first.selector).toBe('&.state');
        expect(mixed.last.prop).toBe('color');
        expect(legacy.params).toBe(`(:root .neo-theme-custom) to (:is(${boundaries.join(', ')}))`);
        expect(legacy.first.selector).toBe(':scope.neo-theme-custom, :scope .neo-theme-scope');
        expect(legacyWhere.params).toBe(legacy.params);
        expect(legacyWhere.first.selector).toBe(':where(:scope.neo-theme-custom, .neo-theme-scope)');
        expect(descendant.selector).toBe(':root .outer .neo-theme-custom');
        expect(result.map.toJSON().sources).toEqual(['Widget.css'])
    });

    test('a sheet that writes @layer itself fails the build', async () => {
        await expect(run('@layer custom {\n    .a {\n        color: red;\n    }\n}\n', 'neo.rules')).rejects.toThrow(/writes no @layer/)
    });

    test('an empty sheet still declares the order', async () => {
        expect((await run('', 'neo.theme')).css).toBe(`@layer ${ORDER};`)
    })
});
