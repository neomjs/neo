import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

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
    let CONTRAST_PAIRS, GRADES, SCAN_SURFACE, inspectThemePalettes, parseColor, resolveValue, source, tmpRoot;

    test.beforeAll(async () => {
        ({CONTRAST_PAIRS, GRADES, SCAN_SURFACE, inspectThemePalettes, parseColor, resolveValue} = await import(modulePath));
        source = fs.readFileSync(liveGlobal, 'utf8')
    });

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-palette-'))
    });

    test.afterEach(() => {
        tmpRoot && fs.rmSync(tmpRoot, {force: true, recursive: true})
    });

    const
        setRole = (css, name, value) => css.replace(new RegExp(`(${name}\\s*:\\s*)[^;]+;`), `$1${value};`),
        inspect = files => {
            for (const [rel, body] of Object.entries(files)) {
                const target = path.join(tmpRoot, 'resources/css', rel);

                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, body, 'utf8')
            }

            return inspectThemePalettes({root: tmpRoot})
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
        expect(CONTRAST_PAIRS).toHaveLength(37);
        expect(GRADES).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
        expect(SCAN_SURFACE).toEqual(['resources/css/**/*.css'])
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
        const {failures} = plant(css => css.replace('--neo-palette-accent-600', '--neo-palette-accent-550: oklch(0.58 0.18 267);\n    --neo-palette-accent-600'));

        expect(failures).toEqual([
            '[grade] resources/css/theme-neo/Global.css declares --neo-palette-accent-550; 550 is not one of the eleven grades'
        ])
    });

    test('a pair the check cannot read fails closed: an undeclared read, and a colour syntax it does not measure', () => {
        for (const value of ['var(--neo-palette-neutral-850)', 'color-mix(in oklch, var(--neo-palette-neutral-800), transparent)']) {
            const {failures} = plant(css => setRole(css, '--neo-color-text-muted', value));

            // Two pairs read the role, in two schemes.
            expect(failures).toHaveLength(4);
            expect(failures.every(failure => failure.includes('--neo-color-text-muted on') && failure.includes('cannot measure'))).toBe(true)
        }
    });

    test('a palette without a scheme fails, and a theme without a palette is skipped', () => {
        const {failures, palettes} = plant(
            css => css.replace(/\.neo-theme-neo-(?:light|dark)\s*\{--neo-color-scheme:[^}]+\}\n/g, ''),
            {'theme-old/Global.css': ':root .neo-theme-old { --button-background-color: #fff; }'}
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

    test('a nested rule that gives a name a second value fails like a flat one, before and after a nested block', () => {
        const
            override = '--neo-color-text-default: var(--neo-color-background-canvas);',
            cascade  = [expect.stringMatching(
                /^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light \(resources\/css\/theme-neo\/Global\.css\)/
            )];

        expect(plant(css => `.neo-theme-neo-light { .neo-dense & { ${override} } }\n${css}`).failures).toEqual(cascade);
        expect(plant(css => `.neo-theme-neo-light { @media print { --button-color: red; } ${override} }\n${css}`).failures).toEqual(cascade)
    });

    test('CONTROL: a nested rule with the same value, a layer, and a component variable under a condition pass', () => {
        const {failures, names} = plant(css => css +
            '\n.neo-theme-neo-light { .neo-dense & { --neo-color-scheme: light; } }' +
            '\n@layer theme { .neo-theme-neo-light { --neo-color-scheme: light; } }' +
            '\n.neo-theme-neo-light { @media print { --button-color: red; } }');

        expect(failures).toEqual([]);
        expect(names).toBe(194)
    });

    test('a measured name with a second value fails in whichever sheet it sits', () => {
        const override = ':root .neo-theme-neo-light { --neo-color-text-default: var(--neo-color-background-canvas); }';

        // A component file of the companion folder, one of another theme's folder, and a structural sheet.
        for (const rel of ['theme-neo-light/button/Base.css', 'theme-light/button/Base.css', 'src/button/Base.css']) {
            expect(inspect({'theme-neo/Global.css': source, [rel]: override}).failures).toEqual([expect.stringMatching(new RegExp(
                '^\\[cascade\\] --neo-color-text-default has 2 values for \\.neo-theme-neo-light ' +
                `\\((?=[^)]*resources/css/theme-neo/Global\\.css)(?=[^)]*resources/css/${rel})`
            ))])
        }
    });

    test('a measured name declared where no theme class is read fails as [scope]', () => {
        const
            override = '--neo-color-text-default: var(--neo-color-background-canvas);',
            scope    = rel => [expect.stringMatching(new RegExp(
                `^\\[scope\\] resources/css/${rel} declares or registers --neo-color-text-default where this check reads no theme class`
            ))];

        // A rule that reaches every element, one that reads the class off the attribute, and a string that
        // closes the block for this reader. The browser applies all three.
        for (const rule of [`* { ${override} }`, `[class~="neo-theme-neo-light"] { ${override} }`, `.neo-theme-neo-light { --probe: "}"; ${override} }`]) {
            expect(plant(css => `${css}\n${rule}`).failures).toEqual(scope('theme-neo/Global\\.css'))
        }

        // A structural sheet that re-binds the role on a subtree, and one that registers the name.
        for (const rule of [`.neo-button { ${override} }`, '@property --neo-color-text-default { syntax: "<color>"; inherits: false; initial-value: red; }']) {
            expect(inspect({'theme-neo/Global.css': source, 'src/button/Base.css': rule}).failures).toEqual(scope('src/button/Base\\.css'))
        }
    });

    test('an escaped class and an escaped name are read as a browser reads them', () => {
        const cascade = [expect.stringMatching(/^\[cascade\] --neo-color-text-default has 2 values for \.neo-theme-neo-light /)];

        expect(plant(css => `.neo-theme-neo-li\\67ht { --neo-color-text-default: var(--neo-color-background-canvas); }\n${css}`).failures)
            .toEqual(cascade);

        expect(plant(css => `.neo-theme-neo-light { --neo-color-text-defaul\\74 : var(--neo-color-background-canvas); }\n${css}`).failures)
            .toEqual(cascade)
    });

    test('CONTROL: a scale role re-valued by a scope or a condition passes, and so do a repeated value and a query', () => {
        const {failures, names} = inspect({
            'theme-neo/Global.css'           : source,
            // The reduced-motion collapse as `src` holds it: the class read off the attribute, and a condition.
            'src/Global.css'                 : ':where([class^="neo-theme-"]) { --neo-duration-fast: 120ms; @media (prefers-reduced-motion: reduce) { --neo-duration-fast: 0ms; } }',
            'src/board/Container.css'        : '.neo-board { --neo-board-gap: 8px; @media print { --neo-board-gap: 0; } }',
            'src/grid/Container.css'         : '@container style(--neo-color-scheme: dark) { .neo-grid { --grid-color: red; } }',
            'theme-neo-light/button/Base.css': ':root .neo-theme-neo-light { --neo-color-scheme: light; --button-color: red; }'
        });

        expect(failures).toEqual([]);
        expect(names).toBe(194)
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
        const {failures} = plant(css => setRole(css, '--neo-palette-shade-4', 'rgb(0 0 0 / )'));

        expect(failures).toHaveLength(3);
        expect(failures).toContain(`[palette] resources/css/theme-neo/Global.css --neo-palette-shade-4: cannot read 'rgb(0 0 0 / )' as a colour`);

        // The dark scheme reads the entry in two roles; the light scheme reads `shade-3` there.
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

    test('CONTROL: a second theme with the same names passes, and the live file declares 194', () => {
        const {failures, names, palettes} = plantSecond();

        expect(failures).toEqual([]);
        expect(palettes).toHaveLength(4);
        expect(names).toBe(194);
        expect(inspectThemePalettes().names).toBe(194)
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
            '--button-border-radius: 4px;\n    --neo-radius-pill: 999px;\n    --neo-radius-large'
        ));

        expect(failures).toEqual([
            '[names] --neo-radius-pill is declared in resources/css/theme-second/Global.css (.neo-theme-second-light, ' +
            '.neo-theme-second-dark) and missing in resources/css/theme-neo/Global.css (.neo-theme-neo-light, ' +
            '.neo-theme-neo-dark); every theme declares the same palette and role names'
        ])
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
