import {test, expect}              from '@playwright/test';
import {execFileSync, spawnSync}   from 'node:child_process';
import {createHash}                from 'node:crypto';
import fs                          from 'node:fs';
import os                          from 'node:os';
import path                        from 'node:path';
import {fileURLToPath}             from 'node:url';
import {compile}                   from 'sass';
import postcss                     from 'postcss';
import {generateTheme, listThemes} from '../../../../buildScripts/create/theme.mjs';

const repoRoot      = fileURLToPath(new URL('../../../../', import.meta.url)),
      createPath    = path.join(repoRoot, 'buildScripts/create/theme.mjs'),
      buildPath     = path.join(repoRoot, 'buildScripts/build/themes.mjs'),
      shippedThemes = fs.readdirSync(path.join(repoRoot, 'resources/scss'), {withFileTypes: true})
          .filter(entry => entry.isDirectory() && entry.name.startsWith('theme-'))
          .map(entry => entry.name).sort();

test.describe('buildScripts/create/theme.mjs consumer workspace scaffolding', () => {
    let root, engineRoot, scssRoot;

    const write = (file, value) => {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, value);
    };

    const read = file => fs.readFileSync(file, 'utf8');

    const cssShape = (css, from, to) => {
        const ast = postcss.parse(css);

        if (from) {
            ast.walkRules(rule => {
                rule.selector = rule.selector.replace(/\.[a-zA-Z_][\w-]*/g, token => token === `.${from}` ? `.${to}` : token);
            });
        }

        const project = node => {
            const value = {type: node.type};

            for (const key of ['selector', 'name', 'params', 'prop', 'value', 'important']) {
                if (node[key] !== undefined) value[key] = node[key];
            }

            if (node.nodes) value.nodes = node.nodes.filter(child => child.type !== 'comment').map(project);
            return value;
        };

        return project(ast);
    };

    const snapshot = dir => {
        const entries = [];

        const visit = folder => {
            for (const name of fs.readdirSync(folder).sort()) {
                const file = path.join(folder, name),
                      stat = fs.lstatSync(file),
                      rel  = path.relative(dir, file);

                if (stat.isSymbolicLink()) {
                    entries.push([rel, 'link', fs.readlinkSync(file)]);
                } else if (stat.isDirectory()) {
                    entries.push([rel, 'directory']);
                    visit(file);
                } else {
                    entries.push([rel, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
                }
            }
        };

        visit(dir);
        return entries;
    };

    const generate = (options={}) => generateTheme({
        cwd      : root,
        baseTheme: 'theme-neo-dark',
        themeName: 'theme-acme',
        ...options
    });

    const refuseWithoutWrites = options => {
        const before = snapshot(root);

        expect(() => generate(options)).toThrow();
        expect(snapshot(root)).toEqual(before);
    };

    test.beforeEach(() => {
        root       = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'neo-create-theme-'));
        engineRoot = path.join(root, 'node_modules/neo.mjs');
        scssRoot   = path.join(root, 'resources/scss');

        write(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-consumer-fixture',
            version     : '1.0.0',
            dependencies: {'neo.mjs': '1.0.0'}
        }));
        fs.mkdirSync(engineRoot, {recursive: true});
        fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(engineRoot, 'package.json'));

        // Physical npm layout: Sass must resolve from the consumer's actual package, not a symlink.
        for (const theme of ['theme-neo-dark', 'theme-light']) {
            fs.cpSync(path.join(repoRoot, 'resources/scss', theme), path.join(engineRoot, 'resources/scss', theme), {recursive: true});
        }

        fs.copyFileSync(path.join(repoRoot, 'resources/scss/_motion.scss'), path.join(engineRoot, 'resources/scss/_motion.scss'));
        fs.mkdirSync(path.join(engineRoot, 'resources/scss/src/button'), {recursive: true});
        fs.copyFileSync(path.join(repoRoot, 'resources/scss/src/button/Base.scss'), path.join(engineRoot, 'resources/scss/src/button/Base.scss'));
    });

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('snapshots every base file and internal partial, preserves selector weight, and leaves the base unchanged', () => {
        const base   = path.join(engineRoot, 'resources/scss/theme-neo-dark'),
              before = snapshot(base);

        generate();

        const target = path.join(scssRoot, 'theme-acme'),
              after  = snapshot(target);

        expect(after.map(([file]) => file)).toEqual(before.map(([file]) => file));
        expect(read(path.join(target, 'Global.scss'))).toContain(':where(.neo-theme-acme)');
        expect(read(path.join(target, 'button/Base.scss'))).toContain(':where(.neo-theme-acme)');
        expect(read(path.join(target, 'design-tokens/_all.scss'))).toContain('@use "Core"');
        expect(snapshot(base)).toEqual(before);
        expect(fs.existsSync(path.join(scssRoot, '_motion.scss'))).toBe(false);
    });

    test('the noninteractive CLI produces a theme that the real consumer builder compiles and maps', () => {
        test.setTimeout(60_000);

        execFileSync(process.execPath, [createPath, '--name', 'theme-acme', '--base', 'theme-neo-dark', '--noquestions'], {
            cwd: root, encoding: 'utf8', stdio: 'pipe'
        });
        execFileSync(process.execPath, [buildPath, '-n', '-e', 'dev', '-t', 'theme-acme'], {
            cwd: root, encoding: 'utf8', stdio: 'pipe'
        });

        const cssRoot = path.join(root, 'dist/development/css/theme-acme'),
              global  = read(path.join(cssRoot, 'Global.css')),
              button  = read(path.join(cssRoot, 'button/Base.css')),
              map     = JSON.parse(read(path.join(root, 'resources/theme-map.json')));

        expect(global).toContain(':where(.neo-theme-acme)');
        expect(global).toContain('--motion-fast: 120ms');
        expect(global).toContain('--neo-color-scheme: dark');
        expect(global).toContain('--core-fontfamily-sans:');
        expect(global).not.toContain('.neo-theme-neo-dark');
        expect(button).toContain(':where(.neo-theme-acme)');
        expect(button).toContain('--button-background-color:');
        expect(button).not.toContain('.neo-theme-neo-dark');
        expect(map.Neo.Global).toContain('theme-acme');
        expect(map.Neo.button.Base).toEqual(expect.arrayContaining(['src', 'theme-acme']));
        expect(JSON.parse(read(path.join(root, 'dist/development/resources/theme-map.json')))).toEqual(map);
        expect(fs.existsSync(path.join(scssRoot, '_motion.scss'))).toBe(false);
    });

    for (const baseTheme of shippedThemes) {
        test(`every ${baseTheme} entry compiles with only the exact theme class retargeted`, () => {
            test.setTimeout(60_000);

            const base = path.join(engineRoot, 'resources/scss', baseTheme);
            fs.cpSync(path.join(repoRoot, 'resources/scss', baseTheme), base, {recursive: true});
            generate({baseTheme});

            const target  = path.join(scssRoot, 'theme-acme'),
                  entries = folder => snapshot(folder).map(([file]) => file)
                      .filter(file => file.endsWith('.scss') && !path.basename(file).startsWith('_')),
                  originals = entries(base);

            expect(originals.length).toBeGreaterThan(0);
            expect(entries(target)).toEqual(originals);

            for (const entry of originals) {
                const originalCss  = compile(path.join(base, entry)).css,
                      generatedCss = compile(path.join(target, entry)).css;

                expect(cssShape(generatedCss), `${baseTheme}/${entry}`).toEqual(
                    cssShape(originalCss, `neo-${baseTheme}`, 'neo-theme-acme')
                );
            }
        });
    }

    test('lists installed, declaring-package and workspace themes once, without admitting unrelated packages', () => {
        for (const theme of shippedThemes) {
            fs.cpSync(path.join(repoRoot, 'resources/scss', theme), path.join(engineRoot, 'resources/scss', theme), {recursive: true});
        }

        write(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-consumer-fixture',
            version     : '1.0.0',
            dependencies: {'neo.mjs': '1.0.0', '@fixture/skin': '1.0.0', 'plain-skin': '1.0.0'}
        }));
        write(path.join(root, 'node_modules/@fixture/skin/package.json'), JSON.stringify({name: '@fixture/skin', neo: {scss: 'skin'}}));
        write(path.join(root, 'node_modules/@fixture/skin/skin/theme-package/Global.scss'), ':root { --fixture: package; }');
        write(path.join(scssRoot, 'theme-workspace/Global.scss'), ':root { --fixture: workspace; }');
        write(path.join(scssRoot, 'theme-neo-dark/Global.scss'), ':root { --fixture: duplicate; }');
        write(path.join(scssRoot, 'theme-fake'), 'not a folder');

        for (const name of ['plain-skin', 'unlisted-skin']) {
            const pkg = path.join(root, 'node_modules', name);
            write(path.join(pkg, 'package.json'), JSON.stringify({name, ...(name === 'unlisted-skin' ? {neo: {scss: 'skin'}} : {})}));
            write(path.join(pkg, 'skin/theme-ignored/Global.scss'), ':root { --fixture: ignored; }');
        }

        expect(listThemes(root)).toEqual([...new Set([...shippedThemes, 'theme-package', 'theme-workspace'])].sort());
    });

    test('noninteractive CLI requires both flags and refuses incomplete input without writes or a prompt', () => {
        const before = snapshot(root);

        for (const args of [[], ['--name', 'theme-acme'], ['--base', 'theme-neo-dark']]) {
            const result = spawnSync(process.execPath, [createPath, '--noquestions', ...args], {
                cwd: root, encoding: 'utf8', timeout: 5000
            });

            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status).toBeGreaterThan(0);
            expect(snapshot(root)).toEqual(before);
        }
    });

    test('declared packages extend the base and sparse workspace files win without dropping engine files', () => {
        const packageRoot = path.join(root, 'node_modules/@fixture/skin'),
              packageCss  = path.join(packageRoot, 'skin'),
              button      = read(path.join(engineRoot, 'resources/scss/theme-neo-dark/button/Base.scss'));

        write(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-consumer-fixture',
            version     : '1.0.0',
            dependencies: {'neo.mjs': '1.0.0', '@fixture/skin': '1.0.0', 'plain-skin': '1.0.0'}
        }));
        write(path.join(packageRoot, 'package.json'), JSON.stringify({name: '@fixture/skin', neo: {scss: 'skin'}}));
        write(path.join(packageCss, 'theme-neo-dark/button/Base.scss'), button + '\n:where(.neo-theme-neo-dark) { --fixture-layer: package; }\n');
        write(path.join(packageCss, 'theme-neo-dark/apps/fixture/Widget.scss'), ':where(.neo-theme-neo-dark) { --fixture-widget: package; }\n');
        write(path.join(scssRoot, 'theme-neo-dark/button/Base.scss'), button + '\n:where(.neo-theme-neo-dark) { --fixture-layer: workspace; }\n');

        for (const name of ['plain-skin', 'unlisted-skin']) {
            const pkg = path.join(root, 'node_modules', name);
            write(path.join(pkg, 'package.json'), JSON.stringify({name, ...(name === 'unlisted-skin' ? {neo: {scss: 'skin'}} : {})}));
            write(path.join(pkg, 'skin/theme-neo-dark/Ignored.scss'), ':where(.neo-theme-neo-dark) { --ignored: true; }\n');
        }

        generate();

        const target = path.join(scssRoot, 'theme-acme');

        expect(read(path.join(target, 'button/Base.scss'))).toContain('--fixture-layer: workspace');
        expect(read(path.join(target, 'button/Base.scss'))).not.toContain('--fixture-layer: package');
        expect(read(path.join(target, 'apps/fixture/Widget.scss'))).toContain(':where(.neo-theme-acme)');
        expect(fs.existsSync(path.join(target, 'Global.scss'))).toBe(true);
        expect(fs.existsSync(path.join(target, 'design-tokens/_all.scss'))).toBe(true);
        expect(fs.existsSync(path.join(target, 'Ignored.scss'))).toBe(false);
    });

    test('rebases external Sass directives while retaining internal imports and exact selector boundaries', () => {
        const sourceRoot = path.join(engineRoot, 'resources/scss'),
              base       = path.join(sourceRoot, 'theme-directives');

        write(path.join(sourceRoot, '_used.scss'), '$value: red;\n');
        write(path.join(sourceRoot, '_forwarded.scss'), '.shared-forwarded { color: teal; }\n');
        write(path.join(sourceRoot, '_imported.scss'), '$imported: blue;\n');
        write(path.join(base, 'Global.scss'), ':root .neo-theme-directives { --fixture-global: true; }\n');
        write(path.join(base, '_inside.scss'), '@mixin values { --from-inside: green; }\n');
        write(path.join(base, 'Base.scss'), [
            '@use "../used" as used;',
            '@use "./inside" as inside;',
            '@forward "../forwarded";',
            '@import "../imported";',
            ':root .neo-theme-directives { --from-used: #{used.$value}; --from-imported: #{$imported}; @include inside.values; }',
            '.neo-theme-directives-extra { --unrelated-selector: retained; }'
        ].join('\n'));

        generate({baseTheme: 'theme-directives'});

        const target = path.join(scssRoot, 'theme-acme/Base.scss'),
              css    = compile(target).css;

        expect(css).toContain(':root .neo-theme-acme');
        expect(css).toContain('--from-used: red');
        expect(css).toContain('--from-imported: blue');
        expect(css).toContain('--from-inside: green');
        expect(css).toContain('.shared-forwarded');
        expect(css).toContain('.neo-theme-directives-extra');
        expect(css).not.toContain('.neo-theme-acme-extra');
        expect(read(target)).toContain('@use "./inside"');
        expect(fs.existsSync(path.join(scssRoot, 'theme-acme/_used.scss'))).toBe(false);
    });

    test('rebases every URL in a multi-import whose dependencies exist only in the installed package', () => {
        const sourceRoot = path.join(engineRoot, 'resources/scss'),
              base       = path.join(sourceRoot, 'theme-multiimport');

        write(path.join(sourceRoot, '_first.scss'), '$first: red;\n');
        write(path.join(sourceRoot, '_second.scss'), '$second: blue;\n');
        write(path.join(base, 'Global.scss'), [
            '@import "../first",',
            "        '../second';",
            ':where(.neo-theme-multiimport) { --first: #{$first}; --second: #{$second}; }'
        ].join('\n'));

        generate({baseTheme: 'theme-multiimport'});

        const css = compile(path.join(scssRoot, 'theme-acme/Global.scss')).css;

        expect(css).toContain(':where(.neo-theme-acme)');
        expect(css).toContain('--first: red');
        expect(css).toContain('--second: blue');
        expect(fs.existsSync(path.join(scssRoot, '_first.scss'))).toBe(false);
        expect(fs.existsSync(path.join(scssRoot, '_second.scss'))).toBe(false);
    });

    test('renames selector classes without changing class-looking literals, assets or Sass selector syntax', () => {
        const base      = path.join(engineRoot, 'resources/scss/theme-literals'),
              assetName = 'icon.neo-theme-literals.svg',
              asset     = '<svg xmlns="http://www.w3.org/2000/svg"><title>.neo-theme-literals</title></svg>';

        write(path.join(base, assetName), asset);
        write(path.join(base, 'Global.scss'), [
            "$part: 'glyph';",
            ':where(.neo-theme-literals) {',
            '    content: ".neo-theme-literals";',
            '    --quoted-theme: ".neo-theme-literals";',
            '    --raw-theme: .neo-theme-literals;',
            `    background-image: url("./${assetName}");`,
            '    & > .fixture-#{$part} { --nested: true; }',
            '}',
            '.neo-theme-literals[data-theme=".neo-theme-literals"] { outline: 0; }',
            '.scope {',
            '    &.neo-theme-literals .fixture-#{$part} { --interpolated: true; }',
            '}'
        ].join('\n'));

        generate({baseTheme: 'theme-literals'});

        const target       = path.join(scssRoot, 'theme-acme'),
              css          = compile(path.join(target, 'Global.scss')).css,
              declarations = new Map();

        postcss.parse(css).walkDecls(declaration => declarations.set(declaration.prop, declaration.value));

        expect(css).toContain(':where(.neo-theme-acme) > .fixture-glyph');
        expect(css).toContain('.scope.neo-theme-acme .fixture-glyph');
        expect(css).toContain('.neo-theme-acme[data-theme=".neo-theme-literals"]');
        expect(css).not.toContain('[data-theme=".neo-theme-acme"]');
        expect(declarations.get('content')).toBe('".neo-theme-literals"');
        expect(declarations.get('--quoted-theme')).toBe('".neo-theme-literals"');
        expect(declarations.get('--raw-theme')).toBe('.neo-theme-literals');
        expect(declarations.get('background-image')).toContain(`./${assetName}`);
        expect(read(path.join(target, assetName))).toBe(asset);
        expect(fs.existsSync(path.join(target, 'icon.neo-theme-acme.svg'))).toBe(false);
    });

    test('rejects invalid base and destination names before writing', () => {
        for (const themeName of ['../escape', 'neo-theme-acme', 'theme-', 'theme-acme/nested', 'theme-acme space']) {
            refuseWithoutWrites({themeName});
        }

        refuseWithoutWrites({baseTheme: '../theme-neo-dark'});
    });

    test('refuses missing bases and self-extension without materializing a destination', () => {
        refuseWithoutWrites({baseTheme: 'theme-missing'});
        refuseWithoutWrites({themeName: 'theme-neo-dark'});
    });

    test('refuses existing local and installed destinations without overwriting either', () => {
        write(path.join(scssRoot, 'theme-acme/keep.txt'), 'caller-owned');

        refuseWithoutWrites({});
        refuseWithoutWrites({themeName: 'theme-light'});
    });

    test('rejects a symlink within a base tree before copying any files', () => {
        const secret = path.join(root, 'outside.scss');

        write(secret, ':root { --outside: untouched; }\n');
        fs.symlinkSync(secret, path.join(engineRoot, 'resources/scss/theme-neo-dark/_linked.scss'));

        refuseWithoutWrites({});
    });

    test('rejects symlink destination ancestry without writing through it', () => {
        const outside = path.join(root, 'outside-scss');

        fs.mkdirSync(outside);
        fs.mkdirSync(path.dirname(scssRoot), {recursive: true});
        fs.symlinkSync(outside, scssRoot, 'dir');

        refuseWithoutWrites({});
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    test('also generates from an engine checkout without an installed neo package', () => {
        fs.cpSync(path.join(engineRoot, 'resources/scss'), scssRoot, {recursive: true});
        fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(root, 'package.json'));
        fs.rmSync(path.join(root, 'node_modules'), {recursive: true});

        generate({baseTheme: 'theme-light'});

        const target = path.join(scssRoot, 'theme-acme');

        expect(read(path.join(target, 'button/Base.scss'))).toContain(':root .neo-theme-acme');
        expect(compile(path.join(target, 'Global.scss')).css).toContain('--motion-fast: 120ms');
    });
});
