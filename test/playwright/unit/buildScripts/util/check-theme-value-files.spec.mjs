import {test, expect}  from '@playwright/test';
import fs              from 'node:fs';
import os              from 'node:os';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

const
    __dirname  = path.dirname(fileURLToPath(import.meta.url)),
    modulePath = path.resolve(__dirname, '../../../../../buildScripts/util/check-theme-value-files.mjs');

/**
 * Unit coverage for `check-theme-value-files.mjs`: theme folders come from `theme-map.json` and
 * `Global.css` `.neo-theme-*` declarations (plus `theme-base` when present), never from a `theme-*`
 * glob, while selector blocks and non-custom-property declarations inside value files fail closed.
 */
test.describe('check-theme-value-files.mjs — theme value-only guard and map resolution', () => {
    let SCAN_SURFACE, collectThemeFiles, collectThemeValueFileFailures, tmpRoot;

    test.beforeAll(async () => {
        ({SCAN_SURFACE, collectThemeFiles, collectThemeValueFileFailures} = await import(modulePath))
    });

    test.beforeEach(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-theme-value-files-'))
    });

    test.afterEach(() => {
        tmpRoot && fs.rmSync(tmpRoot, {force: true, recursive: true})
    });

    const plant = (files, themeMap = null) => {
        const cssRoot = path.join(tmpRoot, 'resources/css');

        for (const [rel, body] of Object.entries(files)) {
            const target = path.join(cssRoot, rel);
            fs.mkdirSync(path.dirname(target), {recursive: true});
            fs.writeFileSync(target, body, 'utf8')
        }

        if (themeMap) {
            const mapFile = path.join(tmpRoot, 'resources/theme-map.json');
            fs.mkdirSync(path.dirname(mapFile), {recursive: true});
            fs.writeFileSync(mapFile, JSON.stringify(themeMap), 'utf8')
        }

        return cssRoot
    };

    test('CONTROL: live repository passes and SCAN_SURFACE contains no theme-* wildcard segment', () => {
        expect(collectThemeValueFileFailures()).toEqual([]);
        expect(SCAN_SURFACE.some(entry => entry.includes('theme-*'))).toBe(false);
        expect(SCAN_SURFACE).toContain('resources/css/*/Global.css')
    });

    test('collects theme-base and mapped folders (including non-theme-* folders from theme-map.json) while ignoring src and unmapped theme-* decoys', () => {
        const cssRoot = plant({
            'src/button/Base.css'        : '.neo-button { color: red; }',
            'theme-base/button/Base.css' : '[class*="neo-theme-"] { --button-color: var(--neo-color-text-default); }',
            'custom-skin/Global.css'     : ':where(.neo-theme-custom) { --neo-color-text-default: #111; }',
            'custom-skin/button/Base.css': ':where(.neo-theme-custom) { --button-gap: 4px; }',
            'mapped-only/button/Base.css': ':where(.neo-theme-mapped) { --button-gap: 8px; }',
            'theme-decoy/button/Base.css': '.decoy { color: red; }'
        }, {
            themes: {
                'neo-theme-mapped': ['mapped-only']
            }
        });

        expect(collectThemeFiles({repoRoot: tmpRoot, root: cssRoot})).toEqual([
            'resources/css/custom-skin/Global.css',
            'resources/css/custom-skin/button/Base.css',
            'resources/css/mapped-only/button/Base.css',
            'resources/css/theme-base/button/Base.css'
        ]);
        expect(collectThemeValueFileFailures({repoRoot: tmpRoot, root: cssRoot})).toEqual([])
    });

    test('rejects nested selectors and top-level non-variable declarations in both theme-base and mapped theme folders', () => {
        const cssRoot = plant({
            'theme-base/button/Base.css': '[class*="neo-theme-"] { .nested { --x: 1px; } }',
            'custom-skin/Global.css'    : ':where(.neo-theme-custom) { color: red; }'
        });

        const failures = collectThemeValueFileFailures({repoRoot: tmpRoot, root: cssRoot});

        expect(failures).toHaveLength(2);
        expect(failures.some(msg => msg.includes('theme-base/button/Base.css') && msg.includes('nested selector'))).toBe(true);
        expect(failures.some(msg => msg.includes('custom-skin/Global.css') && msg.includes('top-level property'))).toBe(true)
    });

    test('fails closed when no mapped theme or theme-base files exist', () => {
        const cssRoot  = plant({'src/button/Base.css': '.neo-button { color: red; }'}),
              failures = collectThemeValueFileFailures({repoRoot: tmpRoot, root: cssRoot});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[surface]')
    })
});
