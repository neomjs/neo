import path                              from 'node:path';
import {test, expect}                    from '@playwright/test';
import {moduleClassNames, rewriteModule} from '../../../../buildScripts/util/moveSourceTransforms.mjs';

/** @summary Resolves synthetic source paths without creating or importing fixture files. */
const file = relative => path.resolve('move-source-fixture', relative);

test.describe('moveSourceTransforms (#5086)', () => {
    test('rewrites each static module edge while retaining aliases and surrounding source', () => {
        const from    = file('src/old/View.mjs'),
            oldTarget = file('src/old/Sibling.mjs'),
            newTarget = file('src/shared/Renamed.mjs'),
            code      = [
                '// import Ghost from "./Sibling.mjs";',
                'const prose = "export * from \'./Sibling.mjs\'";',
                'import Default, {named as alias} from "./Sibling.mjs";',
                'import "./Sibling.mjs";',
                'export {default as PublicAlias} from "./Sibling.mjs";',
                'export * from "./Sibling.mjs";',
                'export * as namespace from "./Sibling.mjs";',
                'const lazy = import("./Sibling.mjs");',
                'const template = import(`./Sibling.mjs`);'
            ].join('\r\n'),
            expected = code.split('\r\n').map((line, index) => index < 2 ? line :
                line.replace(/(?:"|`)\.\/Sibling\.mjs(?:"|`)/, '"../shared/Renamed.mjs"')).join('\r\n'),
            result = rewriteModule({
                code, from, to: from,
                mapPath: target => target === oldTarget ? newTarget : target
            });

        expect(result.code).toBe(expected);
        expect(result.references).toHaveLength(7);
        expect(result.unresolved).toEqual([]);
        for (const reference of result.references) {
            expect(reference).toMatchObject({specifier: './Sibling.mjs', value: '../shared/Renamed.mjs'});
            expect(['"./Sibling.mjs"', '`./Sibling.mjs`']).toContain(code.slice(reference.start, reference.end))
        }
    });

    [
        ['importer only', 'src/new/deep/View.mjs', 'src/old/Sibling.mjs', '../../old/Sibling.mjs'],
        ['target only', 'src/old/View.mjs', 'src/shared/Sibling.mjs', '../shared/Sibling.mjs'],
        ['both siblings', 'src/new/View.mjs', 'src/new/Sibling.mjs', './Sibling.mjs'],
        ['both independently', 'src/new/deep/View.mjs', 'src/shared/Renamed.mjs', '../../shared/Renamed.mjs']
    ].forEach(([label, importer, target, expected]) => {
        test(`resolves the original target before applying the move: ${label}`, () => {
            const from = file('src/old/View.mjs'),
                sibling = file('src/old/Sibling.mjs'),
                result = rewriteModule({
                    code: 'import Sibling from "./Sibling.mjs";',
                    from, to: file(importer),
                    mapPath: value => value === sibling ? file(target) : value
                });

            expect(result.code).toBe(`import Sibling from "${expected}";`);
            expect(result.unresolved).toEqual([])
        })
    });

    test('preserves URL search and fragment while mapping decoded paths', () => {
        const from = file('src/old/View.mjs'),
            seen = [],
            result = rewriteModule({
                code: 'import Value from "./Foo%20Bar.mjs?version=1#main";',
                from, to: from,
                mapPath: target => {
                    seen.push(target);
                    return file('src/shared/Renamed File.mjs')
                }
            });

        expect(seen).toEqual([file('src/old/Foo Bar.mjs')]);
        expect(result.code).toBe('import Value from "../shared/Renamed%20File.mjs?version=1#main";')
    });

    test('decodes escaped literals but preserves bytes outside the edited source range', () => {
        const from = file('src/old/View.mjs'),
            code = String.raw`/* before */ import  { value as renamed }  from '\x2e/Sibling\u002emjs' /* after */;
const untouched = '\x2e/Sibling\u002emjs';`,
            result = rewriteModule({
                code, from, to: from,
                mapPath: target => target === file('src/old/Sibling.mjs') ? file('src/new/Other.mjs') : target
            }),
            reference = result.references[0];

        expect(result.references).toHaveLength(1);
        expect(reference.specifier).toBe('./Sibling.mjs');
        expect(code.slice(reference.start, reference.end)).toBe(String.raw`'\x2e/Sibling\u002emjs'`);
        expect(result.code).toBe(code.slice(0, reference.start) + '"../new/Other.mjs"' + code.slice(reference.end))
    });

    test('does not reinterpret a quoted interpolation marker or non-relative specifier', () => {
        const from = file('src/old/View.mjs'),
            code = [
                'import pkg from "some-package";',
                'export * from "https://example.test/module.mjs";',
                'import "/root/module.mjs";',
                'import "#alias";',
                'const literal = import("./${name}.mjs");'
            ].join('\n'),
            seen = [],
            result = rewriteModule({
                code, from, to: from,
                mapPath: target => { seen.push(target); return target }
            });

        expect(result.code).toBe(code);
        expect(result.unresolved).toEqual([]);
        expect(seen).toEqual([file('src/old/${name}.mjs')])
    });

    test('reports computed import expression ranges and conservative directory prefixes without editing them', () => {
        const expressions = [
                ['`./parts/${kind === "x" ? `nested-${name}` : other}.mjs`', './parts/'],
                ['"../features/" + name + ".mjs"', '../features/'],
                ['`./prefix-${name}.mjs`', './'],
                ['modulePath', null],
                ['pick("./parts/", name)', null],
                ['`https://example.test/${name}.mjs`', null]
            ],
            code = expressions.map(([expression]) => `await import(${expression});`).join('\n'),
            result = rewriteModule({
                code, from: file('src/old/View.mjs'), to: file('src/new/deep/View.mjs'),
                mapPath: target => target
            });

        expect(result.code).toBe(code);
        expect(result.references).toEqual([]);
        expect(result.unresolved.map(({start, end, prefix}) => [code.slice(start, end), prefix])).toEqual(expressions)
    });

    test('retargets canonical names and executable namespace references without changing public identities or prose', () => {
        const from = file('src/old/Widget.mjs'),
            code   = [
                '/**',
                ' * @class Neo.old.Widget',
                " * @member {String} className='Neo.old.Widget'",
                ' * Mentions Neo.old.Widget in ordinary prose.',
                ' */',
                'class Widget extends Base {',
                '    static config = {',
                '        className: "Neo.old.Widget",',
                '        ntype: "old-widget",',
                '        cls: "neo-old-widget",',
                '        text: "Neo.old.Widget"',
                '    };',
                '}',
                'const direct = Neo.old.Widget;',
                'const method = Neo.old.Widget.someMethod();',
                'const different = Neo.old.WidgetFactory;',
                'const instance = Neo.create("Neo.old.Widget", {text: "Neo.old.Widget"});',
                'const unrelated = Other.create("Neo.old.Widget");',
                '// Neo.old.Widget stays in this comment.'
            ].join('\n'),
            result = rewriteModule({
                code, from, to: file('src/new/Card.mjs'), mapPath: target => target,
                classNames: new Map([['Neo.old.Widget', 'Neo.new.Card']])
            });

        expect(result.code).toBe(code
            .replace('@class Neo.old.Widget', '@class Neo.new.Card')
            .replace("className='Neo.old.Widget'", "className='Neo.new.Card'")
            .replace('className: "Neo.old.Widget"', 'className: "Neo.new.Card"')
            .replace('const direct = Neo.old.Widget;', 'const direct = Neo.new.Card;')
            .replace('Neo.old.Widget.someMethod()', 'Neo.new.Card.someMethod()')
            .replace('Neo.create("Neo.old.Widget",', 'Neo.create("Neo.new.Card",'));
        expect(moduleClassNames(result.code)).toEqual(['Neo.new.Card'])
    });

    test('does not rewrite member access or create calls through a parameter named Neo', () => {
        const code = `function localFactory(Neo) {
    return [Neo.old.Widget, Neo.create("Neo.old.Widget")];
}`,
            from = file('src/consumer.mjs'),
            result = rewriteModule({
                code, from, to: from, mapPath: target => target,
                classNames: new Map([['Neo.old.Widget', 'Neo.new.Card']])
            });

        expect(result.code).toBe(code);
        expect(result.unresolved.map(({start, end}) => code.slice(start, end)))
            .toEqual(['Neo.old.Widget', '"Neo.old.Widget"']);
        expect(result.unresolved.every(reference => reference.prefix === null)).toBe(true)
    });

    [
        ['source root', 'function localFactory(Shop) { return Shop.view.Widget; }'],
        ['destination root', 'const Admin = {}; const Widget = Shop.view.Widget;']
    ].forEach(([label, code]) => {
        test(`refuses an executable namespace reference with a local ${label}`, () => {
            const from = file('apps/consumer.mjs'),
                result = rewriteModule({
                    code, from, to: from, mapPath: target => target,
                    classNames: new Map([['Shop.view.Widget', 'Admin.view.Card']])
                });

            expect(result.code).toBe(code);
            expect(result.unresolved).toHaveLength(1);
            const {start, end, prefix} = result.unresolved[0];
            expect(code.slice(start, end)).toBe('Shop.view.Widget');
            expect(prefix).toBeNull()
        })
    });

    test('supports namespace references through the genuine default Neo import', () => {
        const code = `import Neo from '../src/Neo.mjs';
const Widget = Neo.old.Widget;
const instance = Neo.create("Neo.old.Widget");`,
            from = file('apps/consumer.mjs'),
            result = rewriteModule({
                code, from, to: from, mapPath: target => target,
                classNames: new Map([['Neo.old.Widget', 'Neo.new.Card']])
            });

        expect(result.code).toBe(code.replaceAll('Neo.old.Widget', 'Neo.new.Card'));
        expect(result.unresolved).toEqual([])
    });

    test('extracts only direct literal class names from static class config objects', () => {
        const code = String.raw`
const unrelated = {className: 'Not.AClass'};
class First {
    static config = {className: 'Neo.old.First', items: [{className: 'Not.ADeclaration'}]};
}
class Second {
    static config = {"className": "App.view.Sec\u006fnd"};
}
class InstanceConfig { config = {className: 'Not.Static'}; }
class ComputedKey { static config = {[key]: 'Not.Known'}; }
class ComputedValue { static config = {className: namespace + '.Unknown'}; }
class OtherField { static options = {className: 'Not.Config'}; }
// class Comment { static config = {className: 'Not.Source'}; }
const text = "class Text { static config = {className: 'Not.Code'}; }";`;

        expect(moduleClassNames(code)).toEqual(['Neo.old.First', 'App.view.Second'])
    })
});
