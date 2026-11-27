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
        expect(SCAN_SURFACE).toEqual(['resources/css/*/Global.css'])
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
