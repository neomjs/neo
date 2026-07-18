import {test, expect}                from '@playwright/test';
import fs                            from 'node:fs';
import os                            from 'node:os';
import path                          from 'node:path';
import {collectAgentosThemeFailures} from '../../../../../../buildScripts/util/check-agentos-theme.mjs';

/**
 * check-agentos-theme.mjs — the dual-mode theme guard. These isolated fixtures drive the
 * exported collector with temp skins/views so each defect class fails independently of the real tree:
 * parity (byte-identical / missing), token-only (a bare CSS-color literal past the var() fallback), and
 * completeness (a consumed token a skin fails to supply — the empty/truncated-palette false-green that a
 * pure symmetry check would pass). Positive cases pin the sanctioned var() fallback + component-local
 * alias so the guard cannot regress into false rejections.
 */
test.describe('check-agentos-theme.mjs', () => {
    let tempDir;

    test.beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-fm-theme-'));
    });

    test.afterEach(() => {
        fs.rmSync(tempDir, {recursive: true, force: true});
    });

    // Materialize a skin/view fixture set in the temp dir and run the collector against it.
    const run = ({dark, light, views = {}, contractedTokens = new Set()}) => {
        const darkPath  = path.join(tempDir, 'dark.scss'),
              lightPath = path.join(tempDir, 'light.scss'),
              viewDir   = path.join(tempDir, 'views');

        fs.writeFileSync(darkPath, dark, 'utf8');
        fs.writeFileSync(lightPath, light, 'utf8');
        fs.mkdirSync(viewDir, {recursive: true}); // idempotent — a test may call run() more than once
        for (const [name, content] of Object.entries(views)) {
            fs.writeFileSync(path.join(viewDir, name), content, 'utf8');
        }

        return collectAgentosThemeFailures({darkPath, lightPath, viewDir, contractedTokens});
    };

    const DARK  = ':root .x {\n    --fm-ink       : #d6dce6;\n    --fm-font-mono : mono;\n}\n';
    const LIGHT = ':root .x {\n    --fm-ink       : #1f2733;\n    --fm-font-mono : mono;\n}\n';
    const VIEW  = '.a { color: var(--fm-ink); }\n';

    test('clean fixture passes', () => {
        expect(run({dark: DARK, light: LIGHT, views: {'a.scss': VIEW}})).toEqual([]);
    });

    test('byte-identical --fm-* color value fails parity', () => {
        const failures = run({dark: DARK, light: DARK, views: {'a.scss': VIEW}});
        expect(failures.some(m => m.startsWith('[parity]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('mode-invariant font token identical across skins is allowed', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': VIEW}});
        expect(failures.some(m => m.includes('--fm-font-mono'))).toBe(false);
    });

    test('token missing from one skin fails parity and completeness', () => {
        const lightMissing = ':root .x {\n    --fm-font-mono : mono;\n}\n',
              failures     = run({dark: DARK, light: lightMissing, views: {'a.scss': VIEW}});

        expect(failures.some(m => m.startsWith('[parity]') && m.includes('--fm-ink'))).toBe(true);
        expect(failures.some(m => m.startsWith('[completeness]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('symmetrically empty palettes still fail completeness', () => {
        const empty    = ':root .x {\n}\n',
              failures = run({dark: empty, light: empty, views: {'a.scss': VIEW}});

        expect(failures.some(m => m.startsWith('[completeness]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('nested var() fallback (incl. rgba) is allowed', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { background: var(--fm-ink, rgba(1, 2, 3, 0.4)); }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(false);
    });

    test('bare oklch() literal fails token-only', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: oklch(0.7 0.1 200); }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(true);
    });

    test('bare hex literal fails token-only', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: #ff0000; }\n'}});
        expect(failures.some(m => m.startsWith('[token-only]'))).toBe(true);
    });

    test('component-local --fm-* alias is exempt from completeness', () => {
        const failures = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { --fm-dot: var(--fm-ink); box-shadow: 0 0 0 2px var(--fm-dot); }\n'}});
        expect(failures.some(m => m.includes('--fm-dot'))).toBe(false);
    });

    test('symmetric deletion of an UNCONSUMED contracted token is caught (not a vacuous parity pass)', () => {
        // --fm-ink is contracted but consumed by no view here; deleting it from BOTH skins passes parity
        // and completeness, so only the contracted-vocabulary check can catch the design-contract break.
        const noInk    = ':root .x {\n    --fm-font-mono : mono;\n}\n',
              failures = run({dark: noInk, light: noInk, contractedTokens: new Set(['--fm-ink'])});

        expect(failures.some(m => m.startsWith('[contract]') && m.includes('--fm-ink'))).toBe(true);
    });

    test('a bare named CSS color fails token-only; transparent/currentColor and quoted strings do not', () => {
        const bad = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { color: crimson; }\n'}}),
              ok  = run({dark: DARK, light: LIGHT, views: {'a.scss': '.a { background: transparent; border-color: currentColor; content: "red alert"; color: var(--fm-ink); }\n'}});

        expect(bad.some(m => m.startsWith('[token-only]'))).toBe(true);
        expect(ok.some(m => m.startsWith('[token-only]'))).toBe(false);
    });

    // check 4 — text-safe ink. `--fm-ink-faint` is below the 4.5:1 text floor on every surface in both
    // skins, so it may fill surfaces/borders but never text. A prose "no live consumer" note did not hold
    // the line (four text sites re-adopted it after an earlier cleanup), hence the mechanical rule.
    const FAINT_DARK  = ':root .x {\n    --fm-ink       : #d6dce6;\n    --fm-ink-faint : #5a6575;\n    --fm-font-mono : mono;\n}\n';
    const FAINT_LIGHT = ':root .x {\n    --fm-ink       : #1f2733;\n    --fm-ink-faint : #8494a7;\n    --fm-font-mono : mono;\n}\n';

    test('--fm-ink-faint filling text fails text-contrast', () => {
        const failures = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { color: var(--fm-ink-faint); }\n'}});

        expect(failures.some(m => m.startsWith('[text-contrast]') && m.includes('--fm-ink-faint'))).toBe(true);
    });

    test('--fm-ink-faint as a NON-text value stays legal — it survives as the non-text floor', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a { background: var(--fm-ink-faint); border-color: var(--fm-ink-faint); color: var(--fm-ink); }\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(false);
    });

    test('the inline multi-declaration form is caught (the shape that regressed)', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a {\n    &.is-pending { color: var(--fm-ink-faint); font-style: italic; }\n}\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(true);
    });

    // A pseudo-class puts a colon in the SELECTOR. Resolving the property from the first colon on the
    // line therefore read a selector fragment as the property and skipped the check entirely — and
    // `&:hover { color: … }` is the single likeliest place a sub-floor ink returns.
    for (const [shape, view] of Object.entries({
        'element pseudo-class'   : '.a:hover { color: var(--fm-ink-faint); }\n',
        'nested ampersand hover' : '.a {\n    &:hover { color: var(--fm-ink-faint); }\n}\n',
        'functional pseudo-class': '.a:not(.b) { color: var(--fm-ink-faint); }\n'
    })) {
        test(`text-contrast survives a ${shape} on the declaration line`, () => {
            const failures = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': view}});

            expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(true);
        });
    }

    test('an uppercase/mixed-case property is caught (CSS property names are case-insensitive)', () => {
        const upper = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { COLOR: var(--fm-ink-faint); }\n'}}),
              mixed = run({dark: FAINT_DARK, light: FAINT_LIGHT, views: {'a.scss': '.a { Color: var(--fm-ink-faint); }\n'}});

        expect(upper.some(m => m.startsWith('[text-contrast]'))).toBe(true);
        expect(mixed.some(m => m.startsWith('[text-contrast]'))).toBe(true);
    });

    test('a pseudo-class line with a NON-text property stays legal (no over-rejection)', () => {
        const failures = run({
            dark : FAINT_DARK,
            light: FAINT_LIGHT,
            views: {'a.scss': '.a:hover { background: var(--fm-ink-faint); border-color: var(--fm-ink-faint); color: var(--fm-ink); }\n'}
        });

        expect(failures.some(m => m.startsWith('[text-contrast]'))).toBe(false);
    });
});
