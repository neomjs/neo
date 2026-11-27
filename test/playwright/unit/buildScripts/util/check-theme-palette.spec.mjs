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
    let CONTRAST_PAIRS, SCAN_SURFACE, inspectThemePalettes, parseColor, resolveValue, source, tmpRoot;

    test.beforeAll(async () => {
        ({CONTRAST_PAIRS, SCAN_SURFACE, inspectThemePalettes, parseColor, resolveValue} = await import(modulePath));
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
        plant   = (change, extraFiles = {}) => {
            const planted = change(source);

            // A change that matched nothing would turn its arm into a second control.
            expect(planted).not.toBe(source);

            for (const [rel, body] of Object.entries({'theme-neo/Global.css': planted, ...extraFiles})) {
                const target = path.join(tmpRoot, 'resources/css', rel);

                fs.mkdirSync(path.dirname(target), {recursive: true});
                fs.writeFileSync(target, body, 'utf8')
            }

            return inspectThemePalettes({root: tmpRoot})
        };

    test('CONTROL: the live repository passes, and theme Neo is measured in both schemes', () => {
        const {failures, palettes} = inspectThemePalettes();

        expect(failures).toEqual([]);
        expect(palettes).toEqual(expect.arrayContaining(['neo-theme-neo-light (light)', 'neo-theme-neo-dark (dark)']));
        expect(CONTRAST_PAIRS).toHaveLength(35);
        expect(SCAN_SURFACE).toEqual(['resources/css/*/Global.css'])
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

    test('a grade off its table lightness fails, and the same colour written as hex passes', () => {
        const off = plant(css => css.replace(/(--neo-palette-accent-600\s*:\s*)oklch\(0\.544/, '$1oklch(0.560'));

        expect(off.failures).toContainEqual(expect.stringMatching(
            /^\[grade\] resources\/css\/theme-neo\/Global\.css --neo-palette-accent-600 has OKLCH lightness 0\.560; grade 600 is 0\.544/
        ));

        expect(plant(css => setRole(css, '--neo-palette-accent-600', '#3e63dd')).failures).toEqual([])
    });

    test('a grade outside the table fails, and the eight extras are not read as grades', () => {
        const {failures} = plant(css => css.replace('--neo-palette-accent-600', '--neo-palette-accent-550: oklch(0.58 0.18 267);\n    --neo-palette-accent-600'));

        expect(failures).toEqual([
            '[grade] resources/css/theme-neo/Global.css declares --neo-palette-accent-550; 550 is not a grade of the lightness table'
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
