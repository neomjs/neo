import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    SCAN_SURFACE,
    collectThemeClassPrefixFailures,
    stripJsComments
} from '../../../../../buildScripts/util/check-theme-class-prefix.mjs';

/**
 * @summary Unit suite for `buildScripts/util/check-theme-class-prefix.mjs`.
 */
test.describe('check-theme-class-prefix — neo-theme- reserved for themes and neo-theme-scope', () => {
    let tmpRoot;

    /**
     * @param {Object<String, String>} files
     * @returns {String}
     */
    const makeTree = files => {
        const root = fs.mkdtempSync(path.join(tmpRoot, 'prefix-case-'));

        const defaults = {
            'resources/css/src/Base.css'        : '.neo-button { color: var(--neo-button-color); }\n',
            'resources/css/theme-neo/Global.css': '.neo-theme-neo-dark, .neo-theme-neo-light { --neo-color-scheme: dark; }\n'
        };

        for (const [relPath, content] of Object.entries({...defaults, ...files})) {
            const fullPath = path.join(root, relPath);

            fs.mkdirSync(path.dirname(fullPath), {recursive: true});
            fs.writeFileSync(fullPath, content)
        }

        return root
    };

    test.beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-class-prefix-'))
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true})
    });

    test('CONTROL: the live repository passes and exports a non-empty SCAN_SURFACE', () => {
        expect(SCAN_SURFACE.length).toBeGreaterThan(0);
        expect(collectThemeClassPrefixFailures()).toEqual([])
    });

    test('PASSES: declared theme classes, neo-theme-scope, custom properties, and bare prefix helpers', () => {
        const root = makeTree({
            'resources/css/src/Scope.css': [
                '[class*="neo-theme-"] { color-scheme: var(--neo-color-scheme); }',
                '.neo-theme-scope { --neo-theme-custom-prop: 1px; }',
                '.neo-themeswitcher { display: inline-flex; }'
            ].join('\n'),
            'src/button/ThemeSwitcher.mjs': [
                '/**',
                " * @example {themeLabels: {'neo-theme-company-dark': 'Company Dark'}}",
                ' */',
                '// Single-line comment mentioning neo-theme-legacy',
                "export const baseCls = ['neo-button', 'neo-themeswitcher'];",
                "export const isTheme = cls => cls.startsWith('neo-theme-') && cls !== 'neo-theme-scope';",
                "export const strip   = cls => cls.replace(/^neo-theme-/, '');"
            ].join('\n'),
            'examples/button/index.html': [
                '<!-- neo-theme-commented-out -->',
                '<body class="neo-theme-neo-dark neo-theme-scope"></body>'
            ].join('\n')
        });

        expect(collectThemeClassPrefixFailures({root})).toEqual([])
    });

    test('FIRES: undeclared neo-theme-* selector in CSS reports exact file and line', () => {
        const root = makeTree({
            'resources/css/src/button/ThemeSwitcher.css': '.neo-button {\n    &.neo-theme-switcher { gap: 4px; }\n}\n'
        });

        expect(collectThemeClassPrefixFailures({root})).toEqual([
            "[reserved-prefix] resources/css/src/button/ThemeSwitcher.css:2 uses 'neo-theme-switcher'; " +
            "'neo-theme-' is reserved for declared theme classes and 'neo-theme-scope'"
        ])
    });

    test('FIRES: undeclared neo-theme-* class or concatenation stem in .mjs and .html', () => {
        const root = makeTree({
            'src/widget/Custom.mjs': [
                "const url = 'https://neomjs.com/docs';",
                "const iconCls = 'neo-theme-switcher-icon-' + icon;"
            ].join('\n'),
            'apps/demo/index.html': '<body class="neo-theme-unregistered"></body>\n'
        });

        expect(collectThemeClassPrefixFailures({root})).toEqual([
            "[reserved-prefix] src/widget/Custom.mjs:2 uses 'neo-theme-switcher-icon-'; " +
            "'neo-theme-' is reserved for declared theme classes and 'neo-theme-scope'",
            "[reserved-prefix] apps/demo/index.html:1 uses 'neo-theme-unregistered'; " +
            "'neo-theme-' is reserved for declared theme classes and 'neo-theme-scope'"
        ])
    });

    test('FIRES on reserved theme/theme-* ntype and PASSES on themeswitcher class and consumer usage', () => {
        const unsafeRoot = makeTree({
            'src/button/BadSwitcher.mjs': [
                'class BadSwitcher {',
                "    static config = { ntype: 'theme-switcher', ui: 'ghost' }",
                '}'
            ].join('\n'),
            'examples/demo/BadConsumer.mjs': "export const items = [{ntype: 'theme-switcher'}];\n"
        });

        expect(collectThemeClassPrefixFailures({root: unsafeRoot})).toEqual([
            "[reserved-prefix] src/button/BadSwitcher.mjs:2 uses reserved ntype 'theme-switcher', whose " +
            "component.Base#afterSetUi emits 'neo-theme-switcher-<ui>'; rename ntype so it is neither " +
            "'theme' nor 'theme-*'",
            "[reserved-prefix] examples/demo/BadConsumer.mjs:1 uses reserved ntype 'theme-switcher', whose " +
            "component.Base#afterSetUi emits 'neo-theme-switcher-<ui>'; rename ntype so it is neither " +
            "'theme' nor 'theme-*'"
        ]);

        const safeRoot = makeTree({
            'src/button/ThemeSwitcher.mjs': [
                'class ThemeSwitcher {',
                "    static config = { ntype: 'themeswitcher', ui: 'ghost' }",
                '    afterSetUi(v, ov) { super.afterSetUi(v, ov) }',
                '}'
            ].join('\n'),
            'examples/demo/Consumer.mjs': "export const items = [{ntype: 'themeswitcher'}];\n"
        });

        expect(collectThemeClassPrefixFailures({root: safeRoot})).toEqual([])
    });

    test('stripJsComments preserves URLs inside strings while blanking comments line-for-line', () => {
        const input = [
            "const a = 'https://example.com/neo-theme-rogue'; // neo-theme-comment",
            '/* multi',
            '   neo-theme-block */',
            "const b = 'ok';"
        ].join('\n');

        const stripped = stripJsComments(input);

        expect(stripped.split('\n')).toHaveLength(4);
        expect(stripped).toContain('https://example.com/neo-theme-rogue');
        expect(stripped).not.toContain('neo-theme-comment');
        expect(stripped).not.toContain('neo-theme-block')
    });

    test('FAILS CLOSED: missing CSS tree or empty Global.css theme map never passes vacuously', () => {
        const missing = collectThemeClassPrefixFailures({root: path.join(tmpRoot, 'missing')});

        expect(missing).toHaveLength(1);
        expect(missing[0]).toContain('[surface]');

        const noThemesRoot = fs.mkdtempSync(path.join(tmpRoot, 'no-themes-'));

        fs.mkdirSync(path.join(noThemesRoot, 'resources/css/src'), {recursive: true});
        fs.writeFileSync(path.join(noThemesRoot, 'resources/css/src/Base.css'), '.neo-x {}');

        const noThemes = collectThemeClassPrefixFailures({root: noThemesRoot});

        expect(noThemes).toHaveLength(1);
        expect(noThemes[0]).toContain('[surface]')
    })
});
