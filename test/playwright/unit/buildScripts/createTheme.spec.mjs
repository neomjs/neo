import {test, expect}              from '@playwright/test';
import {execFileSync, spawnSync}   from 'node:child_process';
import {createHash}                from 'node:crypto';
import fs                          from 'node:fs';
import os                          from 'node:os';
import path                        from 'node:path';
import {fileURLToPath}             from 'node:url';
import postcss                     from 'postcss';
import {generateTheme, listThemes} from '../../../../buildScripts/create/theme.mjs';
import {extractThemeClasses}       from '../../../../buildScripts/util/themeCss.mjs';

const repoRoot      = fileURLToPath(new URL('../../../../', import.meta.url)),
      createPath    = path.join(repoRoot, 'buildScripts/create/theme.mjs'),
      buildPath     = path.join(repoRoot, 'buildScripts/build/themes.mjs'),
      // A theme is a folder whose Global.css declares a theme class, so theme-base is none
      shippedThemes = fs.readdirSync(path.join(repoRoot, 'resources/css'), {withFileTypes: true})
          .filter(entry => entry.isDirectory() && entry.name.startsWith('theme-') && fs.existsSync(path.join(repoRoot, 'resources/css', entry.name, 'Global.css')))
          .map(entry => entry.name).sort();

test.describe('buildScripts/create/theme.mjs consumer workspace scaffolding', () => {
    let root, engineRoot, cssRoot;

    const write = (file, value) => {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, value);
    };

    const read = file => fs.readFileSync(file, 'utf8');

    const cssShape = (css, retarget) => {
        const ast = postcss.parse(css);

        if (retarget) {
            ast.walkRules(rule => {
                rule.selector = rule.selector.replace(/\.[a-zA-Z_][\w-]*/g, token => retarget.has(token.slice(1)) ? `.${retarget.get(token.slice(1))}` : token);
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
        cssRoot    = path.join(root, 'resources/css');

        write(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-consumer-fixture',
            version     : '1.0.0',
            dependencies: {'neo.mjs': '1.0.0'}
        }));
        fs.mkdirSync(engineRoot, {recursive: true});
        fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(engineRoot, 'package.json'));

        // Physical npm layout: the build must resolve from the consumer's actual package, not a symlink.
        for (const theme of ['theme-neo-dark', 'theme-light']) {
            fs.cpSync(path.join(repoRoot, 'resources/css', theme), path.join(engineRoot, 'resources/css', theme), {recursive: true});
        }

        // The base's widget sheet is planted, so the generator's contract does not follow which packages moved to theme-base
        write(path.join(engineRoot, 'resources/css/theme-neo-dark/button/Base.css'), ':where(.neo-theme-neo-dark) {\n    --neo-button-background-color: #000;\n}\n');

        for (const sheet of ['Global.css', 'button/Base.css']) {
            fs.mkdirSync(path.dirname(path.join(engineRoot, 'resources/css/src', sheet)), {recursive: true});
            fs.copyFileSync(path.join(repoRoot, 'resources/css/src', sheet), path.join(engineRoot, 'resources/css/src', sheet));
        }
    });

    test.afterEach(() => {
        fs.rmSync(root, {recursive: true, force: true});
    });

    test('snapshots every base file, preserves selector weight, and leaves the base unchanged', () => {
        const base   = path.join(engineRoot, 'resources/css/theme-neo-dark'),
              before = snapshot(base);

        generate();

        const target = path.join(cssRoot, 'theme-acme'),
              after  = snapshot(target);

        expect(after.map(([file]) => file)).toEqual(before.map(([file]) => file));
        expect(read(path.join(target, 'Global.css'))).toContain(':where(.neo-theme-acme)');
        expect(read(path.join(target, 'Global.css'))).toMatch(/--neo-core-fontfamily-sans\s*:/);
        expect(read(path.join(target, 'Global.css'))).toMatch(/--neo-duration-fast\s*:\s*120ms/);
        expect(read(path.join(target, 'button/Base.css'))).toContain(':where(.neo-theme-acme)');
        expect(snapshot(base)).toEqual(before);
    });

    test('the noninteractive CLI produces a theme that the real consumer builder builds and maps', () => {
        test.setTimeout(60_000);

        execFileSync(process.execPath, [createPath, '--name', 'theme-acme', '--base', 'theme-neo-dark', '--noquestions'], {
            cwd: root, encoding: 'utf8', stdio: 'pipe'
        });
        execFileSync(process.execPath, [buildPath, '-n', '-e', 'dev', '-t', 'theme-acme'], {
            cwd: root, encoding: 'utf8', stdio: 'pipe'
        });

        const distRoot   = path.join(root, 'dist/development/css'),
              global     = read(path.join(distRoot, 'theme-acme/Global.css')),
              button     = read(path.join(distRoot, 'theme-acme/button/Base.css')),
              structural = read(path.join(distRoot, 'src/Global.css')),
              map        = JSON.parse(read(path.join(root, 'resources/theme-map.json')));

        expect(global).toContain(':where(.neo-theme-acme)');
        expect(global).toMatch(/--neo-color-scheme\s*:\s*dark/);
        expect(global).toMatch(/--neo-core-fontfamily-sans\s*:/);
        expect(global).not.toContain('.neo-theme-neo-dark');
        expect(global).toMatch(/--neo-duration-fast\s*:\s*120ms/);
        expect(structural).toMatch(/--neo-duration-fast\s*:\s*0ms/);
        expect(structural).not.toMatch(/--neo-duration-fast\s*:\s*120ms/);
        expect(button).toContain(':where(.neo-theme-acme)');
        expect(button).toMatch(/--neo-button-background-color\s*:/);
        expect(button).not.toContain('.neo-theme-neo-dark');
        expect(map.Neo.Global).toContain('theme-acme');
        expect(map.Neo.button.Base).toEqual(expect.arrayContaining(['src', 'theme-acme']));
        expect(JSON.parse(read(path.join(root, 'dist/development/resources/theme-map.json')))).toEqual(map);
    });

    test('the installed generator resolves its build tools inside the installed Engine', () => {
        const installedPath = path.join(engineRoot, 'buildScripts/create/theme.mjs'),
              lock          = JSON.parse(read(path.join(repoRoot, 'package-lock.json'))),
              manifest      = JSON.parse(read(path.join(engineRoot, 'package.json'))),
              parsers       = ['postcss', 'postcss-selector-parser'],
              packages      = new Set(parsers);

        expect(manifest.dependencies).toBeUndefined();
        for (const name of parsers) expect(manifest.devDependencies[name]).toBeTruthy();

        // The generator and the modules it imports, as the installed Engine ships them
        for (const relative of [
            'buildScripts/create/theme.mjs',
            'buildScripts/util/themeCss.mjs',
            'buildScripts/util/themeCssRoots.mjs',
            'buildScripts/util/declaredPackageRoots.mjs'
        ]) {
            fs.mkdirSync(path.dirname(path.join(engineRoot, relative)), {recursive: true});
            fs.copyFileSync(path.join(repoRoot, relative), path.join(engineRoot, relative));
        }

        // The scaffolder installs Engine development tools in this nested package. Keep the
        // fixture physical and limited to the parsers' graph so repository resolution cannot help.
        for (const name of packages) {
            const relative = `node_modules/${name}`,
                  metadata = lock.packages[relative];

            for (const dependency of Object.keys({...metadata.dependencies, ...metadata.peerDependencies})) {
                if (!metadata.peerDependenciesMeta?.[dependency]?.optional) packages.add(dependency);
            }

            const source = path.join(repoRoot, relative);

            fs.cpSync(source, path.join(engineRoot, relative), {
                recursive  : true,
                dereference: true,
                filter     : file => !path.relative(source, file).split(path.sep).includes('node_modules')
            });
        }

        expect(snapshot(root).some(([, kind]) => kind === 'link')).toBe(false);

        execFileSync(process.execPath, [installedPath, '--name', 'theme-acme', '--base', 'theme-neo-dark', '--noquestions'], {
            cwd: root, encoding: 'utf8', stdio: 'pipe'
        });

        expect(read(path.join(cssRoot, 'theme-acme/Global.css'))).toContain(':where(.neo-theme-acme)');
        expect(read(path.join(cssRoot, 'theme-acme/button/Base.css'))).toContain(':where(.neo-theme-acme)');
    });

    for (const baseTheme of shippedThemes) {
        test(`every ${baseTheme} sheet keeps its shape with only its theme classes retargeted`, () => {
            const base = path.join(engineRoot, 'resources/css', baseTheme);
            fs.cpSync(path.join(repoRoot, 'resources/css', baseTheme), base, {recursive: true});
            generate({baseTheme});

            const target    = path.join(cssRoot, 'theme-acme'),
                  entries   = folder => snapshot(folder).map(([file]) => file).filter(file => file.endsWith('.css')),
                  originals = entries(base),
                  // One class becomes the new theme's class; a folder that declares a light and a dark class keeps each scheme suffix
                  classes   = extractThemeClasses(read(path.join(base, 'Global.css'))),
                  retarget  = new Map(classes.map(name => [
                      name,
                      classes.length === 1 ? 'neo-theme-acme' : `neo-theme-acme-${name.match(/(light|dark)$/)[1]}`
                  ]));

            expect(originals.length).toBeGreaterThan(0);
            expect(classes.length).toBeGreaterThan(0);
            expect(entries(target)).toEqual(originals);

            const motionRoles = new Set([
                '--neo-duration-fast', '--neo-duration-base', '--neo-duration-panel', '--neo-duration-stage',
                '--neo-duration-stagger', '--neo-ease-out', '--neo-ease-in'
            ]);
            const declarations = postcss.parse(read(path.join(target, 'Global.css')));

            for (const name of retarget.values()) {
                const declared = new Set();
                declarations.walkRules(rule => {
                    if (rule.selector.includes(`.${name}`)) {
                        rule.each(node => {
                            if (node.type === 'decl' && motionRoles.has(node.prop)) declared.add(node.prop);
                        });
                    }
                });
                expect(declared, `${baseTheme}: ${name} motion roles`).toEqual(motionRoles);
            }

            for (const entry of originals) {
                expect(cssShape(read(path.join(target, entry))), `${baseTheme}/${entry}`).toEqual(
                    cssShape(read(path.join(base, entry)), retarget)
                );
            }
        });
    }

    // A consumer whose name merely contains `neo.mjs` is still a consumer: only the exact name marks the Engine
    for (const consumer of ['theme-consumer-fixture', 'neo.mjs-demo']) {
        test(`lists installed, declaring-package and workspace themes once for ${consumer}, without admitting unrelated packages`, () => {
            for (const theme of shippedThemes) {
                fs.cpSync(path.join(repoRoot, 'resources/css', theme), path.join(engineRoot, 'resources/css', theme), {recursive: true});
            }

            write(path.join(root, 'package.json'), JSON.stringify({
                name        : consumer,
                version     : '1.0.0',
                dependencies: {'neo.mjs': '1.0.0', '@fixture/skin': '1.0.0', 'plain-skin': '1.0.0'}
            }));
            write(path.join(root, 'node_modules/@fixture/skin/package.json'), JSON.stringify({name: '@fixture/skin', neo: {css: 'skin'}}));
            write(path.join(root, 'node_modules/@fixture/skin/skin/theme-package/Global.css'), ':root .neo-theme-package { --fixture: package; }');
            write(path.join(cssRoot, 'theme-workspace/Global.css'), ':root .neo-theme-workspace { --fixture: workspace; }');
            write(path.join(cssRoot, 'theme-neo-dark/Global.css'), ':where(.neo-theme-neo-dark) { --fixture: duplicate; }');
            write(path.join(cssRoot, 'theme-base/button/Base.css'), '[class*="neo-theme-"] { --fixture: shared; }');
            write(path.join(cssRoot, 'theme-unmapped/Global.css'), ':root { --fixture: no-theme-class; }');
            write(path.join(cssRoot, 'theme-fake'), 'not a folder');

            for (const name of ['plain-skin', 'unlisted-skin']) {
                const pkg = path.join(root, 'node_modules', name);
                write(path.join(pkg, 'package.json'), JSON.stringify({name, ...(name === 'unlisted-skin' ? {neo: {css: 'skin'}} : {})}));
                write(path.join(pkg, 'skin/theme-ignored/Global.css'), ':root .neo-theme-ignored { --fixture: ignored; }');
            }

            expect(listThemes(root)).toEqual([...new Set([...shippedThemes, 'theme-package', 'theme-workspace'])].sort());
        });
    }

    test('inside the Engine, named exactly neo.mjs, only its own themes are listed', () => {
        write(path.join(root, 'package.json'), JSON.stringify({name: 'neo.mjs', version: '1.0.0', dependencies: {'@fixture/skin': '1.0.0'}}));
        write(path.join(root, 'node_modules/@fixture/skin/package.json'), JSON.stringify({name: '@fixture/skin', neo: {css: 'skin'}}));
        write(path.join(root, 'node_modules/@fixture/skin/skin/theme-package/Global.css'), ':root .neo-theme-package { --fixture: package; }');
        write(path.join(cssRoot, 'theme-engine/Global.css'), ':root .neo-theme-engine { --fixture: engine; }');
        write(path.join(cssRoot, 'theme-base/button/Base.css'), '[class*="neo-theme-"] { --fixture: base; }');

        expect(listThemes(root)).toEqual(['theme-engine']);
    });

    test('retargets mapped non-theme-* and dual-scheme base folders with one selectable-folder policy and prints the destination\'s actual classes', () => {
        write(path.join(engineRoot, 'resources/css/brand_v2/Global.css'), ':where(.neo-theme-brand) { --brand: 1; }');
        write(path.join(engineRoot, 'resources/css/brand_v2/button/Base.css'), ':where(.neo-theme-brand) { --button-gap: 4px; }');
        write(path.join(engineRoot, 'resources/css/split_widgets/button/Base.css'), ':where(.neo-theme-brand) { --button-pad: 8px; }');
        write(path.join(engineRoot, 'resources/css/shared-neo/Global.css'), [
            '.neo-theme-neo-light { --neo-color-scheme: light; }',
            '.neo-theme-neo-dark  { --neo-color-scheme: dark; }'
        ].join('\n'));
        write(path.join(engineRoot, 'resources/css/theme-base/button/Base.css'), '[class*="neo-theme-"] { --shared: 1; }');
        write(path.join(engineRoot, 'resources/theme-map.json'), JSON.stringify({
            themes: {
                'neo-theme-brand'    : ['brand_v2', 'split_widgets'],
                'neo-theme-neo-dark' : ['shared-neo', 'theme-neo-dark'],
                'neo-theme-neo-light': ['shared-neo']
            }
        }));

        expect(listThemes(root)).toContain('brand_v2');
        expect(listThemes(root)).toContain('shared-neo');
        expect(listThemes(root)).not.toContain('split_widgets');
        expect(listThemes(root)).not.toContain('theme-base');

        refuseWithoutWrites({baseTheme: 'split_widgets'});
        refuseWithoutWrites({baseTheme: 'theme-base'});
        refuseWithoutWrites({themeName: 'theme-base'});

        generate({baseTheme: 'brand_v2', themeName: 'theme-acme'});
        expect(read(path.join(cssRoot, 'theme-acme/Global.css'))).toContain(':where(.neo-theme-acme)');
        expect(read(path.join(cssRoot, 'theme-acme/button/Base.css'))).toContain(':where(.neo-theme-acme)');

        const dualOut = execFileSync(
            process.execPath,
            [createPath, '--name', 'theme-dual', '--base', 'shared-neo', '--noquestions'],
            {cwd: root, encoding: 'utf8', stdio: 'pipe'}
        );

        expect(read(path.join(cssRoot, 'theme-dual/Global.css'))).toContain('.neo-theme-dual-light');
        expect(read(path.join(cssRoot, 'theme-dual/Global.css'))).toContain('.neo-theme-dual-dark');
        expect(dualOut).toContain('"neo-theme-dual-dark"');
        expect(dualOut).toContain('"neo-theme-dual-light"');
        expect(dualOut).not.toContain('"neo-theme-dual"');
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
              button      = read(path.join(engineRoot, 'resources/css/theme-neo-dark/button/Base.css'));

        write(path.join(root, 'package.json'), JSON.stringify({
            name        : 'theme-consumer-fixture',
            version     : '1.0.0',
            dependencies: {'neo.mjs': '1.0.0', '@fixture/skin': '1.0.0', 'plain-skin': '1.0.0'}
        }));
        write(path.join(packageRoot, 'package.json'), JSON.stringify({name: '@fixture/skin', neo: {css: 'skin'}}));
        write(path.join(packageCss, 'theme-neo-dark/button/Base.css'), button + '\n:where(.neo-theme-neo-dark) { --fixture-layer: package; }\n');
        write(path.join(packageCss, 'theme-neo-dark/apps/fixture/Widget.css'), ':where(.neo-theme-neo-dark) { --fixture-widget: package; }\n');
        write(path.join(cssRoot, 'theme-neo-dark/button/Base.css'), button + '\n:where(.neo-theme-neo-dark) { --fixture-layer: workspace; }\n');

        for (const name of ['plain-skin', 'unlisted-skin']) {
            const pkg = path.join(root, 'node_modules', name);
            write(path.join(pkg, 'package.json'), JSON.stringify({name, ...(name === 'unlisted-skin' ? {neo: {css: 'skin'}} : {})}));
            write(path.join(pkg, 'skin/theme-neo-dark/Ignored.css'), ':where(.neo-theme-neo-dark) { --ignored: true; }\n');
        }

        generate();

        const target = path.join(cssRoot, 'theme-acme');

        expect(read(path.join(target, 'button/Base.css'))).toContain('--fixture-layer: workspace');
        expect(read(path.join(target, 'button/Base.css'))).not.toContain('--fixture-layer: package');
        expect(read(path.join(target, 'apps/fixture/Widget.css'))).toContain(':where(.neo-theme-acme)');
        expect(fs.existsSync(path.join(target, 'Global.css'))).toBe(true);
        expect(fs.existsSync(path.join(target, 'Ignored.css'))).toBe(false);
    });

    test('renames selector classes without changing class-looking literals, assets or nesting', () => {
        const base      = path.join(engineRoot, 'resources/css/theme-literals'),
              assetName = 'icon.neo-theme-literals.svg',
              asset     = '<svg xmlns="http://www.w3.org/2000/svg"><title>.neo-theme-literals</title></svg>';

        write(path.join(base, assetName), asset);
        write(path.join(base, 'Global.css'), [
            ':where(.neo-theme-literals) {',
            '    content: ".neo-theme-literals";',
            '    --quoted-theme: ".neo-theme-literals";',
            '    --raw-theme: .neo-theme-literals;',
            `    background-image: url("./${assetName}");`,
            '    & > .fixture-glyph { --nested: true; }',
            '}',
            '.neo-theme-literals[data-theme=".neo-theme-literals"] { outline: 0; }',
            '.scope {',
            '    &.neo-theme-literals .fixture-glyph { --scoped: true; }',
            '}'
        ].join('\n'));

        generate({baseTheme: 'theme-literals'});

        const target       = path.join(cssRoot, 'theme-acme'),
              ast          = postcss.parse(read(path.join(target, 'Global.css'))),
              declarations = new Map(),
              selectors    = [];

        ast.walkDecls(declaration => declarations.set(declaration.prop, declaration.value));
        ast.walkRules(rule => selectors.push(rule.selector));

        expect(selectors).toEqual([
            ':where(.neo-theme-acme)',
            '& > .fixture-glyph',
            '.neo-theme-acme[data-theme=".neo-theme-literals"]',
            '.scope',
            '&.neo-theme-acme .fixture-glyph'
        ]);
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
        write(path.join(cssRoot, 'theme-acme/keep.txt'), 'caller-owned');

        refuseWithoutWrites({});
        refuseWithoutWrites({themeName: 'theme-light'});
    });

    test('rejects a symlink within a base tree before copying any files', () => {
        const secret = path.join(root, 'outside.css');

        write(secret, ':root { --outside: untouched; }\n');
        fs.symlinkSync(secret, path.join(engineRoot, 'resources/css/theme-neo-dark/linked.css'));

        refuseWithoutWrites({});
    });

    test('rejects symlink destination ancestry without writing through it', () => {
        const outside = path.join(root, 'outside-css');

        fs.mkdirSync(outside);
        fs.mkdirSync(path.dirname(cssRoot), {recursive: true});
        fs.symlinkSync(outside, cssRoot, 'dir');

        refuseWithoutWrites({});
        expect(fs.readdirSync(outside)).toEqual([]);
    });

    test('also generates from an engine checkout without an installed neo package', () => {
        fs.cpSync(path.join(engineRoot, 'resources/css'), cssRoot, {recursive: true});
        fs.copyFileSync(path.join(repoRoot, 'package.json'), path.join(root, 'package.json'));
        fs.rmSync(path.join(root, 'node_modules'), {recursive: true});

        generate({baseTheme: 'theme-light'});

        const target = path.join(cssRoot, 'theme-acme');

        expect(read(path.join(target, 'button/Base.css'))).toContain(':root .neo-theme-acme');
        expect(read(path.join(target, 'Global.css'))).toContain(':root .neo-theme-acme');
    });
});
