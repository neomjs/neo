import {test, expect} from '@playwright/test';
import fs             from 'node:fs';
import os             from 'node:os';
import path           from 'node:path';

import {
    FOREIGN_PROPERTIES,
    PALETTE_EXTRAS,
    SCAN_SURFACE,
    collectThemePropertyPrefixFailures,
    isAllowedNeoProperty
} from '../../../../../buildScripts/util/check-theme-property-prefix.mjs';

const neoProp = suffix => '--' + 'neo-' + suffix;

/**
 * @summary Unit suite for `buildScripts/util/check-theme-property-prefix.mjs`.
 */
test.describe('check-theme-property-prefix — every engine CSS property carries --neo- and every --neo-* matches kindOf()', () => {
    let tmpRoot;

    /**
     * @param {Object<String, String>} files
     * @returns {String}
     */
    const makeTree = files => {
        const root = fs.mkdtempSync(path.join(tmpRoot, 'prop-prefix-case-'));

        const defaults = {
            'resources/css/src/Base.css'        : '.neo-button { color: var(--neo-fixture-button-color); }\n',
            'resources/css/theme-neo/Global.css': '.neo-theme-neo-dark { --neo-color-scheme: dark; }\n'
        };

        for (const [relPath, content] of Object.entries({...defaults, ...files})) {
            const fullPath = path.join(root, relPath);

            fs.mkdirSync(path.dirname(fullPath), {recursive: true});
            fs.writeFileSync(fullPath, content)
        }

        return root
    };

    test.beforeAll(() => {
        tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-prop-prefix-'))
    });

    test.afterAll(() => {
        fs.rmSync(tmpRoot, {recursive: true, force: true})
    });

    test('CONTROL: the live repository passes and exports SCAN_SURFACE covering css, src, apps, examples, and test', () => {
        expect(SCAN_SURFACE).toEqual([
            'resources/css/**/*.css',
            'src/**/*.mjs',
            'apps/**/*.mjs',
            'examples/**/*.mjs',
            'test/**/*.mjs'
        ]);
        expect(collectThemePropertyPrefixFailures()).toEqual([])
    });

    test('PASSES: palette, all 13 role categories, temporary legacy Global.css tokens, component variables, foreign vendor vars, app/example CSS vars, CSS content strings, and valid dynamic prefix templates', () => {
        expect(isAllowedNeoProperty('--neo-color-scheme')).toBe(true);
        expect(isAllowedNeoProperty('--neo-palette-accent-600')).toBe(true);
        expect([...PALETTE_EXTRAS].every(isAllowedNeoProperty)).toBe(true);
        expect(Object.keys(FOREIGN_PROPERTIES)).toContain('--fa-width');

        const allowedSamples = [
            '--neo-color-text-default',
            '--neo-space-0-5',
            '--neo-control-height-medium',
            '--neo-font-family-sans',
            '--neo-font-smoothing',
            '--neo-line-height-normal',
            '--neo-letter-spacing-heading',
            '--neo-radius-medium',
            '--neo-border-width-thin',
            '--neo-focus-ring-width',
            '--neo-opacity-disabled',
            '--neo-elevation-2',
            neoProp('duration-fast'),
            neoProp('ease-out'),
            neoProp('sem-color-text-neutral-default'),
            neoProp('white'),
            neoProp('spacing-16'),
            neoProp('cyber-cyan'),
            neoProp('button-background-color'),
            neoProp('board-card-border-color-hover')
        ];

        for (const sample of allowedSamples) {
            expect(isAllowedNeoProperty(sample), sample).toBe(true)
        }

        const root = makeTree({
            'resources/css/src/Toast.css'         : '.neo-toast { --fa-width: 1.25em; font-family: var(\n    --fa-style-family-classic\n); content: "--not-a-decl: 1"; }\n',
            'resources/css/src/apps/demo/View.css': '.demo-view { --demo-accent: #123456; color: var(--demo-accent); }\n',
            'resources/css/theme-neo/Global.css'  : [
                '.neo-theme-neo-light {',
                '    --neo-color-scheme: light;',
                '    --neo-palette-white: #fff;',
                '    --neo-palette-brand-500: oklch(0.610 0.136 161.0);',
                '    --neo-color-background-canvas: var(--neo-palette-white);',
                '    --neo-fixture-button-background-color: var(--neo-color-background-canvas);',
                '}'
            ].join('\n'),
            'src/component/Base.mjs': [
                `// ${neoProp('color')}`,
                'export const gap = `--neo-align-gap-${side}`;',
                'export const evt = `var(--neo-event-${color}-color)`;',
                "export const isNeo = key => key.startsWith('--neo-');",
                "export const vtext = '<!--neo-vtext-->';"
            ].join('\n')
        });

        expect(collectThemePropertyPrefixFailures({root})).toEqual([])
    });

    test('FIRES: unprefixed engine CSS declarations/reads (including multi-line var() and @property) and invalid complete --neo-* shapes (including double-hyphen identifiers) report exact file and line', () => {
        const
            unprefixedDecl     = '--' + 'fixture-unprefixed-bg',
            unprefixedRead     = '--' + 'fixture-unprefixed-fg',
            multilineRead      = '--' + 'foreign-widget-color',
            multilineAtProp    = '--' + 'foreign-widget-width',
            multilineDecl      = '--' + 'foreign-widget-pad',
            doubleDashAtom     = neoProp('demo--atom'),
            badRoleWord        = neoProp('border-color'),
            badSingleSeg       = neoProp('duration'),
            badPaletteSlot     = neoProp('palette-purple-400'),
            badPaletteStep     = neoProp('palette-accent-350'),
            badLineWord        = neoProp('line-color'),
            badTemplateDblDash = neoProp('demo--');

        expect(isAllowedNeoProperty(doubleDashAtom)).toBe(false);
        expect(isAllowedNeoProperty(badRoleWord)).toBe(false);
        expect(isAllowedNeoProperty(badSingleSeg)).toBe(false);
        expect(isAllowedNeoProperty(badPaletteSlot)).toBe(false);
        expect(isAllowedNeoProperty(badPaletteStep)).toBe(false);
        expect(isAllowedNeoProperty(badLineWord)).toBe(false);

        const root = makeTree({
            'resources/css/src/Button.css': [
                '@property',
                `    ${multilineAtProp} {`,
                '    syntax: "<length>";',
                '    inherits: false;',
                '    initial-value: 0px;',
                '}',
                '.neo-button {',
                `    ${unprefixedDecl}: #fff;`,
                `    ${multilineDecl}`,
                '        : 4px;',
                `    color: var(${unprefixedRead});`,
                '    background-color: var(',
                `        ${multilineRead}`,
                '    );',
                `    border-color: var(${badRoleWord});`,
                `    ${doubleDashAtom}: 1px;`,
                '}'
            ].join('\n') + '\n',
            'src/Plugin.mjs'           : `export const style = {'${badSingleSeg}': '200ms', '${doubleDashAtom}': '2px'};\n`,
            'apps/demo/View.mjs'       : `export const color = 'var(${badPaletteSlot})';\n`,
            'examples/demo/Main.mjs'   : `export const step  = 'var(${badPaletteStep})';\n`,
            'test/unit/Sample.spec.mjs': `export const probe = '${badLineWord}';\nexport const badTpl = \`${badTemplateDblDash}\${k}\`;\n`
        });

        expect(collectThemePropertyPrefixFailures({root})).toEqual([
            `[unprefixed-engine-property] resources/css/src/Button.css:2 uses '${multilineAtProp}'; every engine custom property ` +
            `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`,
            `[unprefixed-engine-property] resources/css/src/Button.css:8 uses '${unprefixedDecl}'; every engine custom property ` +
            `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`,
            `[unprefixed-engine-property] resources/css/src/Button.css:9 uses '${multilineDecl}'; every engine custom property ` +
            `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`,
            `[unprefixed-engine-property] resources/css/src/Button.css:11 uses '${unprefixedRead}'; every engine custom property ` +
            `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`,
            `[unprefixed-engine-property] resources/css/src/Button.css:13 uses '${multilineRead}'; every engine custom property ` +
            `under resources/css must start with '--neo-' (or be registered in FOREIGN_PROPERTIES)`,
            `[invalid-neo-property] resources/css/src/Button.css:15 uses '${badRoleWord}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] resources/css/src/Button.css:16 uses '${doubleDashAtom}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] src/Plugin.mjs:1 uses '${badSingleSeg}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] src/Plugin.mjs:1 uses '${doubleDashAtom}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] apps/demo/View.mjs:1 uses '${badPaletteSlot}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] examples/demo/Main.mjs:1 uses '${badPaletteStep}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] test/unit/Sample.spec.mjs:1 uses '${badLineWord}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`,
            `[invalid-neo-property] test/unit/Sample.spec.mjs:2 uses '${badTemplateDblDash}'; expected '--neo-palette-<slot>-<grade>', ` +
            `a thirteen-category role, a temporary legacy Global.css token, or '--neo-<component>-<property>'`
        ])
    });

    test('FAILS CLOSED: missing CSS tree never passes vacuously', () => {
        const failures = collectThemePropertyPrefixFailures({root: path.join(tmpRoot, 'missing')});

        expect(failures).toHaveLength(1);
        expect(failures[0]).toContain('[surface]')
    })
});
