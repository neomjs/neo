import {test, expect}            from '@playwright/test';
import {execFileSync, spawnSync} from 'node:child_process';
import fs                        from 'node:fs';
import os                        from 'node:os';
import path                      from 'node:path';
import {fileURLToPath}           from 'node:url';

const
    __dirname  = path.dirname(fileURLToPath(import.meta.url)),
    repoRoot   = path.resolve(__dirname, '../../../../..'),
    modulePath = path.join(repoRoot, 'buildScripts/util/check-theme-palette.mjs'),
    liveGlobal = path.join(repoRoot, 'resources/css/theme-neo/Global.css');

/**
 * Unit coverage for `check-theme-palette.mjs`. The fixture arms plant theme Neo's own `Global.css` with one
 * change each, so every arm measures a real palette and a planted fault is the only difference.
 */
test.describe('check-theme-palette.mjs — grade lightness and contrast floors of a theme palette', () => {
    let CONTRAST_PAIRS, GRADES, SCAN_SURFACE, inspectThemePalettes, measureThemePairContrast, parseColor, resolveValue, source, tmpRoot;

    test.beforeAll(async () => {
        ({CONTRAST_PAIRS, GRADES, SCAN_SURFACE, inspectThemePalettes, measureThemePairContrast, parseColor, resolveValue} = await import(modulePath));
        source = fs.readFileSync(liveGlobal, 'utf8')
    });

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-palette-'))
    });

    test.afterEach(() => {
        tmpRoot && fs.rmSync(tmpRoot, {force: true, recursive: true})
    });

    const
        // A name no palette declares is built from parts: a spelled `--neo-` name has to be a real one.
        neoName = suffix => '--' + 'neo-' + suffix,
        setRole = (css, name, value) => css.replace(new RegExp(`(${name}\\s*:\\s*)[^;]+;`), `$1${value};`),
        // A fixture tree holds none of the live `theme-base` sheets, so it starts from an empty allow-list.
        inspect = (files, options = {}) => {
            const cssDir = path.join(tmpRoot, 'resources/css');

            fs.rmSync(cssDir, {force: true, recursive: true});

            for (const [rel, body] of Object.entries(files)) {
                const target = path.join(cssDir, rel);

                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, body, 'utf8')
            }

            return inspectThemePalettes({baseColoursAllowed: {}, root: tmpRoot, ...options})
        },
        plant   = (change, extraFiles = {}) => {
            const planted = change(source);

            // A change that matched nothing would turn its arm into a second control.
            expect(planted).not.toBe(source);

            return inspect({'theme-neo/Global.css': planted, ...extraFiles})
        },
        // Theme Neo's file as it stands, beside a second theme: its copy under two other classes, plus one change.
        plantSecond = (change = css => css) => {
            const copy = source.replaceAll('neo-theme-neo-', 'neo-theme-second-');

            return inspect({'theme-neo/Global.css': source, 'theme-second/Global.css': change(copy)})
        };

    test('CONTROL: the live repository passes, and theme Neo is measured in both schemes', () => {
        const {failures, palettes} = inspectThemePalettes();

        expect(failures).toEqual([]);
        expect(palettes).toEqual(expect.arrayContaining(['neo-theme-neo-light (light)', 'neo-theme-neo-dark (dark)']));
        expect(CONTRAST_PAIRS).toHaveLength(45);
        expect(GRADES).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
        expect(SCAN_SURFACE).toEqual(['resources/css/**/*.css'])
    });

    test('background-selected keeps at least a 1.1:1 step on background-accent-subtle in both schemes', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-background-selected',
            'light-dark(var(--neo-palette-accent-200), var(--neo-palette-accent-900))'));

        expect(failures).toEqual([
            '[pair] resources/css/theme-neo/Global.css .neo-theme-neo-dark (dark) ' +
            '--neo-color-background-selected on --neo-color-background-accent-subtle is 1.00:1; the floor is 1.1:1'
        ])
    });

    test('background-selected-strong keeps at least a 1.1:1 step on background-selected and 4.5:1 text contrast', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-background-selected-strong',
            'light-dark(var(--neo-palette-accent-200), var(--neo-palette-accent-700))'));

        expect(failures).toEqual([
            '[pair] resources/css/theme-neo/Global.css .neo-theme-neo-light (light) ' +
            '--neo-color-background-selected-strong on --neo-color-background-selected is 1.00:1; the floor is 1.1:1'
        ])
    });

    test('the strong border meets 3:1 on the canvas and on a field, in both schemes', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-border-strong',
            'light-dark(var(--neo-palette-neutral-400), var(--neo-palette-neutral-700))'));

        expect(failures).toHaveLength(4);

        for (const failure of failures) {
            expect(failure).toMatch(/--neo-color-border-strong on --neo-color-background-(canvas|field) is \d\.\d\d:1; the floor is 3:1$/)
        }
    });

    test('a text role under its floor fails in the scheme where it is weak, with the measured ratio', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-text-muted',
            'light-dark(var(--neo-palette-neutral-300), var(--neo-palette-neutral-400))'));

        expect(failures).toHaveLength(2);

        for (const failure of failures) {
            expect(failure).toContain('.neo-theme-neo-light (light) --neo-color-text-muted on --neo-color-background-');
            expect(failure).toMatch(/is \d\.\d\d:1; the floor is 4\.5:1$/)
        }
    });

    test('a grade that one slot paints at another lightness fails, and the same colour written as hex passes', () => {
        const off = plant(css => css.replace(/(--neo-palette-accent-600\s*:\s*)oklch\(0\.544/, '$1oklch(0.560'));

        expect(off.failures).toContainEqual(
            '[grade] resources/css/theme-neo/Global.css --neo-palette-accent-600 has OKLCH lightness 0.560; ' +
            'grade 600 is 0.544 in --neo-palette-neutral-600, and a grade has one lightness in every slot'
        );

        expect(plant(css => setRole(css, '--neo-palette-accent-600', '#3e63dd')).failures).toEqual([])
    });

    test('a palette with lightness numbers of its own passes when every slot shares them', () => {
        const {failures} = plant(css => css.replaceAll('oklch(0.790 ', 'oklch(0.800 '));

        expect(failures).toEqual([])
    });

    test('a slot whose grades do not descend in lightness fails, once per slot', () => {
        const
            {failures} = plant(css => css.replaceAll('oklch(0.470 ', 'oklch(0.550 ')),
            descent    = failures.filter(failure => failure.startsWith('[descent]'));

        expect(failures.some(failure => failure.startsWith('[grade]'))).toBe(false);
        expect(descent).toHaveLength(7);
        expect(descent).toContain(
            '[descent] resources/css/theme-neo/Global.css --neo-palette-accent-700 has OKLCH lightness 0.550, ' +
            'not under --neo-palette-accent-600 at 0.544; a slot\'s grades descend in lightness'
        )
    });

    test('a grade outside the eleven fails, and the eight extras are not read as grades', () => {
        const
            offGrade   = neoName('palette-accent-550'),
            {failures} = plant(css => css.replace('--neo-palette-accent-600', `${offGrade}: oklch(0.58 0.18 267);\n    --neo-palette-accent-600`));

        expect(failures).toEqual([
            `[grade] resources/css/theme-neo/Global.css declares ${offGrade}; 550 is not one of the eleven grades`
        ])
    });

    test('a pair the check cannot read fails closed: an undeclared read, and a colour syntax it does not measure', () => {
        for (const value of [`var(${neoName('palette-neutral-850')})`, 'color-mix(in oklch, var(--neo-palette-neutral-800), transparent)']) {
            const {failures} = plant(css => setRole(css, '--neo-color-text-muted', value));

            // Two pairs read the role, in two schemes.
            expect(failures).toHaveLength(4);
            expect(failures.every(failure => failure.includes('--neo-color-text-muted on') && failure.includes('cannot measure'))).toBe(true)
        }
    });

    test('a palette without a scheme fails, and a theme without a palette is skipped', () => {
        const {failures, palettes} = plant(
            css => css.replace(/\.neo-theme-neo-(?:light|dark)\s*\{--neo-color-scheme:[^}]+\}\n/g, ''),
            {'theme-old/Global.css': ':root .neo-theme-old { --neo-button-background-color: #fff; }'}
        );

        expect(palettes).toEqual(['neo-theme-neo-light (no scheme)', 'neo-theme-neo-dark (no scheme)']);
        expect(failures).toHaveLength(2);
        expect(failures.every(failure => failure.startsWith('[scheme]'))).toBe(true)
    });

    test('a theme that declares one scheme is measured in that scheme only', () => {
        const {failures, palettes} = plant(css => css
            .replace(/\.neo-theme-neo-light\s*\{--neo-color-scheme:[^}]+\}\n/, '')
            .replace('.neo-theme-neo-light, .neo-theme-neo-dark', '.neo-theme-neo-dark'));

        expect(palettes).toEqual(['neo-theme-neo-dark (dark)']);
        expect(failures).toEqual([])
    });

    test('a role with a second, different value for one class fails, wherever the other declaration sits', () => {
        const override = '{ --neo-color-text-default: var(--neo-color-background-canvas); }';

        // A more specific rule wins in the browser from any place in the sheet; here it stands first.
        expect(plant(css => `:root .neo-theme-neo-light ${override}\n${css}`).failures).toEqual([expect.stringMatching(
            /^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light \(resources\/css\/theme-neo\/Global\.css\)/
        )]);

        // The same override in a second folder that serves the class.
        expect(inspect({
            'theme-neo/Global.css'      : source,
            'theme-neo-light/Global.css': `:where(.neo-theme-neo-light) ${override}`
        }).failures).toEqual([expect.stringMatching(
            /^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light \(resources\/css\/theme-neo\/Global\.css, resources\/css\/theme-neo-light\/Global\.css\)/
        )])
    });

    test('CONTROL: a second folder that repeats a name with the same value passes', () => {
        const {failures, palettes} = inspect({
            'theme-neo/Global.css'      : source,
            'theme-neo-light/Global.css': ':where(:root:has(> .neo-theme-neo-light), .neo-theme-neo-light) { --neo-color-scheme: light; --button-color: red; }'
        });

        expect(failures).toEqual([]);
        expect(palettes).toHaveLength(2)
    });

    test('a name declared under a condition fails with the condition named, nested in the class or around it', () => {
        const
            override = '--neo-color-text-default: var(--neo-color-background-canvas);',
            under    = (condition, name = '--neo-color-text-default') => [expect.stringMatching(new RegExp(
                `^\\[conditional\\] resources/css/theme-neo/Global\\.css declares ${name} for \\.neo-theme-neo-light inside ${condition};`
            ))];

        // Active in every viewport: the browser paints the text on its own background.
        expect(plant(css => `${css}\n.neo-theme-neo-light { @media (min-width: 0px) { ${override} } }`).failures)
            .toEqual(under('@media \\(min-width: 0px\\)'));

        expect(plant(css => `${css}\n@media (min-width: 0px) { .neo-theme-neo-light { ${override} } }`).failures)
            .toEqual(under('@media \\(min-width: 0px\\)'));

        expect(plant(css => `${css}\n.neo-theme-neo-light { @supports (color: red) { @media screen { ${override} } } }`).failures)
            .toEqual(under('@supports \\(color: red\\) @media screen'));

        // The same value is refused as well: a name declared only there would be measured as unconditional.
        expect(plant(css => `${css}\n.neo-theme-neo-light { @media print { --neo-color-scheme: light; } }`).failures)
            .toEqual(under('@media print', '--neo-color-scheme'))
    });

    test('a theme without a palette keeps its exemption under a condition, and a palette declared only there fails', () => {
        expect(inspect({
            'theme-neo/Global.css': source,
            'theme-old/Global.css': '.neo-theme-old { @media print { --neo-button-color: red; } }'
        }).failures).toEqual([]);

        const {failures, palettes} = inspect({
            'theme-neo/Global.css' : source,
            'theme-only/Global.css': '@media screen { .neo-theme-only { --neo-palette-white: #fff; } }'
        });

        expect(palettes).toHaveLength(2);
        expect(failures).toEqual([
            '[conditional] resources/css/theme-only/Global.css declares --neo-palette-white for .neo-theme-only inside ' +
            '@media screen; this check reads no condition and cannot tell when that value paints'
        ])
    });

    test('a declaration after a nested block competes like a flat one, and a nested rule declares no measured name', () => {
        const override = '--neo-color-text-default: var(--neo-color-background-canvas);';

        expect(plant(css => `.neo-theme-neo-light { @media print { --button-color: red; } ${override} }\n${css}`).failures)
            .toEqual([expect.stringMatching(
                /^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light \(resources\/css\/theme-neo\/Global\.css\)/
            )]);

        // A nested rule reaches a subtree, so it is refused also with the value the class has.
        for (const value of ['var(--neo-color-background-canvas)', source.match(/--neo-color-text-default\s*:\s*([^;]+);/)[1]]) {
            expect(plant(css => `.neo-theme-neo-light { .neo-dense & { --neo-color-text-default: ${value}; } }\n${css}`).failures)
                .toEqual([expect.stringMatching(/^\[scope\] resources\/css\/theme-neo\/Global\.css declares or registers --neo-color-text-default /)])
        }
    });

    test('CONTROL: a layer, a nested rule with a component variable, and one under a condition pass', () => {
        const {failures, names} = plant(css => css +
            '\n.neo-theme-neo-light { .neo-dense & { --button-color: red; } }' +
            '\n@layer theme { .neo-theme-neo-light { --neo-color-scheme: light; } }' +
            '\n.neo-theme-neo-light { @media print { --button-color: red; } }');

        expect(failures).toEqual([]);
        expect(names).toBe(200)
    });

    test('a measured name with a second value fails across companion Global.css sheets, and any role or palette name outside Global.css fails as [scope]', () => {
        const override = ':root .neo-theme-neo-light { --neo-color-text-default: var(--neo-color-background-canvas); }';

        for (const rel of ['theme-neo-light/Global.css', 'theme-light/Global.css']) {
            expect(inspect({'theme-neo/Global.css': source, [rel]: override}).failures).toEqual([expect.stringMatching(new RegExp(
                '^\\[cascade\\] --neo-color-text-default has 2 values for \\.neo-theme-neo-light ' +
                `\\((?=[^)]*resources/css/theme-neo/Global\\.css)(?=[^)]*resources/css/${rel})`
            ))])
        }

        // A component file of the companion folder, one of another theme's folder, and a structural sheet.
        for (const rel of ['theme-neo-light/button/Base.css', 'theme-light/button/Base.css', 'src/button/Base.css']) {
            expect(inspect({'theme-neo/Global.css': source, [rel]: override}).failures).toEqual([
                `[scope] resources/css/${rel} declares or registers --neo-color-text-default outside Global.css; palette and role names are declared in Global.css only`
            ])
        }
    });

    test('a theme-base variable that mixes two colours fails as [mix], and one with a raw colour as [raw], naming the sheet, the name and the value', () => {
        const
            rel    = 'resources/css/theme-base/board/Container.css',
            column = 'color-mix(in oklab, var(--neo-color-background-surface), var(--neo-color-background-inverse) 5%)',
            proxy  = 'color-mix(in srgb, var(--neo-color-border-accent) 38%, var(--neo-color-border-default))',
            mix    = 'a colour no role names; a component variable reads roles, or one role mixed with transparent (ADR 0044 decision 4)';

        expect(inspect({
            'theme-neo/Global.css'          : source,
            'theme-base/board/Container.css': [
                '[class*="neo-theme-"] {',
                `    --neo-board-column-background: ${column};`,
                `    --neo-dock-proxy-border-color: ${proxy};`,
                '    --neo-board-accent-color     : #0a7a6e;',
                '    --neo-board-avatar-color     : var(--neo-color-text-accent, #0b5f56);',
                '}'
            ].join('\n')
        }).failures).toEqual([
            `[mix] ${rel} binds --neo-board-column-background to ${column}, ${mix}`,
            `[mix] ${rel} binds --neo-dock-proxy-border-color to ${proxy}, ${mix}`,
            `[raw] ${rel} gives --neo-board-accent-color a raw colour (#0a7a6e); theme-base reads roles, and a listed value goes into BASE_COLOURS_ALLOWED with its reason`,
            `[raw] ${rel} gives --neo-board-avatar-color a raw colour (var(--neo-color-text-accent, #0b5f56)); theme-base reads roles, and a listed value goes into BASE_COLOURS_ALLOWED with its reason`
        ])
    });

    test('CONTROL: in theme-base a role, a role in a shorthand, one role mixed with transparent, a choice of two roles, a length and a keyword pass', () => {
        expect(inspect({
            'theme-neo/Global.css'          : source,
            'theme-base/board/Container.css': [
                '[class*="neo-theme-"] {',
                '    --neo-board-color                       : var(--neo-color-text-default);',
                '    --neo-board-card-box-shadow             : 0 2px 8px var(--neo-color-shadow);',
                '    --neo-board-slot-background             : color-mix(in srgb, var(--neo-color-background-accent) 10%, transparent);',
                '    --neo-rangefield-thumb-box-shadow-active: 0 0 0 var(--neo-space-1) color-mix(in srgb, transparent, var(--neo-color-focus-ring) 45%);',
                '    --neo-board-column-border-color         : light-dark(var(--neo-color-border-default), var(--neo-color-border-strong));',
                '    --neo-board-column-width                : 280px;',
                '    --neo-board-card-progress-border-radius : none;',
                '}'
            ].join('\n')
        }).failures).toEqual([])
    });

    test('an allowed mixed or raw colour passes, and an allowed entry that matches nothing fails as [allowed]', () => {
        const
            files = {
                'theme-neo/Global.css'          : source,
                'theme-base/board/Container.css': '[class*="neo-theme-"] {\n    --neo-board-accent-color: #0a7a6e;\n}'
            },
            kept  = {'theme-base/board/Container.css|--neo-board-accent-color': 'a vendor value the fixture keeps'};

        expect(inspect(files, {baseColoursAllowed: kept}).failures).toEqual([]);

        expect(inspect(files, {baseColoursAllowed: {...kept, 'theme-base/board/Card.css|--neo-board-badge-border-radius': 'nothing holds it'}}).failures).toEqual([
            '[allowed] BASE_COLOURS_ALLOWED entry theme-base/board/Card.css|--neo-board-badge-border-radius matches no mixed or raw colour any more; delete it'
        ])
    });

    test('a measured name declared in a rule that is no theme class itself fails as [scope]', () => {
        const
            override = '--neo-color-text-default: var(--neo-color-background-canvas);',
            scope    = rel => [expect.stringMatching(new RegExp(
                `^\\[scope\\] resources/css/${rel} declares or registers --neo-color-text-default outside a rule that declares on a theme class itself`
            ))];

        // A rule that reaches every element, and one that reads the class off the attribute.
        for (const rule of [`* { ${override} }`, `[class~="neo-theme-neo-light"] { ${override} }`]) {
            expect(plant(css => `${css}\n${rule}`).failures).toEqual(scope('theme-neo/Global\\.css'))
        }

        // A structural sheet that re-binds the role on a subtree, and one that registers the name.
        for (const rule of [`.neo-button { ${override} }`, '@property --neo-color-text-default { syntax: "<color>"; inherits: false; initial-value: red; }']) {
            expect(inspect({'theme-neo/Global.css': source, 'src/button/Base.css': rule}).failures).toEqual([
                '[scope] resources/css/src/button/Base.css declares or registers --neo-color-text-default outside Global.css; palette and role names are declared in Global.css only'
            ])
        }
    });

    test('a rule that names a theme class and reaches past it fails as [scope], also with the value the class has', () => {
        const scope = [expect.stringMatching(
            /^\[scope\] resources\/css\/theme-neo\/Global\.css declares or registers --neo-color-scheme outside a rule that declares on a theme class itself/
        )];

        // A list part that reaches every element, a negation, a sibling, a descendant, and a nested negation.
        for (const selector of ['.neo-theme-neo-light, *', ':not(.neo-theme-neo-dark)', '.neo-theme-neo-light ~ *', '.neo-theme-neo-light *']) {
            expect(plant(css => `${css}\n${selector} { --neo-color-scheme: light; }`).failures).toEqual(scope)
        }

        expect(plant(css => `${css}\n.neo-theme-neo-light { :not(&) { --neo-color-scheme: light; } }`).failures).toEqual(scope)
    });

    test('a string and a url() are no syntax: a comment mark, a brace or a selector inside one hides nothing', () => {
        const
            override = '--neo-color-text-default: var(--neo-color-background-canvas);',
            cascade  = (name, themeClass) => expect.stringMatching(new RegExp(`^\\[cascade\\] ${name} has 2 values for \\.${themeClass} `));

        // The declaration sits between two comment marks, or behind a brace: it is the last one, so it is measured too.
        // In the third rule the first string has no closing quote, and it ends where its line ends.
        for (const rule of [
            `.neo-theme-neo-dark { --probe: "/*"; ${override} --probe2: "*/"; }`,
            `.neo-theme-neo-dark { --probe: url(/*); ${override} --probe2: url(*/); }`,
            `.neo-theme-neo-dark { --probe: "/*\n; ${override} --probe2: "*/"; }`,
            `.neo-theme-neo-dark { --probe: "}"; ${override} }`
        ]) {
            const {failures} = plant(css => `${css}\n${rule}`);

            expect(failures).toHaveLength(9);
            expect(failures).toContainEqual(cascade('--neo-color-text-default', 'neo-theme-neo-dark'));
            expect(failures.filter(failure => failure.startsWith('[pair]') && failure.includes('.neo-theme-neo-dark (dark)'))).toHaveLength(8)
        }

        // The string spells another class's rule: the declaration stays the dark class's own.
        for (const probe of ['"} .neo-theme-neo-light {"', 'url(}.neo-theme-neo-light{)']) {
            expect(plant(css => `${css}\n.neo-theme-neo-dark { --probe: ${probe}; --neo-color-scheme: light; }`).failures)
                .toEqual([cascade('--neo-color-scheme', 'neo-theme-neo-dark')])
        }
    });

    test('a sheet whose brackets do not balance fails as [syntax]: a browser drops what follows', () => {
        const syntax = [expect.stringMatching(
            /^\[syntax\] resources\/css\/theme-neo\/Global\.css has a bracket that does not close the one opened last/
        )];

        // Ahead of the palette, each of these leaves a Chromium page without a single palette name.
        for (const probe of ['(} .neo-theme-neo-light {)', '[} .neo-theme-neo-light {]', '(']) {
            expect(plant(css => `.neo-theme-neo-dark { --probe: ${probe}; }\n${css}`).failures).toEqual(syntax)
        }
    });

    test('a palette block under a selector of another shape is no palette, and every name in it fails', () => {
        const
            block                = '.neo-theme-neo-light, .neo-theme-neo-dark {',
            {failures, palettes} = plant(css => css.replace(block, '.neo-theme-neo-light, .neo-theme-neo-dark, * {'));

        // The block holds 86 palette entries and 48 colour roles. The scheme has a rule of its own.
        expect(palettes).toEqual([]);
        expect(failures).toHaveLength(134);
        expect(failures.every(failure => failure.startsWith('[scope] resources/css/theme-neo/Global.css declares or registers --neo-'))).toBe(true)
    });

    test('a theme without a palette declares no colour role but the scheme', () => {
        expect(inspect({
            'theme-neo/Global.css': source,
            'theme-old/Global.css': '.neo-theme-old { --neo-color-scheme: dark; --neo-color-text-default: #fff; }'
        }).failures).toEqual([
            '[scope] resources/css/theme-old/Global.css declares --neo-color-text-default for .neo-theme-old, which has no palette; ' +
            'a theme takes its palette and its colour roles together'
        ])
    });

    test('a colour role that reads a name outside the measured ones cannot be measured', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-text-muted', 'var(--text-alias)') +
            '\n.neo-theme-neo-light, .neo-theme-neo-dark { --text-alias: var(--neo-palette-neutral-600); }');

        // Two pairs read the role, in two schemes.
        expect(failures).toHaveLength(4);
        expect(failures.every(failure => failure.includes('--neo-color-text-muted on') && failure.includes('cannot measure'))).toBe(true)
    });

    test('an escaped class and an escaped name are read as a browser reads them', () => {
        const cascade = [expect.stringMatching(/^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light /)];

        expect(plant(css => `.neo-theme-neo-li\\67ht { --neo-color-text-default: var(--neo-color-background-canvas); }\n${css}`).failures)
            .toEqual(cascade);

        expect(plant(css => `.neo-theme-neo-light { --neo-color-text-defaul\\74 : var(--neo-color-background-canvas); }\n${css}`).failures)
            .toEqual(cascade)
    });

    test('CONTROL: a scale role re-valued by a scope or a condition in Global.css passes, and non-declaration tokens in component sheets are ignored', () => {
        const
            probeRole         = neoName('radius-probe'),
            {failures, names} = inspect({
                'theme-neo/Global.css'           : `${source}\n.neo-theme-neo-light { .neo-dense & { --neo-control-height-medium: 28px; } }`,
                // Reduced-motion collapse, plain density class, root-descendant density class, quoted density attribute, and `.neo-theme-scope`.
                'src/Global.css'                 : [
                    ':where([class^="neo-theme-"], [class*=" neo-theme-"]) { @media (prefers-reduced-motion: reduce) { --neo-duration-fast: 0ms; } }',
                    '.neo-density-compact { --neo-control-height-medium: 28px; }',
                    ':root .density-compact { --neo-control-height-small: 22px; }',
                    '[class^="density-"] { --neo-control-gap: 4px; }',
                    '.neo-theme-scope { --neo-space-1: 6px; }'
                ].join('\n'),
                'src/board/Container.css'        : [
                    '.neo-board { --neo-board-gap: 8px; @media print { --neo-board-gap: 0; } }',
                    `.${probeRole}:hover { color: red; }`,
                    `.neo-board { --widget-data: { ${probeRole}: 1px; }; }`
                ].join('\n'),
                'src/grid/Container.css'         : '@container style(--neo-color-scheme: dark) { .neo-grid { --grid-color: red; } }',
                'theme-neo-light/Global.css'     : ':root .neo-theme-neo-light { --neo-color-scheme: light; }',
                'theme-neo-light/button/Base.css': ':root .neo-theme-neo-light { --button-color: red; }'
            });

        expect(failures).toEqual([]);
        expect(names).toBe(200)
    });

    test('the four planted role/condition escapes fail with sheet and name, and src/Global.css refuses every selector arm that reaches a bare theme', () => {
        const
            newScale  = neoName('space-99'),
            probeRole = neoName('radius-probe');

        // 1. A new scale role in a theme widget sheet, on a component selector (even alongside non-declaration controls).
        expect(inspect({
            'theme-neo/Global.css'          : source,
            'theme-neo-dark/button/Base.css': [
                `.${probeRole}:hover { color: red; }`,
                `.neo-button { --widget-data: { ${probeRole}: 1px; }; ${newScale}: 1px; }`
            ].join('\n')
        }).failures).toEqual([
            `[scope] resources/css/theme-neo-dark/button/Base.css declares or registers ${newScale} outside Global.css; palette and role names are declared in Global.css only`
        ]);

        // 2. The same, on a theme-class rule of the widget sheet.
        expect(inspect({
            'theme-neo/Global.css'          : source,
            'theme-neo-dark/button/Base.css': `:root .neo-theme-neo-dark { ${newScale}: 1px; }`
        }).failures).toEqual([
            `[scope] resources/css/theme-neo-dark/button/Base.css declares or registers ${newScale} outside Global.css; palette and role names are declared in Global.css only`
        ]);

        // 3. An existing motion role re-valued in a `src` rule sheet.
        for (const rule of ['.neo-button { --neo-duration-fast: 0ms; }', ':where([class^="neo-theme-"]) { --neo-duration-fast: 0ms; }']) {
            expect(inspect({
                'theme-neo/Global.css': source,
                'src/button/Base.css' : rule
            }).failures).toEqual([
                '[scope] resources/css/src/button/Base.css declares or registers --neo-duration-fast outside Global.css; palette and role names are declared in Global.css only'
            ])
        }

        // 4. A colour role under a condition nested inside the rule of a theme class without a palette.
        expect(inspect({
            'theme-neo/Global.css' : source,
            'theme-dark/Global.css': '.neo-theme-dark { --neo-color-scheme: dark; @media (min-width: 0px) { --neo-color-text-default: red; } }'
        }).failures).toEqual([
            '[conditional] resources/css/theme-dark/Global.css declares --neo-color-text-default for .neo-theme-dark inside ' +
            '@media (min-width: 0px); this check reads no condition and cannot tell when that value paints'
        ]);

        // `src/Global.css` refuses unconditional motion roles (normal values live in each theme's Global.css)
        // and refuses any selector list where at least one effective arm reaches the bare theme or root.
        for (const [selector, role] of [
            [':where([class^="neo-theme-"])',             '--neo-duration-fast'],
            ['.neo-theme-neo-light',                      '--neo-duration-fast'],
            [':is(.neo-theme-neo-light)',                 '--neo-space-1'],
            ['.neo-theme-neo-light, .density-compact',    '--neo-space-1'],
            [':where(.neo-theme-neo-light, .density-compact)', '--neo-space-1'],
            [':is(.density-compact, [class*="neo-theme-"])',   '--neo-space-1'],
            [':root .neo-theme-neo-light',                '--neo-space-1']
        ]) {
            expect(inspect({
                'theme-neo/Global.css': source,
                'src/Global.css'      : `${selector} { ${role}: 8px; }`
            }).failures, selector).toEqual([
                `[scope] resources/css/src/Global.css declares or registers ${role} without a scope or condition; src/Global.css only re-values scale roles under a scope or condition`
            ])
        }

        expect(inspect({
            'theme-neo/Global.css': source,
            'src/Global.css'      : '.neo-density-compact { --neo-color-text-default: red; }'
        }).failures).toEqual([
            '[scope] resources/css/src/Global.css declares or registers --neo-color-text-default outside a theme Global.css; palette and colour-role names belong to a theme class in theme-<name>/Global.css'
        ])
    });

    test('measureThemePairContrast and the --contrast CLI print both scheme ratios and match checkPalette across every checked pair', () => {
        const selected = measureThemePairContrast('text-default', 'background-selected');

        expect(selected.failures).toEqual([]);
        expect(selected.pairs.map(({formatted, scheme, themeClass}) => ({formatted, scheme, themeClass}))).toEqual([
            {formatted: '13.11:1', scheme: 'light', themeClass: 'neo-theme-neo-light'},
            {formatted: expect.stringMatching(/^\d+\.\d\d:1$/), scheme: 'dark', themeClass: 'neo-theme-neo-dark'}
        ]);

        const stdout = execFileSync(process.execPath, [modulePath, '--contrast', 'text-default', 'background-selected'], {
            cwd     : repoRoot,
            encoding: 'utf8'
        });

        expect(stdout.trim().split('\n')).toEqual([
            '--neo-color-text-default on --neo-color-background-selected',
            `  neo-theme-neo-light (light): ${selected.pairs[0].formatted}`,
            `  neo-theme-neo-dark (dark): ${selected.pairs[1].formatted}`
        ]);

        // Every checked pair in CONTRAST_PAIRS passes its floor via measureThemePairContrast.
        for (const [foreground, background, floor] of CONTRAST_PAIRS) {
            const fromCommand = measureThemePairContrast(foreground, background);

            expect(fromCommand.failures).toEqual([]);
            expect(fromCommand.pairs).toHaveLength(2);
            expect(fromCommand.pairs.every(({ratio}) => ratio >= floor)).toBe(true)
        }

        // Exact numerical agreement with checkPalette's formatted `[pair] ... is X.XX:1` output across all eight
        // text-default pairs in both schemes (opaque surfaces and translucent neutral-hover / neutral-active).
        const weakDefault = plant(css => setRole(css, '--neo-color-text-default',
            'light-dark(var(--neo-palette-neutral-400), var(--neo-palette-neutral-700))'));

        for (const [foreground, background, floor] of CONTRAST_PAIRS.filter(([fg]) => fg === '--neo-color-text-default')) {
            const measured = measureThemePairContrast(foreground, background, {root: tmpRoot});

            expect(measured.failures).toEqual([]);

            for (const {formatted, scheme, themeClass} of measured.pairs) {
                expect(weakDefault.failures).toContain(
                    `[pair] resources/css/theme-neo/Global.css .${themeClass} (${scheme}) ${foreground} on ${background} is ${formatted}; the floor is ${floor}:1`
                )
            }
        }

        // Translucent foreground composited over the background, and non-zero exit on an undeclared name.
        const translucent = measureThemePairContrast('shade-3', 'background-canvas');
        expect(translucent.failures).toEqual([]);
        expect(translucent.pairs).toHaveLength(2);

        const missing = spawnSync(process.execPath, [modulePath, '--contrast', 'text-default', 'background-missing'], {
            cwd     : repoRoot,
            encoding: 'utf8'
        });
        expect(missing.status).toBe(1);
        expect(missing.stderr).toContain('background-missing')
    });

    test('a colour the browser clamps is measured as it paints, and a malformed number fails closed', () => {
        const
            weak    = value => plant(css => setRole(css, '--neo-color-text-strong', value)).failures,
            asWhite = weak('#fff');

        expect(asWhite.length).toBeGreaterThan(0);
        expect(weak('rgb(512 512 512)')).toEqual(asWhite);

        expect(weak('rgb(0 0 .)').length).toBeGreaterThan(0);
        expect(weak('rgb(0 0 .)').every(failure => failure.includes('cannot measure'))).toBe(true);

        expect(parseColor('rgb(512 512 512)').rgba).toEqual(parseColor('#fff').rgba);
        expect(parseColor('rgb(0 0 .)')).toBeNull();
        expect(parseColor('oklch(1.4 0 0)').lightness).toBe(1)
    });

    test('rgb() is read in the two forms a browser reads, and a mixed or empty separator fails closed', () => {
        for (const value of ['rgb(0 0 0)', 'rgb(0, 0, 0)', 'rgb( 0 , 0 , 0 )', 'rgba(0, 0, 0, 1)', 'rgb(0 0 0 / 100%)']) {
            expect(parseColor(value).rgba).toEqual([0, 0, 0, 1]);
            expect(plant(css => setRole(css, '--neo-palette-black', value)).failures).toEqual([])
        }

        for (const value of ['rgb(0, 0 0)', 'rgb(0,,0,0)', 'rgb(0 0, 0)', 'rgb(0 0 0, .5)', 'rgb(0, 0, 0 / .5)']) {
            expect(parseColor(value)).toBeNull()
        }

        // The stock black with a separator no browser reads: the entry fails, and so does each pair that reads it.
        for (const value of ['rgb(0, 0 0)', 'rgb(0,,0,0)']) {
            const {failures} = plant(css => setRole(css, '--neo-palette-black', value));

            expect(failures).toHaveLength(3);
            expect(failures).toContain(`[palette] resources/css/theme-neo/Global.css --neo-palette-black: cannot read '${value}' as a colour`);
            expect(failures.filter(failure => failure.includes('cannot measure'))).toHaveLength(2)
        }
    });

    test('a palette entry that no measured pair reads is still read as a colour, and so is each role that reads it', () => {
        const {failures} = plant(css => setRole(css, '--neo-palette-shade-5', 'rgb(0 0 0 / )'));

        expect(failures).toHaveLength(3);
        expect(failures).toContain(`[palette] resources/css/theme-neo/Global.css --neo-palette-shade-5: cannot read 'rgb(0 0 0 / )' as a colour`);

        // Dark reads the entry in both roles. Light uses shades 3 and 4.
        for (const role of ['--neo-color-background-scrim', '--neo-color-shadow']) {
            expect(failures).toContainEqual(expect.stringMatching(new RegExp(
                `^\\[role\\] resources/css/theme-neo/Global\\.css \\.neo-theme-neo-dark \\(dark\\) ${role}: cannot read `
            )))
        }
    });

    test('a colour role that no measured pair reads is still read as a colour, in each scheme', () => {
        const {failures} = plant(css => setRole(css, '--neo-color-background-surface', 'rgb(0, 0 0)'));

        expect(CONTRAST_PAIRS.flat()).not.toContain('--neo-color-background-surface');
        expect(new Set(failures)).toEqual(new Set(['light', 'dark'].map(scheme =>
            `[role] resources/css/theme-neo/Global.css .neo-theme-neo-${scheme} (${scheme}) --neo-color-background-surface: ` +
            `cannot read 'rgb(0, 0 0)' as a colour`
        )))
    });

    test('CONTROL: a second theme with the same names passes, and the live file declares 200', () => {
        const {failures, names, palettes} = plantSecond();

        expect(failures).toEqual([]);
        expect(palettes).toHaveLength(4);
        expect(names).toBe(200);
        expect(inspectThemePalettes().names).toBe(200)
    });

    test('a name a second theme lacks fails once, with both sides named', () => {
        const {failures} = plantSecond(css => css.replace(/\n\s*--neo-radius-large\s*:[^\n]*/, ''));

        expect(failures).toEqual([
            '[names] --neo-radius-large is declared in resources/css/theme-neo/Global.css (.neo-theme-neo-light, ' +
            '.neo-theme-neo-dark) and missing in resources/css/theme-second/Global.css (.neo-theme-second-light, ' +
            '.neo-theme-second-dark); every theme declares the same palette and role names'
        ])
    });

    test('a name a second theme adds fails once, and a component variable is not compared', () => {
        const {failures} = plantSecond(css => css.replace(
            '--neo-radius-large',
            '--neo-button-border-radius: 4px;\n    --neo-radius-pill: 999px;\n    --neo-radius-large'
        ));

        expect(failures).toEqual([
            '[names] --neo-radius-pill is declared in resources/css/theme-second/Global.css (.neo-theme-second-light, ' +
            '.neo-theme-second-dark) and missing in resources/css/theme-neo/Global.css (.neo-theme-neo-light, ' +
            '.neo-theme-neo-dark); every theme declares the same palette and role names'
        ])
    });

    test('the compared names are the shared classifier\'s: a role of every category is compared, a name it refuses is not', () => {
        const added = (role, value) => plantSecond(css => css.replace('--neo-radius-large', `${neoName(role)}: ${value};\n    --neo-radius-large`));

        // One role per category, declared by the second theme only.
        for (const role of ['color-text-extra', 'space-99', 'control-gap-extra', 'font-size-extra', 'line-height-extra', 'letter-spacing-extra',
            'radius-pill', 'border-width-extra', 'focus-ring-extra', 'opacity-extra', 'elevation-9', 'duration-extra', 'ease-extra']) {
            expect(added(role, role.startsWith('color-') ? '#fff' : '1px').failures).toEqual([expect.stringMatching(new RegExp(
                `^\\[names\\] ${neoName(role)} is declared in resources/css/theme-second/Global\\.css `
            ))])
        }

        // A role-shaped name the classifier refuses is the prefix guard's to fail; no palette is compared by it.
        const {failures, names} = added('font-Demo', '1px');

        expect(failures).toEqual([]);
        expect(names).toBe(200)
    });

    // A product palette: an app's Global.css that re-values theme Neo's names on its classes.
    const
        APP  = 'theme-neo/apps/probe/Global.css',
        BOTH = '.neo-theme-neo-light, .neo-theme-neo-dark',
        // Three accent grades turned toward violet at theme Neo's own lightness and chroma.
        VIOLET  = `${BOTH} {\n    --neo-palette-accent-500: oklch(0.610 0.180 290.0);\n` +
            `    --neo-palette-accent-600: oklch(0.544 0.191 290.0);\n    --neo-palette-accent-700: oklch(0.470 0.170 290.0);\n}\n`,
        product = (body, files = {}) => inspect({'theme-neo/Global.css': source, [APP]: body, ...files});

    test('a product palette in an app\'s Global.css passes on its theme\'s classes and is named, the theme measured as before', () => {
        const {failures, names, palettes, productPalettes} = product(VIOLET);

        expect(failures).toEqual([]);
        expect(productPalettes).toEqual(['neo-theme-neo-light + probe (light)', 'neo-theme-neo-dark + probe (dark)']);
        expect(new Set(palettes)).toEqual(new Set(['neo-theme-neo-light (light)', 'neo-theme-neo-dark (dark)']));
        expect(names).toBe(inspect({'theme-neo/Global.css': source}).names)
    });

    test('a product palette is held to its theme\'s rules, and each failure names the app\'s file', () => {
        const fails = body => product(`${BOTH} {\n    ${body}\n}\n`).failures;

        // A role name the theme does not declare.
        expect(fails(`${neoName('color-background-probe')}: #fff;`)).toEqual(['light', 'dark'].map(scheme =>
            `[product] resources/css/${APP} declares ${neoName('color-background-probe')} for .neo-theme-neo-${scheme}, ` +
            'which its theme does not; a product palette re-values its theme\'s names and adds none'
        ));

        // A grade whose lightness differs from the other slots'. The raised surface reads that grade at night,
        // so the pair on it drops as well; the two classes' grade lines are one line.
        expect(fails('--neo-palette-neutral-900: oklch(0.330 0.022 270.0);')).toEqual([
            `[grade] resources/css/${APP} --neo-palette-neutral-900 has OKLCH lightness 0.330; grade 900 is 0.280 in ` +
            '--neo-palette-accent-900, and a grade has one lightness in every slot',
            `[pair] resources/css/${APP} .neo-theme-neo-dark (dark) --neo-color-text-accent on --neo-color-background-surface-raised ` +
            'is 4.49:1; the floor is 4.5:1'
        ]);

        // A re-valued role under its floor in one scheme only.
        const weak = fails('--neo-color-text-muted: light-dark(var(--neo-palette-neutral-300), var(--neo-palette-neutral-400));');

        expect(weak).toHaveLength(2);

        for (const failure of weak) {
            expect(failure).toMatch(new RegExp(
                `^\\[pair\\] resources/css/${APP.replaceAll('.', '\\.')} \\.neo-theme-neo-light \\(light\\) --neo-color-text-muted on ` +
                '--neo-color-background-(canvas|surface-raised) is \\d\\.\\d\\d:1; the floor is 4\\.5:1$'
            ))
        }

        // The scheme stays the theme's.
        expect(fails('--neo-color-scheme: dark;')).toContain(
            `[product] resources/css/${APP} declares --neo-color-scheme for .neo-theme-neo-light; a product palette keeps its theme's scheme`
        )
    });

    test('every other second declaration still fails: the app\'s other sheets, a src sheet, another selector, a condition, another theme\'s class', () => {
        const
            rule    = selector => `${selector} {\n    --neo-palette-accent-600: oklch(0.544 0.191 290.0);\n}\n`,
            outside = rel => `[scope] resources/css/${rel} declares or registers --neo-palette-accent-600 outside Global.css; ` +
                'palette and role names are declared in Global.css only';

        for (const rel of ['theme-neo/apps/probe/Viewport.css', 'src/apps/probe/Palette.css']) {
            expect(inspect({'theme-neo/Global.css': source, [rel]: rule(BOTH)}).failures).toEqual([outside(rel)])
        }

        expect(product(rule('.probe-viewport')).failures).toEqual([
            `[scope] resources/css/${APP} declares or registers --neo-palette-accent-600 outside a rule that declares on a theme class itself; ` +
            'a palette or colour-role name has one value per theme class, and nothing here can tell what another rule reaches'
        ]);

        expect(product(`@media (min-width: 0px) {\n${rule('.neo-theme-neo-light')}}\n`).failures).toEqual([
            `[conditional] resources/css/${APP} declares --neo-palette-accent-600 for .neo-theme-neo-light inside @media (min-width: 0px); ` +
            'this check reads no condition and cannot tell when that value paints'
        ]);

        // A class without a palette, and the class of a second palette theme.
        expect(product(rule('.neo-theme-light')).failures).toEqual([
            `[product] resources/css/${APP} declares on .neo-theme-light, whose palette no theme declares; ` +
            'a product palette sits in the folder whose Global.css declares its class\'s palette, one overlay per app and class'
        ]);

        const second = source.replaceAll('neo-theme-neo-', 'neo-theme-second-');

        expect(product(rule('.neo-theme-second-dark'), {'theme-second/Global.css': second}).failures).toEqual([
            `[product] resources/css/${APP} declares on .neo-theme-second-dark, whose palette resources/css/theme-second/Global.css declares; ` +
            'a product palette sits in the folder whose Global.css declares its class\'s palette, one overlay per app and class'
        ])
    });

    test('an app\'s Global.css in a folder whose own Global.css declares no palette for the class fails, alone and beside a valid one', () => {
        const
            DARK  = 'theme-neo-dark/apps/probe/Global.css',
            files = extra => ({'theme-neo-dark/Global.css': ':where(.neo-theme-neo-dark) {\n    --neo-duration-fast: 120ms;\n}\n', ...extra}),
            // Each passes alone where its folder allows it (4.785:1 and 5.521:1); together they paint 1.314:1.
            text    = '.neo-theme-neo-dark {\n    --neo-color-text-inverse: var(--neo-palette-neutral-600);\n}\n',
            ground  = '.neo-theme-neo-dark {\n    --neo-color-background-inverse: var(--neo-palette-neutral-500);\n}\n',
            refused = `[product] resources/css/${DARK} declares on .neo-theme-neo-dark, whose palette resources/css/theme-neo/Global.css declares; ` +
                'a product palette sits in the folder whose Global.css declares its class\'s palette, one overlay per app and class';

        expect(product(text, files()).failures).toEqual([]);
        expect(product(ground, files()).failures).toEqual([]);
        expect(inspect({'theme-neo/Global.css': source, ...files({[DARK]: ground})}).failures).toEqual([refused]);
        expect(product(text, files({[DARK]: ground})).failures).toEqual([refused])
    });

    test('an app\'s Global.css holds palette and role names on its theme\'s classes under no condition, and one that re-values nothing fails', () => {
        const
            DARK      = 'theme-neo-dark/apps/probe/Global.css',
            newScale  = neoName('space-99'),
            outside   = (rel, name) => `[product] resources/css/${rel} declares ${name} outside a theme class; a product palette re-values names on its theme's classes only`,
            unread    = rel => `[product] resources/css/${rel} re-values no palette or role name on a theme class; a product palette declares its values there`,
            inspectIn = (rel, body) => inspect({'theme-neo/Global.css': source, [rel]: body});

        // CONTROL: a scale role its theme declares, re-valued on the theme's classes, is measured and named.
        const control = product(`${BOTH} {\n    --neo-space-1: 6px;\n}\n`);

        expect(control.failures).toEqual([]);
        expect(control.productPalettes).toEqual(['neo-theme-neo-light + probe (light)', 'neo-theme-neo-dark + probe (dark)']);

        // Scale roles on a component selector, here and in the companion folder.
        expect(product(`.probe-viewport {\n    ${newScale}: 99px;\n    --neo-font-family-sans: Inter;\n}\n`).failures).toEqual([
            outside(APP, newScale),
            outside(APP, '--neo-font-family-sans')
        ]);
        expect(inspectIn(DARK, '.probe-viewport {\n    --neo-space-1: 99px;\n}\n').failures).toEqual([outside(DARK, '--neo-space-1')]);

        // A scale role under a condition, on the theme's class.
        expect(product(`@media (min-width: 0px) {\n    .neo-theme-neo-light {\n        ${newScale}: 99px;\n    }\n}\n`).failures).toEqual([
            `[conditional] resources/css/${APP} declares ${newScale} for .neo-theme-neo-light inside @media (min-width: 0px); ` +
            'this check reads no condition and cannot tell when that value paints'
        ]);

        // A component variable, and a registration.
        expect(product(`${BOTH} {\n    --neo-button-color: red;\n}\n`).failures).toEqual([
            `[product] resources/css/${APP} declares --neo-button-color, which is no palette or role name; a product palette re-values its theme's names only`
        ]);
        expect(product(`@property --neo-space-1 {\n    syntax: '<length>';\n    inherits: true;\n    initial-value: 4px;\n}\n`).failures).toEqual([
            `[product] resources/css/${APP} registers --neo-space-1; a product palette re-values its theme's names and registers none`
        ]);

        // A sheet that declares nothing, or nothing a palette holds, was never read.
        expect(product('').failures).toEqual([unread(APP)]);
        expect(inspectIn(DARK, '/* nothing yet */\n.probe-viewport {\n    color: red;\n}\n').failures).toEqual([unread(DARK)])
    });

    test('run from a workspace, the command measures the workspace\'s product palette on the Engine\'s theme', () => {
        const
            workspace = path.join(tmpRoot, 'workspace'),
            file      = path.join(workspace, 'resources/css', APP),
            run       = () => spawnSync(process.execPath, ['node_modules/neo.mjs/buildScripts/util/check-theme-palette.mjs'], {cwd: workspace, encoding: 'utf8'});

        fs.mkdirSync(path.join(workspace, 'node_modules'), {recursive: true});
        fs.symlinkSync(repoRoot, path.join(workspace, 'node_modules/neo.mjs'), 'junction');
        fs.writeFileSync(path.join(workspace, 'package.json'), JSON.stringify({name: 'probe-workspace', dependencies: {'neo.mjs': '*'}}));
        fs.mkdirSync(path.dirname(file), {recursive: true});
        fs.writeFileSync(file, VIOLET);

        const passing = run();

        expect(passing.status).toBe(0);
        expect(passing.stdout).toContain(
            '2 product palette(s), measured on their theme\'s: neo-theme-neo-light + probe (light), neo-theme-neo-dark + probe (dark).'
        );

        fs.writeFileSync(file, `${BOTH} {\n    --neo-color-text-default: var(--neo-color-background-canvas);\n}\n`);

        const failing = run();

        expect(failing.status).toBe(1);
        expect(failing.stderr).toContain(
            `[pair] resources/css/${APP} .neo-theme-neo-light (light) --neo-color-text-default on --neo-color-background-canvas is 1.00:1; the floor is 4.5:1`
        )
    });

    test('resolveValue follows var() reads and picks the light-dark() side of the scheme', () => {
        const declarations = new Map([
            ['--a', 'light-dark(var(--b), var(--c))'],
            ['--b', '#fff'],
            ['--c', 'var(--d)'],
            ['--d', 'rgb(0 0 0 / .5)']
        ]);

        expect(resolveValue('var(--a)', declarations, 'light')).toBe('#fff');
        expect(resolveValue('var(--a)', declarations, 'dark')).toBe('rgb(0 0 0 / .5)');
        expect(resolveValue('var(--missing)', declarations, 'light')).toBeNull();
        expect(resolveValue('var(--missing, #fff)', declarations, 'light')).toBeNull()
    });

    test('parseColor reads oklch, hex and rgb with alpha, and returns null for anything else', () => {
        const accent = parseColor('oklch(0.544 0.191 267.0)');

        expect(accent.literal).toBe(true);
        expect(accent.lightness).toBe(0.544);
        expect(accent.rgba.slice(0, 3).map(channel => Math.round(channel * 255))).toEqual([0x3e, 0x63, 0xdd]);

        expect(parseColor('#fff').rgba).toEqual([1, 1, 1, 1]);
        expect(parseColor('rgb(0 0 0 / .16)').rgba).toEqual([0, 0, 0, 0.16]);
        expect(parseColor('#3e63dd').lightness).toBeCloseTo(0.544, 2);
        expect(parseColor('color-mix(in oklch, red, blue)')).toBeNull()
    })
});
