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
    const run = ({dark, light, views = {}}) => {
        const darkPath  = path.join(tempDir, 'dark.scss'),
              lightPath = path.join(tempDir, 'light.scss'),
              viewDir   = path.join(tempDir, 'views');

        fs.writeFileSync(darkPath, dark, 'utf8');
        fs.writeFileSync(lightPath, light, 'utf8');
        fs.mkdirSync(viewDir);
        for (const [name, content] of Object.entries(views)) {
            fs.writeFileSync(path.join(viewDir, name), content, 'utf8');
        }

        return collectAgentosThemeFailures({darkPath, lightPath, viewDir});
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
});
